import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardWorldToPercent, nestedDiscAngles, parseSetiCell, unwrapSector } from './setiGeometry.js';
import { setiCellPoint } from './setiGeometry.js';
import { normalizeSetiView } from './setiView.js';
import { buildSetiCardCatalog, findSetiCard, SetiTable, type SetiSceneDef } from './SetiScene.js';
import { setiAffordableMoveCells, setiMovePaymentForCost } from './setiMovePayment.js';

Object.assign(globalThis, { React });

const sceneSource = readFileSync(new URL('./SetiScene.tsx', import.meta.url), 'utf8');
const playSource = readFileSync(new URL('./SetiPlay.tsx', import.meta.url), 'utf8');
const boardSource = readFileSync(new URL('./SetiBoard.tsx', import.meta.url), 'utf8');
const soloSource = readFileSync(new URL('./SetiSoloRival.tsx', import.meta.url), 'utf8');
const setiCss = readFileSync(new URL('./seti.css', import.meta.url), 'utf8');
const soloCss = readFileSync(new URL('./setiSolo.css', import.meta.url), 'utf8');

assert.deepEqual(parseSetiCell('seti_cell_r2s7'), { ring: 2, sector: 7 });
assert.deepEqual(nestedDiscAngles([2, 3, 5]), [-45, -90, 225]);
assert.equal(unwrapSector(7, 0), 8);
assert.ok(setiCellPoint('seti_cell_r0s1').x > 50 && setiCellPoint('seti_cell_r0s1').y > 50);
assert.deepEqual(boardWorldToPercent([[10, 0, -5], [0, 20, -10]], [0, 0]), { x: 50, y: 50 });

assert.deepEqual(setiMovePaymentForCost(1, 1, null, ['move-card']), { energy: 1 }, 'energy payment is available only at exact affordability');
assert.equal(setiMovePaymentForCost(1, 0, null, ['move-card']), null, 'raw move is disabled when energy cannot pay');
assert.deepEqual(setiMovePaymentForCost(1, 0, 'move-card', ['move-card']), { cardId: 'move-card' }, 'selected movement card pays the base movement cost');
assert.equal(setiMovePaymentForCost(2, 0, 'move-card', ['move-card']), null, 'movement card cannot hide an unaffordable asteroid surcharge');
assert.deepEqual(setiMovePaymentForCost(2, 1, 'move-card', ['move-card']), { cardId: 'move-card' }, 'movement card plus affordable surcharge is legal');
assert.equal(setiMovePaymentForCost(1, 0, 'stale-card', ['move-card']), null, 'stale or ineligible selected card cannot produce payment');
assert.deepEqual(setiAffordableMoveCells(
  ['energy-cell', 'card-cell', 'blocked-cell'],
  { 'energy-cell': 1, 'card-cell': 1, 'blocked-cell': 2 },
  0,
  'move-card',
  ['move-card'],
), ['energy-cell', 'card-cell'], 'only destinations affordable by the chosen card remain enabled');

const pointerDownStart = sceneSource.indexOf('const down = (event: ReactPointerEvent<HTMLButtonElement>) => {');
const pointerDownEnd = sceneSource.indexOf('const move = (event: ReactPointerEvent<HTMLButtonElement>) => {', pointerDownStart);
const pressBeforeDrag = sceneSource.indexOf('onPress?.();', pointerDownStart);
const captureAfterPress = sceneSource.indexOf('event.currentTarget.setPointerCapture(event.pointerId);', pointerDownStart);
const dragAfterPress = sceneSource.indexOf('setDrag({', pointerDownStart);
assert.ok(pointerDownStart >= 0 && pointerDownEnd > pointerDownStart, 'tactile pointer-down handler exists');
assert.ok(pressBeforeDrag > pointerDownStart && pressBeforeDrag < captureAfterPress && captureAfterPress < dragAfterPress && dragAfterPress < pointerDownEnd, 'piece selection happens before pointer capture and drag state');
assert.match(sceneSource, /onPress=\{\(\) => onPiecePress\?\.\(piece\)\}/, 'solar piece press exposes destinations before movement');
assert.match(sceneSource, /onCell\?\.\(value,\s*piece\.id\)/, 'cell drops preserve the dragged piece id');
assert.match(sceneSource, /onBody\?\.\('orbit',\s*value,\s*piece\.id\)/, 'orbit drops preserve the dragged piece id');
assert.match(sceneSource, /onBody\?\.\('land',\s*value,\s*piece\.id\)/, 'landing drops preserve the dragged piece id');
assert.match(playSource, /onPiecePress=\{preparePieceDrag\}/, 'device table wires press-before-drag selection');
assert.match(playSource, /const moveSelected = \(cell: string, draggedPieceId\?: string\)[\s\S]*?const activePieceId = draggedPieceId \?\? pendingPieceId \?\? selectedPiece\?\.id \?\? null;/, 'move resolution prefers the dragged piece identity');
assert.match(playSource, /const bodySelected = \(kind: 'orbit' \| 'land', body: string, draggedPieceId\?: string\)[\s\S]*?const activePieceId = draggedPieceId \?\? pendingPieceId \?\? selectedPiece\?\.id \?\? null;/, 'orbit and land resolution prefer the dragged piece identity');

