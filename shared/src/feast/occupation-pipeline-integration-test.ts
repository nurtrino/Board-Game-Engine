/**
 * Reducer-level occupation pipeline integration coverage.
 *
 * Unlike the registry, planner, decision, and executor unit suites, every
 * mutation here enters through applyFeastAction. Occupations are selected from
 * a real printed worker action, and all card choices are resolved through the
 * server-owned pending-decision cursor.
 *
 * Run: npx tsx shared/src/feast/occupation-pipeline-integration-test.ts
 */

import {
  FEAST_OCCUPATION_BY_ID,
  applyFeastAction,
  createFeast,
  feastMakePlacement,
  feastPlacementPreviewError,
  feastWeaponConservation,
  type FeastAction,
  type FeastContinuation,
  type FeastDecisionChoice,
  type FeastPendingDecision,
  type FeastSeatColor,
  type FeastShipType,
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

function seats(count: number): { name: string; color: FeastSeatColor }[] {
  return COLORS.slice(0, count).map((color, index) => ({ name: `Pipeline ${index + 1}`, color }));
}

function fresh(count: number, seed: number): FeastState {
  const state = createFeast(seats(count), seed, { occupationMode: 'all' });
  state.pending = [];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  for (const player of state.players) {
    player.passed = false;
    player.turnActionTaken = false;
    player.turnMayEnd = false;
    player.turnEffectUsed = false;
    player.fourthOccupationAfter = false;
  }
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

function putInHand(state: FeastState, numbers: readonly number[]): void {
  for (const number of numbers) {
    const id = cardId(number);
    removeCardEverywhere(state, id);
    state.players[0].occupationHand.push(id);
  }
}

function markPlayed(state: FeastState, number: number): void {
  const id = cardId(number);
  removeCardEverywhere(state, id);
  state.players[0].playedOccupations.push(id);
  state.players[0].occupationUses.push({
    cardId: id, round: state.round, usesThisRound: 0, usedOnce: false,
  });
}

function placeSpecialOnBoard(
  state: FeastState, ownerSeat: number, specialId: 'cloakpin' | 'drinking-horn', placementId: string,
  boardId?: string,
): string {
  const owner = state.players[ownerSeat];
  const board = boardId ? owner.boards.find((candidate) => candidate.id === boardId) : owner.boards[0];
  if (!board) throw new Error(`Missing special-tile target board ${boardId ?? '(first)'}`);
  state.specialSupply = state.specialSupply.filter((candidate) => candidate !== specialId);
  owner.specials = [...owner.specials.filter((candidate) => candidate !== specialId), specialId];
  for (const rotation of [0, 90, 180, 270] as const) {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if (feastPlacementPreviewError(owner, board.id, specialId, x, y, rotation, false) !== null) continue;
      board.placements.push(feastMakePlacement(placementId, specialId, x, y, rotation));
      return board.id;
    }
  }
  throw new Error(`Could not place ${specialId} on an authentic board cell`);
}

function act(state: FeastState, action: FeastAction, message: string): void {
  const result = applyFeastAction(state, 0, action);
  check(result.ok, `${message}${result.ok ? '' : ` (${result.error})`}`);
  if (!result.ok) throw new Error(`${message}: ${result.error}`);
}

function rejectAtomic(state: FeastState, action: FeastAction, message: string): void {
  const before = JSON.stringify(state);
  const result = applyFeastAction(state, 0, action);
  check(!result.ok, `${message}: reducer rejects`);
  equal(JSON.stringify(state), before, `${message}: rejection is atomic`);
}

function head(state: FeastState, expectedKind?: FeastPendingDecision['kind']): FeastPendingDecision {
  const decision = state.pending[0];
  check(!!decision, `pending ${expectedKind ?? 'decision'} exists`);
  if (!decision) throw new Error(`Missing pending ${expectedKind ?? 'decision'}`);
  if (expectedKind) check(decision.kind === expectedKind, `pending decision kind is ${expectedKind}`);
  return decision;
}

function resolveHead(
  state: FeastState, choice: FeastDecisionChoice, message: string,
): void {
  const decision = head(state);
  act(state, { type: 'resolve_decision', decisionId: decision.id, choice }, message);
}

function beginPrintedOccupationPlay(
  state: FeastState, numbers: readonly number[],
  spaceId: 'play-occupations-2' | 'play-occupations-4' = 'play-occupations-2',
): FeastPendingDecision {
  putInHand(state, numbers);
  act(state, { type: 'place_workers', spaceId }, `place Vikings on ${spaceId}`);
  const decision = head(state, 'occupation');
  check(decision.continuation.kind === 'printed', 'occupation chooser retains the printed-action continuation');
  for (const number of numbers) {
    const id = cardId(number);
    const definition = FEAST_OCCUPATION_BY_ID[id];
    const option = decision.options.find((candidate) => candidate.id === id);
    check(!!definition, `${id} has extracted card metadata`);
    check(option?.id === id, `${id} is an exact server option id`);
    check(option?.label === definition?.name, `${id} option uses authentic card name`);
    check(option?.detail === `${definition?.points ?? 0} VP - ${definition?.type ?? 'card'}`, `${id} option uses authentic points/timing metadata`);
  }
  return decision;
}

function chooseCards(state: FeastState, numbers: readonly number[], message: string): void {
  const decision = head(state, 'occupation');
  act(state, {
    type: 'resolve_decision', decisionId: decision.id,
    choice: { optionIds: numbers.map(cardId) },
  }, message);
}

function expectCardDecision(
  state: FeastState, number: number, clauseId: string, mode: string,
): FeastPendingDecision {
  const decision = head(state, 'card-effect');
  const definition = FEAST_OCCUPATION_BY_ID[cardId(number)];
  check(decision.meta?.cardId === cardId(number), `${definition.name}: decision has exact card id`);
  check(decision.meta?.cardNumber === number, `${definition.name}: decision has exact card number`);
  check(decision.meta?.clauseId === clauseId, `${definition.name}: decision has exact clause id`);
  check(decision.meta?.mode === mode, `${definition.name}: decision mode is ${mode}`);
  check(decision.label.startsWith(`${definition.name}:`), `${definition.name}: decision label uses authentic name`);
  check(typeof decision.meta?.requestId === 'string' && decision.meta.requestId.includes(cardId(number)), `${definition.name}: request id is card-scoped`);
  return decision;
}

function assertUsage(
  state: FeastState, number: number, clauseId: string,
  limit: FeastState['occupationUsage'][number]['limit'], usedOnce: boolean,
): void {
  const id = cardId(number);
  const records = state.occupationUsage.filter((entry) => entry.cardId === id && entry.clauseId === clauseId);
  equal(records.length, 1, `${id}: exactly one accepted clause provenance record`);
  if (records[0]) {
    check(records[0].limit === limit, `${id}: provenance records ${limit}`);
    check(records[0].round === state.round, `${id}: provenance records current round`);
    check(typeof records[0].eventId === 'string' && records[0].eventId.startsWith('occupation-event-'), `${id}: provenance records server event id`);
  }
  const use = state.players[0].occupationUses.find((entry) => entry.cardId === id);
  check(use?.usesThisRound === 1, `${id}: accepted reducer execution increments card use`);
  check(use?.usedOnce === usedOnce, `${id}: one-time state is ${usedOnce}`);
}

function addShips(state: FeastState, types: readonly FeastShipType[]): void {
  state.players[0].ships = types.map((type, index) => ({
    id: `pipeline-${type}-${index}`, type, ore: 0, emigrated: false, emigratedRound: null,
  }));
}

function weaponCount(state: FeastState): number {
  return Object.values(state.players[0].weapons).reduce((sum, amount) => sum + amount, 0);
}

// Golden identity is hard-coded here so a self-consistent but misnumbered
// registry cannot make the reducer integration suite pass.
const AUTHENTIC_NAMES: Readonly<Record<number, string>> = {
  5: 'Chief', 10: 'Milker', 11: 'Trident Hunter', 14: 'Ship Owner',
  22: 'Miner', 32: 'Weapons Supplier', 35: 'Cattle Breeder',
  39: 'Modifier', 43: 'Fruit Picker', 44: 'Master Tailor', 47: 'Tanner',
  51: 'Master Mason', 54: 'Tradesman', 58: 'Linseed Oil Presser',
  60: 'Inspector', 188: 'Mineworker',
};
for (const [raw, name] of Object.entries(AUTHENTIC_NAMES)) {
  const number = Number(raw);
  const definition = FEAST_OCCUPATION_BY_ID[cardId(number)];
  check(definition?.id === cardId(number), `${name}: authentic card id ${cardId(number)}`);
  check(definition?.number === number, `${name}: authentic printed number ${number}`);
  check(definition?.name === name, `${cardId(number)}: authentic name ${name}`);
  check((definition?.clarification.length ?? 0) > 20, `${name}: appendix clarification is present`);
}

// ---------------------------------------------------------------------------
// Immediate on-play effects through a real printed occupation action.
// ---------------------------------------------------------------------------

{
  const state = fresh(1, 9310);
  state.players[0].goods.sheep = 1;
  state.players[0].goods.cattle = 1;
  const beforeMilk = state.players[0].goods.milk;
  const beforeSilver = state.players[0].silver;
  beginPrintedOccupationPlay(state, [10]);
  chooseCards(state, [10], 'play Milker');
  check(state.pending.length === 0, 'Milker resolves without a client-authored mutation');
  check(state.players[0].goods.milk === beforeMilk + 2, 'Milker gains 2 milk for two distinct animal types');
  check(state.players[0].silver === beforeSilver + 2, 'Milker gains 2 silver for two distinct animal types');
  assertUsage(state, 10, 'milk-and-silver-per-animal-kind', 'once-per-card', true);
}

{
  const state = fresh(1, 9311);
  const deckSpear = state.weaponDeck.indexOf('spear');
  check(deckSpear >= 0, 'Trident Hunter fixture has a finite spear card in the draw pile');
  if (deckSpear < 0) throw new Error('Seeded Trident Hunter spear fixture changed');
  state.weaponDeck.splice(deckSpear, 1);
  state.weaponDiscard.push('spear');
  const beforeSpear = state.players[0].weapons.spear;
  const beforeWeapons = weaponCount(state);
  const beforeDiscardSpears = state.weaponDiscard.filter((weapon) => weapon === 'spear').length;
  check(feastWeaponConservation(state) === 47, 'Trident Hunter starts with all 47 finite weapon cards conserved');
  beginPrintedOccupationPlay(state, [11]);
  chooseCards(state, [11], 'play Trident Hunter');
  check(state.pending.length === 0, 'Trident Hunter mandatory named draw executes automatically');
  check(state.players[0].weapons.spear === beforeSpear + 1, 'Trident Hunter takes exactly one spear');
  check(weaponCount(state) === beforeWeapons + 1, 'Trident Hunter adds exactly one physical weapon to the player');
  check(state.weaponDiscard.filter((weapon) => weapon === 'spear').length === beforeDiscardSpears - 1, 'Trident Hunter searches discard before draw pile');
  check(feastWeaponConservation(state) === 47, 'Trident Hunter preserves all 47 finite weapon cards');
  assertUsage(state, 11, 'take-spear', 'once-per-card', true);
}

{
  const state = fresh(1, 9314);
  addShips(state, ['whaling-boat', 'knarr', 'longship', 'whaling-boat', 'knarr', 'longship']);
  const before = state.players[0].goods['whale-meat'];
  beginPrintedOccupationPlay(state, [14]);
  chooseCards(state, [14], 'play Ship Owner');
  check(state.players[0].goods['whale-meat'] === before + 2, 'Ship Owner gains exactly 2 whale meat for two complete fleets');
  assertUsage(state, 14, 'complete-fleet-whale-meat', 'once-per-card', true);
}

{
  const state = fresh(1, 9322);
  addShips(state, ['longship', 'longship']);
  const before = {
    stone: state.players[0].resources.stone,
    ore: state.players[0].resources.ore,
    silver: state.players[0].silver,
  };
  beginPrintedOccupationPlay(state, [22]);
  chooseCards(state, [22], 'play Miner');
  equal({
    stone: state.players[0].resources.stone - before.stone,
    ore: state.players[0].resources.ore - before.ore,
    silver: state.players[0].silver - before.silver,
  }, { stone: 2, ore: 2, silver: 2 }, 'Miner gains stone, ore, and silver once per longship');
  assertUsage(state, 22, 'miner-longship-yield', 'once-per-card', true);
}

{
  const state = fresh(1, 9332);
  addShips(state, ['longship', 'longship']);
  const beforeWeapons = weaponCount(state);
  const beforeSupply = state.weaponDeck.length + state.weaponDiscard.length;
  check(feastWeaponConservation(state) === 47, 'Weapons Supplier starts with all 47 finite weapon cards conserved');
  beginPrintedOccupationPlay(state, [32]);
  chooseCards(state, [32], 'play Weapons Supplier');
  check(state.pending.length === 0, 'Weapons Supplier mandatory finite draw executes automatically');
  check(weaponCount(state) === beforeWeapons + 5, 'Weapons Supplier draws exactly 5 cards for two longships');
  check(state.weaponDeck.length + state.weaponDiscard.length === beforeSupply - 5, 'Weapons Supplier removes exactly 5 cards from finite weapon supply');
  check(feastWeaponConservation(state) === 47, 'Weapons Supplier preserves all 47 finite weapon cards');
  assertUsage(state, 32, 'weapons-by-longships', 'once-per-card', true);
}

{
  const state = fresh(1, 9343);
  const before = state.players[0].goods.fruits;
  beginPrintedOccupationPlay(state, [43]);
  chooseCards(state, [43], 'play Fruit Picker');
  check(state.players[0].goods.fruits === before + 1, 'Fruit Picker gains exactly 1 fruit');
  assertUsage(state, 43, 'take-fruits', 'once-per-card', true);
}

{
  const state = fresh(4, 9488);
  const before = state.players[0].silver;
  beginPrintedOccupationPlay(state, [188]);
  chooseCards(state, [188], 'play Mineworker');
  check(state.players[0].silver === before + 3, 'Mineworker gains exactly 3 silver in a four-player game');
  assertUsage(state, 188, 'player-count-silver', 'once-per-card', false);
}

// ---------------------------------------------------------------------------
// Ordered multi-card play plus serialized deferred phase continuations.
// ---------------------------------------------------------------------------

{
  const state = fresh(1, 9505);
  state.players[0].goods.cattle = 2;
  const beforeFruit = state.players[0].goods.fruits;
  beginPrintedOccupationPlay(state, [5, 35, 43], 'play-occupations-4');
  chooseCards(state, [5, 35, 43], 'play Chief, Cattle Breeder, and Fruit Picker in that order');

  equal(state.players[0].playedOccupations.filter((id) => [5, 35, 43].map(cardId).includes(id)), [cardId(5)], 'only the first selected card is played before its on-play effect');
  check(state.players[0].occupationHand.includes(cardId(35)) && state.players[0].occupationHand.includes(cardId(43)), 'later selected cards remain in hand while Chief resolves');
  check(!state.players[0].turnMayEnd, 'printed action cannot finish while the occupation chain is unresolved');

  const privateFeast = head(state, 'feast');
  check(privateFeast.meta?.extra === true, 'Chief automatically creates a distinct private Feast decision');
  check(privateFeast.continuation.kind === 'occupation-deferred', 'Chief Feast retains the ordered occupation continuation');
  check(!state.players[0].playedOccupations.includes(cardId(35)), 'Cattle Breeder still waits until Chief Feast completes');
  act(state, { type: 'feast_finish' }, 'finish Chief private Feast');

  const breederConfirm = expectCardDecision(state, 35, 'private-breeding', 'confirm');
  check(state.players[0].playedOccupations.includes(cardId(35)), 'Cattle Breeder plays immediately after Chief continuation resumes');
  check(!state.players[0].playedOccupations.includes(cardId(43)), 'Fruit Picker waits for Cattle Breeder decision');
  act(state, {
    type: 'resolve_decision', decisionId: breederConfirm.id, choice: { accepted: true },
  }, 'accept Cattle Breeder private breeding');

  check(state.pending.length === 0, 'multi-card chain returns to and completes the printed worker action');
  check(state.players[0].goods.cattle === 1 && state.players[0].goods['pregnant-cattle'] === 1, 'Cattle Breeder runs one separate breeding phase');
  check(state.players[0].goods.fruits === beforeFruit + 1, 'Fruit Picker resolves only after the deferred phase card');
  equal(state.players[0].playedOccupations.filter((id) => [5, 35, 43].map(cardId).includes(id)), [cardId(5), cardId(35), cardId(43)], 'selected occupations are committed in submitted order');
  check(state.players[0].turnMayEnd, 'printed action continuation becomes endable only after every card effect');

  const titles = state.events.map((event) => event.title);
  const order = ['Played Chief', 'Resolved Chief', 'Feast completed', 'Played Cattle Breeder', 'Resolved Cattle Breeder', 'Played Fruit Picker', 'Resolved Fruit Picker']
    .map((title) => titles.indexOf(title));
  check(order.every((index) => index >= 0), 'ordered chain emits every play/effect/phase audit event');
  check(order.every((index, position) => position === 0 || index > order[position - 1]), 'audit events prove on-play effects resolve before the next card');
  assertUsage(state, 5, 'private-feast', 'once-per-card', true);
  assertUsage(state, 35, 'private-breeding', 'once-per-card', true);
  assertUsage(state, 43, 'take-fruits', 'once-per-card', true);
}

// ---------------------------------------------------------------------------
// Anytime activation, decline, choices, repeat counts, and stale decisions.
// ---------------------------------------------------------------------------

{
  const state = fresh(1, 9544);
  markPlayed(state, 44);
  state.players[0].goods.hide = 2;
  state.players[0].goods.wool = 2;
  state.players[0].goods.linen = 2;
  state.players[0].goods.clothing = 0;
  state.players[0].silver = 0;

  act(state, { type: 'activate_occupation', cardId: cardId(44) }, 'activate Master Tailor for optional decline');
  const declineDecision = expectCardDecision(state, 44, 'tailor-exchange', 'confirm');
  const beforeDecline = {
    hide: state.players[0].goods.hide, wool: state.players[0].goods.wool,
    linen: state.players[0].goods.linen, clothing: state.players[0].goods.clothing,
    silver: state.players[0].silver,
  };
  resolveHead(state, { accepted: false }, 'decline optional Master Tailor exchange');
  equal({
    hide: state.players[0].goods.hide, wool: state.players[0].goods.wool,
    linen: state.players[0].goods.linen, clothing: state.players[0].goods.clothing,
    silver: state.players[0].silver,
  }, beforeDecline, 'declining Master Tailor makes no inventory mutation');
  check(!state.occupationUsage.some((entry) => entry.cardId === cardId(44)), 'declining Master Tailor records no accepted provenance');

  act(state, { type: 'activate_occupation', cardId: cardId(44) }, 'reactivate Master Tailor after decline');
  const firstAccept = expectCardDecision(state, 44, 'tailor-exchange', 'confirm');
  check(firstAccept.id !== declineDecision.id, 'reactivation receives a fresh server decision id');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: declineDecision.id, choice: { accepted: true },
  }, 'stale declined Master Tailor decision');
  resolveHead(state, { accepted: true }, 'accept first Master Tailor exchange');

  act(state, { type: 'activate_occupation', cardId: cardId(44) }, 'repeat unlimited Master Tailor activation');
  resolveHead(state, { accepted: true }, 'accept second Master Tailor exchange');
  equal({
    hide: state.players[0].goods.hide, wool: state.players[0].goods.wool,
    linen: state.players[0].goods.linen, clothing: state.players[0].goods.clothing,
    silver: state.players[0].silver,
  }, { hide: 0, wool: 0, linen: 0, clothing: 2, silver: 6 }, 'Master Tailor repeats exact printed exchange across activations');
  const accepted = state.occupationUsage.filter((entry) => entry.cardId === cardId(44));
  check(accepted.length === 2, 'Master Tailor stores provenance for both accepted unlimited uses');
  check(new Set(accepted.map((entry) => entry.eventId)).size === 2, 'Master Tailor repeated uses have distinct event provenance');
}

