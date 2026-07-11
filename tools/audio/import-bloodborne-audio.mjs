#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const AUDIO_ROLES = new Set([
  'menu', 'exploration', 'enemy-encounter', 'boss', 'boss-phase', 'victory', 'defeat', 'dream',
]);

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.webm']);
const BLOCKED_HOSTS = [
  'youtube.com', 'youtu.be', 'youtube-nocookie.com', 'soundcloud.com', 'spotify.com',
  'bandcamp.com', 'music.apple.com', 'deezer.com', 'tidal.com',
];
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const MAX_DURATION_SECONDS = 7_200;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_OUTPUT_DIR = join(WORKSPACE, 'client', 'public', 'bloodborne', 'audio');

export function validateRemoteAudioUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`Invalid URL: ${raw}`); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only direct HTTP(S) audio URLs are accepted.');
  if (url.username || url.password) throw new Error('Authenticated URLs are not accepted.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
    throw new Error(`Streaming/page host is not accepted: ${host}. Use a licensed local file or a direct publisher-hosted audio URL.`);
  }
  const extension = extname(url.pathname).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(extension)) {
    throw new Error(`Remote input must be a direct audio-file URL with a recognized extension; got ${url.pathname || '/'}.`);
  }
  return url;
}

export function normalizeEntry(raw, defaults = {}) {
  const value = { ...defaults, ...raw };
  const input = requiredString(value.input, 'input');
  const title = requiredString(value.title, 'title');
  const license = requiredString(value.license, 'license');
  const source = requiredString(value.source, 'source');
  if (/^(?:unknown|none|n\/?a)$/i.test(license)) throw new Error('license must identify the actual license or permission; unknown/none is not accepted.');

  const roles = [...new Set(toList(value.roles ?? value.role))];
  if (!roles.length || roles.some((role) => !AUDIO_ROLES.has(role))) {
    throw new Error(`roles must contain one or more of: ${[...AUDIO_ROLES].join(', ')}`);
  }
  const id = slug(value.id ?? title);
  if (!id) throw new Error(`Could not derive a safe id from ${JSON.stringify(value.id ?? title)}.`);

  const remote = /^https?:\/\//i.test(input);
  if (remote) validateRemoteAudioUrl(input);
  else if (!/^[a-z]:[\\/]/i.test(input) && /^[a-z][a-z0-9+.-]*:/i.test(input)) throw new Error('input must be a local path or a direct HTTP(S) audio URL.');

  if (/^https?:\/\//i.test(source)) {
    const sourceUrl = new URL(source);
    const host = sourceUrl.hostname.toLowerCase();
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) {
      throw new Error(`YouTube/streaming pages cannot be used as source metadata: ${host}.`);
    }
  }

  const outputFormat = String(value.outputFormat ?? value.format ?? 'ogg').toLowerCase();
  if (outputFormat !== 'ogg' && outputFormat !== 'mp3') throw new Error('outputFormat must be ogg or mp3.');
  const gain = numberInRange(value.gain ?? 0.55, 0, 1, 'gain');
  const crossfadeMs = numberInRange(value.crossfadeMs ?? 2_500, 0, 30_000, 'crossfadeMs');
  const loop = booleanValue(value.loop ?? !roles.some((role) => role === 'victory' || role === 'defeat'), 'loop');
  const bossPhase = value.bossPhase == null ? undefined : numberInRange(value.bossPhase, 1, 2, 'bossPhase');
  if (bossPhase != null && !Number.isInteger(bossPhase)) throw new Error('bossPhase must be 1 or 2.');

  return {
    id, input, title, license, source, roles, outputFormat, gain, crossfadeMs, loop,
    ...(optionalString(value.attribution) ? { attribution: optionalString(value.attribution) } : {}),
    ...(optionalId(value.bossId, 'bossId') ? { bossId: optionalId(value.bossId, 'bossId') } : {}),
    ...(bossPhase != null ? { bossPhase } : {}),
    ...(optionalId(value.enemyId, 'enemyId') ? { enemyId: optionalId(value.enemyId, 'enemyId') } : {}),
  };
}

