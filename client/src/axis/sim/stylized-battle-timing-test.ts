import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STYLIZED_DEATH_MS,
  STYLIZED_HEALTH_PULSE_MS,
  STYLIZED_PARATROOPER_DROP_MS,
  STYLIZED_RETREAT_MS,
  STYLIZED_SUBMERGE_MS,
  STYLIZED_SHOT_MS,
  stylizedPresentationDurationMs,
  stylizedVolleyDurationMs,
} from './stylizedBattleTiming.js';

assert.equal(stylizedPresentationDurationMs({
  domain: 'land',
  previous: { destroyedIds: [] },
  next: { destroyedIds: ['tank-1'] },
}), STYLIZED_DEATH_MS.land, 'a casualty generation cannot settle before its collapse finishes');

assert.equal(stylizedPresentationDurationMs({
  domain: 'sea',
  previous: { destroyedIds: [], submergedIds: [] },
  next: { destroyedIds: ['carrier-1'], submergedIds: ['sub-1'] },
}), Math.max(STYLIZED_DEATH_MS.sea, STYLIZED_SUBMERGE_MS));

assert.equal(stylizedPresentationDurationMs({
  domain: 'land',
  previous: { retreatingIds: [] },
  next: { retreatingIds: ['inf-1'] },
  requestedMs: 2_000,
}), 2_000, 'the authoritative host duration remains a hard floor');

assert.equal(stylizedPresentationDurationMs({
  domain: 'land',
  previous: { retreatingIds: [], healthById: { tank: 1 } },
  next: { retreatingIds: ['inf-1'], healthById: { tank: 0.5 } },
}), Math.max(STYLIZED_RETREAT_MS, STYLIZED_HEALTH_PULSE_MS));

assert.equal(stylizedPresentationDurationMs({
  domain: 'land',
  previous: { destroyedIds: ['tank-1'] },
  next: { destroyedIds: ['tank-1'] },
}), 0, 'already-present states do not replay or extend a later generation');

assert.equal(stylizedPresentationDurationMs({
  domain: 'land',
  previous: { aboardParatrooperIds: ['infantry'] },
  next: { aboardParatrooperIds: [], deployedParatrooperIds: ['infantry'] },
}), STYLIZED_PARATROOPER_DROP_MS, 'deployment cannot settle before the airborne descent finishes');

assert.equal(stylizedPresentationDurationMs({
  domain: 'land',
  previous: {},
  next: { deployedParatrooperIds: ['infantry'] },
}), STYLIZED_PARATROOPER_DROP_MS, 'a renderer retry replays and settles the current deployed state safely');

assert.equal(stylizedVolleyDurationMs([]), 120);
assert.equal(stylizedVolleyDurationMs([0, 85, 170]), 170 + STYLIZED_SHOT_MS);

const rendererSource = readFileSync(new URL('./StylizedBattleSim.tsx', import.meta.url), 'utf8');
assert.match(
  rendererSource,
  /const lastPresentedSeq = useRef<number \| null>\(null\)/,
  'a fresh or remounted diorama must replay and acknowledge the current authoritative visual generation',
);

console.log('stylized battle timing: all checks passed');