{
  const state = fresh(1, 9551);
  markPlayed(state, 51);
  state.players[0].goods['rune-stone'] = 2;
  state.players[0].goods.milk = 0;
  state.players[0].goods.cabbage = 0;
  state.players[0].silver = 0;
  act(state, { type: 'activate_occupation', cardId: cardId(51) }, 'activate Master Mason');
  const confirmation = expectCardDecision(state, 51, 'mason-exchange', 'confirm');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: 'forged-card-effect-id', choice: { accepted: true },
  }, 'forged Master Mason decision id');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: confirmation.id,
    choice: { accepted: true, optionIds: ['forged-confirmation-payload'] },
  }, 'forged item attached to Master Mason confirmation');
  resolveHead(state, { accepted: true }, 'confirm Master Mason optional exchange');

  const choice = expectCardDecision(state, 51, 'mason-exchange', 'choice');
  check(choice.options.length === 2, 'Master Mason exposes exactly milk and cabbage choices');
  equal(choice.options.map((option) => option.label), ['MILK', 'CABBAGE'], 'Master Mason choices preserve printed alternatives');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: confirmation.id, choice: { optionIds: [choice.options[0].id] },
  }, 'stale Master Mason confirmation after cursor advancement');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: choice.id, choice: { optionIds: ['occ:v1:choice:forged:cabbage'] },
  }, 'forged Master Mason option encoding');
  const cabbage = choice.options.find((option) => option.label === 'CABBAGE');
  check(!!cabbage, 'Master Mason cabbage server option exists');
  resolveHead(state, { optionIds: [cabbage!.id] }, 'choose Master Mason cabbage');
  equal({
    runeStone: state.players[0].goods['rune-stone'], silver: state.players[0].silver,
    milk: state.players[0].goods.milk, cabbage: state.players[0].goods.cabbage,
  }, { runeStone: 1, silver: 1, milk: 0, cabbage: 1 }, 'Master Mason pays and grants exactly the selected branch');
  assertUsage(state, 51, 'mason-exchange', 'unlimited', false);
}