export function parseCli(argv) {
  const options = { replace: false, dryRun: false, outputDir: DEFAULT_OUTPUT_DIR };
  const entry = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else {
      if (!arg.startsWith('--')) throw new Error(`Unexpected positional argument: ${arg}`);
      const key = arg.slice(2);
      const next = argv[++i];
      if (next == null || next.startsWith('--')) throw new Error(`${arg} requires a value.`);
      if (key === 'config') options.config = resolve(next);
      else if (key === 'output-dir') options.outputDir = resolve(next);
      else if (key === 'role' || key === 'roles') entry.roles = [...(entry.roles ?? []), ...toList(next)];
      else if (key === 'input') entry.input = next;
      else if (key === 'id') entry.id = next;
      else if (key === 'title') entry.title = next;
      else if (key === 'license') entry.license = next;
      else if (key === 'source') entry.source = next;
      else if (key === 'attribution') entry.attribution = next;
      else if (key === 'format') entry.outputFormat = next;
      else if (key === 'gain') entry.gain = next;
      else if (key === 'crossfade-ms') entry.crossfadeMs = next;
      else if (key === 'loop') entry.loop = next;
      else if (key === 'boss-id') entry.bossId = next;
      else if (key === 'boss-phase') entry.bossPhase = next;
      else if (key === 'enemy-id') entry.enemyId = next;
      else throw new Error(`Unknown option: ${arg}`);
    }
  }
  options.entry = entry;
  return options;
}

