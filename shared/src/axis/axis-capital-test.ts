import assert from 'node:assert/strict';
import { applyAxisAction, type AxisAction } from './actions.js';
import { TURN_ORDER, type PowerKey } from './config.js';
import { AXIS_INDEX, createAxisGame } from './game.js';
import {
  activePower,
  axisViewFor,
  normalizeAxisState,
  operatingPower,
  productionOf,
  unitCount,
  type AxisState,
} from './state.js';

const makeState = (seed: number): AxisState => createAxisGame([], seed, {
  scenario: '1941',
  rnd: true,
  nationalObjectives: false,
  winCondition: 'standard',
});

const act = (state: AxisState, seat: PowerKey, action: AxisAction) =>
  applyAxisAction(state, AXIS_INDEX, seat, action);

const turnIndex = (power: PowerKey) => TURN_ORDER['1941'].indexOf(power);

function chinaBoardSnapshot(state: AxisState): string {
  return JSON.stringify(Object.fromEntries(Object.entries(state.board)
    .map(([space, stacks]) => [space, stacks.filter((stack) => stack.power === 'china')])
    .filter(([, stacks]) => (stacks as AxisState['board'][string]).length > 0)));
}

function beginCapturedUsaTurn(state: AxisState): void {
  state.powers.usa.capitalHeldBy = 'japan';
  state.powers.usa.ipcs = 0;
  state.powers.usa.staging = {};
  state.powers.usa.researchTokens = 0;
  state.control['eastern-united-states'] = 'japan';
  state.board['eastern-united-states'] = [];
  // This fixture skips directly over Japan's opening attack. Remove the lone
  // US transport trapped with Japan's carrier so the capital-flow assertions
  // are not also responsible for resolving a mandatory same-zone sea battle.
  state.board['sz-50'] = (state.board['sz-50'] ?? []).filter((stack) => stack.power !== 'usa');
  state.turnIdx = turnIndex('italy');
  state.phase = 'mobilize';
  state.turnStartedCapitalOccupied = false;
  assert.equal(act(state, 'italy', { type: 'endPhase' }).ok, true, 'Italy hands play to occupied USA');
  assert.equal(activePower(state), 'usa');
  assert.equal(state.phase, 'combatMove', 'occupied USA skips research and purchase');
  assert.equal(state.turnStartedCapitalOccupied, true);
}

function runUsOperationsToMobilize(state: AxisState, first: 'usa' | 'china' = 'china'): void {
  assert.equal(act(state, 'usa', { type: 'chooseUsOperationOrder', first }).ok, true);
  assert.equal(operatingPower(state), first);
  assert.equal(act(state, 'usa', { type: 'endPhase' }).ok, true, 'first USA/China combat block ends');
  assert.equal(state.phase, 'combatMove');
  assert.equal(act(state, 'usa', { type: 'endPhase' }).ok, true, 'second USA/China combat block ends');
  assert.equal(state.phase, 'noncombat');
  assert.equal(act(state, 'usa', { type: 'endPhase' }).ok, true, 'first USA/China noncombat block ends');
  assert.equal(state.phase, 'noncombat');
  assert.equal(act(state, 'usa', { type: 'endPhase' }).ok, true, 'second USA/China noncombat block ends');
  assert.equal(state.phase, 'mobilize');
}

