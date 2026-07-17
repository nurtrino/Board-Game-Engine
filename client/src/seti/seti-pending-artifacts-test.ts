import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SetiPendingArtifacts,
  setiAlienBoardArt,
  setiPendingArtifactModel,
} from './SetiPendingArtifacts.js';
import type { SetiSceneDef } from './SetiScene.js';
import type { SetiUiPending, SetiUiView } from './setiView.js';

const view = {
  you: 2,
  species: [{ id: 'oumuamua', module: { kind: 'oumuamua', exofossils: { 2: 3 } } }],
} as unknown as SetiUiView;

function pending(kind: string, options: unknown[], raw: Record<string, unknown> = {}, prompt = kind): SetiUiPending {
  return { kind, owner: 2, prompt, options, raw };
}

let model = setiPendingArtifactModel(view, pending('end-round-card', ['seti_project_204500', 'seti_project_204501']));
assert.equal(model?.kind, 'end-round-card');
if (model?.kind === 'end-round-card') assert.deepEqual(model.choices.map(({ index, cardId }) => [index, cardId]), [
  [0, 'seti_project_204500'],
  [1, 'seti_project_204501'],
]);

model = setiPendingArtifactModel(view, pending('project-visit-reward', ['move', 'publicity'], { sourceCardId: 'seti_project_204518' }));
assert.equal(model?.kind, 'project-visit-reward');
if (model?.kind === 'project-visit-reward') {
  assert.equal(model.cardId, 'seti_project_204518');
  assert.equal(model.publicity.index, 1, 'semantic icon keeps the reducer index when options are reordered');
  assert.equal(model.move.index, 0);
}

model = setiPendingArtifactModel(view, pending(
  'card-effect-choice',
  ['orange', 'blue', 'purple'],
  { cardId: 'seti_alien:any-trace:any:17' },
  'Choose a life-trace color',
));
assert.equal(model?.kind, 'trace-color');
if (model?.kind === 'trace-color') assert.deepEqual(model.choices.map(({ index, color }) => [index, color]), [
  [0, 'orange'], [1, 'blue'], [2, 'purple'],
]);

model = setiPendingArtifactModel(view, pending(
  'card-effect-choice',
  ['skip', 'seti_project_204556'],
  { cardId: 'seti_project_204556' },
  'Tuck this card as income?',
));
assert.equal(model?.kind, 'tuck-income');
if (model?.kind === 'tuck-income') {
  assert.equal(model.cardId, 'seti_project_204556');
  assert.equal(model.skip.index, 0);
  assert.equal(model.tuck.index, 1);
}

model = setiPendingArtifactModel(view, pending(
  'card-effect-choice',
  ['2', '0', '3', '1'],
  { cardId: 'seti_alien:exo-move:seti_alien_oumuamua_07' },
  'Spend exofossils for movement',
));
assert.equal(model?.kind, 'exofossil-quantity');
if (model?.kind === 'exofossil-quantity') {
  assert.equal(model.held, 3);
  assert.deepEqual(model.choices.map(({ index, amount }) => [index, amount]), [[0, 2], [1, 0], [2, 3], [3, 1]]);
}

model = setiPendingArtifactModel(view, pending(
  'card-effect-choice',
  ['skip', 'spend'],
  { cardId: 'seti_alien:exo-data:seti_alien_oumuamua_05' },
  'Spend an exofossil for data?',
));
assert.equal(model?.kind, 'exofossil-spend');
if (model?.kind === 'exofossil-spend') assert.deepEqual(model.choices.map(({ index, action }) => [index, action]), [[0, 'skip'], [1, 'spend']]);

model = setiPendingArtifactModel(view, pending('centaurian-reward', ['reward:3', 'reward:0', 'reward:2']));
assert.equal(model?.kind, 'centaurian-reward');
if (model?.kind === 'centaurian-reward') assert.deepEqual(model.choices.map(({ index, rewardIndex }) => [index, rewardIndex]), [[0, 3], [1, 0], [2, 2]]);

model = setiPendingArtifactModel(view, pending(
  'card-effect-choice',
  ['reward:2', 'reward:0'],
  { cardId: 'seti_alien:trigger:seti_alien_oumuamua_02' },
));
assert.equal(model?.kind, 'alien-mission-reward');
if (model?.kind === 'alien-mission-reward') {
  assert.equal(model.cardId, 'seti_alien_oumuamua_02');
  assert.deepEqual(model.choices.map(({ index, rewardIndex }) => [index, rewardIndex]), [[0, 2], [1, 0]]);
}

model = setiPendingArtifactModel(view, pending(
  'card-effect-choice',
  ['1', '0'],
  { cardId: 'seti_alien:effect-choice:seti_alien_mascamites_03' },
));
assert.equal(model?.kind, 'alien-effect-region');
if (model?.kind === 'alien-effect-region') {
  assert.equal(model.cardId, 'seti_alien_mascamites_03');
  assert.deepEqual(model.choices.map(({ index, effectIndex }) => [index, effectIndex]), [[0, 1], [1, 0]]);
}

assert.equal(setiPendingArtifactModel(view, pending('card-effect-choice', ['alpha', 'beta'])), null, 'unrecognized grammars fall through');
assert.equal(SetiPendingArtifacts({ scene: null, view, pending: pending('card-effect-choice', ['alpha']), onChoose: () => undefined }), null, 'component is safe to classify in Node without a DOM');

const fakeScene = {
  alienBoards: [{ id: 'centaurians', front: '/exact/centaurians.webp' }],
} as unknown as SetiSceneDef;
assert.equal(setiAlienBoardArt(fakeScene, 'centaurians'), '/exact/centaurians.webp');

const rendered = renderToStaticMarkup(createElement(SetiPendingArtifacts, {
  scene: fakeScene,
  view,
  pending: pending('end-round-card', ['seti_project_204500', 'seti_project_204501']),
  onChoose: () => undefined,
}));
assert.match(rendered, /data-seti-pending-artifact="end-round-card"/, 'specialized lane renders without window or document');
assert.match(rendered, /data-seti-option-index="0"/);
assert.match(rendered, /data-seti-option-index="1"/);

const css = readFileSync(new URL('./setiPendingArtifacts.css', import.meta.url), 'utf8');
assert.match(css, /\.seti-pending-artifacts button\s*\{[\s\S]*?min-width:\s*40px;[\s\S]*?min-height:\s*40px;/, 'every option inherits a 40-by-40-pixel minimum hotspot');
assert.match(css, /\/seti\/tokens\/exofossil\.webp|exofossil/i, 'exofossil lane is explicitly styled');

console.log('seti pending artifacts: ok');
