import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

const stateSource = read('shared/src/seti/state.ts');
const viewSource = read('client/src/seti/setiView.ts');
const presentationSource = read('client/src/seti/setiPendingPresentation.ts');
const playSource = read('client/src/seti/SetiPlay.tsx');
const artifactSource = read('client/src/seti/SetiPendingArtifacts.tsx');
const soloSource = read('client/src/seti/SetiSoloRival.tsx');
const audit = read('docs/specs/seti-pending-visual-audit.md');

const union = /export type SetiPendingDecision =([\s\S]*?)\n\nexport interface SetiEvent/.exec(stateSource)?.[1] ?? '';
assert.ok(union, 'SetiPendingDecision union was not found');
const actualKinds = [...union.matchAll(/kind:\s*'([^']+)'/g)].map((match) => match[1]);

// This list is deliberately exhaustive. Adding a pending kind must update the
// visual audit before this source-level contract can pass.
const auditedKinds = [
  'initial-income-card',
  'discard-to-four',
  'end-round-card',
  'signal-sector',
  'completed-sector-order',
  'trace-space',
  'gold-tile',
  'tech-stack',
  'computer-tech-slot',
  'mars-first-data',
  'tuck-income-card',
  'card-effect-choice',
  'alien-card-source',
  'centaurian-reward',
  'exertian-card',
  'solo-objective-task',
  'project-visit-reward',
  'manual-trigger-choice',
];

assert.deepEqual([...actualKinds].sort(), [...auditedKinds].sort(), 'pending-decision kind inventory drifted');
for (const kind of auditedKinds) {
  assert.ok(audit.includes(`| \`${kind}\` |`), `visual audit is missing ${kind}`);
}

// Anchor material current-tree facts used by the audit. These are intentionally
// source checks: the script does not mutate or import the client bundle.
assert.match(viewSource, /pending\.options\.length === 0[\s\S]*legal\.pendingOptions/, 'pending legal-option hydration is missing');
assert.match(viewSource, /pending\?\.kind === 'tech-stack'[\s\S]*pending\.options/, 'pending tech-stack targets are not hydrated');
assert.match(presentationSource, /spacecraftIndexes/, 'placed-spacecraft presentation mapping is missing');
assert.match(presentationSource, /missionIndexes/, 'mission presentation mapping is missing');
assert.match(presentationSource, /missionTargetIndexes/, 'exact mission hotspot mapping is missing');
assert.match(presentationSource, /computerTechChoices/, 'computer technology board-slot mapping is missing');
assert.match(presentationSource, /scanStepChoices/, 'serialized Scan physical-surface mapping is missing');
assert.match(presentationSource, /moveChoices/, 'movement presentation mapping is missing');
assert.match(presentationSource, /sampleChoices/, 'sample presentation mapping is missing');
assert.match(playSource, /SetiSoloObjectiveDecision/, 'specialized solo objective decision is missing');
assert.match(playSource, /pendingChosen[\s\S]*pendingPick/, 'multi-card pending selection is not staged');
assert.match(playSource, /missionChoices[\s\S]*seti-mission-slot-target/, 'mission reward circles are not consumed by the renderer');
assert.match(playSource, /setiPendingArtifactModel[\s\S]*SetiPendingArtifacts/, 'specialized authentic pending artifacts are not integrated');
for (const grammar of ['end-round-card', 'project-visit-reward', 'trace-color', 'exofossil-quantity', 'centaurian-reward', 'alien-mission-reward', 'alien-effect-region']) {
  assert.ok(artifactSource.includes(`kind: '${grammar}'`), `specialized pending artifacts are missing ${grammar}`);
}
assert.match(soloSource, /eligibleOptions\.includes\(option\)/, 'solo task hotspots do not preserve exact option identity');

console.log(`SETI pending visual contract: ${auditedKinds.length} decision kinds audited; multi-card and mission-slot blockers resolved.`);
