import type { BbView } from '@bge/shared';

export const BB_AUDIO_ROLES = [
  'menu',
  'exploration',
  'enemy-encounter',
  'boss',
  'boss-phase',
  'victory',
  'defeat',
  'dream',
] as const;

export type BbAudioRole = (typeof BB_AUDIO_ROLES)[number];

export interface BbAudioTrack {
  id: string;
  roles: BbAudioRole[];
  title: string;
  file: string;
  mime: 'audio/ogg' | 'audio/mpeg';
  durationSeconds: number;
  bytes: number;
  sha256: string;
  loop: boolean;
  gain: number;
  crossfadeMs: number;
  license: string;
  source: string;
  attribution?: string;
  bossId?: string;
  bossPhase?: 1 | 2;
  enemyId?: string;
}

export interface BbAudioManifest {
  schemaVersion: 1;
  generatedAt: string;
  tracks: BbAudioTrack[];
}

export interface BbAudioCue {
  role: BbAudioRole;
  bossId?: string;
  bossPhase?: 1 | 2;
  enemyId?: string;
  /** Stable context seed used to spread generic cues across the OST. */
  variant?: number;
}

const ROLE_SET = new Set<string>(BB_AUDIO_ROLES);
const LOCAL_TRACK = /^\/bloodborne\/audio\/tracks\/[a-z0-9][a-z0-9._-]*\.(?:ogg|mp3)$/i;

/**
 * Treat the manifest as untrusted input. A bad or stale manifest should silence
 * music, never break the board or turn it into an arbitrary URL loader.
 */
export function parseBbAudioManifest(value: unknown): BbAudioManifest | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.tracks)) return null;
  const tracks = value.tracks.map(parseTrack).filter((track): track is BbAudioTrack => track !== null);
  return {
    schemaVersion: 1,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
    tracks,
  };
}

export function bbAudioCueForView(view: BbView): BbAudioCue {
  if (view.phase === 'ended') {
    return {
      role: view.outcome === 'victory' ? 'victory' : 'defeat',
      variant: stableVariant(`${view.campaignId}:${view.chapter}:${view.outcome}`),
    };
  }
  if (view.phase === 'setup') return { role: 'menu', variant: stableVariant(view.campaignId) };

  const combatBoss = view.combat?.bossUid == null
    ? undefined
    : view.bosses.find((boss) => boss.uid === view.combat?.bossUid);
  if (combatBoss) return {
    role: combatBoss.phase === 2 ? 'boss-phase' : 'boss',
    bossId: combatBoss.type,
    bossPhase: combatBoss.phase,
    variant: stableVariant(combatBoss.type),
  };

  const combatEnemy = view.combat?.enemyUid == null
    ? undefined
    : view.enemies.find((enemy) => enemy.uid === view.combat?.enemyUid);
  const activeHunter = view.activeSeat == null
    ? undefined
    : view.hunters.find((hunter) => hunter.seat === view.activeSeat);
  const engagedEnemy = combatEnemy ?? (activeHunter?.space == null
    ? undefined
    : view.enemies.find((enemy) => enemy.space === activeHunter.space));
  if (engagedEnemy) return {
    role: 'enemy-encounter',
    enemyId: engagedEnemy.type,
    variant: stableVariant(engagedEnemy.type),
  };

  const dreamPending = view.pending.some((choice) => choice.kind.startsWith('dream-'));
  const activeInDream = activeHunter != null && activeHunter.space == null;
  const partyInDream = view.hunters.length > 0 && view.hunters.every((hunter) => hunter.space == null);
  if (dreamPending || activeInDream || partyInDream) return {
    role: 'dream',
    variant: stableVariant(`${view.campaignId}:${view.chapter}`),
  };

  return {
    role: 'exploration',
    variant: stableVariant(`${view.campaignId}:${view.chapter}`),
  };
}

/** Pick the most specific deterministic track for a cue. */
export function selectBbAudioTrack(manifest: BbAudioManifest | null, cue: BbAudioCue): BbAudioTrack | null {
  if (!manifest) return null;
  const candidates = manifest.tracks
    .filter((track) => track.roles.includes(cue.role))
    .map((track) => ({ track, score: specificity(track, cue) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id));
  const bestScore = candidates[0]?.score;
  if (bestScore == null) return null;
  const best = candidates.filter((candidate) => candidate.score === bestScore);
  const variant = Number.isSafeInteger(cue.variant) ? cue.variant! : 0;
  return best[((variant % best.length) + best.length) % best.length]?.track ?? null;
}

function stableVariant(value: string | null | undefined): number {
  const text = value ?? '';
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function specificity(track: BbAudioTrack, cue: BbAudioCue): number {
  let score = 0;
  if (track.bossId) {
    if (track.bossId !== cue.bossId) return -1;
    score += 8;
  }
  if (track.bossPhase) {
    if (track.bossPhase !== cue.bossPhase) return -1;
    score += 4;
  }
  if (track.enemyId) {
    if (track.enemyId !== cue.enemyId) return -1;
    score += 8;
  }
  return score;
}

function parseTrack(value: unknown): BbAudioTrack | null {
  if (!isRecord(value)) return null;
  const bytes = value.bytes;
  const roles = Array.isArray(value.roles)
    ? [...new Set(value.roles.filter((role): role is BbAudioRole => typeof role === 'string' && ROLE_SET.has(role)))]
    : [];
  if (
    !validId(value.id) || roles.length === 0 || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.file !== 'string' || !LOCAL_TRACK.test(value.file) || value.file.includes('..')
    || (value.mime !== 'audio/ogg' && value.mime !== 'audio/mpeg')
    || !finiteBetween(value.durationSeconds, 0.05, 7_200)
    || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 256 * 1024 * 1024
    || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(value.sha256)
    || typeof value.loop !== 'boolean'
    || !finiteBetween(value.gain, 0, 1)
    || !finiteBetween(value.crossfadeMs, 0, 30_000)
    || typeof value.license !== 'string' || !value.license.trim()
    || typeof value.source !== 'string' || !value.source.trim()
  ) return null;

  if (value.bossPhase !== undefined && value.bossPhase !== 1 && value.bossPhase !== 2) return null;
  if (value.bossId !== undefined && !validId(value.bossId)) return null;
  if (value.enemyId !== undefined && !validId(value.enemyId)) return null;
  if (value.attribution !== undefined && typeof value.attribution !== 'string') return null;

  return {
    id: value.id,
    roles,
    title: value.title.trim(),
    file: value.file,
    mime: value.mime,
    durationSeconds: value.durationSeconds,
    bytes,
    sha256: value.sha256.toLowerCase(),
    loop: value.loop,
    gain: value.gain,
    crossfadeMs: value.crossfadeMs,
    license: value.license.trim(),
    source: value.source.trim(),
    ...(typeof value.attribution === 'string' && value.attribution.trim() ? { attribution: value.attribution.trim() } : {}),
    ...(typeof value.bossId === 'string' ? { bossId: value.bossId } : {}),
    ...(value.bossPhase === 1 || value.bossPhase === 2 ? { bossPhase: value.bossPhase } : {}),
    ...(typeof value.enemyId === 'string' ? { enemyId: value.enemyId } : {}),
  };
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value);
}

function finiteBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