{
  const state = fresh(1, 9554);
  markPlayed(state, 54);
  state.players[0].goods.silverware = 2;
  state.players[0].goods.silk = 0;
  state.players[0].goods.chest = 0;
  act(state, { type: 'activate_occupation', cardId: cardId(54) }, 'activate Tradesman');
  expectCardDecision(state, 54, 'silverware-trade', 'confirm');
  resolveHead(state, { accepted: true }, 'confirm Tradesman exchange');
  const choice = expectCardDecision(state, 54, 'silverware-trade', 'choice');
  equal(choice.options.map((option) => option.label), ['SILK', 'CHEST'], 'Tradesman exposes exact silk/chest alternatives');
  const chest = choice.options.find((option) => option.label === 'CHEST');
  check(!!chest, 'Tradesman chest server option exists');
  resolveHead(state, { optionIds: [chest!.id] }, 'choose Tradesman chest');
  equal({
    silverware: state.players[0].goods.silverware,
    silk: state.players[0].goods.silk,
    chest: state.players[0].goods.chest,
  }, { silverware: 1, silk: 0, chest: 1 }, 'Tradesman performs exactly the chosen 1:1 trade');
  assertUsage(state, 54, 'silverware-trade', 'unlimited', false);
}

{
  const state = fresh(1, 9558);
  markPlayed(state, 58);
  state.players[0].goods.flax = 4;
  state.players[0].goods.oil = 0;
  act(state, { type: 'activate_occupation', cardId: cardId(58) }, 'activate Linseed Oil Presser');
  expectCardDecision(state, 58, 'flax-to-oil', 'confirm');
  resolveHead(state, { accepted: true }, 'confirm Linseed Oil Presser exchange');
  check(state.players[0].goods.flax === 2, 'Linseed Oil Presser pays exactly 2 flax');
  check(state.players[0].goods.oil === 3, 'Linseed Oil Presser gains exactly 3 oil');
  assertUsage(state, 58, 'flax-to-oil', 'unlimited', false);
}

