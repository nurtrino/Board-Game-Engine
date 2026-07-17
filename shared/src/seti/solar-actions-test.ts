import { strict as assert } from 'node:assert';
import { SETI_CELL_IDS, SETI_SEATS, SETI_TECH_BY_ID, SETI_TECH_STACKS, type SetiCellId } from './data.js';
import { rotateSetiSolarSystem } from './actions.js';
import { emptySetiProjectTurnFacts } from './projectRuntime.js';
import {
  getSetiSolarRotationTransition,
  rotateSetiSolarOrientations,
  setiSolarVisitGrantsPublicity,
  setiVisibleSolarFeatureAt,
  type SetiRotatingSolarLayer,
  type SetiSolarOrientations,
} from './solarGeometry.js';
import { createSeti, type SetiPlayer, type SetiState } from './state.js';

const game = (): SetiState => {
  const state = createSeti(SETI_SEATS.slice(0, 2).map((color, index) => ({ name: `Solar ${index}`, color })), 0x5014);
  state.phase = 'playing';
  state.pending = [];
  state.activeSeat = 0;
  state.mainActionTaken = false;
  state.turnResolution = null;
  state.projectRuntime.turn = emptySetiProjectTurnFacts(0);
  for (const player of state.players) {
    player.passed = false;
    player.missions = [];
    player.techs = [];
    player.publicity = 0;
    player.suppressProbePublicityThisTurn = false;
  }
  for (const slot of state.species) {
    slot.revealed = false;
    slot.module = null;
  }
  return state;
};

const place = (state: SetiState, player: SetiPlayer, cell: SetiCellId): void => {
  state.solar.pieces = [{ id: 'solar-action-piece', owner: player.seat, kind: 'probe', cell, supportLayer: 0 }];
};

// Check the mutating reducer against the pure physical model for every
// orientation, cell, and selected disc.
{
  const state = game();
  const player = state.players[0];
  player.suppressProbePublicityThisTurn = true;
  let transitions = 0;
  for (let disc1 = 0; disc1 < 8; disc1++) for (let disc2 = 0; disc2 < 8; disc2++) for (let disc3 = 0; disc3 < 8; disc3++) {
    const before: SetiSolarOrientations = { disc1, disc2, disc3 };
    for (const selected of [1, 2, 3] as const) for (const cell of SETI_CELL_IDS) {
      transitions++;
      state.solar.orientations = { base: 0, ...before };
      state.solar.rotationPointer = selected;
      state.pending = [];
      state.log.length = 0;
      state.projectRuntime.turn = emptySetiProjectTurnFacts(0);
      place(state, player, cell);
      const expected = getSetiSolarRotationTransition(before, selected, cell);
      rotateSetiSolarSystem(state);
      const piece = state.solar.pieces[0];
      assert.deepEqual(state.solar.orientations, { base: 0, ...expected.orientationsAfter });
      assert.equal(piece.cell, expected.to);
      assert.equal(piece.supportLayer, expected.supportAfter);
      assert.equal(state.solar.rotationPointer, selected === 3 ? 1 : selected + 1);
    }
  }
  assert.equal(transitions, 36_864);
}

interface VisitTransition {
  before: SetiSolarOrientations;
  selected: SetiRotatingSolarLayer;
  from: SetiCellId;
  to: SetiCellId;
}

const findVisit = (predicate: (feature: NonNullable<ReturnType<typeof setiVisibleSolarFeatureAt>>) => boolean): VisitTransition => {
  for (let disc1 = 0; disc1 < 8; disc1++) for (let disc2 = 0; disc2 < 8; disc2++) for (let disc3 = 0; disc3 < 8; disc3++) {
    const before = { disc1, disc2, disc3 };
    for (const selected of [1, 2, 3] as const) {
      const after = rotateSetiSolarOrientations(before, selected);
      for (const from of SETI_CELL_IDS) {
        const transition = getSetiSolarRotationTransition(before, selected, from);
        if (!transition.moved) continue;
        const destination = setiVisibleSolarFeatureAt(after, transition.to);
        if (destination && predicate(destination)) return { before, selected, from, to: transition.to };
      }
    }
  }
  throw new Error('No matching solar visit transition exists');
};

const rotateVisit = (state: SetiState, player: SetiPlayer, transition: VisitTransition): void => {
  state.solar.orientations = { base: 0, ...transition.before };
  state.solar.rotationPointer = transition.selected;
  state.pending = [];
  state.projectRuntime.turn = emptySetiProjectTurnFacts(state.activeSeat);
  place(state, player, transition.from);
  rotateSetiSolarSystem(state);
  assert.equal(state.solar.pieces[0].cell, transition.to);
};

// Printed planet/comet publicity and tech-enabled asteroid publicity both
// apply to free rotation movement; Earth and un-upgraded asteroids do not.
{
  const printed = findVisit((feature) => setiSolarVisitGrantsPublicity(feature, false));
  const earth = findVisit((feature) => feature.body === 'Earth');
  const asteroid = findVisit((feature) => feature.kind === 'asteroid');
  const state = game();
  const player = state.players[0];

  rotateVisit(state, player, printed);
  assert.equal(player.publicity, 1, 'rotation grants printed visit publicity');

  player.publicity = 0;
  rotateVisit(state, player, earth);
  assert.equal(player.publicity, 0, 'rotation into Earth grants no publicity');

  player.publicity = 0;
  rotateVisit(state, player, asteroid);
  assert.equal(player.publicity, 0, 'rotation into an asteroid grants no publicity without navigation tech');

  const navigation = SETI_TECH_STACKS.find((stack) => SETI_TECH_BY_ID[stack.id].ability === 'asteroid-navigation')!;
  player.techs.push({ stackId: navigation.id, tileId: navigation.tiles[0].id });
  rotateVisit(state, player, asteroid);
  assert.equal(player.publicity, 1, 'rotation into an asteroid grants publicity with navigation tech');
}

// General visit missions may trigger when another player rotates your probe;
// Asteroids Research is explicitly limited to its owner's turn.
{
  const planet = findVisit((feature) => feature.kind === 'planet' && feature.body !== 'Earth');
  const asteroid = findVisit((feature) => feature.kind === 'asteroid');
  const state = game();
  const visitor = state.players[1];
  visitor.missions = ['seti_project_204501'];
  rotateVisit(state, visitor, planet);
  assert.ok(state.pending.some((decision) => decision.kind === 'manual-trigger-choice'
    && decision.owner === visitor.seat
    && decision.options.some((option) => option.startsWith('claim|seti_project_204501|'))), 'planet visit mission triggers outside its owner turn');

  visitor.missions = ['seti_project_204509'];
  rotateVisit(state, visitor, asteroid);
  assert.ok(!state.pending.some((decision) => decision.kind === 'manual-trigger-choice'
    && decision.options.some((option) => option.startsWith('claim|seti_project_204509|'))), 'Asteroids Research does not trigger outside its owner turn');

  state.activeSeat = visitor.seat;
  visitor.missions = ['seti_project_204509'];
  rotateVisit(state, visitor, asteroid);
  assert.ok(state.pending.some((decision) => decision.kind === 'manual-trigger-choice'
    && decision.owner === visitor.seat
    && decision.options.some((option) => option.startsWith('claim|seti_project_204509|'))), 'Asteroids Research triggers on its owner turn');
}

console.log('seti solar actions: ok (36,864 reducer transitions + visit publicity/mission timing)');
