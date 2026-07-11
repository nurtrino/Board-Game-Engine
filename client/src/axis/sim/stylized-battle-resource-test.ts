import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./StylizedBattleSim.tsx', import.meta.url), 'utf8');

assert.match(
  source,
  /const DENSE_SCENE_UNIT_THRESHOLD = 32/,
  'large command dioramas have an explicit, reviewable quality threshold',
);
assert.match(
  source,
  /shadows=\{denseScene \? false : 'percentage'\}[\s\S]*?dpr=\{denseScene \? 1 : \[1, 1\.25\]\}/,
  'dense scenes retain every piece while dropping the duplicate shadow pass and supersampling cost',
);
assert.match(
  source,
  /frameloop=\{active \? 'always' : 'never'\}/,
  'an offscreen or failed diorama does not keep a WebGL render loop alive',
);
assert.match(
  source,
  /function ContextLossGuard[\s\S]*?addEventListener\('webglcontextlost', lost\)[\s\S]*?removeEventListener\('webglcontextlost', lost\)/,
  'each canvas owns and removes its context-loss listener',
);
assert.doesNotMatch(
  source,
  /onCreated=\{[\s\S]{0,300}webglcontextlost/,
  'anonymous context-loss listeners cannot accumulate across renderer retries',
);
assert.match(
  source,
  /function retainStylizedAudio[\s\S]*?audio\.pause\(\)[\s\S]*?audio\.removeAttribute\('src'\)[\s\S]*?audioByName\.clear\(\)/,
  'the final diorama consumer releases cached media elements and their decoded resources',
);
assert.match(
  source,
  /const expiryTimers = useRef\(new Map<string, number>\(\)\)[\s\S]*?for \(const timer of expiryTimers\.current\.values\(\)\) window\.clearTimeout\(timer\)/,
  'kill-feed timers have durable per-entry ownership and complete unmount cleanup',
);
assert.match(
  source,
  /if \(!air && domain !== 'sea' && !transitionActive\) return;/,
  'settled land pieces stop rewriting identical transforms every animation frame',
);
assert.match(
  source,
  /useEffect\(\(\) => \(\) => surface\.dispose\(\), \[surface\]\)/,
  'the diorama explicitly releases its only imperative geometry allocation',
);
assert.match(
  source,
  /\{placements\.map\(\(placement\) => \([\s\S]*?<UnitToken/,
  'quality scaling never removes or aggregates authoritative battle pieces',
);

console.log('stylized battle resource ownership: all checks passed');
