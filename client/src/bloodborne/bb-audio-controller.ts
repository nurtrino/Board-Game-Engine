import { selectBbAudioTrack, type BbAudioCue, type BbAudioManifest, type BbAudioTrack } from './bb-audio-cues';

export interface BbAudioPort {
  src: string;
  preload: string;
  loop: boolean;
  volume: number;
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener?(type: string, listener: () => void, options?: AddEventListenerOptions | boolean): void;
}

export interface BbAudioControllerOptions {
  createAudio?: (src: string) => BbAudioPort;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
  playTimeoutMs?: number;
}

interface PlayingTrack {
  audio: BbAudioPort;
  track: BbAudioTrack;
}

const DEFAULT_PLAY_TIMEOUT_MS = 2_500;

/**
 * Two-deck music player. All media and autoplay failures are contained here so
 * game rendering and input remain completely independent of audio availability.
 */
export class BbAudioController {
  private readonly createAudio: (src: string) => BbAudioPort;
  private readonly now: () => number;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly playTimeoutMs: number;
  private manifest: BbAudioManifest | null = null;
  private cue: BbAudioCue | null = null;
  private current: PlayingTrack | null = null;
  private pending: PlayingTrack | null = null;
  private resumePending = false;
  private unlocked = false;
  private muted = false;
  private disposed = false;
  private operation = 0;
  private fadeOperation = 0;
  private fadeHandle: number | null = null;
  private fadeOutgoing: BbAudioPort | null = null;
  private active = new Set<BbAudioPort>();

