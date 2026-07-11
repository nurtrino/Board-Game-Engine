import { useEffect, useMemo, useRef } from 'react';
import type { BbView } from '@bge/shared';
import { BbAudioController } from './bb-audio-controller';
import { bbAudioCueForView, parseBbAudioManifest } from './bb-audio-cues';

const MANIFEST_URL = '/bloodborne/audio/manifest.json';
const MUTED_KEY = 'bge-bloodborne-music-muted';

export function bloodborneMusicMuted(storage?: Pick<Storage, 'getItem'> | null): boolean {
  try {
    const target = storage === undefined
      ? (typeof window === 'undefined' ? null : window.localStorage)
      : storage;
    return target?.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistBloodborneMusicMuted(muted: boolean, storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const target = storage === undefined
      ? (typeof window === 'undefined' ? null : window.localStorage)
      : storage;
    target?.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch { /* private browsing or storage disabled */ }
}

/**
 * Keeps TV music in sync with public game state. It deliberately exposes no
 * loading/error state: music is optional ambience and can never block play.
 */
export function useBbAudio(view: BbView, muted: boolean): void {
  const controller = useRef<BbAudioController | null>(null);
  const cue = useMemo(() => bbAudioCueForView(view), [view]);
  const cueKey = `${cue.role}|${cue.bossId ?? ''}|${cue.bossPhase ?? ''}|${cue.enemyId ?? ''}|${cue.variant ?? 0}`;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const player = new BbAudioController();
    controller.current = player;

    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), 8_000);
    void fetch(MANIFEST_URL, { cache: 'no-cache', signal: abort.signal, headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() as Promise<unknown> : null)
      .then((raw) => {
        if (raw != null) player.setManifest(parseBbAudioManifest(raw));
      })
      .catch(() => { /* absent/invalid/blocked manifest means silent play */ })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      abort.abort();
      window.clearTimeout(timeout);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      player.dispose();
      if (controller.current === player) controller.current = null;
    };
  }, []);

  useEffect(() => {
    controller.current?.setCue(cue);
    // cueKey avoids restarting work when unrelated fields in BbView change.
  }, [cueKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    persistBloodborneMusicMuted(muted);
    controller.current?.setMuted(muted);
  }, [muted]);
}