assert.match(playSource, /printedMissionSlots\.findIndex\(\(slot\) => slot\.id === choice\.slotId\)/, 'mission reward position is resolved by stable printed slot id');
assert.match(playSource, /'--slot-index': slotIndex, '--slot-count': slotCount/, 'stable mission slot position reaches the physical hotspot');

assert.match(playSource, /if \(\/initial\[-_\]income\/i\.test\(view\.pending\?\.kind \?\? ''\)\) \{[\s\S]*?setCard\(\{ id, origin: 'hand' \}\);\s*return;\s*\}/, 'initial-income hand touch opens the card instead of immediately tucking it');
assert.match(playSource, /onInitialIncome=\{\(\) => \{ send\(\{ type: 'choose_initial_income', cardId: card\.id \}/, 'the inspected card exposes the explicit income tuck action');

assert.match(playSource, /const \[handExpanded, setHandExpanded\] = useState\(false\)/, 'whole-hand fan has explicit UI state');
assert.match(playSource, /className="seti-hand-expand"[\s\S]*?aria-pressed=\{expanded\}/, 'whole-hand fan is an accessible toggle');
assert.match(playSource, /const cardGap = expanded \? Math\.min\(92, 760 \/ Math\.max\(1, cards\.length - 1\)\)/, 'expanded fan spreads the entire hand');
assert.match(setiCss, /\.seti-hand-rail\.is-expanded\s*\{[^}]*height:\s*min\(310px,\s*42vh\)/, 'expanded hand gets a dedicated full-hand surface');

assert.match(playSource, /moveCosts=\{moveCosts\}[\s\S]*?orbitCosts=\{orbitCosts\}[\s\S]*?landCosts=\{landCosts\}/, 'device passes all movement costs to physical destinations');
assert.match(playSource, /const legalCells = setiAffordableMoveCells\(rawLegalCells, rawMoveCosts, me\?\.energy \?\? 0, moveCardId, movementPaymentCards\)/, 'destination cells are filtered by the currently selected payment');
assert.match(playSource, /const payment = setiMovePaymentForCost\(cost, me\.energy, moveCardId, movementPaymentCards\);[\s\S]*?if \(!payment\) \{[\s\S]*?return;[\s\S]*?send\(\{ type: 'move'/, 'moveSelected refuses to emit an unaffordable payment');
assert.match(playSource, /movePaymentCards=\{movePaymentCardTargets\}[\s\S]*?onCardPress=\{\(id\) => \{ if \(selectedPiece && movePaymentCardTargets\.includes\(id\)\) armMovementCard\(id\); \}\}/, 'eligible movement cards arm on physical pointer-down so drag-to-cell remains continuous');
assert.match(playSource, /kind === 'cell' && selectedPiece && rawLegalCells\.includes\(value\)[\s\S]*?setiMovePaymentForCost\(cost, me\.energy, id, movementPaymentCards\)[\s\S]*?if \(!payment\) return false;/, 'card drag validates base cost and surcharge before sending');
assert.match(setiCss, /\.seti-hand-card\.is-move-option:not\(\.is-move-payment\)/, 'eligible movement-corner cards receive a distinct physical highlight');
assert.match(sceneSource, /function TargetCost\(\{ credit, energy, card \}:/, 'physical destination cost artifact exists');
assert.match(sceneSource, /<TargetCost credit=\{cost\?\.credit\} energy=\{cost\?\.energy\} \/>/, 'orbit target shows both printed resource costs');
assert.match(sceneSource, /<TargetCost energy=\{cost\} \/>/, 'landing target shows its energy cost');
assert.match(sceneSource, /<TargetCost card=\{moveCosts\[legalCell \?\? id\]\?\.card\} energy=\{moveCosts\[legalCell \?\? id\]\?\.energy\} \/>/, 'movement cell shows its physical payment artifacts');

assert.ok(playSource.includes('tokenSrc={`/seti/tokens/credit-${me.color.toLowerCase()}.webp`}'), 'credit counter uses authentic color-matched token art');
assert.ok(playSource.includes('tokenSrc={`/seti/tokens/energy-${me.color.toLowerCase()}.webp`}'), 'energy counter uses authentic color-matched token art');
assert.match(playSource, /<img src="\/seti\/tokens\/first-player\.webp" alt="starting player token" \/>/, 'device header uses the authentic first-player token');
assert.ok((boardSource.match(/<img src="\/seti\/tokens\/first-player\.webp" alt="starting player token" \/>/g) ?? []).length >= 2, 'TV score rail and details use the authentic first-player token');
for (const color of ['white', 'green', 'orange', 'purple']) {
  for (const resource of ['credit', 'energy']) {
    assert.ok(existsSync(new URL(`../../public/seti/tokens/${resource}-${color}.webp`, import.meta.url)), `${resource}-${color} token art exists`);
  }
}
assert.ok(existsSync(new URL('../../public/seti/tokens/first-player.webp', import.meta.url)), 'first-player token art exists');

assert.doesNotMatch(boardSource, /seti-species-rail|seti-species-tile|setiAlienBoard/, 'TV does not duplicate alien boards outside the physical SetiTable');
assert.equal((sceneSource.match(/<AlienBoards\b/g) ?? []).length, 1, 'the shared table renders one alien-board rack');

assert.match(soloSource, /lastActionStep:\s*solo\.lastActionStep === null \|\| solo\.lastActionStep === undefined \? null : asNumber\(solo\.lastActionStep\)/, 'solo display normalizes the resolved action step');
assert.ok((soloSource.match(/selectedStep=\{solo\.lastActionStep\}/g) ?? []).length >= 2, 'solo panel and TV HUD both pass the resolved step to authentic action art');
assert.match(soloSource, /className=\{index === selectedStep \? 'is-selected' : ''\}/, 'the exact resolved rival step receives selected styling');
assert.match(soloCss, /\.seti-rival-step-track i\.is-selected\s*\{/, 'selected rival step has a visible artifact style');

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
    { seat: 1, color: 'Green', name: 'B', score: 6, publicity: 5, credits: 3, energy: 2, dataPool: 1, hand: ['seti_project_204500'], alienMissions: ['seti_alien_mascamites_01'], incomeCards: [{ cardId: 'seti_project_204501' }], computer: { top: [true, false, false, false, false, true], tech: { seti_tech_stack_computer_1: { boardSlot: 3, lower: true } } }, techs: [{ stackId: 'seti_tech_stack_probe_1', tileId: 'tile' }, { stackId: 'seti_tech_stack_computer_1', tileId: 'computer-tile', computerSlot: 3 }] },
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
  legal: { canEndTurn: false, canPass: true, canLaunch: true, canAnalyze: false, canResearch: true, moveTargets: { 'probe-1': ['seti_cell_r1s2'] }, moveEnergyCost: { 'probe-1': { seti_cell_r1s2: 2 } }, orbitTargets: {}, landTargets: {}, scanSectorTargets: ['kepler22'], techStackTargets: [], traceTargets: [], playableCards: [], placeDataSlots: [1], buyableRow: [], pendingOptions: ['kepler22'] },
});

assert.equal(view.players[1].color, 'green');
assert.deepEqual(view.players[1].computer.top.slice(0, 2), [true, false]);
assert.deepEqual(view.players[1].computer.tech, [{ stackId: 'seti_tech_stack_computer_1', boardSlot: 3, lower: true }]);
assert.deepEqual(view.players[1].techs, [
  { stackId: 'seti_tech_stack_probe_1', tileId: 'tile', computerSlot: null },
  { stackId: 'seti_tech_stack_computer_1', tileId: 'computer-tile', computerSlot: 3 },
]);
assert.equal(view.legal.canResearch, true);
assert.deepEqual(view.players[1].missions, ['seti_alien_mascamites_01']);
assert.deepEqual(view.orientations, [1, 3, 4]);
assert.equal(view.bodyCells.Earth, 'seti_cell_r0s1');
assert.equal(view.sectors[0].data, 4);
assert.deepEqual(view.pending?.options, ['kepler22']);
assert.deepEqual(view.projectRow, ['seti_project_204500', '', 'seti_project_204502']);

const soloView = normalizeSetiView({
  ...view.raw,
  solo: {
    difficulty: 4,
    rivalScore: 37,
    rivalPublicity: 8,
    progress: 7,
    progressLoops: 2,
    activeObjectives: [{ objectiveId: 'seti_solo_objective_3_05', marked: [true, false, false] }],
    completedObjectives: ['seti_solo_objective_1_01'],
    objectiveDeckCount: 9,
    actionDeckCount: 3,
    actionDiscardCount: 2,
    currentActionCard: 'seti_solo_action_s15',
    lastActionCard: 'seti_solo_action_s04',
    lastActionStep: 2,
    techs: { probe: 2, telescope: 1, computer: 3 },
    computer: [true, true, false, false, false, false],
    dataPool: 5,
    rivalStartsRound: true,
    passed: false,
  },
  pending: {
    kind: 'solo-objective-task', owner: 0,
    decision: { kind: 'solo-objective-task', owner: 0, options: ['seti_solo_objective_3_05|1', 'seti_solo_objective_3_05|2'] },
  },
});
assert.equal(soloView.solo?.rivalPublicity, 8);
assert.deepEqual(soloView.solo?.activeObjectives[0], { objectiveId: 'seti_solo_objective_3_05', marked: [true, false, false] });
assert.deepEqual(soloView.solo?.techs, { probe: 2, telescope: 1, computer: 3 });
assert.deepEqual(soloView.solo?.computer, [true, true, false, false, false, false]);
assert.equal(soloView.solo?.lastActionStep, 2);
assert.deepEqual(soloView.pending?.options, ['seti_solo_objective_3_05|1', 'seti_solo_objective_3_05|2']);

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

const costMarkup = renderToStaticMarkup(createElement(SetiTable, {
  scene,
  view,
  compact: true,
  interactive: true,
  selectedPieceId: 'probe-1',
  legalCells: ['seti_cell_r1s2'],
  moveCosts: { seti_cell_r1s2: { energy: 2 } },
  orbitTargets: ['Mars'],
  orbitCosts: { Mars: { credit: 1, energy: 1 } },
  landTargets: ['Mars'],
  landCosts: { Mars: 2 },
}));
assert.match(costMarkup, /aria-label="move to ring 2 sector 3, 2 energy"/, 'SSR move cell exposes its exact energy cost');
assert.match(costMarkup, /aria-label="orbit Mars, 1 credit and 1 energy"/, 'SSR orbit target exposes both exact costs');
assert.match(costMarkup, /aria-label="land on Mars, 2 energy"/, 'SSR landing target exposes its exact cost');
assert.ok((costMarkup.match(/class="seti-target-cost"/g) ?? []).length >= 3, 'SSR renders cost artifacts on move, orbit, and land targets');
assert.match(costMarkup, /class="is-credit"/, 'SSR orbit artifact includes a credit token');
assert.match(costMarkup, /class="is-energy"/, 'SSR movement artifacts include energy tokens');

const cardCostMarkup = renderToStaticMarkup(createElement(SetiTable, {
  scene,
  view,
  compact: true,
  interactive: true,
  selectedPieceId: 'probe-1',
  legalCells: ['seti_cell_r1s2'],
  moveCosts: { seti_cell_r1s2: { card: true, energy: 1 } },
}));
assert.match(cardCostMarkup, /aria-label="move to ring 2 sector 3, movement card and 1 energy"/, 'SSR move cell describes the mixed card and energy payment');
assert.match(cardCostMarkup, /class="is-card"/, 'SSR move cell renders a physical movement-card artifact');

console.log('seti ui helpers: ok');