  constructor(options: BbAudioControllerOptions = {}) {
    this.createAudio = options.createAudio ?? ((src) => {
      const audio = new Audio(src);
      return audio;
    });
    this.now = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()));
    this.requestFrame = options.requestFrame ?? ((callback) => {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
      return globalThis.setTimeout(() => callback(this.now()), 16) as unknown as number;
    });
    this.cancelFrame = options.cancelFrame ?? ((handle) => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
      else globalThis.clearTimeout(handle);
    });
    this.playTimeoutMs = options.playTimeoutMs ?? DEFAULT_PLAY_TIMEOUT_MS;
  }

  setManifest(manifest: BbAudioManifest | null): void {
    if (this.disposed) return;
    this.manifest = manifest;
    this.reconcile();
  }

  setCue(cue: BbAudioCue): void {
    if (this.disposed) return;
    this.cue = cue;
    this.reconcile();
  }

  setMuted(muted: boolean): void {
    if (this.disposed || muted === this.muted) return;
    this.muted = muted;
    if (muted) {
      this.operation++;
      this.resumePending = false;
      this.stopPending();
      this.stopFade(true);
      for (const audio of this.active) {
        setVolume(audio, 0);
        safePause(audio);
      }
      return;
    }
    this.reconcile();
  }

  /** Call from pointer/keyboard handlers. Repeated calls intentionally retry rejected autoplay. */
  unlock(): void {
    if (this.disposed || this.muted) return;
    this.unlocked = true;
    this.reconcile();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.operation++;
    this.resumePending = false;
    this.stopPending();
    this.stopFade(true);
    for (const audio of this.active) safePause(audio);
    this.active.clear();
    this.current = null;
  }

  private reconcile(): void {
    if (this.disposed || this.muted || !this.unlocked || !this.cue) return;
    const track = selectBbAudioTrack(this.manifest, this.cue);
    if (!track) {
      this.operation++;
      this.stopPending();
      this.stopFade(true);
      if (this.current) {
        safePause(this.current.audio);
        this.active.delete(this.current.audio);
        this.current = null;
      }
      return;
    }
    if (this.current?.track.id === track.id) {
      this.resume(this.current);
      return;
    }
    if (this.pending?.track.id === track.id) return;
    this.start(track);
  }

  private start(track: BbAudioTrack): void {
    this.operation++;
    const operation = this.operation;
    this.stopPending();

    let audio: BbAudioPort;
    try {
      audio = this.createAudio(track.file);
      audio.preload = 'auto';
      audio.loop = track.loop;
      setVolume(audio, 0);
    } catch {
      return;
    }

    const incoming = { audio, track };
    this.pending = incoming;
    this.active.add(audio);
    audio.addEventListener?.('error', () => this.mediaFailed(incoming), { once: true });

    let playResult: Promise<void> | void;
    try {
      playResult = audio.play();
    } catch {
      this.mediaFailed(incoming);
      return;
    }

    const timeout = globalThis.setTimeout(() => {
      if (this.pending === incoming && this.operation === operation) this.mediaFailed(incoming);
    }, this.playTimeoutMs);
    void Promise.resolve(playResult).then(() => {
      globalThis.clearTimeout(timeout);
      if (this.disposed || this.muted || this.operation !== operation || this.pending !== incoming) {
        safePause(audio);
        this.active.delete(audio);
        return;
      }
      this.pending = null;
      this.stopFade(true);
      const outgoing = this.current;
      this.current = incoming;
      this.crossfade(outgoing, incoming);
    }).catch(() => {
      globalThis.clearTimeout(timeout);
      this.mediaFailed(incoming);
    });
  }

  private resume(current: PlayingTrack): void {
    current.audio.loop = current.track.loop;
    if (this.resumePending) return;
    this.resumePending = true;
    const operation = this.operation;
    let playResult: Promise<void> | void;
    try {
      playResult = current.audio.play();
    } catch {
      this.resumePending = false;
      return;
    }
    const timeout = globalThis.setTimeout(() => { this.resumePending = false; }, this.playTimeoutMs);
    void Promise.resolve(playResult).then(() => {
      globalThis.clearTimeout(timeout);
      this.resumePending = false;
      if (this.disposed || this.muted || operation !== this.operation || this.current !== current) return;
      this.fadeIn(current.audio, current.track.gain, current.track.crossfadeMs);
    }).catch(() => {
      globalThis.clearTimeout(timeout);
      this.resumePending = false;
    });
  }

  private crossfade(outgoing: PlayingTrack | null, incoming: PlayingTrack): void {
    const duration = incoming.track.crossfadeMs;
    const target = incoming.track.gain;
    if (!outgoing || duration <= 0) {
      if (outgoing) {
        safePause(outgoing.audio);
        this.active.delete(outgoing.audio);
      }
      setVolume(incoming.audio, target);
      return;
    }

    const oldAudio = outgoing.audio;
    const oldStart = finiteVolume(oldAudio.volume);
    this.fadeOutgoing = oldAudio;
    this.runFade(duration, (progress) => {
      setVolume(incoming.audio, target * progress);
      setVolume(oldAudio, oldStart * (1 - progress));
    }, () => {
      safePause(oldAudio);
      this.active.delete(oldAudio);
      if (this.fadeOutgoing === oldAudio) this.fadeOutgoing = null;
    });
  }

  private fadeIn(audio: BbAudioPort, target: number, duration: number): void {
    this.stopFade(true);
    const startVolume = finiteVolume(audio.volume);
    if (duration <= 0 || startVolume >= target) {
      setVolume(audio, target);
      return;
    }
    this.runFade(duration, (progress) => {
      setVolume(audio, startVolume + (target - startVolume) * progress);
    });
  }

  private runFade(duration: number, render: (progress: number) => void, complete?: () => void): void {
    const fadeOperation = ++this.fadeOperation;
    const startedAt = this.now();
    const tick = () => {
      if (this.disposed || this.muted || fadeOperation !== this.fadeOperation) return;
      const progress = Math.min(1, Math.max(0, (this.now() - startedAt) / Math.max(1, duration)));
      render(progress);
      if (progress >= 1) {
        this.fadeHandle = null;
        complete?.();
      } else {
        this.fadeHandle = this.requestFrame(tick);
      }
    };
    render(0);
    this.fadeHandle = this.requestFrame(tick);
  }

  private stopFade(pauseOutgoing: boolean): void {
    this.fadeOperation++;
    if (this.fadeHandle != null) this.cancelFrame(this.fadeHandle);
    this.fadeHandle = null;
    if (pauseOutgoing && this.fadeOutgoing) {
      safePause(this.fadeOutgoing);
      this.active.delete(this.fadeOutgoing);
    }
    this.fadeOutgoing = null;
  }

  private stopPending(): void {
    if (!this.pending) return;
    safePause(this.pending.audio);
    this.active.delete(this.pending.audio);
    this.pending = null;
  }

  private mediaFailed(track: PlayingTrack): void {
    if (this.pending === track) this.pending = null;
    if (this.current === track) this.current = null;
    safePause(track.audio);
    this.active.delete(track.audio);
  }
}

function setVolume(audio: BbAudioPort, volume: number): void {
  try { audio.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0)); } catch { /* media element went away */ }
}

function safePause(audio: BbAudioPort): void {
  try { audio.pause(); } catch { /* media element went away */ }
}

function finiteVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
}
