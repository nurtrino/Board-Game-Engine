// Battle sounds. Plain audio elements, cloned per play so volleys overlap, capped so a sixty-unit
// volley is a rattle and not a wall of noise. Silent when the hub's sound switch is off.
import { sfxEnabled } from '../../sfx';
import { unitDomain } from './model';

const FILES = ['artillery-fire', 'infantry-fire', 'naval-fire', 'plane-fire', 'tank-fire', 'dice-roll'] as const;
export type BattleSoundName = (typeof FILES)[number];

const VOLUME: Record<BattleSoundName, number> = {
  'artillery-fire': 0.5, 'infantry-fire': 0.34, 'naval-fire': 0.55, 'plane-fire': 0.4, 'tank-fire': 0.5, 'dice-roll': 0.6,
};
const MAX_VOICES = 7;

export function fireSoundFor(key: string): BattleSoundName {
  const d = unitDomain(key);
  if (d === 'sea') return 'naval-fire';
  if (d === 'air') return 'plane-fire';
  if (key === 'tank') return 'tank-fire';
  if (key === 'artillery' || key === 'aaGun') return 'artillery-fire';
  return 'infantry-fire';
}

export class BattleSound {
  private base = new Map<BattleSoundName, HTMLAudioElement>();
  private live = new Set<HTMLAudioElement>();
  private timers = new Set<number>();
  private dead = false;

  constructor() {
    if (typeof Audio === 'undefined') return;
    for (const name of FILES) {
      const a = new Audio(`/axis/sim/sounds/${name}.mp3`);
      a.preload = 'auto';
      this.base.set(name, a);
    }
  }

  /** rate below 1 plays lower and longer: a fire sound becomes an explosion. */
  play(name: BattleSoundName, opts: { volume?: number; rate?: number; delay?: number } = {}) {
    if (this.dead || !sfxEnabled()) return;
    if (opts.delay && opts.delay > 0) {
      const id = window.setTimeout(() => {
        this.timers.delete(id);
        this.play(name, { ...opts, delay: 0 });
      }, opts.delay * 1000);
      this.timers.add(id);
      return;
    }
    const src = this.base.get(name);
    if (!src || this.live.size >= MAX_VOICES) return;
    try {
      const a = src.cloneNode() as HTMLAudioElement;
      a.volume = Math.min(1, Math.max(0, VOLUME[name] * (opts.volume ?? 1)));
      if (opts.rate && opts.rate !== 1) {
        (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
        a.playbackRate = opts.rate;
      }
      const done = () => { this.live.delete(a); };
      a.addEventListener('ended', done, { once: true });
      a.addEventListener('error', done, { once: true });
      this.live.add(a);
      void a.play().catch(done); // blocked before the first tap on the page: stay silent
    } catch { /* no audio on this device */ }
  }

  boom(scale = 1, delay = 0) {
    this.play('tank-fire', { volume: Math.min(1.4, 0.8 + scale * 0.3), rate: 0.62, delay });
  }

  dispose() {
    this.dead = true;
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    for (const a of this.live) { try { a.pause(); } catch { /* ignore */ } }
    this.live.clear();
    this.base.clear();
  }
}
