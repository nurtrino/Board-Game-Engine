import assert from 'node:assert/strict';
import { setiPendingCue, setiPendingPresentation } from './setiPendingPresentation.js';
import type { SetiUiPending, SetiUiView } from './setiView.js';

const view = {
  pieces: [{ id: 'probe-1' }, { id: 'probe-2' }],
  placedSpacecraft: [{ id: 'seti_spacecraft_1', body: 'Mars', kind: 'lander', owner: 1 }],
  bodyCells: { Oumuamua: 'seti_cell_r2s4' },
  sectors: [{ id: 'seti_sector_vega' }, { id: 'seti_sector_procyon' }],
  projectRow: ['seti_project_1', 'seti_project_2'],
  players: [{ hand: ['seti_project_3'], alienHand: [], hiddenExertian: [], missions: ['seti_project_4'], income: [] }],
  species: [{ faceUp: 'seti_alien_mascamites_01' }],
} as unknown as SetiUiView;

function pending(kind: string, options: unknown[]): SetiUiPending {
  return { kind, owner: 0, prompt: kind, options, raw: {} };
}

let result = setiPendingPresentation(pending('card-effect-choice', ['skip', 'probe-1']), view);
assert.equal(result.pieceIndexes.get('probe-1'), 1);
assert.deepEqual(result.finishIndexes, [0]);
assert.equal(setiPendingCue(result, pending('card-effect-choice', ['skip', 'probe-1'])), 'TOUCH A GLOWING PROBE');

result = setiPendingPresentation(pending('card-effect-choice', ['seti_cell_r1s7', 'r2s0']), view);
assert.equal(result.cellIndexes.get('seti_cell_r1s7'), 0);
assert.equal(result.cellIndexes.get('seti_cell_r2s0'), 1);

result = setiPendingPresentation(pending('card-effect-choice', ['row:1', 'seti_project_3']), view);
assert.equal(result.rowIndexes.get(1), 0);
assert.equal(result.cardIndexes.get('seti_project_3'), 1);

result = setiPendingPresentation(pending('manual-trigger-choice', ['claim|seti_project_4|slot-a', 'skip']), view);
assert.equal(result.missionIndexes.get('seti_project_4'), 0);
assert.equal(result.missionTargetIndexes.get('mission:seti_project_4:slot:slot-a'), 0);
assert.deepEqual(result.missionChoices, [{
  index: 0,
  rawOption: 'claim|seti_project_4|slot-a',
  action: 'claim',
  cardId: 'seti_project_4',
  slotId: 'slot-a',
  targetId: 'mission:seti_project_4:slot:slot-a',
}]);
assert.deepEqual(result.finishIndexes, [1]);

result = setiPendingPresentation(pending('manual-trigger-choice', [
  'claim|seti_project_4|scan-data',
  'claim|seti_project_4|scan-card',
  'claim|seti_project_4|scan-vp',
  'skip',
]), view);
assert.equal(result.missionIndexes.has('seti_project_4'), false, 'ambiguous whole-card target must not hide sibling reward circles');
assert.deepEqual(result.missionChoices.map((choice) => [choice.targetId, choice.index, choice.rawOption]), [
  ['mission:seti_project_4:slot:scan-data', 0, 'claim|seti_project_4|scan-data'],
  ['mission:seti_project_4:slot:scan-card', 1, 'claim|seti_project_4|scan-card'],
  ['mission:seti_project_4:slot:scan-vp', 2, 'claim|seti_project_4|scan-vp'],
]);
assert.equal(new Set(result.missionChoices.map((choice) => choice.targetId)).size, 3);
assert.equal(result.direct, true, 'distinct mission hotspots cover every reward-circle option');
assert.deepEqual(result.unmappedIndexes, []);

result = setiPendingPresentation(pending('manual-trigger-choice', ['complete|seti_project_4', 'skip']), view);
assert.deepEqual(result.missionChoices[0], {
  index: 0,
  rawOption: 'complete|seti_project_4',
  action: 'complete',
  cardId: 'seti_project_4',
  slotId: null,
  targetId: 'mission:seti_project_4:complete',
});
assert.equal(result.missionIndexes.get('seti_project_4'), 0);

result = setiPendingPresentation(pending('card-effect-choice', ['probe-1|Mars', 'orbit|probe-2|Jupiter']), view);
assert.deepEqual(result.bodyChoices, [
  { index: 0, action: 'land', pieceId: 'probe-1', spacecraftId: null, body: 'Mars' },
  { index: 1, action: 'orbit', pieceId: 'probe-2', spacecraftId: null, body: 'Jupiter' },
]);

result = setiPendingPresentation(pending('card-effect-choice', ['seti_spacecraft_1']), view);
assert.equal(result.spacecraftIndexes.get('seti_spacecraft_1'), 0);
assert.equal(setiPendingCue(result, pending('card-effect-choice', ['seti_spacecraft_1'])), 'TOUCH THE GLOWING SPACECRAFT');

result = setiPendingPresentation(pending('card-effect-choice', ['probe-1|Mars|occupied:seti_spacecraft_1']), view);
assert.deepEqual(result.bodyChoices, [
  { index: 0, action: 'land', pieceId: 'probe-1', spacecraftId: 'seti_spacecraft_1', body: 'Mars' },
]);

