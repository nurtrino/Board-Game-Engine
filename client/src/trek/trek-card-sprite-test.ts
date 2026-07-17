import assert from 'node:assert/strict';
import { fitCardSprite } from './trekCardSpriteGeometry';

const closeTo = (actual: number, expected: number, message: string) => {
  assert.ok(Math.abs(actual - expected) < 0.001, `${message}: expected ${expected}, got ${actual}`);
};

// The real park sheet is 3814x4096 with a 10x7 grid. Its rotated cards are
// wider than the legacy 224x158 frame, so they should letterbox vertically
// instead of being compressed to the frame's aspect ratio.
const parkCellAspect = (3814 / 10) / (4096 / 7);
const park = fitCardSprite(224, 158, parkCellAspect, true);
closeTo(park.displayWidth / park.displayHeight, 1 / parkCellAspect, 'park display preserves rotated cell aspect');
closeTo(park.displayWidth, 224, 'park display uses available width');
assert.ok(park.displayHeight < 158, 'park display leaves vertical breathing room instead of stretching');
closeTo(park.spriteWidth / park.spriteHeight, parkCellAspect, 'park atlas crop preserves source cell aspect');

// Upright trek cards preserve their source ratio too, with only a small inset
// in the existing 52x74 river slot.
const trekCellAspect = (4096 / 10) / (4014 / 7);
const trek = fitCardSprite(52, 74, trekCellAspect, false);
closeTo(trek.displayWidth / trek.displayHeight, trekCellAspect, 'trek display preserves source cell aspect');
assert.ok(trek.displayWidth <= 52 && trek.displayHeight <= 74, 'trek display remains inside its existing slot');

assert.throws(() => fitCardSprite(0, 74, trekCellAspect, false), /positive finite/);

console.log('Trekking card sprite geometry OK');
