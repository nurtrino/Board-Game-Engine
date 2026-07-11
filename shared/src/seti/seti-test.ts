// SETI engine acceptance tests: directed rules, hidden-information projection,
// conservation/determinism, and complete seeded five-round bot games.
// Run: npx tsx shared/src/seti/seti-test.ts

import {
  SETI_ALIEN_CARDS,
  SETI_BASE_PROJECT_CARDS,
  SETI_BODIES,
  SETI_CELL_IDS,
  SETI_PROMO_PROJECT_CARDS,
  SETI_PROJECT_BY_ID,
  SETI_RULES,
  SETI_SEATS,
  SETI_SECTORS,
  SETI_SOLAR_ART_ANCHORS,
  SETI_TECH_STACKS,
  adjacentSetiCells,
  parseSetiCell,
  setiCellId,
  type SetiBody,
  type SetiCellId,
  type SetiSectorId,
  type SetiTechStackId,
} from './data.js';
import {
  assertSetiState,
  createSeti,
  drawSetiProjectCard,
  earthSetiSectorId,
  getSetiBodyCells,
  getSetiLegalTargets,
  getSetiSolarFeatures,
  setiProjectCardTotal,
  setiSupportLayerForCell,
  setiViewFor,
  type SetiPlayer,
  type SetiState,
} from './state.js';
import {
  applySetiAction,
  chooseSetiBotAction,
  markSetiSignal,
  rotateSetiSolarSystem,
  runSetiBotGame,
  settleSetiCompletedSectors,
  type SetiAction,
} from './actions.js';