{
  const state = fresh(1, 9547);
  markPlayed(state, 47);
  state.players[0].goods['salt-meat'] = 4;
  state.players[0].goods.hide = 0;
  act(state, { type: 'activate_occupation', cardId: cardId(47) }, 'activate Tanner');
  expectCardDecision(state, 47, 'salt-meat-to-hide', 'confirm');
  resolveHead(state, { accepted: true }, 'confirm Tanner exchange');
  const repeat = expectCardDecision(state, 47, 'salt-meat-to-hide', 'repeat');
  check(repeat.meta?.repeatMax === 4, 'Tanner repeat maximum is derived from four available salt meat');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: repeat.id, choice: { amount: 5 },
  }, 'Tanner repeat above finite inventory maximum');
  resolveHead(state, { amount: 3 }, 'exchange three salt meat with Tanner');
  check(state.players[0].goods['salt-meat'] === 1, 'Tanner repeat pays exactly the selected 3 salt meat');
  check(state.players[0].goods.hide === 3, 'Tanner repeat gains exactly 3 hide');
  assertUsage(state, 47, 'salt-meat-to-hide', 'unlimited', false);
}

// ---------------------------------------------------------------------------
// Sequential choice plus canonical target selection through card play.
// ---------------------------------------------------------------------------

{
  const state = fresh(1, 9560);
  const occupied = state.actionSpaces.find((space) => space.id === 'build-shed');
  check(!!occupied, 'Inspector target fixture finds Build a Shed action space');
  if (!occupied) throw new Error('Missing Build a Shed action space');
  occupied.occupants = [{
    seat: 0, workers: 2, workerColor: state.players[0].activeWorkerColor, copiedFrom: null,
  }];
  state.players[0].workersAvailable -= 2;
  const beforeAvailable = state.players[0].workersAvailable;
  beginPrintedOccupationPlay(state, [60]);
  chooseCards(state, [60], 'play Inspector');
  expectCardDecision(state, 60, 'inspect-action-space', 'confirm');
  resolveHead(state, { accepted: true }, 'confirm Inspector effect');

  const choice = expectCardDecision(state, 60, 'inspect-action-space', 'choice');
  const oneWorker = choice.options.find((option) => option.label === 'ONE WORKER');
  check(!!oneWorker, 'Inspector exposes one-worker printed branch');
  resolveHead(state, { optionIds: [oneWorker!.id] }, 'choose Inspector one-worker branch');

  const target = expectCardDecision(state, 60, 'inspect-action-space', 'target');
  check(target.meta?.targetKind === 'action-space', 'Inspector target is typed as an action space');
  const shedTarget = target.options.find((option) => option.label === 'BUILD SHED');
  check(!!shedTarget, 'Inspector lists the seeded occupied Build a Shed action space');
  check(target.options.every((option) => !option.disabled), 'Inspector target list contains only occupied legal action spaces');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: target.id,
    choice: { optionIds: ['occ:v1:target:forged:build-long-house'] },
  }, 'forged Inspector target option');
  resolveHead(state, { optionIds: [shedTarget!.id] }, 'select Inspector Build a Shed target');
  check(occupied !== state.actionSpaces.find((space) => space.id === 'build-shed'), 'atomic reducer replaces state graph after successful target resolution');
  const resolvedSpace = state.actionSpaces.find((space) => space.id === 'build-shed');
  check(resolvedSpace?.occupants[0]?.workers === 1, 'Inspector returns exactly one Viking from selected action space');
  check(state.players[0].workersAvailable === beforeAvailable - 2 + 1, 'Inspector returns one Viking after paying two for the occupation action');
  assertUsage(state, 60, 'inspect-action-space', 'once-per-card', true);
}

