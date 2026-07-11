/**
 * Public-reducer integration coverage for occupation deferred intents.
 *
 * Every effect in this file is opened and resolved through applyFeastAction.
 * The tests intentionally do not call the planner, executor, or deferred
 * interpreter directly: a passing result proves the server-owned continuation
 * survives the complete action/decision boundary.
 *
 * Run: npx tsx shared/src/feast/occupation-deferred-reducer-integration-test.ts
 */

import {
  FEAST_OCCUPATION_BY_ID,
  applyFeastAction,
  createFeast,
  type FeastAction,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastSeatColor,
  type FeastState,
} from './index.js';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string): asserts condition {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`,
  );
}

const COLORS: readonly FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'];

function fresh(seed: number): FeastState {
  const state = createFeast([{ name: 'Deferred Tester', color: COLORS[0] }], seed, {
    occupationMode: 'all',
  });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.firstPlayer = 0;
  const player = state.players[0];
  player.passed = false;
  player.turnActionTaken = false;
  player.turnMayEnd = false;
  player.turnEffectUsed = false;
  player.fourthOccupationAfter = false;
  return state;
}

function cardId(number: number): string {
  return `occupation-${number}`;
}

function removeCardEverywhere(state: FeastState, id: string): void {
  state.occupationDeck = state.occupationDeck.filter((candidate) => candidate !== id);
  state.startingOccupationDeck = state.startingOccupationDeck.filter((candidate) => candidate !== id);
  state.occupationDiscard = state.occupationDiscard.filter((candidate) => candidate !== id);
  state.occupationUsage = state.occupationUsage.filter((entry) => entry.cardId !== id);
  for (const player of state.players) {
    player.occupationHand = player.occupationHand.filter((candidate) => candidate !== id);
    player.playedOccupations = player.playedOccupations.filter((candidate) => candidate !== id);
    player.occupationUses = player.occupationUses.filter((entry) => entry.cardId !== id);
  }
}

function putInHand(state: FeastState, number: number): void {
  const id = cardId(number);
  removeCardEverywhere(state, id);
  state.players[0].occupationHand.push(id);
}

function markPlayed(state: FeastState, number: number): void {
  const id = cardId(number);
  removeCardEverywhere(state, id);
  state.players[0].playedOccupations.push(id);
  state.players[0].occupationUses.push({
    cardId: id, round: state.round, usesThisRound: 0, usedOnce: false,
  });
}

function apply(state: FeastState, action: FeastAction): ReturnType<typeof applyFeastAction> {
  return applyFeastAction(state, 0, action);
}

function mustApply(state: FeastState, action: FeastAction, message: string): void {
  const result = apply(state, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function head(state: FeastState, expectedKind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `pending ${expectedKind ?? 'decision'} exists`);
  if (!decision) throw new Error(`Missing pending ${expectedKind ?? 'decision'}`);
  if (expectedKind) check(decision.kind === expectedKind, `pending decision kind is ${expectedKind}`);
  return decision;
}

function resolve(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice,
): ReturnType<typeof applyFeastAction> {
  return apply(state, { type: 'resolve_decision', decisionId: decision.id, choice });
}

function resolveOk(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice, message: string,
): void {
  const result = resolve(state, decision, choice);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function optionByLabel(decision: FeastPendingDecision, label: string): string | null {
  const wanted = label.toLocaleLowerCase();
  return decision.options.find((option) => option.label.toLocaleLowerCase().includes(wanted))?.id ?? null;
}

function rejectForgedOption(
  state: FeastState, decision: FeastPendingDecision, forgedId: string, message: string,
): void {
  const before = JSON.stringify(state);
  const result = resolve(state, decision, { optionIds: [forgedId] });
  check(!result.ok, `${message}: forged option is rejected`);
  equal(JSON.stringify(state), before, `${message}: rejected choice is atomic`);
  if (!result.ok) {
    const error = result.error ?? '';
    check(
      /unknown|offered|option|choice/i.test(error)
        && !/broken occupation-effect continuation/i.test(error),
      `${message}: rejection comes from server option validation (got ${JSON.stringify(error)})`,
    );
  }
}

function rejectChoiceAtomic(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice, message: string,
): void {
  const before = JSON.stringify(state);
  const result = resolve(state, decision, choice);
  check(!result.ok, `${message}: invalid choice is rejected`);
  equal(JSON.stringify(state), before, `${message}: rejected choice is atomic`);
}

function rejectStaleDecision(
  state: FeastState, decisionId: string, choice: FeastDecisionChoice, message: string,
): void {
  const before = JSON.stringify(state);
  const result = apply(state, { type: 'resolve_decision', decisionId, choice });
  check(!result.ok, `${message}: consumed decision id is rejected`);
  equal(JSON.stringify(state), before, `${message}: stale decision rejection is atomic`);
  if (!result.ok) {
    check(/no longer active|no pending decision/i.test(result.error ?? ''),
      `${message}: reducer reports a stale cursor boundary`);
  }
}

function beginPrintedOccupation(state: FeastState, number: number): void {
  putInHand(state, number);
  mustApply(state, { type: 'place_workers', spaceId: 'play-occupations-2' },
    `place Vikings to play ${FEAST_OCCUPATION_BY_ID[cardId(number)]?.name ?? cardId(number)}`);
  const chooser = head(state, 'occupation');
  resolveOk(state, chooser, { optionIds: [cardId(number)] }, `choose ${cardId(number)}`);
}

function confirmOptionalCard(state: FeastState, number: number): void {
  const decision = head(state, 'card-effect');
  check(decision.meta?.cardId === cardId(number), `${cardId(number)} owns its confirmation`);
  check(decision.meta?.requestKind === 'confirmation', `${cardId(number)} begins with a confirmation`);
  resolveOk(state, decision, { accepted: true }, `accept ${cardId(number)}`);
}

// ---------------------------------------------------------------------------
// Card 17 (Silk Worm Breeder): grant-action -> upgrade-good.
// ---------------------------------------------------------------------------

{
  const state = fresh(9717);
  const player = state.players[0];
  player.goods.peas = 1;
  player.goods['rune-stone'] = 0;

  beginPrintedOccupation(state, 17);
  confirmOptionalCard(state, 17);

  const upgrade = head(state, 'card-effect');
  check(upgrade.meta?.mode === 'occupation-deferred', 'Card 17 exposes a reducer-owned deferred decision');
  check(upgrade.meta?.grantAction === 'upgrade-good', 'Card 17 deferred decision identifies upgrade-good');
  check(upgrade.min === 1 && upgrade.max === 1, 'Card 17 requires exactly one legal three-step upgrade');
  const peasToRune = upgrade.options.find((option) => option.id === 'peas->rune-stone');
  check(!!peasToRune && !peasToRune.disabled, 'Card 17 offers the authentic Peas -> Rune Stone upgrade');

  rejectForgedOption(state, upgrade, 'peas->treasure-chest', 'Card 17 tampered upgrade');

  if (peasToRune) {
    const result = resolve(state, upgrade, { optionIds: [peasToRune.id] });
    check(result.ok, `Card 17 valid upgrade resolves${result.ok ? '' : ` (${result.error})`}`);
    if (result.ok) {
      check(player !== state.players[0], 'successful deferred grant commits an atomic replacement state graph');
      check(state.players[0].goods.peas === 0, 'Card 17 consumes exactly one Peas');
      check(state.players[0].goods['rune-stone'] === 1, 'Card 17 gains exactly one Rune Stone');
      check(state.pending.length === 0, 'Card 17 resumes and completes the printed occupation action');
    }
  }
}

// ---------------------------------------------------------------------------
// Card 52 (Tutor): grant-action -> play-occupation, including nested resume.
// ---------------------------------------------------------------------------

{
  const state = fresh(9752);
  markPlayed(state, 52);
  putInHand(state, 43); // Fruit Picker has a deterministic mandatory on-play gain.
  state.players[0].silver = 2;
  state.players[0].goods.fruits = 0;

  mustApply(state, { type: 'activate_occupation', cardId: cardId(52) }, 'activate Tutor');
  confirmOptionalCard(state, 52);

  const play = head(state, 'card-effect');
  check(play.meta?.mode === 'occupation-deferred', 'Tutor exposes a reducer-owned deferred decision');
  check(play.meta?.grantAction === 'play-occupation', 'Tutor deferred decision identifies play-occupation');
  const fruitPicker = play.options.find((option) => option.id === cardId(43));
  check(!!fruitPicker && !fruitPicker.disabled, 'Tutor offers Fruit Picker from the live hand');
  check(state.players[0].silver === 1, 'Tutor payment is committed before its nested action choice');

  rejectForgedOption(state, play, cardId(190), 'Tutor tampered occupation choice');

  if (fruitPicker) {
    const result = resolve(state, play, { optionIds: [fruitPicker.id] });
    check(result.ok, `Tutor valid nested occupation resolves${result.ok ? '' : ` (${result.error})`}`);
    if (result.ok) {
      check(!state.players[0].occupationHand.includes(cardId(43)), 'Tutor removes Fruit Picker from hand');
      check(state.players[0].playedOccupations.includes(cardId(43)), 'Tutor commits Fruit Picker as played');
      check(state.players[0].goods.fruits === 1, 'Tutor resolves Fruit Picker before returning');
      check(state.pending.length === 0, 'Tutor nested card resumes and completes its anytime activation');
    }
  }
}

// ---------------------------------------------------------------------------
// Card 42 (Home Builder): phase hook -> choice -> target -> placement intent.
// ---------------------------------------------------------------------------

{
  const state = fresh(9742);
  markPlayed(state, 42);
  const player = state.players[0];
  player.resources.wood = 1;
  const shedId = 'deferred-test-shed';
  player.boards.push({
    id: shedId, definitionId: 'shed', kind: 'building', owner: 0, placements: [],
  });

  // Passing and ending the sole player's turn enters the real automatic
  // income phase, where Card 42 opens before income is calculated.
  mustApply(state, { type: 'pass' }, 'pass to automatic phases');
  mustApply(state, { type: 'end_turn' }, 'advance to Card 42 income hook');
  confirmOptionalCard(state, 42);

  const resource = head(state, 'card-effect');
  check(resource.meta?.requestKind === 'choice', 'Card 42 requests wood-or-stone through the card cursor');
  const wood = optionByLabel(resource, 'wood');
  check(!!wood, 'Card 42 offers the wood branch');
  if (!wood) throw new Error('Card 42 wood option missing');
  resolveOk(state, resource, { optionIds: [wood] }, 'choose Card 42 wood branch');

  const shed = head(state, 'card-effect');
  check(shed.meta?.requestKind === 'target', 'Card 42 asks the server for an owned shed target');
  const shedOption = shed.options.find((option) => option.label.toLocaleLowerCase().includes('shed'));
  check(!!shedOption, 'Card 42 offers the seeded owned shed');
  if (!shedOption) throw new Error('Card 42 shed option missing');
  resolveOk(state, shed, { optionIds: [shedOption.id] }, 'choose Card 42 shed');

  const placement = head(state, 'card-effect');
  check(placement.meta?.mode === 'occupation-deferred', 'Card 42 opens a reducer-owned placement decision');
  check(placement.meta?.intentKind === 'placement', 'Card 42 deferred decision is typed as placement');
  check(placement.min === 1 && placement.max === 1, 'Card 42 requires exactly one legal placement');
  check(placement.options.length > 0, 'Card 42 derives legal shed cells from current geometry');
  check(placement.options.every((option) => option.id.startsWith(`${shedId}@`)),
    'Card 42 exposes only canonical targets on the selected shed');

  rejectForgedOption(state, placement, `${shedId}@999,999,0`, 'Card 42 tampered placement');

  const legal = placement.options.find((option) => !option.disabled);
  if (legal) {
    const result = resolve(state, placement, { optionIds: [legal.id] });
    check(result.ok, `Card 42 valid shed placement resolves${result.ok ? '' : ` (${result.error})`}`);
    if (result.ok) {
      const resolvedShed = state.players[0].boards.find((board) => board.id === shedId);
      check(resolvedShed?.placements.length === 1, 'Card 42 commits exactly one shed placement');
      check(resolvedShed?.placements[0]?.pieceId === 'wood', 'Card 42 placement contains the selected wood');
      check(state.players[0].resources.wood === 0, 'Card 42 consumes the placed wood from supply');
      check(!state.pending.some((decision) => decision.kind === 'card-effect'
        && decision.meta?.mode === 'occupation-deferred'), 'Card 42 resumes the automatic phase after placement');
    }
  } else check(false, 'Card 42 has an enabled legal placement option');
}

// ---------------------------------------------------------------------------
// Card 87 (Preacher): grant-action -> mountain-take.
// ---------------------------------------------------------------------------

{
  const state = fresh(9787);
  beginPrintedOccupation(state, 87);
  confirmOptionalCard(state, 87);

  const preacher = head(state, 'card-effect');
  check(preacher.meta?.requestKind === 'choice', 'Preacher exposes its printed reward choice');
  const mountainBranch = optionByLabel(preacher, 'mountain');
  check(!!mountainBranch, 'Preacher offers the take-four mountain branch');
  if (!mountainBranch) throw new Error('Preacher mountain branch missing');
  resolveOk(state, preacher, { optionIds: [mountainBranch] }, 'choose Preacher mountain branch');

  const mountain = head(state, 'mountain');
  check(mountain.meta?.mode === 'occupation-deferred', 'Preacher uses the ordinary mountain decision type');
  check(mountain.meta?.grantAction === 'mountain-take', 'Preacher mountain decision retains grant provenance');
  equal(mountain.meta?.allowances, [4], 'Preacher retains its exact four-item allowance');
  check(mountain.meta?.sameStrip === true, 'Preacher requires all four items from one strip');
  const stripOption = mountain.options.find((option) => !option.disabled
    && (state.mountains.find((strip) => strip.id === option.id)?.items.length ?? 0) >= 4);
  check(!!stripOption, 'Preacher offers a live strip with at least four items');
  if (!stripOption) throw new Error('Preacher mountain strip missing');
  const stripBefore = [...state.mountains.find((strip) => strip.id === stripOption.id)!.items];

  rejectChoiceAtomic(state, mountain, {
    allocations: [{ id: 'forged-mountain-strip', amount: 4 }],
  }, 'Preacher forged mountain strip');

  const result = resolve(state, mountain, {
    allocations: [{ id: stripOption.id, amount: 4 }],
  });
  check(result.ok, `Preacher valid mountain take resolves${result.ok ? '' : ` (${result.error})`}`);
  if (result.ok) {
    equal(state.mountains.find((strip) => strip.id === stripOption.id)?.items,
      stripBefore.slice(4), 'Preacher removes exactly the four arrow-end items');
    check(state.pending.length === 0, 'Preacher returns from the mountain grant to the printed occupation action');
    check(state.players[0].turnMayEnd, 'Preacher leaves the original worker turn ready to end');
    rejectStaleDecision(state, mountain.id, {
      allocations: [{ id: stripOption.id, amount: 1 }],
    }, 'Preacher completed mountain decision');
  }
}

// ---------------------------------------------------------------------------
// Card 77 (Follower): grant-action -> full printed action-space resolution.
// ---------------------------------------------------------------------------

{
  const state = fresh(9777);
  const occupied = state.actionSpaces.find((space) => space.id === 'weekly-flax-stockfish');
  check(!!occupied, 'Follower fixture finds the authentic weekly-market space');
  if (!occupied) throw new Error('Missing weekly-flax-stockfish action space');
  occupied.occupants = [{
    seat: 0, workers: 1, workerColor: state.players[0].activeWorkerColor, copiedFrom: null,
  }];
  state.players[0].workersAvailable--;

  beginPrintedOccupation(state, 77);
  const originalActionId = state.players[0].turnActionId;
  confirmOptionalCard(state, 77);

  const extraAction = head(state, 'card-effect');
  check(extraAction.meta?.grantAction === 'action-space', 'Follower exposes an action-space grant');
  const weekly = extraAction.options.find((option) => option.id === 'weekly-flax-stockfish');
  check(!!weekly && !weekly.disabled, 'Follower offers the seeded occupied second-column market');
  rejectForgedOption(state, extraAction, 'weekly-market-forged', 'Follower forged action space');

  if (weekly) {
    const before = {
      flax: state.players[0].goods.flax,
      stockfish: state.players[0].goods.stockfish,
      silver: state.players[0].silver,
    };
    const result = resolve(state, extraAction, { optionIds: [weekly.id] });
    check(result.ok, `Follower valid extra action resolves${result.ok ? '' : ` (${result.error})`}`);
    if (result.ok) {
      equal({
        flax: state.players[0].goods.flax - before.flax,
        stockfish: state.players[0].goods.stockfish - before.stockfish,
        silver: state.players[0].silver - before.silver,
      }, { flax: 1, stockfish: 1, silver: 1 }, 'Follower resolves every printed market reward exactly once');
      check(occupied !== state.actionSpaces.find((space) => space.id === occupied.id),
        'Follower granted action commits through an atomic replacement graph');
      check(state.actionSpaces.find((space) => space.id === occupied.id)?.occupants[0]?.workers === 1,
        'Follower places no Vikings on the copied action space');
      check(state.players[0].turnActionId === originalActionId,
        'Follower restores the original occupation-action provenance after the grant');
      check(state.pending.length === 0 && state.players[0].turnMayEnd,
        'Follower returns to and completes the original printed occupation action');
      rejectStaleDecision(state, extraAction.id, { optionIds: [weekly.id] },
        'Follower completed extra-action decision');
    }
  }
}

// ---------------------------------------------------------------------------
// Card 81 (Quarter-master): grant-action -> discounted ship purchase.
// ---------------------------------------------------------------------------

{
  const state = fresh(9781);
  const player = state.players[0];
  player.silver = 7;
  player.weapons.bow = 1;
  player.weapons.spear = 1;
  beginPrintedOccupation(state, 81);
  confirmOptionalCard(state, 81);

  const buyShip = head(state, 'card-effect');
  check(buyShip.meta?.grantAction === 'buy-ship', 'Quarter-master exposes a buy-ship grant');
  const longship = buyShip.options.find((option) => option.id === 'longship');
  check(!!longship && !longship.disabled, 'Quarter-master offers an available large-ship berth');
  if (!longship) throw new Error('Quarter-master longship option missing');

  rejectChoiceAtomic(state, buyShip, {
    optionIds: [longship.id], allocations: [{ id: 'throwing-axe', amount: 1 }],
  }, 'Quarter-master forged weapon-spend declaration');

  const discardBefore = state.weaponDiscard.length;
  const result = resolve(state, buyShip, { optionIds: [longship.id] });
  check(result.ok, `Quarter-master discounted purchase resolves${result.ok ? '' : ` (${result.error})`}`);
  if (result.ok) {
    check(state.players[0].ships.filter((ship) => ship.type === 'longship' && !ship.emigrated).length === 1,
      'Quarter-master creates exactly one active longship');
    check(state.players[0].silver === 0, 'Quarter-master rounds two half-weapon discounts to a 7-silver cost');
    check(state.players[0].weapons.bow === 1 && state.players[0].weapons.spear === 1,
      'Quarter-master counts the bow and spear without spending either card');
    check(state.weaponDiscard.length === discardBefore,
      'Quarter-master does not move counted discount weapons to the discard');
    check(state.pending.length === 0 && state.players[0].turnMayEnd,
      'Quarter-master returns to and completes the original occupation action');
    rejectStaleDecision(state, buyShip.id, { optionIds: [longship.id] },
      'Quarter-master completed purchase decision');
  }
}

// ---------------------------------------------------------------------------
// Card 84 (Harbor Guard): grant-action -> discounted emigration.
// ---------------------------------------------------------------------------

{
  const state = fresh(9784);
  state.round = 4;
  const player = state.players[0];
  player.silver = 1;
  player.ships.push(
    { id: 'harbor-knarr-a', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'harbor-longship', type: 'longship', ore: 2, emigrated: false, emigratedRound: null },
    { id: 'harbor-knarr-b', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
  );

  beginPrintedOccupation(state, 84);
  confirmOptionalCard(state, 84);

  const emigration = head(state, 'card-effect');
  check(emigration.meta?.grantAction === 'emigration', 'Harbor Guard exposes an emigration grant');
  const target = emigration.options.find((option) => option.id === 'harbor-longship');
  check(!!target && !target.disabled, 'Harbor Guard offers the seeded active longship');
  check(target?.detail?.includes('1 silver'), 'Harbor Guard previews round four minus three active large ships');
  rejectForgedOption(state, emigration, 'harbor-ghost-ship', 'Harbor Guard forged ship');

  if (target) {
    const result = resolve(state, emigration, { optionIds: [target.id] });
    check(result.ok, `Harbor Guard discounted emigration resolves${result.ok ? '' : ` (${result.error})`}`);
    if (result.ok) {
      const emigrated = state.players[0].ships.find((ship) => ship.id === target.id);
      check(emigrated?.emigrated === true && emigrated.emigratedRound === 4,
        'Harbor Guard records the selected ship and exact emigration round');
      check(emigrated?.ore === 0, 'Harbor Guard clears added ore from the emigrated ship');
      check(state.players[0].silver === 0, 'Harbor Guard pays the exact discounted 1-silver cost');
      check(state.pending.length === 0 && state.players[0].turnMayEnd,
        'Harbor Guard returns to and completes the original occupation action');
      rejectStaleDecision(state, emigration.id, { optionIds: [target.id] },
        'Harbor Guard completed emigration decision');
    }
  }
}

// ---------------------------------------------------------------------------
// Card 85 (Hornblower): grant-action -> ordinary Hunting/Snare die pipelines.
// ---------------------------------------------------------------------------

function exerciseHornblower(
  seed: number, branchLabel: 'hunt' | 'snare', grantAction: 'hunting-game' | 'laying-snare',
  silverCost: number, rewardWeapon: 'bow' | 'snare',
): void {
  const state = fresh(seed);
  state.players[0].silver = 3;
  state.players[0].resources.wood = 0;
  const weaponBefore = state.players[0].weapons[rewardWeapon];

  beginPrintedOccupation(state, 85);
  confirmOptionalCard(state, 85);

  const hornChoice = head(state, 'card-effect');
  check(hornChoice.meta?.requestKind === 'choice', `Hornblower ${branchLabel} exposes its printed branch choice`);
  const branch = optionByLabel(hornChoice, branchLabel);
  check(!!branch, `Hornblower offers the ${branchLabel} branch`);
  if (!branch) throw new Error(`Hornblower ${branchLabel} branch missing`);
  resolveOk(state, hornChoice, { optionIds: [branch] }, `choose Hornblower ${branchLabel}`);

  const grant = head(state, 'card-effect');
  check(grant.meta?.mode === 'occupation-deferred', `Hornblower ${branchLabel} opens a deferred grant`);
  check(grant.meta?.grantAction === grantAction, `Hornblower ${branchLabel} retains its exact action classification`);
  check(state.players[0].silver === 3 - silverCost, `Hornblower ${branchLabel} pays its printed silver cost before the die action`);
  const begin = grant.options.find((option) => option.id === 'begin');
  check(!!begin, `Hornblower ${branchLabel} offers the server-owned begin command`);
  if (!begin) throw new Error(`Hornblower ${branchLabel} begin option missing`);
  rejectForgedOption(state, grant, 'begin-forged', `Hornblower ${branchLabel} forged grant command`);

  resolveOk(state, grant, { optionIds: [begin.id] }, `begin Hornblower ${branchLabel} die action`);
  const die = head(state, 'die');
  check(die.meta?.stage === 'roll', `Hornblower ${branchLabel} starts at the ordinary roll stage`);
  check(die.continuation.kind === 'die' && die.continuation.resume?.kind === 'occupation-deferred',
    `Hornblower ${branchLabel} die retains the occupation continuation`);
  rejectStaleDecision(state, grant.id, { optionIds: [begin.id] },
    `Hornblower ${branchLabel} consumed grant decision`);
  rejectChoiceAtomic(state, die, { optionIds: ['forged-roll'] },
    `Hornblower ${branchLabel} forged die command`);

  resolveOk(state, die, { optionIds: ['roll'] }, `roll Hornblower ${branchLabel} die`);
  const spend = head(state, 'die');
  check(spend.id === die.id && spend.meta?.stage === 'spend',
    `Hornblower ${branchLabel} advances the same opaque die cursor to spend/fail`);
  const result = resolve(state, spend, { optionIds: ['fail'] });
  check(result.ok, `Hornblower ${branchLabel} declared failure resolves${result.ok ? '' : ` (${result.error})`}`);
  if (result.ok) {
    check(state.players[0].resources.wood === 1, `Hornblower ${branchLabel} receives ordinary failure wood`);
    check(state.players[0].weapons[rewardWeapon] === weaponBefore + 1,
      `Hornblower ${branchLabel} receives the ordinary failure weapon`);
    check(state.players[0].silver === 3 - silverCost,
      `Hornblower ${branchLabel} does not alter its paid card cost during die resolution`);
    check(state.pending.length === 0 && state.players[0].turnMayEnd,
      `Hornblower ${branchLabel} returns through the die and completes the occupation action`);
    rejectStaleDecision(state, die.id, { optionIds: ['fail'] },
      `Hornblower ${branchLabel} completed die decision`);
  }
}

exerciseHornblower(9785, 'hunt', 'hunting-game', 1, 'bow');
exerciseHornblower(9786, 'snare', 'laying-snare', 2, 'snare');

console.log(`${passed}/${passed + failed} occupation deferred reducer integration checks passed`);
if (failed) process.exit(1);