// Capital capture immediately destroys only the victim's economic staging.
{
  const state = makeState(3101);
  state.turnIdx = turnIndex('germany');
  state.phase = 'combatMove';
  state.board['central-united-states'] = [{ power: 'germany', key: 'infantry', count: 1 }];
  state.control['central-united-states'] = 'germany';
  state.board['eastern-united-states'] = [];
  state.control['eastern-united-states'] = 'usa';
  state.board['western-united-states'] = [{ power: 'usa', key: 'fighter', count: 2 }];
  state.powers.usa.ipcs = 17;
  state.powers.usa.techs = ['warBonds'];
  state.powers.usa.researchTokens = 3;
  state.powers.usa.staging = { infantry: 2, tank: 1 };
  state.powers.usa.purchasedThisTurn = { infantry: { count: 2, paidUnitCost: 3 } };
  state.powers.usa.factoriesUsed = { 'western-united-states': 4 };
  state.chinaGrant = 2;
  state.chinaGrantPreparedRound = state.round;
  const germanyBefore = state.powers.germany.ipcs;
  const usaBoardBefore = JSON.stringify(state.board['western-united-states']);
  const chinaBefore = chinaBoardSnapshot(state);

  const captured = act(state, 'germany', {
    type: 'attack',
    target: 'eastern-united-states',
    forces: [{ from: 'central-united-states', units: [{ key: 'infantry', count: 1 }] }],
  });
  assert.equal(captured.ok, true, captured.error);
  assert.equal(state.control['eastern-united-states'], 'germany');
  assert.equal(state.powers.usa.capitalHeldBy, 'germany');
  assert.equal(state.powers.usa.ipcs, 0);
  assert.equal(state.powers.germany.ipcs, germanyBefore + 17, 'only unspent IPCs are looted');
  assert.deepEqual(state.powers.usa.staging, {}, 'all unmobilized units are lost');
  assert.deepEqual(state.powers.usa.purchasedThisTurn, {}, 'captured purchase provenance is cleared with staging');
  assert.equal(state.powers.usa.researchTokens, 0, 'all standing researchers are lost');
  assert.deepEqual(state.powers.usa.factoriesUsed, {}, 'obsolete factory usage is cleared');
  assert.deepEqual(state.powers.usa.techs, ['warBonds'], 'developed technology survives');
  assert.equal(JSON.stringify(state.board['western-united-states']), usaBoardBefore, 'board units survive elsewhere');
  assert.equal(chinaBoardSnapshot(state), chinaBefore, 'Chinese forces are a separate force');
  assert.equal(state.chinaGrant, 2, 'China grant is not confiscated with Washington');
  assert.ok(state.log.some((entry) => /unmobilized units.*researchers/i.test(entry.text)));
}

// An occupied non-USA turn retains combat/noncombat and skips every economic phase.
{
  const state = makeState(3102);
  state.powers.ussr.capitalHeldBy = 'germany';
  state.powers.ussr.ipcs = 9;
  state.control.russia = 'germany';
  state.board.russia = [];
  state.turnIdx = turnIndex('germany');
  state.phase = 'mobilize';
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  assert.equal(activePower(state), 'ussr');
  assert.equal(state.phase, 'combatMove');
  assert.equal(state.turnStartedCapitalOccupied, true);
  const view = axisViewFor(state, AXIS_INDEX);
  assert.equal(view.capitalOccupied, true);
  assert.equal(view.turnStartedCapitalOccupied, true);

  const beforeRejectedResearch = JSON.stringify(state);
  assert.equal(act(state, 'ussr', { type: 'buyResearch', dice: 1 }).ok, false);
  assert.equal(JSON.stringify(state), beforeRejectedResearch, 'skipped research action is a no-op');
  assert.equal(act(state, 'ussr', { type: 'buy', key: 'infantry', count: 1 }).ok, false);
  assert.equal(act(state, 'ussr', { type: 'endPhase' }).ok, true, 'combat can still finish');
  assert.equal(state.phase, 'noncombat');
  assert.equal(act(state, 'ussr', { type: 'endPhase' }).ok, true, 'noncombat can still finish');
  assert.equal(activePower(state), 'japan', 'still-occupied USSR advances without mobilization');
  assert.equal(state.powers.ussr.ipcs, 9, 'no income is collected');
  assert.equal(state.powers.ussr.lastIncome, 0);
}

// Recapturing the capital during combat restores income, not skipped purchases.
{
  const state = makeState(3103);
  state.powers.ussr.capitalHeldBy = 'germany';
  state.powers.ussr.ipcs = 0;
  state.control.russia = 'germany';
  state.board.russia = [];
  state.turnIdx = turnIndex('germany');
  state.phase = 'mobilize';
  assert.equal(act(state, 'germany', { type: 'endPhase' }).ok, true);
  state.control.caucasus = 'ussr';
  state.board.caucasus = [{ power: 'ussr', key: 'infantry', count: 1 }];

  const recaptured = act(state, 'ussr', {
    type: 'attack',
    target: 'russia',
    forces: [{ from: 'caucasus', units: [{ key: 'infantry', count: 1 }] }],
  });
  assert.equal(recaptured.ok, true, recaptured.error);
  assert.equal(state.powers.ussr.capitalHeldBy, null);
  assert.equal(state.turnStartedCapitalOccupied, true, 'turn-start skip snapshot survives liberation');
  const liberatedView = axisViewFor(state, AXIS_INDEX);
  assert.equal(liberatedView.capitalOccupied, false);
  assert.equal(liberatedView.turnStartedCapitalOccupied, true, 'view distinguishes restored income from already-skipped phases');
  assert.equal(act(state, 'ussr', { type: 'endPhase' }).ok, true);
  assert.equal(act(state, 'ussr', { type: 'endPhase' }).ok, true);
  assert.equal(state.phase, 'mobilize', 'liberated power reaches the income shell');

  state.powers.ussr.staging = { infantry: 1 }; // malicious/legacy residue
  const beforeRejectedPlacement = JSON.stringify(state);
  const rejected = act(state, 'ussr', { type: 'place', space: 'russia', key: 'infantry', count: 1 });
  assert.equal(rejected.ok, false);
  assert.equal(JSON.stringify(state), beforeRejectedPlacement, 'skipped-purchase placement cannot partially mutate state');
  const expectedIncome = productionOf(state, AXIS_INDEX, 'ussr');
  assert.equal(act(state, 'ussr', { type: 'endPhase' }).ok, true);
  assert.equal(state.powers.ussr.staging.infantry, 1, 'undeployable occupied-start carryover survives the turn');
  assert.equal(state.powers.ussr.ipcs, expectedIncome, 'income resumes after midturn capital liberation');
  assert.equal(state.powers.ussr.lastIncome, expectedIncome);
}