{
  const state = fresh(1, 9678);
  state.players[0].ships.push({
    id: 'card-78-knarr', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null,
  });
  state.players[0].goods['pregnant-sheep'] = 1;
  state.players[0].goods.sheep = 0;
  beginPrintedOccupationPlay(state, [78]);
  chooseCards(state, [78], 'play Knarr Turner with a pregnant Sheep available');
  expectCardDecision(state, 78, 'flip-goods-by-knarrs', 'confirm');
  resolveHead(state, { accepted: true }, 'accept Knarr Turner flips');

  const flip = head(state, 'card-effect');
  check(flip.meta?.mode === 'occupation-deferred' && flip.meta?.grantAction === 'upgrade-good',
    'Knarr Turner exposes a reducer-owned flip decision');
  const pregnantToNormal = flip.options.find((option) => option.id === 'pregnant-sheep->sheep');
  check(!!pregnantToNormal, 'Knarr Turner offers Pregnant Sheep -> Sheep as the physical reverse-side flip');
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: flip.id,
    choice: { allocations: [{ id: 'pregnant-sheep->pregnant-cattle', amount: 1 }] },
  }, 'forged Knarr Turner pregnancy route');
  resolveHead(state, { allocations: [{ id: pregnantToNormal!.id, amount: 1 }] },
    'flip the pregnant Sheep to its normal side');

  equal(state.players[0].goods['pregnant-sheep'], 0,
    'Knarr Turner consumes the exact pregnant face');
  equal(state.players[0].goods.sheep, 1,
    'Knarr Turner restores the normal Sheep face instead of rejecting pregnancy');
  assertUsage(state, 78, 'flip-goods-by-knarrs', 'once-per-card', true);
}