result = setiPendingPresentation(pending('card-effect-choice', ['seti_sector_vega']), view);
assert.equal(result.sectorIndexes.get('seti_sector_vega'), 0);

result = setiPendingPresentation(pending('card-effect-choice', ['done', 'probe-1|seti_cell_r1s7|1']), view);
assert.deepEqual(result.moveChoices, [{ index: 1, pieceId: 'probe-1', cell: 'seti_cell_r1s7' }]);

result = setiPendingPresentation(pending('card-effect-choice', ['sector:seti_sector_vega', 'tile:0']), view);
assert.equal(result.sectorIndexes.get('seti_sector_vega'), 0);
assert.deepEqual(result.oumuamuaTileChoices, [{ index: 1, tileSlot: 0, rawOption: 'tile:0', targetId: 'oumuamua-tile:0' }]);

result = setiPendingPresentation(pending('alien-card-source', ['face-up:seti_alien_mascamites_01', 'deck']), view);
assert.equal(result.cardIndexes.get('seti_alien_mascamites_01'), 0);
assert.equal(result.alienDeckIndex, 1);

result = setiPendingPresentation(pending('card-effect-choice', ['deck', 'row:0']), view);
assert.equal(result.projectDeckIndex, 0);

const samplePending = pending('card-effect-choice', ['sample:seti_mascamite_sample_3', 'sample:seti_mascamite_sample_5']);
samplePending.raw.cardId = 'seti_alien:sample:take:seti_alien_mascamites_01:Jupiter';
result = setiPendingPresentation(samplePending, view);
assert.deepEqual(result.sampleChoices, [
  { index: 0, body: 'Jupiter', order: 0 },
  { index: 1, body: 'Jupiter', order: 1 },
]);

const computerPending = pending('computer-tech-slot', [0, 2, 3]);
computerPending.raw.stackId = 'computer-2';
computerPending.raw.tileId = 'seti_tech_computer_2';
result = setiPendingPresentation(computerPending, view);
assert.deepEqual(result.computerTechChoices, [
  { index: 0, rawOption: 0, boardSlot: 0, trackSlot: 0, stackId: 'computer-2', tileId: 'seti_tech_computer_2', targetId: 'computer-tech-slot:0' },
  { index: 1, rawOption: 2, boardSlot: 2, trackSlot: 3, stackId: 'computer-2', tileId: 'seti_tech_computer_2', targetId: 'computer-tech-slot:2' },
  { index: 2, rawOption: 3, boardSlot: 3, trackSlot: 5, stackId: 'computer-2', tileId: 'seti_tech_computer_2', targetId: 'computer-tech-slot:3' },
]);
assert.equal(setiPendingCue(result, computerPending), 'TOUCH A GLOWING COMPUTER SPACE');

const scanOptions = [
  'earth',
  'project-row',
  'discard-extra-signal',
  'mercury-publicity-signal',
  'energy-launch-or-move',
  'done',
];
const scanPending = pending('card-effect-choice', scanOptions);
scanPending.prompt = 'Choose the next Scan element on the table';
scanPending.raw.cardId = 'seti_main_scan';
result = setiPendingPresentation(scanPending, view);
assert.deepEqual(result.scanStepChoices.map(({ key, surface, targetId, index, rawOption }) => ({ key, surface, targetId, index, rawOption })), [
  { index: 0, rawOption: 'earth', key: 'earth', surface: 'earth-body', targetId: 'scan-step:earth' },
  { index: 1, rawOption: 'project-row', key: 'project-row', surface: 'project-row', targetId: 'scan-step:project-row' },
  { index: 2, rawOption: 'discard-extra-signal', key: 'discard-extra-signal', surface: 'telescope-tech-discard', targetId: 'scan-step:discard-extra-signal' },
  { index: 3, rawOption: 'mercury-publicity-signal', key: 'mercury-publicity-signal', surface: 'telescope-tech-mercury', targetId: 'scan-step:mercury-publicity-signal' },
  { index: 4, rawOption: 'energy-launch-or-move', key: 'energy-launch-or-move', surface: 'telescope-tech-energy', targetId: 'scan-step:energy-launch-or-move' },
  { index: 5, rawOption: 'done', key: 'done', surface: 'finish', targetId: 'scan-step:done' },
]);
assert.deepEqual(result.finishIndexes, [5]);
assert.equal(result.direct, true, 'every serialized Scan option has an exact physical surface');

result = setiPendingPresentation(pending('card-effect-choice', ['probe-1', 'unmapped-effect']), view);
assert.deepEqual(result.unmappedIndexes, [1]);
assert.equal(result.direct, false, 'one mapped option cannot hide an unmapped sibling');
assert.equal(setiPendingCue(result, pending('card-effect-choice', ['probe-1', 'unmapped-effect'])), null);

const loneDoneScan = pending('card-effect-choice', ['done']);
loneDoneScan.prompt = 'Choose the next Scan element on the table';
result = setiPendingPresentation(loneDoneScan, view);
assert.equal(result.scanStepChoices[0]?.key, 'done', 'serialized Scan remains identifiable when done is its only option');

console.log('seti pending presentation: ok');
