// Tiny CC0 sound layer (Kenney packs, see public/sfx/CREDITS.txt). Game-
// agnostic: named clips, cloned per play so rapid repeats overlap instead of
// cutting off, with a persisted global mute. Browsers gate autoplay until a
// user gesture, so we prime the pipeline on the first pointer/key event.

const FILES = {
  shuffle: 'shuffle',
  build: 'build', link: 'link', coins: 'coins',
  turn: 'turn', click: 'click', error: 'error', win: 'win',
} as const;
export type SfxName = keyof typeof FILES;

// Per-clip trims so nothing jumps out (jingles + shuffle run hot).
const VOL: Partial<Record<SfxName, number>> = {
  win: 0.6, shuffle: 0.65, turn: 0.5, click: 0.4, coins: 0.8, error: 0.6,
};

const STORE_KEY = 'bge-sfx-muted';
let enabled = typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_KEY) !== '1' : true;
const cache = new Map<SfxName, HTMLAudioElement>();

function base(name: SfxName): HTMLAudioElement {
  let a = cache.get(name);
  if (!a) { a = new Audio(`/sfx/${FILES[name]}.ogg`); a.preload = 'auto'; cache.set(name, a); }
  return a;
}

export function playSfx(name: SfxName | null | undefined): void {
  if (!enabled || !name) return; // null = a deliberately silent event (e.g. card draws)
  try {
    const a = base(name).cloneNode() as HTMLAudioElement;
    a.volume = VOL[name] ?? 0.85;
    void a.play().catch(() => { /* pre-gesture or unsupported — ignore */ });
  } catch { /* ignore */ }
}

export function sfxEnabled(): boolean { return enabled; }
export function setSfxEnabled(on: boolean): void {
  enabled = on;
  try { localStorage.setItem(STORE_KEY, on ? '0' : '1'); } catch { /* ignore */ }
}

// Preload the clips and unlock audio on the first user gesture.
export function initSfx(): void {
  for (const k of Object.keys(FILES) as SfxName[]) base(k);
  const unlock = () => {
    const a = base('click');
    a.muted = true;
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

// The sound a completed action should make, by BrassEvent.kind. Actions with no
// distinctive cue stay silent (null) rather than borrow a generic card sound.
export function sfxForKind(kind?: string): SfxName | null {
  switch (kind) {
    case 'build': case 'develop': return 'build';
    case 'network': return 'link';
    case 'sell': case 'loan': return 'coins';
    case 'scout': return 'shuffle';
    default: return null;
  }
}