// Couriers 70/71 must derive the unique tile's location from committed board
// state when the card is played. The occupation chooser has no location field
// the client could truthfully provide (or forge).
for (const fixture of [
  { number: 70, clauseId: 'reclaim-cloakpin', specialId: 'cloakpin', rewards: ['silverware', 'rune-stone'] },
  { number: 71, clauseId: 'reclaim-drinking-horn', specialId: 'drinking-horn', rewards: ['chest', 'rune-stone'] },
] as const) {
  const state = fresh(2, 9700 + fixture.number);
  const sourceBoardId = `${fixture.specialId}-opponent-iceland`;
  state.players[1].boards.push({
    id: sourceBoardId, definitionId: 'iceland', kind: 'exploration', owner: 1, placements: [],
  });
  placeSpecialOnBoard(state, 1, fixture.specialId, `${fixture.specialId}-placed`, sourceBoardId);
  markPlayed(state, 100);
  const actorSilverBefore = state.players[0].silver;
  beginPrintedOccupationPlay(state, [fixture.number]);
  chooseCards(state, [fixture.number], `play ${fixture.specialId} courier`);

  const confirmation = expectCardDecision(state, fixture.number, fixture.clauseId, 'confirm');
  check(confirmation.continuation.kind === 'occupation-event'
    && confirmation.continuation.context.fields[fixture.number === 70 ? 'cloakpinLocation' : 'drinkingHornLocation'] === 'board',
  `${fixture.specialId} play event carries the reducer-derived board location`);
  resolveHead(state, { accepted: true }, `accept ${fixture.specialId} reclaim`);

  const source = expectCardDecision(state, fixture.number, fixture.clauseId, 'target');
  check(source.options.length === 1, `${fixture.specialId} reclaim offers the one committed physical placement`);
  rejectAtomic(state, {
    type: 'resolve_decision', decisionId: source.id, choice: { optionIds: ['forged-placement'] },
  }, `forged ${fixture.specialId} source`);
  resolveHead(state, { optionIds: [source.options[0].id] }, `select committed ${fixture.specialId}`);

  const footprint = expectCardDecision(state, fixture.number, fixture.clauseId, 'target');
  check(footprint.options.length === 1, `${fixture.specialId} fill remains bound to the exact vacated placement`);
  resolveHead(state, { optionIds: [footprint.options[0].id] }, `select vacated ${fixture.specialId} footprint`);

  const packing = head(state, 'card-effect');
  check(packing.meta?.mode === 'occupation-deferred' && packing.meta?.intentKind === 'placement',
    `${fixture.specialId} produces a typed deferred placement decision`);
  check(packing.options.length > 0, `${fixture.specialId} vacated footprint offers a server-authored packing`);
  resolveHead(state, { optionIds: [packing.options[0].id] }, `fill vacated ${fixture.specialId} footprint`);

  const sourceBoard = state.players[1].boards.find((board) => board.id === sourceBoardId)!;
  check(state.players[0].specials.includes(fixture.specialId), `${fixture.specialId} moves into the card owner's supply`);
  check(!state.players[1].specials.includes(fixture.specialId), `${fixture.specialId} leaves the former owner's supply`);
  check(!sourceBoard.placements.some((placement) => placement.pieceId === fixture.specialId),
    `${fixture.specialId} leaves its exact committed board position`);
  equal(sourceBoard.placements.map((placement) => placement.pieceId).sort(), [...fixture.rewards].sort(),
    `${fixture.specialId} footprint receives the exact printed replacement tiles`);
  equal(state.players[0].silver, actorSilverBefore + 1,
    `${fixture.specialId} cross-player Rune Stone emits an actor tile-placement context on Exploration`);
  equal(state.occupationUsage.filter((entry) => entry.cardId === cardId(100)).length, 1,
    `${fixture.specialId} replacement packing triggers the actor's Rune Stone occupation exactly once`);
  assertUsage(state, fixture.number, fixture.clauseId, 'once-per-card', true);
}

