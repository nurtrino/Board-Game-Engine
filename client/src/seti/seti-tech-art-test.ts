import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SETI_TECH_BY_ID, SETI_TECH_STACKS } from '@bge/shared';
import { setiTechAbilityFace, setiTechBack, type SetiSceneDef } from './SetiScene';

const scene = JSON.parse(readFileSync(new URL('../../public/seti/scene.json', import.meta.url), 'utf8')) as SetiSceneDef;
const sceneStacks = (scene.decks?.technologyStacks ?? []) as {
  guid: string;
  tiles: { cardId: number; back: string; sheet: string }[];
}[];
type SceneTechTile = (typeof sceneStacks)[number]['tiles'][number];

const expectedGuids: Record<string, string> = {
  seti_tech_stack_probe_1: '9b40d4',
  seti_tech_stack_probe_2: '0fb79c',
  seti_tech_stack_probe_3: '93c0f5',
  seti_tech_stack_probe_4: '82eb24',
  seti_tech_stack_telescope_1: 'c0c391',
  seti_tech_stack_telescope_2: 'b71fb9',
  seti_tech_stack_telescope_3: '00d8a2',
  seti_tech_stack_telescope_4: '5065ac',
  seti_tech_stack_computer_1: '00df2d',
  seti_tech_stack_computer_2: 'b26ea5',
  seti_tech_stack_computer_3: '84fb8c',
  seti_tech_stack_computer_4: '9dceb9',
};

for (const definition of SETI_TECH_STACKS) {
  assert.equal(definition.sourceGuid, expectedGuids[definition.id], `${definition.id} uses its authentic physical stack`);
  const sceneStack = sceneStacks.find((stack) => stack.guid === definition.sourceGuid);
  assert.ok(sceneStack, `${definition.id} exists in the scene catalog`);
  for (const tile of definition.tiles) {
    const sceneTile: SceneTechTile | undefined = sceneStack.tiles.find((candidate: SceneTechTile) => candidate.cardId === tile.sourceCardId);
    assert.ok(sceneTile, `${tile.id} resolves by sourceCardId`);
    assert.equal(setiTechBack(scene, definition.id, tile.id), sceneTile.back, `${tile.id} exposes its immediate-reward face`);
    assert.equal(setiTechAbilityFace(scene, definition.id, tile.id), sceneTile.sheet, `${tile.id} exposes its installed ability face`);
  }
}

const telescope = SETI_TECH_BY_ID.seti_tech_stack_telescope_1;
const telescopeScene = sceneStacks.find((stack) => stack.guid === telescope.sourceGuid)!;
assert.notEqual(telescope.tiles[0].sourceCardId, telescopeScene.tiles[0].cardId, 'fixture proves catalog order differs from scene JSON order');
assert.equal(
  setiTechBack(scene, telescope.id, telescope.tiles[0].id),
  telescopeScene.tiles.find((tile) => tile.cardId === telescope.tiles[0].sourceCardId)!.back,
  'top tile art follows the public tile id instead of the first scene tile',
);

assert.equal(setiTechBack(scene, 'not-a-technology', 'missing'), undefined, 'unknown technology does not invent art');
console.log('SETI technology art mapping: 12 authentic stacks and 48 exact tile faces verified');