let passed = 0;
let failed = 0;
function ok(condition: unknown, message: string): asserts condition {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function equal<T>(actual: T, expected: T, message: string): void {
  ok(Object.is(actual, expected), `${message} (got ${String(actual)}, expected ${String(expected)})`);
}

function seats(count: number) {
  return SETI_SEATS.slice(0, count).map((color, index) => ({ name: `Bot ${index + 1}`, color }));
}

function act(s: SetiState, seat: number, action: SetiAction, label: string = action.type): void {
  const result = applySetiAction(s, seat, action);
  ok(result.ok, `${label}: ${result.error ?? 'accepted'}`);
}

function drainPending(s: SetiState, max = 100): void {
  for (let guard = 0; s.pending.length && guard < max; guard++) {
    const owner = s.pending[0].owner;
    const action = chooseSetiBotAction(s, owner);
    ok(action !== null, `bot resolves ${s.pending[0].kind}`);
    if (!action) return;
    act(s, owner, action, `resolve ${s.pending[0]?.kind ?? 'decision'}`);
  }
  ok(s.pending.length === 0, 'pending queue drains');
}

function ready(count = 2, seed = 1): SetiState {
  const s = createSeti(seats(count), seed);
  drainPending(s);
  equal(s.phase, 'playing', 'income selection enters play');
  return s;
}

function addProbeAt(s: SetiState, player: SetiPlayer, cell: SetiCellId): string {
  const id = `seti_test_probe_${s.solar.nextPieceId++}`;
  s.solar.pieces.push({ id, owner: player.seat, kind: 'probe', cell, supportLayer: setiSupportLayerForCell(s, cell) });
  return id;
}

// Catalog and setup provenance.
{
  equal(SETI_BASE_PROJECT_CARDS.length, 138, '138 base project cards');
  equal(SETI_PROMO_PROJECT_CARDS.length, 2, '2 optional promos');
  equal(SETI_ALIEN_CARDS.length, 55, '55 alien cards');
  equal(SETI_TECH_STACKS.length, 12, '12 technology stacks');
  ok(SETI_TECH_STACKS.every((stack) => stack.tiles.length === 4), 'every technology stack has four tiles');
  ok(SETI_TECH_STACKS.flatMap((stack) => stack.tiles).every((tile) => tile.immediateReward.status === 'typed'), 'all 48 immediate technology rewards are typed');
  ok((Object.keys(SETI_BODIES) as SetiBody[]).every((body) => ['none', 'typed'].includes(SETI_BODIES[body].orbitReward.status)), 'no fake/untranscribed moon or planet orbit reward');
  ok(SETI_BASE_PROJECT_CARDS.every((card) => card.id === `seti_project_${card.art.sourceCardId}` && !!card.art.faceUrl), 'project ids and authentic art cells are stable');
  ok(SETI_BASE_PROJECT_CARDS.every((card) => card.printed.effects === null && card.printed.status === 'untranscribed'), 'unverified project effects remain explicit gaps');
  equal(SETI_PROJECT_BY_ID.seti_project_204400.name, 'Lunar Gateway', 'replacement Lunar Gateway stays in base deck');
  ok(!SETI_BASE_PROJECT_CARDS.some((card) => card.id === 'seti_promo_41500' || card.id === 'seti_promo_204700'), 'promos excluded by default');
  equal(SETI_SOLAR_ART_ANCHORS.length, 6, 'six moving planets tied to authentic art centers');

  const a = createSeti(seats(4), 998);
  const b = createSeti(seats(4), 998);
  equal(JSON.stringify(a), JSON.stringify(b), 'same seed produces byte-identical setup');
  equal(a.solar.orientations.base, 0, 'printed solar base never rotates during setup');
  ok([a.solar.orientations.disc1, a.solar.orientations.disc2, a.solar.orientations.disc3].every((value) => value >= 0 && value < 8), 'three discs receive seeded 45-degree orientations');
  equal(new Set(a.sectorBoardOrder).size, 4, 'four sector boards uniformly permuted');
  equal(a.species.length, 2, 'two hidden species selected');
  equal(a.projectRow.filter(Boolean).length, 3, 'three-card project row');
  ok(a.roundEndStacks.every((stack) => stack.length === 5), '4p end-round stacks contain player count plus one');
  equal(setiProjectCardTotal(a), 138, 'project cards conserved at setup');
  assertSetiState(a);
}

// Initial income, explicit main action, and explicit end turn.
{
  const s = createSeti(seats(2), 3);
  const owner = s.pending[0].owner;
  ok(!applySetiAction(s, owner, { type: 'launch' }).ok, 'normal action rejected during income selection');
  const selected = s.players[owner].hand[0];
  const kind = SETI_PROJECT_BY_ID[selected].printed.incomeCorner;
  const before = { credits: s.players[owner].credits, energy: s.players[owner].energy, hand: s.players[owner].hand.length };
  act(s, owner, { type: 'choose_initial_income', cardId: selected });
  ok(s.players[owner].incomeCards.some((card) => card.cardId === selected && card.starting), 'selected card tucks as starting income');
  if (kind === 'credit') equal(s.players[owner].credits, before.credits + 1, 'credit income gained immediately');
  if (kind === 'energy') equal(s.players[owner].energy, before.energy + 1, 'energy income gained immediately');
  if (kind === 'card') equal(s.players[owner].hand.length, before.hand, 'card income replaces the tucked card immediately');
  drainPending(s);
  const active = s.activeSeat;
  const launch = applySetiAction(s, active, { type: 'launch' });
  ok(launch.ok, 'launch main action succeeds');
  equal(s.activeSeat, active, 'main action does not silently advance turn');
  ok(s.mainActionTaken, 'main action flag set');
  ok(!applySetiAction(s, active, { type: 'launch' }).ok, 'second main action rejected');
  act(s, active, { type: 'end_turn' });
  ok(s.activeSeat !== active, 'explicit end turn advances to next unpassed player');
}

// Movement graph, asteroid surcharge, publicity visits, and probe limit.
{
  const s = ready(2, 8);
  const p = s.players[s.activeSeat];
  const asteroid = getSetiSolarFeatures(s).find((feature) => feature.kind === 'asteroid')!.cell;
  const id = addProbeAt(s, p, asteroid);
  const to = adjacentSetiCells(asteroid)[0];
  p.energy = 1;
  const rejected = applySetiAction(s, p.seat, { type: 'move', pieceId: id, to });
  ok(!rejected.ok, 'leaving asteroids costs one extra movement energy');
  equal(p.energy, 1, 'failed asteroid move spends nothing');
  p.energy = 2;
  act(s, p.seat, { type: 'move', pieceId: id, to, payment: { energy: 2 } });
  equal(p.energy, 0, 'asteroid move spends two energy');
  const invalid = SETI_CELL_IDS.find((cell) => cell !== to && !adjacentSetiCells(to).includes(cell))!;
  p.energy = 5;
  const beforeInvalid = s.solar.pieces.find((piece) => piece.id === id)!.cell;
  ok(!applySetiAction(s, p.seat, { type: 'move', pieceId: id, to: invalid }).ok, 'movement reducer rejects non-adjacent target');
  equal(s.solar.pieces.find((piece) => piece.id === id)!.cell, beforeInvalid, 'failed non-adjacent move leaves piece in place');

  const publicity = getSetiSolarFeatures(s).find((feature) => feature.kind === 'publicity')!.cell;
  const from = adjacentSetiCells(publicity)[0];
  const publicityProbe = addProbeAt(s, p, from);
  p.energy = 5;
  p.publicity = 9;
  act(s, p.seat, { type: 'move', pieceId: publicityProbe, to: publicity });
  equal(p.publicity, 10, 'publicity cell raises publicity and clamps at 10');
  ok(getSetiLegalTargets(s, p.seat).canLaunch === false, 'base probe limit counts only probes in space');
}

// Exact orbit and landing rewards.
{
  const s = ready(2, 12);
  const p = s.players[s.activeSeat];
  const venus = getSetiBodyCells(s).Venus!;
  const probe = addProbeAt(s, p, venus);
  p.credits = 5;
  p.energy = 5;
  const score = p.score;
  const income = p.incomeCards.length;
  act(s, p.seat, { type: 'orbit', pieceId: probe, body: 'Venus' });
  equal(p.score, score + 9, 'Venus orbit gives printed 6 VP plus first-orbiter 3 VP');
  equal(s.planets.Venus.orbiters.length, 1, 'orbiter moves to planetary board');
  equal(s.solar.pieces.some((piece) => piece.id === probe), false, 'orbited probe leaves solar board');
  drainPending(s);
  equal(p.incomeCards.length, income + 1, 'Venus orbit tucks one income card');
}
{
  const s = ready(2, 16);
  const p = s.players[s.activeSeat];
  const mercury = getSetiBodyCells(s).Mercury!;
  const probe = addProbeAt(s, p, mercury);
  p.energy = 3;
  p.dataPool = 0;
  const score = p.score;
  act(s, p.seat, { type: 'land', pieceId: probe, body: 'Mercury' });
  equal(p.score, score + 12, 'Mercury landing scores 12 VP');
  equal(p.dataPool, 3, 'first Mercury landing gives 3 data');
  ok(s.pending[0]?.kind === 'trace-space', 'landing earns a physical orange trace placement');
  drainPending(s);
  equal(p.traceMarkers.filter((trace) => trace.color === 'orange').length, 1, 'orange landing trace placed');
  equal(s.planets.Mercury.landers.length, 1, 'lander moves to planetary board');
}
{
  const s = ready(2, 19);
  const p = s.players[s.activeSeat];
  const mars = getSetiBodyCells(s).Mars!;
  const noTech = addProbeAt(s, p, mars);
  p.energy = 10;
  ok(!applySetiAction(s, p.seat, { type: 'land', pieceId: noTech, body: 'Phobos' }).ok, 'moon landing requires its technology');
  p.techs.push({ stackId: 'seti_tech_stack_probe_4', tileId: 'seti_test_moon_tech' });
  act(s, p.seat, { type: 'land', pieceId: noTech, body: 'Phobos' });
  equal(s.planets.Phobos.landers.length, 1, 'moon has one lander slot');
  ok(!getSetiLegalTargets(s, p.seat).landTargets[noTech]?.includes('Phobos'), 'occupied moon is no longer a legal target');
}

// Scan, second-signal VP, majority/latest tiebreak, retention, and win rewards.
{
  const s = ready(2, 23);
  const p = s.players[s.activeSeat];
  p.credits = 5;
  p.energy = 5;
  const earth = earthSetiSectorId(s);
  const sector = s.sectors[earth];
  sector.capacity = 2;
  sector.dataRemaining = 2;
  sector.signals = [];
  const score = p.score;
  act(s, p.seat, { type: 'scan' });
  const first = s.pending[0];
  ok(first?.kind === 'signal-sector', 'scan exposes Earth sector as a board target');
  const earthTarget = first.kind === 'signal-sector' ? first.options[0] : earth;
  act(s, p.seat, { type: 'choose', choice: { kind: 'sector', sectorId: earthTarget } });
  const second = s.pending[0];
  ok(second?.kind === 'signal-sector' && second.source === 'project-row', 'scan exposes row card and printed sector targets');
  act(s, p.seat, { type: 'choose', choice: { kind: 'sector', sectorId: earthTarget, row: second.kind === 'signal-sector' ? second.rowOptions![0] : 0 } });
  ok(p.score >= score + 2, 'second signal space scores 2 VP');
  equal(s.projectRow.filter(Boolean).length, 3, 'project row refills after whole scan');
  drainPending(s);
  ok(s.sectors[earthTarget].wins.some((marker) => marker.owner === p.seat), 'sector majority creates persistent win marker');
  equal(p.publicity, Math.min(10, SETI_RULES.startPublicity + 1), 'sector contributor gains publicity');
}
{
  const s = ready(2, 24);
  const id = SETI_SECTORS[0].id;
  const sector = s.sectors[id];
  sector.capacity = 2;
  sector.dataRemaining = 2;
  sector.signals = [];
  markSetiSignal(s, 0, id);
  markSetiSignal(s, 1, id);
  settleSetiCompletedSectors(s, 1);
  ok(sector.wins.some((marker) => marker.owner === 1), 'latest marker wins a tied completed sector');
  equal(sector.signals.length, 1, 'one second-place marker retained');
  equal(sector.signals[0].owner, 0, 'distinct second-place player retains marker');
  equal(sector.dataRemaining, 1, 'track refills around retained marker');
  drainPending(s);
  equal(s.players[1].traceMarkers.filter((trace) => trace.color === 'purple').length, 1, 'first sector win earns purple trace');
  const laterScore = s.players[0].score;
  const laterTraces = s.players[0].traceMarkers.length;
  markSetiSignal(s, 0, id);
  settleSetiCompletedSectors(s, 0);
  equal(s.players[0].score, laterScore + 5, 'later sector completion scores second-space 2 VP plus printed 3 VP');
  equal(s.players[0].traceMarkers.length, laterTraces, 'purple trace is awarded only for the sector first win globally');
}

// Computer placement/analyze clears computer only and queues trace placement.
{
  const s = ready(2, 29);
  const p = s.players[s.activeSeat];
  p.dataPool = 6;
  for (let slot = 0; slot < 6; slot++) act(s, p.seat, { type: 'place_data', slot });
  ok(p.computer.top.every(Boolean), 'six top computer spaces fill left to right');
  p.dataPool = 2;
  p.energy = 2;
  act(s, p.seat, { type: 'analyze' });
  ok(p.computer.top.every((filled) => !filled), 'analyze clears every computer token');
  equal(p.dataPool, 2, 'analyze does not clear data pool');
  ok(s.pending[0]?.kind === 'trace-space', 'analyze queues blue trace placement');
  drainPending(s);
  equal(p.traceMarkers.filter((trace) => trace.color === 'blue').length, 1, 'blue analysis trace placed');
}

// Research rotates the indicated hierarchy, takes top tile, types immediate
// reward, grants first-stack VP, and enables persistent ability.
{
  const s = ready(2, 31);
  const p = s.players[s.activeSeat];
  p.publicity = 10;
  const stackId: SetiTechStackId = 'seti_tech_stack_probe_1';
  const beforeOrientation = s.solar.orientations.disc1;
  const beforeScore = p.score;
  const beforeCount = s.techStacks[stackId].tiles.length;
  act(s, p.seat, { type: 'research', stackId });
  equal(s.solar.orientations.disc1, (beforeOrientation + 7) % 8, 'research rotates disc 1 counter-clockwise');
  equal(s.solar.rotationPointer, 2, 'rotation pointer advances to disc 2');
  equal(s.solar.orientations.base, 0, 'research never rotates printed base');
  equal(s.techStacks[stackId].tiles.length, beforeCount - 1, 'top technology tile taken');
  ok(p.techs.some((tech) => tech.stackId === stackId), 'persistent technology stored on player board');
  ok(p.score >= beforeScore + 2, 'first take from stack scores 2 VP before typed immediate reward');
  equal(s.techStacks[stackId].firstTakeBonusAvailable, false, 'first-take token removed');
  ok(s.solar.pieces.some((piece) => piece.owner === p.seat), 'probe-limit technology includes immediate free launch');
  drainPending(s);
}

// Passing: discard visually to four, take end-round income, first passer
// rotates, all passed triggers income and changes start player.
{
  const s = ready(2, 37);
  const first = s.activeSeat;
  const p = s.players[first];
  while (p.hand.length < 6) {
    const card = drawSetiProjectCard(s);
    if (card) p.hand.push(card);
  }
  const orientation = s.solar.orientations.disc1;
  act(s, first, { type: 'pass' });
  ok(s.pending.some((decision) => decision.kind === 'discard-to-four'), 'pass exposes exact discard-to-four decision');
  ok(s.pending.some((decision) => decision.kind === 'end-round-card'), 'pass exposes end-round card stack');
  equal(s.solar.orientations.disc1, (orientation + 7) % 8, 'first passer rotates solar system');
  drainPending(s);
  equal(p.hand.length, 4, 'first passer discarded to four');
  ok(p.incomeCards.length >= 2, 'first passer added an end-round income card');
  const second = s.activeSeat;
  act(s, second, { type: 'pass' });
  drainPending(s);
  equal(s.round, 2, 'all players passing completes round');
  equal(s.startingSeat, first, 'first passer starts next round');
  ok(s.players.every((player) => !player.passed), 'passed flags reset for new round');
  equal(s.roundEndStacks[0].length, 0, 'unused final round-stack card discarded');
}

// Gold milestones and species discovery resolve after explicit end turn.
{
  const s = ready(2, 41);
  const p = s.players[s.activeSeat];
  p.score = 25;
  s.mainActionTaken = true;
  act(s, p.seat, { type: 'end_turn' });
  ok(s.pending[0]?.kind === 'gold-tile', 'crossed 25 VP milestone waits for a tile gesture');
  drainPending(s);
  ok(p.goldClaims.some((claim) => claim.threshold === 25), 'gold milestone claim stored');
}
{
  const s = ready(2, 43);
  const p = s.players[s.activeSeat];
  const slot = s.species[0];
  slot.discovery.purple = { owner: p.seat, sequence: ++s.markerSequence };
  slot.discovery.orange = { owner: p.seat, sequence: ++s.markerSequence };
  p.computer.top.fill(true);
  p.energy = 2;
  act(s, p.seat, { type: 'analyze' });
  const decision = s.pending[0];
  ok(decision?.kind === 'trace-space' && decision.options.includes(`seti_species_0_discovery_blue`), 'final discovery color is a physical target');
  act(s, p.seat, { type: 'choose', choice: { kind: 'trace-space', spaceId: 'seti_species_0_discovery_blue' } });
  ok(!slot.revealed, 'species stays hidden until end-turn resolution');
  act(s, p.seat, { type: 'end_turn' });
  equal(slot.revealed, true, 'species reveals after milestones at turn end');
  equal(slot.module?.kind, slot.speciesId, 'species initializes its typed module skeleton');
}

// Rotation carry semantics and publicity on pushed visits.
{
  const s = ready(2, 47);
  const p = s.players[s.activeSeat];
  const cell = getSetiBodyCells(s).Earth!;
  const id = addProbeAt(s, p, cell);
  s.solar.pieces.find((piece) => piece.id === id)!.supportLayer = 1;
  const sector = Number(cell.at(-1));
  rotateSetiSolarSystem(s);
  const moved = s.solar.pieces.find((piece) => piece.id === id)!;
  equal(Number(moved.cell.at(-1)), (sector + 7) % 8, 'disc-1-supported probe carried one sector counter-clockwise');
}
{
  const makeRotationState = (disc3: number) => {
    const s = ready(2, 48 + disc3);
    s.solar.orientations = { base: 0, disc1: 0, disc2: 0, disc3 };
    s.solar.rotationPointer = 2;
    s.solar.pieces = [];
    return s;
  };

  const stays = makeRotationState(0);
  const outer = setiCellId(2, 1);
  equal(setiSupportLayerForCell(stays, outer), 3, 'outer test piece starts supported by disc 3');
  const stayId = addProbeAt(stays, stays.players[stays.activeSeat], outer);
  rotateSetiSolarSystem(stays);
  equal(stays.solar.pieces.find((piece) => piece.id === stayId)!.cell, outer, 'disc-3 piece stays during a disc-2 rotation without overlap');

  const bumpedDisc3 = makeRotationState(1);
  const middle = setiCellId(1, 5);
  equal(setiSupportLayerForCell(bumpedDisc3, middle), 3, 'middle test piece initially rests on disc 3');
  const bump3Id = addProbeAt(bumpedDisc3, bumpedDisc3.players[bumpedDisc3.activeSeat], middle);
  rotateSetiSolarSystem(bumpedDisc3);
  equal(bumpedDisc3.solar.pieces.find((piece) => piece.id === bump3Id)!.cell, setiCellId(1, 4), 'disc-3 piece bumps when rotated disc 2 newly overlaps it');

  const bumpedBase = makeRotationState(0);
  equal(setiSupportLayerForCell(bumpedBase, middle), 0, 'base-bump test piece initially rests on printed base');
  const baseId = addProbeAt(bumpedBase, bumpedBase.players[bumpedBase.activeSeat], middle);
  rotateSetiSolarSystem(bumpedBase);
  equal(bumpedBase.solar.pieces.find((piece) => piece.id === baseId)!.cell, setiCellId(1, 4), 'base-supported piece bumps when rotated disc 2 newly overlaps it');
}

// Redaction: hands, species, tech fronts, and pending details.
{
  const s = ready(2, 53);
  const own = setiViewFor(s, 0);
  const tv = setiViewFor(s, null);
  const dev = setiViewFor(s, 'dev');
  ok(own.players[0].hand !== undefined, 'own project hand visible');
  ok(own.players[1].hand === undefined, 'opponent project hand hidden');
  ok(tv.players.every((player) => player.hand === undefined), 'TV sees hand counts only');
  ok(tv.species.every((slot) => slot.speciesId === null), 'hidden species identities redacted');
  ok(dev.species.every((slot) => slot.speciesId !== null), 'developer view can audit hidden species');
  ok(own.techStacks.every((stack) => stack.topTileId === null), 'unrevealed technology fronts hidden');
  ok(dev.techStacks.every((stack) => stack.topTileId !== null), 'developer view can audit technology order');
  s.pending.push({ kind: 'card-effect-choice', owner: 0, cardId: 'test', label: 'Secret', min: 1, max: 1, options: ['a', 'b'] });
  ok(setiViewFor(s, 1).pending?.decision === undefined, 'other player sees pending owner/kind but not private options');
  ok(setiViewFor(s, 0).pending?.decision !== undefined, 'decision owner sees options');
}

// JSON round trip and action-by-action deterministic replay.
{
  const a = createSeti(seats(3), 61);
  const b = createSeti(seats(3), 61);
  for (let step = 0; step < 50 && a.phase !== 'ended'; step++) {
    const owner = a.pending[0]?.owner ?? a.activeSeat;
    const actionA = chooseSetiBotAction(a, owner);
    const actionB = chooseSetiBotAction(b, owner);
    equal(JSON.stringify(actionA), JSON.stringify(actionB), `deterministic bot action ${step}`);
    ok(actionA !== null && actionB !== null, `replay action ${step} exists`);
    if (!actionA || !actionB) break;
    act(a, owner, actionA, `replay A ${step}`);
    act(b, owner, actionB, `replay B ${step}`);
    equal(JSON.stringify(a), JSON.stringify(b), `deterministic state after action ${step}`);
  }
  const restored = JSON.parse(JSON.stringify(a)) as SetiState;
  assertSetiState(restored);
  equal(JSON.stringify(restored), JSON.stringify(a), 'SETI state survives JSON round trip');
}

// Complete seeded games for every supported player count. The 1p run exercises
// the serializable solo-rival shell; 2-4p are core multiplayer acceptance.
for (const count of [1, 2, 3, 4]) {
  for (const seed of [5, 17]) {
    const s = createSeti(seats(count), seed);
    const actions = runSetiBotGame(s, 5000);
    equal(s.phase, 'ended', `${count}p seed ${seed} completes all five rounds`);
    equal(s.round, 5, `${count}p seed ${seed} ends in round five`);
    ok(actions > count * 20 && actions < 5000, `${count}p seed ${seed} bot made bounded progress (${actions} actions)`);
    ok(s.players.every((player) => player.finalScore !== null), `${count}p seed ${seed} computes final scores`);
    ok(s.winners !== null, `${count}p seed ${seed} records result`);
    assertSetiState(s);
    console.log(`${count}p/seed${seed}: ${actions} actions, scores ${s.players.map((player) => `${player.color}:${player.finalScore}`).join(' ')}`);
  }
}

console.log(`${passed}/${passed + failed} SETI checks passed`);
process.exit(failed ? 1 : 0);