{
  const state = fresh(2, 9782);
  markPlayed(state, 182);
  state.players[0].resources.wood = 2;
  state.players[0].boards.push(
    { id: 'courier-actor-house-a', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [] },
    { id: 'courier-actor-house-b', definitionId: 'long-house', kind: 'building', owner: 0, placements: [] },
  );
  const targetBoardId = placeSpecialOnBoard(state, 1, 'cloakpin', 'state-context-cloakpin');
  beginPrintedOccupationPlay(state, [70]);
  chooseCards(state, [70], 'play Cloakpin Courier for cross-player state context coverage');
  resolveHead(state, { accepted: true }, 'accept cross-player Cloakpin reclaim');
  let decision = expectCardDecision(state, 70, 'reclaim-cloakpin', 'target');
  resolveHead(state, { optionIds: [decision.options[0].id] }, 'choose the opponent Cloakpin placement');
  decision = expectCardDecision(state, 70, 'reclaim-cloakpin', 'target');
  resolveHead(state, { optionIds: [decision.options[0].id] }, 'bind the replacement to its vacated footprint');

  decision = expectCardDecision(state, 182, 'house-threshold-spices', 'confirm');
  check(decision.continuation.kind === 'occupation-event'
    && decision.continuation.context.fields.boardId === undefined,
  'the actor-supply mutation is distinguishable from a target-board state change');
  resolveHead(state, { accepted: false }, 'decline the pre-packing threshold opportunity');

  const packing = head(state, 'card-effect');
  check(packing.meta?.intentKind === 'placement', 'Courier resumes into exact replacement packing');
  resolveHead(state, { optionIds: [packing.options[0].id] }, 'commit the cross-player replacement packing');

  decision = expectCardDecision(state, 182, 'house-threshold-spices', 'confirm');
  check(decision.continuation.kind === 'occupation-event'
    && decision.continuation.context.fields.seat === 0
    && decision.continuation.context.fields.boardId === targetBoardId
    && decision.continuation.context.fields.boardKind === 'home',
  'cross-player packing emits actor state-change context with the exact target board id and kind');
  resolveHead(state, { accepted: true }, 'accept the target-board state-change opportunity');
  decision = expectCardDecision(state, 182, 'house-threshold-spices', 'choice');
  resolveHead(state, { optionIds: [] }, 'consume the threshold opportunity without an exchange branch');
  const thresholdUsage = state.occupationUsage.filter((entry) => entry.cardId === cardId(182));
  equal(thresholdUsage.length, 1, 'target-board state change records exactly one accepted threshold use');
  check(thresholdUsage[0]?.eventId?.includes(`owner:1:placement:`) === true,
    'accepted threshold provenance remains bound to the cross-player placement state event');
  check(state.players[0].occupationUses.find((entry) => entry.cardId === cardId(182))?.usedOnce === true,
    'accepted cross-player state-change opportunity latches the once-per-card threshold');
}

{
  const state = fresh(1, 9770);
  state.specialSupply = state.specialSupply.filter((candidate) => candidate !== 'cloakpin');
  state.players[0].specials.push('cloakpin');
  beginPrintedOccupationPlay(state, [70]);
  chooseCards(state, [70], 'play Cloakpin Courier while the tile is uncommitted');
  check(state.pending.length === 0, 'owner-supply Cloakpin does not satisfy the reducer-derived board predicate');
  check(!state.occupationUsage.some((entry) => entry.cardId === cardId(70)),
    'inert owner-supply Cloakpin consumes no Courier use');
}

// The legacy client-authored mutation escape hatch must remain closed even for
// a legitimately owned anytime card.
{
  const state = fresh(1, 9644);
  markPlayed(state, 44);
  rejectAtomic(state, {
    type: 'use_occupation', cardId: cardId(44),
    operations: [{ kind: 'silver', amount: 12 }],
    note: 'Forged client-side state delta.',
  }, 'legacy client-authored occupation operation');
}

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`${passed}/${passed} occupation reducer pipeline checks passed`);
}
