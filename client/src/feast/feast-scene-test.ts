import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeFeastScene } from './FeastScene.js';

const raw = JSON.parse(readFileSync(new URL('../../public/feast/scene.json', import.meta.url), 'utf8')) as Record<string, unknown>;
assert.ok(Array.isArray(raw.specials), 'the extracted Feast scene fixture exercises the array wire shape');

const scene = normalizeFeastScene(raw);
assert.equal(Object.keys(scene.specials).length, 15, 'all 15 special tiles are indexed');
assert.equal(scene.specials['amber-figure']?.image, '/feast/special/amber-figure.webp', 'special tiles are keyed by stable id');
assert.ok(!Array.isArray(scene.specials), 'FeastScene consumers never receive an array');

const keyed = normalizeFeastScene({ ...raw, specials: scene.specials });
assert.equal(keyed.specials, scene.specials, 'an already-keyed scene remains stable');

assert.throws(
  () => normalizeFeastScene({ ...raw, specials: [{ id: 'cloakpin' }, { id: 'cloakpin' }] }),
  /duplicate special tile cloakpin/,
  'duplicate ids are rejected before consumers can silently use the wrong art',
);

console.log('Feast scene normalization: 6 checks passed');