// Washington's occupation does not suppress either operation block or China's grant.
{
  const state = makeState(3104);
  beginCapturedUsaTurn(state);
  assert.ok(state.chinaGrant > 0, 'China grant snapshots at occupied USA turn start');
  assert.equal(state.chinaGrantPreparedRound, state.round);
  const grant = state.chinaGrant;
  const beforeRejectedBuy = JSON.stringify(state);
  assert.equal(act(state, 'usa', { type: 'buy', key: 'infantry', count: 1 }).ok, false);
  assert.equal(JSON.stringify(state), beforeRejectedBuy, 'USA cannot buy and the rejection is atomic');
  runUsOperationsToMobilize(state);
  assert.ok(state.chinaPlacementSpaces.length > 0, 'China still receives placement choices');

  state.powers.usa.staging = { infantry: 1 }; // prove regular placement is independently blocked
  const beforeRejectedPlacement = JSON.stringify(state);
  assert.equal(act(state, 'usa', {
    type: 'placeBatch',
    space: 'western-united-states',
    units: [{ key: 'infantry', count: 1 }],
  }).ok, false);
  assert.equal(JSON.stringify(state), beforeRejectedPlacement, 'occupied-start USA placement is a no-op');
  state.powers.usa.staging = {};

  const destination = state.chinaPlacementSpaces[0];
  const chineseBefore = unitCount(state, destination, 'china', 'infantry');
  assert.equal(act(state, 'usa', {
    type: 'placeBatch', space: destination, units: [], china: grant,
  }).ok, true, 'China may place its full independent grant');
  assert.equal(unitCount(state, destination, 'china', 'infantry'), chineseBefore + grant);
  assert.equal(state.chinaGrant, 0);
  assert.equal(act(state, 'usa', { type: 'endPhase' }).ok, true);
  assert.equal(state.powers.usa.ipcs, 0, 'occupied USA receives no income');
  assert.equal(state.powers.usa.lastIncome, 0);
}

// A positive grant with no eligible China-controlled destination resolves cleanly.
{
  const state = makeState(3105);
  for (const territory of AXIS_INDEX.map.territories) {
    if (territory.isChinese) state.control[territory.id] = 'usa';
  }
  beginCapturedUsaTurn(state);
  assert.ok(state.chinaGrant > 0, 'non-Axis-held printed Chinese territories still generate a grant');
  runUsOperationsToMobilize(state, 'usa');
  assert.deepEqual(state.chinaPlacementSpaces, []);
  assert.equal(state.chinaGrant, 0, 'undeployable grant auto-resolves instead of deadlocking');
  assert.match(state.log.at(-1)?.text ?? '', /cannot deploy.*no eligible/i);
  assert.equal(act(state, 'usa', { type: 'endPhase' }).ok, true, 'turn can end without an eligible China space');
}

