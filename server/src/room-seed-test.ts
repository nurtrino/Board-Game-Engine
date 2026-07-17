import assert from 'node:assert/strict';
import type { GameOptions } from '@bge/shared';
import { resolveRoomSeed } from './room-seed.js';

let randomCalls = 0;
const randomSeed = () => {
  randomCalls++;
  return 741_932;
};

assert.equal(resolveRoomSeed({ seed: 82 }, true, randomSeed), 82, 'local verification may request an exact setup seed');
assert.equal(randomCalls, 0, 'a valid local seed does not consume the random fallback');

assert.equal(resolveRoomSeed({ seed: 82 }, false, randomSeed), 741_932, 'production ignores a client-supplied setup seed');
assert.equal(randomCalls, 1, 'production always consumes the random fallback');

for (const seed of ['82', 82.5, -1, 0x1_0000_0000] as unknown[]) {
  assert.equal(
    resolveRoomSeed({ seed } as GameOptions, true, randomSeed),
    741_932,
    `invalid development seed ${String(seed)} uses the random fallback`,
  );
}
assert.equal(randomCalls, 5, 'every invalid development seed consumes fresh randomness');

console.log('room setup seed authority: ok');
