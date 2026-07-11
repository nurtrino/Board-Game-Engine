import assert from 'node:assert/strict';
import type { BbView } from '@bge/shared';
import { BbAudioController, type BbAudioPort } from './bb-audio-controller';
import {
  bbAudioCueForView,
  parseBbAudioManifest,
  selectBbAudioTrack,
  type BbAudioManifest,
  type BbAudioRole,
  type BbAudioTrack,
} from './bb-audio-cues';

const baseView = (): BbView => ({
  phase: 'play', outcome: null, activeSeat: 0,
  hunters: [{ seat: 0, space: '1:0' }], enemies: [], bosses: [], pending: [], combat: null,
} as unknown as BbView);

assert.equal(bbAudioCueForView({ ...baseView(), phase: 'setup' }).role, 'menu');
assert.equal(bbAudioCueForView(baseView()).role, 'exploration');
const enemyCue = bbAudioCueForView({ ...baseView(), enemies: [{ uid: 7, type: 'scourge-beast', space: '1:0' }] } as BbView);
assert.equal(enemyCue.role, 'enemy-encounter');
assert.equal(enemyCue.enemyId, 'scourge-beast');
assert.equal(typeof enemyCue.variant, 'number');
assert.equal(bbAudioCueForView({ ...baseView(), hunters: [{ seat: 0, space: null }] } as BbView).role, 'dream');
assert.equal(
  bbAudioCueForView({ ...baseView(), bosses: [{ uid: 8, type: 'cleric-beast', phase: 1 }] } as BbView).role,
  'exploration',
  'a boss elsewhere on the map does not hijack exploration music',
);
assert.equal(
  bbAudioCueForView({
    ...baseView(), combat: { bossUid: 8 }, bosses: [{ uid: 8, type: 'cleric-beast', phase: 2 }],
  } as BbView).role,
  'boss-phase',
);
assert.equal(bbAudioCueForView({ ...baseView(), phase: 'ended', outcome: 'victory' }).role, 'victory');
assert.equal(bbAudioCueForView({ ...baseView(), phase: 'ended', outcome: 'defeat' }).role, 'defeat');

const makeTrack = (id: string, roles: BbAudioRole[], extra: Partial<BbAudioTrack> = {}): BbAudioTrack => ({
  id, roles, title: id, file: `/bloodborne/audio/tracks/${id}.ogg`, mime: 'audio/ogg',
  durationSeconds: 60, bytes: 1_000, sha256: 'a'.repeat(64), loop: true,
  gain: 0.6, crossfadeMs: 100, license: 'CC BY 4.0', source: 'https://example.test/license',
  ...extra,
});
const manifest: BbAudioManifest = {
  schemaVersion: 1,
  generatedAt: '2026-01-01T00:00:00.000Z',
  tracks: [
    makeTrack('menu', ['menu']),
    makeTrack('explore', ['exploration']),
    makeTrack('boss-generic', ['boss']),
    makeTrack('boss-specific', ['boss'], { bossId: 'cleric-beast' }),
  ],
};
assert.equal(selectBbAudioTrack(manifest, { role: 'boss', bossId: 'cleric-beast', bossPhase: 1 })?.id, 'boss-specific');
assert.equal(selectBbAudioTrack(manifest, { role: 'boss', bossId: 'other', bossPhase: 1 })?.id, 'boss-generic');

const variants: BbAudioManifest = {
  ...manifest,
  tracks: [makeTrack('explore-a', ['exploration']), makeTrack('explore-b', ['exploration'])],
};
assert.equal(selectBbAudioTrack(variants, { role: 'exploration', variant: 0 })?.id, 'explore-a');
assert.equal(selectBbAudioTrack(variants, { role: 'exploration', variant: 1 })?.id, 'explore-b');

const parsed = parseBbAudioManifest({
  ...manifest,
  tracks: [
    ...manifest.tracks,
    { ...makeTrack('remote', ['menu']), file: 'https://example.test/audio.ogg' },
    { ...makeTrack('traversal', ['menu']), file: '/bloodborne/audio/tracks/../secret.ogg' },
  ],
});
assert.equal(parsed?.tracks.length, 4, 'unsafe manifest tracks are ignored');
assert.equal(parseBbAudioManifest({ schemaVersion: 2, tracks: [] }), null);

class FakeAudio implements BbAudioPort {
  preload = '';
  loop = false;
  volume = 1;
  currentTime = 0;
  pauses = 0;
  plays = 0;
  constructor(public src: string) {}
  play(): Promise<void> { this.plays++; return Promise.resolve(); }
  pause(): void { this.pauses++; }
}

let now = 0;
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const audios: FakeAudio[] = [];
const controller = new BbAudioController({
  createAudio: (src) => { const audio = new FakeAudio(src); audios.push(audio); return audio; },
  now: () => now,
  requestFrame: (callback) => { const id = ++frameId; frames.set(id, callback); return id; },
  cancelFrame: (id) => { frames.delete(id); },
  playTimeoutMs: 50,
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const advance = (time: number) => {
  now = time;
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) callback(time);
};

controller.setManifest(manifest);
controller.setCue({ role: 'menu' });
assert.equal(audios.length, 0, 'autoplay waits for a gesture');
controller.unlock();
await flush();
assert.equal(audios.length, 1);
assert.equal(audios[0].volume, 0.6);

controller.setCue({ role: 'exploration' });
await flush();
assert.equal(audios.length, 2);
assert.equal(audios[1].volume, 0);
advance(50);
assert.ok(audios[0].volume > 0 && audios[0].volume < 0.6);
assert.ok(audios[1].volume > 0 && audios[1].volume < 0.6);
advance(100);
assert.equal(audios[0].pauses, 1);
assert.equal(audios[1].volume, 0.6);

controller.setMuted(true);
assert.ok(audios[1].pauses >= 1);
controller.setManifest(null);
controller.setMuted(false);
controller.unlock();
controller.dispose();

console.log('bloodborne audio cue/controller tests passed');