// Capital liberation sweeps friendly-held originals and factories, with the AA exception.
{
  const state = makeState(3106);
  assert.equal(state.originalOwner.india, 'uk');
  assert.equal(state.originalOwner.australia, 'uk');
  assert.equal(state.originalOwner.kwangtung, 'uk');
  state.turnIdx = turnIndex('usa');
  state.phase = 'combatMove';
  state.usaOperationFirst = 'usa';
  state.usaOperationIndex = 0;
  state.powers.uk.capitalHeldBy = 'japan';
  state.control['united-kingdom'] = 'japan';
  state.board['sz-2'] = [{
    power: 'usa', key: 'transport', count: 1,
    cargo: [{ power: 'usa', key: 'infantry', count: 1 }],
  }];
  state.board['united-kingdom'] = [
    { power: 'ussr', key: 'factory', count: 1 },
    { power: 'ussr', key: 'aaGun', count: 1 },
    { power: 'ussr', key: 'infantry', count: 1 },
  ];
  state.control.india = 'usa';
  state.board.india = [
    { power: 'usa', key: 'factory', count: 1 },
    { power: 'usa', key: 'aaGun', count: 1 },
    { power: 'usa', key: 'infantry', count: 1 },
  ];
  state.control.kwangtung = 'china';
  state.board.kwangtung = [
    { power: 'china', key: 'factory', count: 1 },
    { power: 'china', key: 'aaGun', count: 1 },
    { power: 'china', key: 'infantry', count: 1 },
  ];
  state.control.australia = 'japan';
  state.board.australia = [
    { power: 'japan', key: 'factory', count: 1 },
    { power: 'japan', key: 'aaGun', count: 1 },
  ];

  const liberated = act(state, 'usa', {
    type: 'attack',
    target: 'united-kingdom',
    forces: [],
    offloadFrom: 'sz-2',
    offloadUnits: [{ key: 'infantry', count: 1 }],
  });
  assert.equal(liberated.ok, true, liberated.error);
  assert.equal(state.powers.uk.capitalHeldBy, null);
  assert.equal(state.control['united-kingdom'], 'uk');
  assert.equal(unitCount(state, 'united-kingdom', 'uk', 'factory'), 1, 'capital factory returns to UK');
  assert.equal(unitCount(state, 'united-kingdom', 'uk', 'aaGun'), 1, 'capital AA returns to UK');
  assert.equal(unitCount(state, 'united-kingdom', 'ussr', 'infantry'), 1, 'capital ordinary ally remains Soviet');

  assert.equal(state.control.india, 'uk');
  assert.equal(unitCount(state, 'india', 'uk', 'factory'), 1, 'noncapital factory returns');
  assert.equal(unitCount(state, 'india', 'usa', 'aaGun'), 1, 'noncapital AA preserves pre-liberation owner');
  assert.equal(unitCount(state, 'india', 'usa', 'infantry'), 1, 'noncapital ordinary unit remains American');
  assert.equal(state.control.kwangtung, 'uk', 'Kwangtung naturally returns with other UK originals');
  assert.equal(unitCount(state, 'kwangtung', 'uk', 'factory'), 1);
  assert.equal(unitCount(state, 'kwangtung', 'china', 'aaGun'), 1, 'Kwangtung AA follows the noncapital exception');
  assert.equal(unitCount(state, 'kwangtung', 'china', 'infantry'), 1);
  assert.equal(state.control.australia, 'japan', 'enemy-held original territory does not sweep');
  assert.equal(unitCount(state, 'australia', 'japan', 'factory'), 1);
  assert.equal(unitCount(state, 'australia', 'japan', 'aaGun'), 1);
}

// Legacy saves hydrate the durable snapshot and cannot reopen skipped phases.
{
  const state = makeState(3107);
  state.turnIdx = turnIndex('usa');
  state.phase = 'purchase';
  state.powers.usa.capitalHeldBy = 'japan';
  state.control['eastern-united-states'] = 'japan';
  delete (state as AxisState & { turnStartedCapitalOccupied?: boolean }).turnStartedCapitalOccupied;
  delete (state as AxisState & { chinaGrantPreparedRound?: number | null }).chinaGrantPreparedRound;
  const boardBefore = JSON.stringify(state.board);
  const techsBefore = JSON.stringify(state.powers.usa.techs);
  assert.equal(normalizeAxisState(state), state);
  assert.equal(state.turnStartedCapitalOccupied, true);
  assert.equal(state.phase, 'combatMove', 'legacy occupied purchase save migrates past economic phases');
  assert.equal(state.chinaGrantPreparedRound, state.round);
  assert.ok(state.chinaGrant > 0, 'legacy occupied USA turn hydrates its China grant');
  assert.equal(JSON.stringify(state.board), boardBefore, 'capital migration leaves board forces untouched');
  assert.equal(JSON.stringify(state.powers.usa.techs), techsBefore);
}

console.log('axis captured-capital turns: all checks passed');