export async function importAudio(options) {
  const outputDir = resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const tracksDir = join(outputDir, 'tracks');
  await mkdir(tracksDir, { recursive: true });
  const entries = options.entries;
  if (!entries.length) throw new Error('No audio entries were provided.');
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error('Track ids must be unique within a batch.');

  const manifestPath = join(outputDir, 'manifest.json');
  const manifest = await readExistingManifest(manifestPath);
  for (const entry of entries) {
    if (!options.replace && manifest.tracks.some((track) => track.id === entry.id)) {
      throw new Error(`Track id ${entry.id} already exists; pass --replace to update it.`);
    }
  }

  if (options.dryRun) return { manifest, imported: [], dryRun: true };
  const hasFfprobe = commandAvailable('ffprobe');
  if (!hasFfprobe) throw new Error('ffprobe is required to validate audio duration and streams. Install FFmpeg and retry.');
  const hasFfmpeg = commandAvailable('ffmpeg');

  const staged = [];
  try {
    for (const entry of entries) staged.push(await stageEntry(entry, tracksDir, { hasFfmpeg }));
    const nextTracks = manifest.tracks.filter((track) => !entries.some((entry) => entry.id === track.id));
    nextTracks.push(...staged.map((item) => item.track));
    nextTracks.sort((a, b) => a.id.localeCompare(b.id));
    const nextManifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), tracks: nextTracks };

    const committed = [];
    try {
      for (const item of staged) {
        const backup = `${item.finalPath}.backup-${randomUUID()}`;
        let hadExisting = false;
        try { await rename(item.finalPath, backup); hadExisting = true; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
        await rename(item.stagePath, item.finalPath);
        committed.push({ ...item, backup: hadExisting ? backup : null });
      }
      await atomicWriteJson(manifestPath, nextManifest);
      await atomicWrite(join(outputDir, 'CREDITS.md'), renderCredits(nextManifest));
      for (const item of committed) if (item.backup) await rm(item.backup, { force: true });

      const referenced = new Set(nextManifest.tracks.map((track) => track.file));
      for (const oldTrack of manifest.tracks.filter((track) => entries.some((entry) => entry.id === track.id))) {
        if (!referenced.has(oldTrack.file)) await rm(join(outputDir, oldTrack.file.replace(/^\/bloodborne\/audio\//, '')), { force: true });
      }
      return { manifest: nextManifest, imported: staged.map((item) => item.track), dryRun: false };
    } catch (error) {
      for (const item of committed.reverse()) {
        await rm(item.finalPath, { force: true });
        if (item.backup) await rename(item.backup, item.finalPath).catch(() => undefined);
      }
      throw error;
    }
  } finally {
    for (const item of staged) await rm(item.stagePath, { force: true }).catch(() => undefined);
  }
}

async function stageEntry(entry, tracksDir, { hasFfmpeg }) {
  let inputPath;
  let downloadedPath = null;
  try {
    if (/^https?:\/\//i.test(entry.input)) {
      downloadedPath = join(tracksDir, `.download-${randomUUID()}${extname(new URL(entry.input).pathname).toLowerCase()}`);
      await downloadDirectAudio(entry.input, downloadedPath);
      inputPath = downloadedPath;
    } else {
      inputPath = resolve(entry.input);
      const inputStat = await stat(inputPath);
      if (!inputStat.isFile()) throw new Error(`Input is not a file: ${inputPath}`);
      if (inputStat.size > MAX_SOURCE_BYTES) throw new Error(`Input exceeds ${MAX_SOURCE_BYTES} bytes: ${inputPath}`);
      if (!AUDIO_EXTENSIONS.has(extname(inputPath).toLowerCase())) throw new Error(`Input does not have a recognized audio extension: ${inputPath}`);
    }

    const sourceProbe = await probeAudio(inputPath);
    const extension = `.${entry.outputFormat}`;
    const stagePath = join(tracksDir, `.stage-${entry.id}-${randomUUID()}${extension}`);
    const finalPath = join(tracksDir, `${entry.id}${extension}`);
    if (hasFfmpeg) await convertAudio(inputPath, stagePath, entry.outputFormat);
    else if (extname(inputPath).toLowerCase() === extension) await copyFile(inputPath, stagePath);
    else throw new Error(`ffmpeg is required to convert ${extname(inputPath)} to ${extension}.`);

    const outputProbe = await probeAudio(stagePath);
    if (Math.abs(outputProbe.duration - sourceProbe.duration) > Math.max(1.5, sourceProbe.duration * 0.01)) {
      throw new Error(`Converted duration changed unexpectedly (${sourceProbe.duration}s to ${outputProbe.duration}s).`);
    }
    const outputStat = await stat(stagePath);
    if (outputStat.size <= 0 || outputStat.size > MAX_OUTPUT_BYTES) throw new Error(`Converted file size is invalid: ${outputStat.size} bytes.`);
    const sha256 = await sha256File(stagePath);
    const mime = entry.outputFormat === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
    return {
      stagePath,
      finalPath,
      track: {
        id: entry.id,
        roles: entry.roles,
        title: entry.title,
        file: `/bloodborne/audio/tracks/${entry.id}${extension}`,
        mime,
        durationSeconds: Math.round(outputProbe.duration * 1000) / 1000,
        bytes: outputStat.size,
        sha256,
        loop: entry.loop,
        gain: entry.gain,
        crossfadeMs: entry.crossfadeMs,
        license: entry.license,
        source: entry.source,
        ...(entry.attribution ? { attribution: entry.attribution } : {}),
        ...(entry.bossId ? { bossId: entry.bossId } : {}),
        ...(entry.bossPhase ? { bossPhase: entry.bossPhase } : {}),
        ...(entry.enemyId ? { enemyId: entry.enemyId } : {}),
      },
    };
  } finally {
    if (downloadedPath) await rm(downloadedPath, { force: true }).catch(() => undefined);
  }
}

async function downloadDirectAudio(rawUrl, destination) {
  let url = validateRemoteAudioUrl(rawUrl);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { Accept: 'audio/*,application/octet-stream;q=0.5', 'User-Agent': 'BoardGameEngine-AudioImporter/1.0' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect from ${url} omitted Location.`);
      url = validateRemoteAudioUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Audio download failed (${response.status}) for ${url}.`);
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!(contentType.startsWith('audio/') || ['application/octet-stream', 'application/ogg', 'binary/octet-stream'].includes(contentType))) {
      throw new Error(`Remote response is not audio (${contentType || 'missing Content-Type'}); page URLs are rejected.`);
    }
    const statedLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(statedLength) && statedLength > MAX_SOURCE_BYTES) throw new Error(`Remote audio exceeds ${MAX_SOURCE_BYTES} bytes.`);
    const handle = await open(destination, 'wx');
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > MAX_SOURCE_BYTES) throw new Error(`Remote audio exceeds ${MAX_SOURCE_BYTES} bytes.`);
        await handle.write(chunk);
      }
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!bytes) throw new Error('Remote audio was empty.');
    return;
  }
  throw new Error('Remote audio exceeded five redirects.');
}

async function probeAudio(path) {
  const output = await run('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type:format=duration,size', '-of', 'json', path,
  ]);
  let data;
  try { data = JSON.parse(output); } catch { throw new Error(`ffprobe returned invalid JSON for ${path}.`); }
  if (!Array.isArray(data.streams) || data.streams[0]?.codec_type !== 'audio') throw new Error(`No audio stream found in ${path}.`);
  const duration = Number(data.format?.duration);
  const size = Number(data.format?.size);
  if (!Number.isFinite(duration) || duration < 0.05 || duration > MAX_DURATION_SECONDS) throw new Error(`Audio duration must be 0.05-${MAX_DURATION_SECONDS}s; got ${duration}.`);
  if (Number.isFinite(size) && (size <= 0 || size > MAX_SOURCE_BYTES)) throw new Error(`Audio size is invalid: ${size}.`);
  return { duration, size };
}

