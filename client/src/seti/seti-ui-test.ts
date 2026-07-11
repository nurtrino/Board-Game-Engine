import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boardWorldToPercent, nestedDiscAngles, parseSetiCell, unwrapSector } from './setiGeometry.js';
import { setiCellPoint } from './setiGeometry.js';
import { normalizeSetiView } from './setiView.js';
import { buildSetiCardCatalog, findSetiCard, type SetiSceneDef } from './SetiScene.js';

assert.deepEqual(parseSetiCell('seti_cell_r2s7'), { ring: 2, sector: 7 });
assert.deepEqual(nestedDiscAngles([2, 3, 5]), [-45, -90, 225]);
assert.equal(unwrapSector(7, 0), 8);
assert.ok(setiCellPoint('seti_cell_r0s1').x > 50 && setiCellPoint('seti_cell_r0s1').y > 50);
assert.deepEqual(boardWorldToPercent([[10, 0, -5], [0, 20, -10]], [0, 0]), { x: 50, y: 50 });

const view = normalizeSetiView({
  game: 'seti',
  round: 2,
  phase: 'playing',
  activeSeat: 1,
  startingSeat: 0,
  you: 1,
  mainActionTaken: false,
  passedSeats: [],
  players: [
    { seat: 0, color: 'White', name: 'A', score: 4, publicity: 4, credits: 4, energy: 3, dataPool: 0, computer: { top: [false, false, false, false, false, false], tech: {} }, techs: [] },
    { seat: 1, color: 'Green', name: 'B', score: 6, publicity: 5, credits: 3, energy: 2, dataPool: 1, hand: ['seti_project_204500'], incomeCards: [{ cardId: 'seti_project_204501' }], computer: { top: [true, false, false, false, false, false], tech: {} }, techs: [{ stackId: 'seti_tech_stack_probe_1', tileId: 'tile' }] },
  ],
  solar: { orientations: { base: 0, disc1: 1, disc2: 3, disc3: 4 }, rotationPointer: 2, bodyCells: { Earth: 'seti_cell_r0s1' }, pieces: [{ id: 'probe-1', owner: 1, kind: 'probe', cell: 'seti_cell_r1s3', supportLayer: 1 }] },
  sectors: { kepler22: { id: 'kepler22', capacity: 5, dataRemaining: 4, signals: [{ owner: 1, sequence: 3 }], wins: [] } },
  planets: { Earth: { body: 'Earth', orbiters: [], landers: [], firstLandingBonuses: [] } },
  sectorBoardOrder: ['kepler-proxima'],
  projectRow: ['seti_project_204500', null, 'seti_project_204502'],
  techStacks: [{ id: 'seti_tech_stack_probe_1', count: 3, firstTakeBonusAvailable: true, topTileId: null }],
  goldTiles: [{ id: 'seti_gold_tech', side: 'B' }],
  species: [{ slot: 0, revealed: false, speciesId: null, discovery: {}, research: [] }],
  pending: { kind: 'signal-sector', owner: 1, decision: { kind: 'signal-sector', owner: 1, options: ['kepler22'] } },
  winners: null,
  legal: { canEndTurn: false, canPass: true, canLaunch: true, canAnalyze: false, moveTargets: { 'probe-1': ['seti_cell_r1s2'] }, moveEnergyCost: { 'probe-1': { seti_cell_r1s2: 2 } }, orbitTargets: {}, landTargets: {}, scanSectorTargets: ['kepler22'], techStackTargets: [], traceTargets: [], playableCards: [], placeDataSlots: [1], buyableRow: [], pendingOptions: ['kepler22'] },
});

assert.equal(view.players[1].color, 'green');
assert.deepEqual(view.players[1].computer.slice(0, 2), [true, false]);
assert.deepEqual(view.players[1].techs, ['seti_tech_stack_probe_1']);
assert.deepEqual(view.orientations, [1, 3, 4]);
assert.equal(view.bodyCells.Earth, 'seti_cell_r0s1');
assert.equal(view.sectors[0].data, 4);
assert.deepEqual(view.pending?.options, ['kepler22']);
assert.deepEqual(view.projectRow, ['seti_project_204500', '', 'seti_project_204502']);

const scene = JSON.parse(readFileSync(new URL('../../public/seti/scene.json', import.meta.url), 'utf8')) as SetiSceneDef;
const cards = buildSetiCardCatalog(scene);
assert.equal(cards.filter((card) => /^project-/.test(card.id)).length, 140);
const project = findSetiCard(cards, 'seti_project_204569');
assert.equal(project?.sheet, '/seti/cards/project-2045.webp');
assert.equal(project?.name, 'Low-Power Microprocessors');
assert.equal(project?.cell, 69);
assert.equal(project?.cols, 10);
assert.equal(project?.rows, 7);
const alien = findSetiCard(cards, 'seti_alien_exertians_15');
assert.equal(alien?.sheet, '/seti/cards/alien-exertians.webp');
assert.equal(alien?.cell, 14);
assert.equal(alien?.cols, 5);

console.log('seti ui helpers: ok');