async function convertAudio(input, output, format) {
  const codec = format === 'ogg' ? ['-c:a', 'libvorbis', '-q:a', '5'] : ['-c:a', 'libmp3lame', '-q:a', '3'];
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input,
    '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-ac', '2', '-ar', '48000', ...codec, output,
  ]);
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

function commandAvailable(command) {
  return spawnSync(command, ['-version'], { windowsHide: true, stdio: 'ignore' }).status === 0;
}

async function readExistingManifest(path) {
  let raw;
  try { raw = await readFile(path, 'utf8'); } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 1, generatedAt: '', tracks: [] };
    throw error;
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error(`Existing manifest is invalid JSON: ${path}`); }
  if (value?.schemaVersion !== 1 || !Array.isArray(value.tracks)) throw new Error(`Existing manifest schema is invalid: ${path}`);
  return value;
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function atomicWriteJson(path, value) {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  let handle;
  try {
    // Windows rejects fsync on a read-only descriptor. Keep the original write
    // descriptor open through flush, then atomically rename the closed file.
    handle = await open(temporary, 'wx');
    await handle.writeFile(contents, { encoding: 'utf8' });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

function renderCredits(manifest) {
  const lines = ['# Bloodborne audio credits', '', 'Generated from `manifest.json`. Do not remove attribution.', ''];
  for (const track of manifest.tracks) {
    lines.push(`## ${track.title}`, '', `- Roles: ${track.roles.join(', ')}`, `- License: ${track.license}`, `- Source: ${track.source}`);
    if (track.attribution) lines.push(`- Credit: ${track.attribution}`);
    lines.push(`- SHA-256: \`${track.sha256}\``, '');
  }
  return `${lines.join('\n')}\n`;
}

async function loadEntries(options) {
  if (!options.config) return [normalizeEntry(options.entry)];
  const raw = await readFile(options.config, 'utf8');
  const config = JSON.parse(raw);
  if (config?.schemaVersion !== 1 || !Array.isArray(config.tracks)) throw new Error('Config must have schemaVersion 1 and a tracks array.');
  return config.tracks.map((track, index) => {
    try { return normalizeEntry(track, config.defaults ?? {}); }
    catch (error) { throw new Error(`Config track ${index + 1}: ${error.message}`); }
  });
}

function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}
function optionalString(value) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function optionalId(value, name) {
  const text = optionalString(value);
  if (!text) return undefined;
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(text)) throw new Error(`${name} must be a safe game id.`);
  return text;
}
function slug(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
function toList(value) {
  if (Array.isArray(value)) return value.flatMap(toList);
  return typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}
function numberInRange(value, min, max, name) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} must be between ${min} and ${max}.`);
  return number;
}
function booleanValue(value, name) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true or false.`);
}

function help() {
  return `Rights-safe Bloodborne audio importer

Batch:  node tools/audio/import-bloodborne-audio.mjs --config <plan.json> [--replace] [--dry-run]
Single: node tools/audio/import-bloodborne-audio.mjs --input <file-or-direct-audio-url> --id <id>
        --title <title> --role <role[,role]> --license <license> --source <source-page>
        [--attribution <credit>] [--format ogg|mp3] [--gain 0..1]
        [--crossfade-ms 0..30000] [--loop true|false] [--boss-id <id>]
        [--boss-phase 1|2] [--enemy-id <id>] [--replace] [--dry-run]

YouTube, youtu.be, streaming pages, non-audio URLs, and unknown licenses are rejected.
Remote files are downloaded only from direct publisher-hosted audio URLs and are still
required to carry explicit --license and --source metadata.`;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.help) { console.log(help()); return; }
  const entries = await loadEntries(options);
  const result = await importAudio({ ...options, entries });
  if (result.dryRun) {
    console.log(`Validated ${entries.length} import entr${entries.length === 1 ? 'y' : 'ies'} (no network or file conversion performed).`);
    return;
  }
  for (const track of result.imported) console.log(`${track.id}: ${track.durationSeconds}s, ${track.bytes} bytes, sha256 ${track.sha256}`);
  console.log(`Wrote ${join(options.outputDir, 'manifest.json')} and CREDITS.md atomically.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(`Audio import failed: ${error.message}`); process.exitCode = 1; });
}
