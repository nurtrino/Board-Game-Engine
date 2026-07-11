import {
  FEAST_ACTION_BY_ID, FEAST_ACTION_SPACES, FEAST_BOARD_BY_ID,
  FEAST_EXPLORATION_PAIRS, FEAST_GOOD_BY_ID, FEAST_GOOD_IDS, FEAST_MOUNTAINS,
  FEAST_OCCUPATION_BY_ID, FEAST_OCCUPATIONS, FEAST_SPECIAL_BY_ID, FEAST_SPECIALS,
  FEAST_WEAPON_DECK_COUNTS,
} from './data.js';
import {
  feastBonusesForBoard, feastCanAfford, feastIncomeForBoard,
  feastUncoveredNegative,
} from './placement.js';
import { feastOccupationActionModifiers, feastOccupationScoringModifiers } from './occupationRuntime.js';
import type { FeastOccupationUsageRecord } from './occupationRuntime.js';
import type { FeastOccupationEvent } from './occupationRules.js';
import { feastOccupationContext } from './occupationPipeline.js';
import type {
  FeastActionSpaceDefinition, FeastAutomaticBonusState, FeastBoardState, FeastEvent, FeastGood, FeastOccupationDefinition,
  FeastOptions, FeastPendingDecision, FeastPlayer, FeastPlayerView, FeastResult,
  FeastScoreBreakdown, FeastSeated, FeastSeatColor, FeastShipType, FeastState,
  FeastView, FeastWeapon, FeastOccupationContextState,
} from './types.js';

export const FEAST_SEATS: readonly FeastSeatColor[] = ['Red', 'Blue', 'Green', 'Purple'] as const;
export const FEAST_DEFAULT_OPTIONS: FeastOptions = {
  length: 'long', occupationMode: 'A', soloStartingOccupation: 'random',
};
export const FEAST_EDITION = 'CLASSIC BASE - 2016' as const;
export const FEAST_SCHEMA_VERSION = 1 as const;

export const feastOk = (): FeastResult => ({ ok: true });
export const feastErr = (error: string): FeastResult => ({ ok: false, error });

export function feastId(state: FeastState, prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

/** Counter-based deterministic stream. Every random operation advances state. */
export function feastRandom(state: FeastState): number {
  let x = (state.seed + Math.imul(++state.rngCounter, 0x9e3779b9)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x21f0aaad);
  x ^= x >>> 15;
  x = Math.imul(x, 0x735a2d97);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

export function feastShuffle<T>(state: FeastState, input: readonly T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(feastRandom(state) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function feastEvent(
  state: FeastState, seat: number | null, title: string, detail: string,
  extra: Partial<Pick<FeastEvent, 'actionSpaceId' | 'boardId' | 'die'>> = {},
): void {
  const player = seat === null ? null : state.players[seat] ?? null;
  state.lastEvent = {
    seq: ++state.eventSeq, round: state.round, phase: state.phase,
    phaseNumber: state.phaseNumber, seat, player: player?.name ?? null, title, detail, ...extra,
  };
  if (!Array.isArray(state.events)) state.events = [];
  state.events.push(state.lastEvent);
  if (state.events.length > 240) state.events.splice(0, state.events.length - 240);
  state.log.push(`${player ? `${player.name}: ` : ''}${title}${detail ? ` - ${detail}` : ''}`);
  if (state.log.length > 240) state.log.splice(0, state.log.length - 240);
}

function emptyGoods(): Record<FeastGood, number> {
  return Object.fromEntries(FEAST_GOOD_IDS.map((id) => [id, 0])) as Record<FeastGood, number>;
}

function occupationAllowed(card: FeastOccupationDefinition, mode: FeastOptions['occupationMode']): boolean {
  return mode === 'all' || (mode === 'A' ? card.deck === 'A' : card.deck === 'B' || card.deck === 'C');
}

function nextSoloColor(color: FeastSeatColor): FeastSeatColor {
  return FEAST_SEATS[(FEAST_SEATS.indexOf(color) + 1) % FEAST_SEATS.length];
}

function buildPlayer(
  seated: FeastSeated, seat: number, options: FeastOptions, solo: boolean,
): FeastPlayer {
  const base = options.length === 'long' ? 5 : 6;
  const activeBase = solo ? 5 : base;
  const secondColor = nextSoloColor(seated.color);
  const goods = emptyGoods();
  goods.mead = 1;
  const workerColors = solo ? [seated.color, secondColor] : [seated.color];
  const workersByColor: Partial<Record<FeastSeatColor, number>> = solo
    ? { [seated.color]: 5, [secondColor]: options.length === 'long' ? 5 : 6 }
    : { [seated.color]: base };
  return {
    seat, name: seated.name, color: seated.color,
    workerColors, activeWorkerColor: seated.color, workersByColor,
    workersTotal: activeBase, workersAvailable: activeBase,
    workersWaiting: solo ? (options.length === 'long' ? 5 : 6) : 0,
    passed: false, turnActionTaken: false, turnMayEnd: false, turnEffectUsed: false,
    turnActionId: null, turnSelectedShipIds: [], turnActionFacts: {}, fourthOccupationAfter: false,
    silver: 0,
    resources: { wood: 0, stone: 0, ore: 0 },
    goods,
    weapons: { bow: 1, snare: 1, spear: 1, 'long-sword': 0 },
    ships: [], specials: [],
    occupationHand: [], playedOccupations: [], occupationUses: [],
    boards: [{
      id: `player-${seat}-home`,
      definitionId: options.length === 'long' ? 'home-long' : 'home-short',
      kind: 'home', owner: seat, placements: [],
    }],
    feastPlacements: [], feastRewardedPlacementIds: [], feastHorizontalTypes: [],
    feastNoMeadCommitted: false, thingPenalties: 0,
    finalIncome: 0, scoreAdjustments: [],
  };
}

export function createFeast(
  seated: FeastSeated[], seed: number,
  rawOptions: Partial<FeastOptions> = {},
): FeastState {
  if (seated.length < 1 || seated.length > 4) throw new Error('A Feast for Odin is 1-4 players');
  if (new Set(seated.map((x) => x.color)).size !== seated.length) throw new Error('Feast seat colors must be unique');
  if (seated.some((x) => !FEAST_SEATS.includes(x.color))) throw new Error('Unknown Feast seat color');
  const options: FeastOptions = { ...FEAST_DEFAULT_OPTIONS, ...rawOptions };
  if (!['short', 'long'].includes(options.length)) throw new Error('Feast length must be short or long');
  if (!['A', 'BC', 'all'].includes(options.occupationMode)) throw new Error('Unknown occupation mode');
  if (!['random', 'choose'].includes(options.soloStartingOccupation)) throw new Error('Unknown solo occupation setup');
  const rounds = (options.length === 'short' ? 6 : 7) as 6 | 7;

  const state: FeastState = {
    schemaVersion: FEAST_SCHEMA_VERSION,
    game: 'feast', edition: FEAST_EDITION,
    seed: seed | 0, rngCounter: 0, nextId: 1,
    options, phase: 'new_viking', phaseNumber: 1, round: 1, rounds,
    firstPlayer: 0, turn: 0, lastWorkerSeat: null, feastCursor: 0,
    automaticCheckpoint: null, automaticSeatCursor: 0,
    automaticItems: [], automaticItemCursor: 0,
    automaticBreedingContexts: [], automaticBreedingContextCursor: 0,
    automaticBonuses: [], automaticBonusCursor: 0, automaticBonusOffered: false,
    automaticBonusStage: 'offer', automaticBonusContexts: [], automaticBonusContextCursor: 0,
    players: seated.map((x, i) => buildPlayer(x, i, options, seated.length === 1)),
    actionSpaces: FEAST_ACTION_SPACES.map((x) => ({ id: x.id, occupants: [] })),
    workerPlacementHistory: [],
    imitationColumns: [], mountains: [], mountainDeck: [],
    explorations: FEAST_EXPLORATION_PAIRS.map((x) => ({ ...x, silver: 0, claimedBy: null })),
    specialSupply: FEAST_SPECIALS.map((x) => x.id),
    buildingSupply: { shed: 3, 'stone-house': 3, 'long-house': 5 },
    occupationDeck: [], occupationDiscard: [], startingOccupationDeck: [],
    weaponDeck: [], weaponDiscard: [],
    weaponSubstitutes: { bow: 0, snare: 0, spear: 0, 'long-sword': 0 },
    occupationUsage: [], occupationReplacements: [], occupationActiveModifiers: [],
    pending: [],
    eventSeq: 0, lastEvent: null, events: [], log: [], scores: null, winners: null,
  };

  state.firstPlayer = Math.floor(feastRandom(state) * state.players.length);
  state.turn = state.firstPlayer;
  if (seated.length === 4) {
    state.imitationColumns = [feastRandom(state) < 0.5 ? 1 : 2, feastRandom(state) < 0.5 ? 3 : 4];
  }

  const mountainDeck = feastShuffle(state, FEAST_MOUNTAINS.map((items, i) => ({ id: `mountain-${i + 1}`, items: [...items] })));
  state.mountains = mountainDeck.splice(0, seated.length === 4 ? 3 : 2);
  state.mountainDeck = mountainDeck;

  const weapons: FeastWeapon[] = [];
  for (const [weapon, count] of Object.entries(FEAST_WEAPON_DECK_COUNTS) as [FeastWeapon, number][]) {
    const dealt = weapon === 'long-sword' ? 0 : seated.length;
    for (let i = 0; i < count - dealt; i++) weapons.push(weapon);
  }
  state.weaponDeck = feastShuffle(state, weapons);

  const allowed = FEAST_OCCUPATIONS.filter((x) => occupationAllowed(x, options.occupationMode));
  state.startingOccupationDeck = feastShuffle(state, allowed.filter((x) => x.starting).map((x) => x.id));
  state.occupationDeck = feastShuffle(state, allowed.filter((x) => !x.starting).map((x) => x.id));

  if (seated.length === 1 && options.soloStartingOccupation === 'choose') {
    const choices = state.startingOccupationDeck.map((id) => {
      const card = FEAST_OCCUPATION_BY_ID[id];
      return { id, label: card.name, detail: `${card.points} VP - ${card.type}` };
    });
    state.pending.push({
      id: feastId(state, 'decision'), seat: 0, kind: 'setup-occupation',
      label: 'Choose a Starting Occupation', prompt: 'Choose one light-brown occupation for the solo game.',
      options: choices, min: 1, max: 1, meta: { private: true },
      continuation: { kind: 'setup-occupation' }, private: true,
    });
  } else {
    for (const player of state.players) {
      const card = state.startingOccupationDeck.pop();
      if (card) player.occupationHand.push(card);
    }
  }

  feastEvent(state, null, 'Classic Feast prepared', `${seated.length} player${seated.length === 1 ? '' : 's'} - ${rounds} rounds`);
  if (!state.pending.length) feastAdvanceAutomatic(state);
  return state;
}

export function feastDrawOccupation(state: FeastState, seat: number): string | null {
  if (!state.occupationDeck.length && state.occupationDiscard.length) {
    state.occupationDeck = feastShuffle(state, state.occupationDiscard);
    state.occupationDiscard = [];
  }
  const card = state.occupationDeck.pop() ?? null;
  if (card) state.players[seat].occupationHand.push(card);
  return card;
}

export function feastDrawWeapon(state: FeastState): FeastWeapon | null {
  if (!state.weaponDeck.length && state.weaponDiscard.length) {
    state.weaponDeck = feastShuffle(state, state.weaponDiscard);
    state.weaponDiscard = [];
  }
  return state.weaponDeck.pop() ?? null;
}

/** Search discard first, then draw pile; shuffle the remaining draw pile. */
export function feastTakeWeapon(state: FeastState, wanted: FeastWeapon): boolean {
  const discard = state.weaponDiscard.indexOf(wanted);
  if (discard >= 0) {
    state.weaponDiscard.splice(discard, 1);
    return true;
  }
  const deck = state.weaponDeck.indexOf(wanted);
  if (deck >= 0) state.weaponDeck.splice(deck, 1);
  state.weaponDeck = feastShuffle(state, state.weaponDeck);
  return deck >= 0;
}

export function feastWeaponConservation(state: FeastState): number {
  const hands = state.players.reduce((total, p) => total + Object.values(p.weapons).reduce((n, x) => n + x, 0), 0);
  const substitutes = Object.values(state.weaponSubstitutes).reduce((n, x) => n + x, 0);
  return hands - substitutes + state.weaponDeck.length + state.weaponDiscard.length;
}

export function feastHasOccupation(player: FeastPlayer, number: number): boolean {
  return player.playedOccupations.includes(`occupation-${number}`);
}

/** Effective silver paid to the printed action after first-class card discounts. */
export function feastActionSilverCost(player: FeastPlayer, actionSpaceId: string, printedCost: number): number {
  if (printedCost <= 0) return 0;
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  let discount = 0;
  if (def?.group === 'Livestock Market' && feastHasOccupation(player, 1)) discount++;
  const buysShip = def?.effects.some((effect) => effect.kind === 'ship') === true;
  if (printedCost >= 2 && feastHasOccupation(player, 2) && !buysShip) discount++;
  if (def?.effects.some((effect) => effect.kind === 'emigrate') && feastHasOccupation(player, 170)) discount += 2;
  return Math.max(0, printedCost - discount);
}

/** Effective building-resource payment for a printed action-space cost. */
export function feastActionResourceCost(
  player: FeastPlayer, actionSpaceId: string,
  resource: 'wood' | 'stone' | 'ore', printedCost: number,
): number {
  if (printedCost <= 0) return 0;
  // Master Bricklayer (116) discounts only a stone cost of a House Building
  // action space.  Including build-shed here is intentional: the appendix says
  // it qualifies if another card has first replaced that shed cost with stone.
  const houseBuildingSpaces = new Set([
    'build-shed', 'build-stone-house', 'build-long-house', 'build-house-and-ship',
  ]);
  const discount = resource === 'stone'
    && feastHasOccupation(player, 116)
    && houseBuildingSpaces.has(actionSpaceId) ? 1 : 0;
  return Math.max(0, printedCost - discount);
}

function harvestLevel(state: FeastState): 0 | 1 | 2 | 3 | 4 {
  if (state.options.length === 'long') {
    return ([1, 2, 0, 3, 0, 4, 0] as const)[state.round - 1] ?? 0;
  }
  return ([1, 0, 2, 0, 3, 0] as const)[state.round - 1] ?? 0;
}

function giveHarvest(state: FeastState): void {
  const level = harvestLevel(state);
  const goods: FeastGood[] = level === 0 ? []
    : ['peas', 'beans', 'flax', ...(level >= 2 ? ['grain' as const] : []),
      ...(level >= 3 ? ['cabbage' as const] : []), ...(level >= 4 ? ['fruits' as const] : [])];
  for (const player of state.players) for (const id of goods) player.goods[id]++;
  feastEvent(state, null, level ? 'Harvest' : 'No harvest', level ? goods.join(', ') : `Round ${state.round}`);
}

function updateExplorations(state: FeastState): void {
  const flipIndex = state.options.length === 'long' ? state.round - 3 : state.round - 2;
  if (flipIndex < 0 || flipIndex >= state.explorations.length || state.round === state.rounds) {
    feastEvent(state, null, 'Exploration phase skipped', `No board turns in round ${state.round}`);
    return;
  }
  const target = state.explorations[flipIndex];
  for (const board of state.explorations) {
    if (board.boardId !== target.boardId && board.claimedBy === null) board.silver += 2;
  }
  if (target.claimedBy === null) {
    target.silver = 0;
    target.face = target.reverseFace;
  }
  feastEvent(state, null, 'Exploration boards updated', `${target.face}; other unclaimed faces received 2 silver`);
}

function addNewVikings(state: FeastState): void {
  if (state.players.length > 1) {
    for (const p of state.players) {
      p.workersByColor[p.color] = (p.workersByColor[p.color] ?? p.workersTotal) + 1;
      p.workersTotal = p.workersByColor[p.color]!;
      p.workersAvailable = p.workersTotal;
    }
    feastEvent(state, null, 'A new Viking arrived', `Everyone now has ${state.players[0].workersTotal} Vikings`);
    return;
  }
  const p = state.players[0];
  const color = p.workerColors[(state.round - 1) % 2];
  p.activeWorkerColor = color;
  const gained = state.options.length === 'short' ? 2 : state.round === 1 ? 1 : 2;
  p.workersByColor[color] = (p.workersByColor[color] ?? 0) + gained;
  p.workersTotal = p.workersByColor[color]!;
  p.workersAvailable = p.workersTotal;
  const other = p.workerColors[state.round % 2];
  p.workersWaiting = p.workersByColor[other] ?? 0;
  feastEvent(state, 0, `${gained} new Viking${gained === 1 ? '' : 's'} arrived`, `${color} is active in round ${state.round}`);
}

function beginActions(state: FeastState): void {
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = state.firstPlayer;
  state.lastWorkerSeat = null;
  state.workerPlacementHistory = [];
  for (const p of state.players) {
    p.passed = false;
    p.turnActionTaken = false;
    p.turnMayEnd = false;
    p.turnEffectUsed = false;
    p.turnActionId = null;
    p.turnSelectedShipIds = [];
    p.turnActionFacts = {};
    p.fourthOccupationAfter = false;
  }
  feastEvent(state, null, 'Action phase began', `${state.players[state.turn].name} acts first`);
}

function resolveIncome(state: FeastState): void {
  const incomes = state.players.map((p) => p.boards.reduce((n, b) => n + feastIncomeForBoard(b), 0));
  state.players.forEach((p, i) => {
    if (state.round === state.rounds) p.finalIncome = incomes[i];
    else p.silver += incomes[i];
  });
  feastEvent(state, null, state.round === state.rounds ? 'Final income recorded' : 'Income paid', incomes.join(', '));
}

export function feastBreedPlayer(player: FeastPlayer): void {
  const breed = (normal: 'sheep' | 'cattle', pregnant: 'pregnant-sheep' | 'pregnant-cattle') => {
    const mothers = player.goods[pregnant];
    if (mothers > 0) {
      player.goods[pregnant] = 0;
      player.goods[normal] += mothers * 2;
    } else if (player.goods[normal] >= 2) {
      player.goods[normal]--;
      player.goods[pregnant]++;
    }
  };
  breed('sheep', 'pregnant-sheep');
  breed('cattle', 'pregnant-cattle');
}

function resolveBreeding(state: FeastState): void {
  for (const player of state.players) feastBreedPlayer(player);
  feastEvent(state, null, 'Animal breeding resolved', 'Sheep and cattle resolved independently');
}

function breedingReceiptContexts(state: FeastState, before: readonly FeastPlayer[]): FeastOccupationContextState[] {
  const contexts: FeastOccupationContextState[] = [];
  for (let offset = 0; offset < state.players.length; offset++) {
    const seat = (state.firstPlayer + offset) % state.players.length;
    const old = before[seat];
    const player = state.players[seat];
    for (const [normal, pregnant] of [['sheep', 'pregnant-sheep'], ['cattle', 'pregnant-cattle']] as const) {
      let remaining = (player.goods[normal] + player.goods[pregnant])
        - (old.goods[normal] + old.goods[pregnant]);
      if (remaining <= 0) continue;
      for (const id of [normal, pregnant] as const) {
        const amount = Math.min(remaining, Math.max(0, player.goods[id] - old.goods[id]));
        for (let animalIndex = 0; animalIndex < amount; animalIndex++) contexts.push(feastOccupationContext(
          state, seat, 'animal-entered-stable', 'animal-gained', 'after', {
            source: 'breeding', phase: 'breeding', animal: id, amount: 1, batchAmount: 1,
          }, { eventId: `phase:${state.round}:breeding:animal:${seat}:${id}:${animalIndex}` },
        ));
        remaining -= amount;
      }
    }
  }
  return contexts;
}

export function feastApplySingleBonusReward(
  state: FeastState, seat: number,
  reward: { kind: 'good' | 'resource' | 'special' | 'building'; id: string; amount: number },
): void {
  const p = state.players[seat];
  if (reward.kind === 'resource') p.resources[reward.id as keyof typeof p.resources] += reward.amount;
  else if (reward.kind === 'good') p.goods[reward.id as FeastGood] += reward.amount;
  else if (reward.kind === 'special') {
    const at = state.specialSupply.indexOf(reward.id);
    if (at >= 0) { state.specialSupply.splice(at, 1); p.specials.push(reward.id); }
  } else if (reward.kind === 'building') {
    const building = reward.id as keyof typeof state.buildingSupply;
    for (let n = 0; n < reward.amount && state.buildingSupply[building] > 0; n++) {
      state.buildingSupply[building]--;
      p.boards.push({ id: feastId(state, building), definitionId: building, kind: 'building', owner: p.seat, placements: [] });
    }
  }
}

function bonusRewardsForBoards(
  state: FeastState, seat: number, boards: readonly FeastBoardState[], eventPrefix: string,
): FeastAutomaticBonusState[] {
  return boards.flatMap((board) => {
    const rewards = feastBonusesForBoard(board);
    const producerGoodCount = rewards
      .filter((reward) => reward.kind === 'good')
      .reduce((total, reward) => total + reward.amount, 0);
    return rewards.map((reward, index) => ({
      seat, boardId: board.id, boardKind: board.definitionId,
      eventId: `${eventPrefix}:${seat}:${board.id}:${index}`,
      producerGoodCount,
      reward: { kind: reward.kind, id: reward.id, amount: reward.amount },
    }));
  });
}

/** Snapshot the exact board-scoped rewards for one ordinary or occupation-
 * granted Bonus resolution. The snapshot keeps later decisions deterministic
 * even if a client attempts unrelated anytime actions while a hook is open. */
export function feastBonusRewardsForScope(
  state: FeastState, seat: number, scope: 'self' | 'houses' | 'home-board', eventPrefix: string,
): FeastAutomaticBonusState[] {
  const boards = state.players[seat].boards.filter((board) => scope === 'self'
    || (scope === 'houses'
      ? board.kind === 'building' && board.definitionId !== 'shed'
      : board.kind === 'home'));
  return bonusRewardsForBoards(state, seat, boards, eventPrefix);
}

function applyBonusRewards(state: FeastState, seat: number, boardIds?: ReadonlySet<string>): number {
  const p = state.players[seat];
  const earned = p.boards.filter((board) => !boardIds || boardIds.has(board.id)).flatMap((board) => feastBonusesForBoard(board));
  for (const reward of earned) {
    feastApplySingleBonusReward(state, seat, reward);
  }
  return earned.length;
}

/** Resolve a real card-granted Bonus scope using the ordinary board helper. */
export function feastResolveBonusScope(
  state: FeastState, seat: number, scope: 'self' | 'houses' | 'home-board',
): number {
  const p = state.players[seat];
  const boardIds = new Set(p.boards.filter((board) => scope === 'self'
    || (scope === 'houses' ? board.kind === 'building' && board.definitionId !== 'shed' : board.kind === 'home')).map((board) => board.id));
  const count = applyBonusRewards(state, seat, boardIds);
  feastEvent(state, seat, 'Occupation Bonus resolved', `${count} board bonus${count === 1 ? '' : 'es'} produced`);
  return count;
}

function resolveBonuses(state: FeastState): void {
  const earned = state.players.map((p) => applyBonusRewards(state, p.seat));
  feastEvent(state, null, 'Board bonuses paid', earned.join(', '));
}

function prepareAutomaticBonuses(state: FeastState): void {
  state.automaticBonuses = state.players.flatMap((player) => bonusRewardsForBoards(
    state, player.seat, player.boards, `phase:${state.round}:bonus`,
  ));
  state.automaticBonusCursor = 0;
  state.automaticBonusOffered = false;
  state.automaticBonusStage = 'offer';
  state.automaticBonusContexts = [];
  state.automaticBonusContextCursor = 0;
}

/**
 * Build the reducer-owned receipt events for one already-applied phase-10
 * reward. Keeping these contexts in state makes pausing on an occupation
 * decision replay-safe: the physical reward is not applied again on resume.
 */
function automaticBonusMutationContexts(
  state: FeastState, bonus: FeastAutomaticBonusState, before: FeastPlayer,
): FeastOccupationContextState[] {
  const seat = bonus.seat;
  const after = state.players[seat];
  const eventBase = `${bonus.eventId}:reward`;
  const common = {
    source: 'bonus', phase: 'bonus', boardId: bonus.boardId,
    boardKind: bonus.boardKind, producerGoodCount: bonus.producerGoodCount,
  } as const;
  const contexts: FeastOccupationContextState[] = [];

  for (const id of FEAST_GOOD_IDS) {
    if (id === 'sheep' || id === 'pregnant-sheep' || id === 'cattle' || id === 'pregnant-cattle') continue;
    const amount = after.goods[id] - before.goods[id];
    if (amount <= 0) continue;
    contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'instead', {
      ...common, goodId: id, amount, batchAmount: amount, originalApplied: true,
    }, { eventId: `${eventBase}:good:${id}:instead` }));
    contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'after', {
      ...common, goodId: id, amount, batchAmount: amount,
    }, { eventId: `${eventBase}:good:${id}` }));
  }
  for (const [normal, pregnant] of [['sheep', 'pregnant-sheep'], ['cattle', 'pregnant-cattle']] as const) {
    let remaining = (after.goods[normal] + after.goods[pregnant]) - (before.goods[normal] + before.goods[pregnant]);
    if (remaining <= 0) continue;
    for (const id of [normal, pregnant] as const) {
      const amount = Math.min(remaining, Math.max(0, after.goods[id] - before.goods[id]));
      if (amount <= 0) continue;
      contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'instead', {
        ...common, goodId: id, amount, batchAmount: amount, originalApplied: true,
      }, { eventId: `${eventBase}:good:${id}:instead` }));
      contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'after', {
        ...common, goodId: id, amount, batchAmount: amount,
      }, { eventId: `${eventBase}:good:${id}` }));
      for (let animalIndex = 0; animalIndex < amount; animalIndex++) contexts.push(feastOccupationContext(
        state, seat, 'animal-entered-stable', 'animal-gained', 'after',
        { ...common, animal: id, amount: 1, batchAmount: 1 },
        { eventId: `${eventBase}:animal:${id}:${animalIndex}` },
      ));
      remaining -= amount;
    }
  }
  for (const id of ['wood', 'stone', 'ore'] as const) {
    const amount = after.resources[id] - before.resources[id];
    if (amount > 0) contexts.push(feastOccupationContext(
      state, seat, 'resource-received', 'resource-gained', 'after',
      { ...common, resourceId: id, amount, batchAmount: amount },
      { eventId: `${eventBase}:resource:${id}` },
    ));
  }
  for (const board of after.boards.filter((candidate) =>
    !before.boards.some((old) => old.id === candidate.id))) {
    if (board.kind === 'building') contexts.push(feastOccupationContext(
      state, seat, 'house-built', 'house-gained', 'after',
      { ...common, houseType: board.definitionId, classifiedAsHouseBuilding: false },
      { eventId: `${eventBase}:house:${board.id}` },
    ));
  }
  if (contexts.length || after.specials.length !== before.specials.length
    || after.boards.length !== before.boards.length) {
    contexts.push(feastOccupationContext(
      state, seat, 'state-changed', 'inventory-threshold', 'when', {
        ...common, income: after.boards.reduce((sum, board) => sum + feastIncomeForBoard(board), 0),
      }, { eventId: `${eventBase}:state` },
    ));
  }
  return contexts;
}

function updateMountains(state: FeastState): void {
  for (const strip of state.mountains) strip.items.shift();
  state.mountains = state.mountains.filter((x) => x.items.length > 0);
  const skip = state.players.length === 4 && state.options.length === 'long' && state.round === 7;
  if (!skip) {
    const next = state.mountainDeck.shift();
    if (next) state.mountains.push(next);
  }
  feastEvent(state, null, 'Mountain strips aged', `${state.mountains.length} face up`);
}

function returnVikings(state: FeastState): void {
  if (state.players.length > 1) {
    for (const space of state.actionSpaces) space.occupants = [];
  } else {
    const p = state.players[0];
    const nextColor = p.workerColors[state.round % 2];
    for (const space of state.actionSpaces) {
      space.occupants = space.occupants.filter((x) => x.workerColor !== nextColor);
    }
  }
  for (const p of state.players) {
    for (const use of p.occupationUses) use.usesThisRound = 0;
  }
  feastEvent(state, null, 'Vikings returned', state.players.length === 1 ? 'The older solo color returned; the latest color remains blocking' : 'All action spaces are open');
}

export function feastQueueFeast(state: FeastState): void {
  const seat = (state.firstPlayer + state.feastCursor) % state.players.length;
  const p = state.players[seat];
  state.pending.push({
    id: feastId(state, 'decision'), seat, kind: 'feast', label: 'Serve the Feast',
    prompt: 'Cover every open Banquet Table cell, then finish the feast.',
    options: [{ id: 'finish', label: 'Finish Feast', detail: 'Any uncovered cell becomes a permanent -3 Thing Penalty.' }],
    min: 0, max: 1,
    meta: { requiredCells: p.workersTotal, emigrated: p.ships.filter((x) => x.emigrated).length },
    continuation: { kind: 'feast' }, private: false,
  });
}

export type FeastAutomaticOccupationHook = (
  state: FeastState, context: FeastOccupationContextState,
) => boolean;

function runAutomaticHookForPlayers(
  state: FeastState, hook: FeastAutomaticOccupationHook | undefined,
  build: (seat: number) => FeastOccupationContextState,
): boolean {
  if (!hook) { state.automaticSeatCursor = 0; return false; }
  while (state.automaticSeatCursor < state.players.length) {
    const seat = (state.firstPlayer + state.automaticSeatCursor) % state.players.length;
    state.automaticSeatCursor++;
    if (hook(state, build(seat))) return true;
  }
  state.automaticSeatCursor = 0;
  return false;
}

function phaseOccupationContext(
  state: FeastState, seat: number, hook: string, event: string, window: string,
  fields: Record<string, import('./types.js').FeastJsonValue>, snapshot = false,
): FeastOccupationContextState {
  const eventId = `phase:${state.round}:${state.phase}:${hook}:${window}:${seat}`;
  return {
    hook, event, window, round: state.round, eventId,
    fields: { seat, round: state.round, phase: state.phase, ...fields },
    ...(snapshot ? { snapshots: { 'phase-start': structuredClone(state.players[seat]) } } : {}),
  };
}

/**
 * Run consecutive non-interactive phases. It deliberately stops at Actions,
 * Feast, a card-created decision, or game end.
 */
export function feastAdvanceAutomatic(state: FeastState, occupationHook?: FeastAutomaticOccupationHook): void {
  for (let guard = 0; guard < 80 && !state.pending.length; guard++) {
    switch (state.phase) {
      case 'new_viking':
        state.phaseNumber = 1; addNewVikings(state); state.phase = 'harvest'; break;
      case 'harvest':
        state.phaseNumber = 2;
        if (state.automaticCheckpoint !== 'harvest:started' && state.automaticCheckpoint !== 'harvest:after') {
          state.automaticCheckpoint = 'harvest:started'; state.automaticSeatCursor = 0;
        }
        if (state.automaticCheckpoint === 'harvest:started') {
          const harvest = harvestLevel(state) > 0;
          if (runAutomaticHookForPlayers(state, occupationHook, (seat) => phaseOccupationContext(
            state, seat, 'phase-started', 'harvest', 'during', { harvest }, true,
          ))) return;
          giveHarvest(state);
          state.automaticCheckpoint = 'harvest:after'; state.automaticSeatCursor = 0;
        }
        if (state.automaticCheckpoint === 'harvest:after') {
          const harvest = harvestLevel(state) > 0;
          if (runAutomaticHookForPlayers(state, occupationHook, (seat) => phaseOccupationContext(
            state, seat, 'phase-resolved', 'harvest', 'after', { harvest },
          ))) return;
          state.automaticCheckpoint = null; state.phase = 'exploration';
        }
        break;
      case 'exploration':
        state.phaseNumber = 3; updateExplorations(state); state.phase = 'weapon'; break;
      case 'weapon': {
        state.phaseNumber = 4;
        if (state.automaticCheckpoint !== 'weapon:replacements') {
          state.automaticCheckpoint = 'weapon:replacements'; state.automaticSeatCursor = 0;
        }
        if (runAutomaticHookForPlayers(state, occupationHook, (seat) => phaseOccupationContext(
          state, seat, 'phase-started', 'new-weapon', 'instead', { exactlyOne: true }, true,
        ))) return;
        for (const p of state.players) {
          const eventId = `phase:${state.round}:weapon:phase-started:instead:${p.seat}`;
          const replaced = state.occupationReplacements.some((record) => record.cardId === 'occupation-38'
            && record.target === 'weapon-draw' && record.eventId === eventId);
          if (!replaced) {
            const card = feastDrawWeapon(state);
            if (card) p.weapons[card]++;
          }
        }
        state.automaticCheckpoint = null;
        feastEvent(state, null, 'New weapons resolved', 'Each player drew a weapon or used an occupation replacement');
        beginActions(state);
        return;
      }
      case 'actions': return;
      case 'start_player':
        state.phaseNumber = 6;
        if (state.players.length > 1 && state.lastWorkerSeat !== null) state.firstPlayer = state.lastWorkerSeat;
        feastEvent(state, null, 'Start player determined', state.players[state.firstPlayer].name);
        state.phase = 'income';
        break;
      case 'income':
        state.phaseNumber = 7;
        if (state.automaticCheckpoint !== 'income:started') {
          state.automaticCheckpoint = 'income:started'; state.automaticSeatCursor = 0;
        }
        if (runAutomaticHookForPlayers(state, occupationHook, (seat) => phaseOccupationContext(
          state, seat, 'phase-started', 'income', 'before', {}, true,
        ))) return;
        state.automaticCheckpoint = null; resolveIncome(state); state.phase = 'breeding'; break;
      case 'breeding': {
        state.phaseNumber = 8;
        state.automaticBreedingContexts ??= [];
        state.automaticBreedingContextCursor ??= 0;
        if (state.automaticCheckpoint !== 'breeding:receipts') {
          const before = structuredClone(state.players);
          resolveBreeding(state);
          state.automaticBreedingContexts = breedingReceiptContexts(state, before);
          state.automaticBreedingContextCursor = 0;
          state.automaticCheckpoint = 'breeding:receipts';
        }
        while (state.automaticBreedingContextCursor < state.automaticBreedingContexts.length) {
          const context = state.automaticBreedingContexts[state.automaticBreedingContextCursor++];
          if (occupationHook?.(state, context)) return;
        }
        state.automaticBreedingContexts = [];
        state.automaticBreedingContextCursor = 0;
        state.automaticCheckpoint = null;
        state.phase = 'feast';
        break;
      }
      case 'feast':
        state.phaseNumber = 9;
        state.feastCursor = Math.min(state.feastCursor, state.players.length - 1);
        if (!['feast:preplacements', 'feast:during', 'feast:when'].includes(state.automaticCheckpoint ?? '')) {
          state.automaticCheckpoint = 'feast:preplacements';
          const seat = (state.firstPlayer + state.feastCursor) % state.players.length;
          state.players[seat].feastNoMeadCommitted = false;
          state.players[seat].feastRewardedPlacementIds ??= [];
        }
        if (state.automaticCheckpoint === 'feast:preplacements') {
          const seat = (state.firstPlayer + state.feastCursor) % state.players.length;
          const player = state.players[seat];
          const placement = player.feastPlacements.find((candidate) =>
            !player.feastRewardedPlacementIds.includes(candidate.id));
          if (placement) {
            player.feastRewardedPlacementIds.push(placement.id);
            const matchingPlacementsEarlierThisRound = player.feastPlacements
              .filter((candidate) => candidate.pieceId === placement.pieceId
                && candidate.id !== placement.id).length;
            const context = feastOccupationContext(
              state, seat, 'tile-placed', 'tile-placement', 'after', {
                pieceId: placement.pieceId, destination: 'banquet-table', phase: 'feast',
                boardId: 'banquet-table', boardKind: 'banquet-table',
                matchingPlacementsEarlierThisRound,
              }, { eventId: `${placement.id}:feast-start` },
            );
            if (occupationHook?.(state, context)) return;
            break;
          }
          state.automaticCheckpoint = 'feast:during';
        }
        if (state.automaticCheckpoint === 'feast:during') {
          const seat = (state.firstPlayer + state.feastCursor) % state.players.length;
          state.automaticCheckpoint = 'feast:when';
          const declaredMeadPlacements = state.players[seat].feastPlacements
            .filter((placement) => placement.pieceId === 'mead').length;
          if (occupationHook?.(state, phaseOccupationContext(
            state, seat, 'phase-started', 'feast', 'during', { declaredMeadPlacements }, true,
          ))) return;
        }
        if (state.automaticCheckpoint === 'feast:when') {
          const seat = (state.firstPlayer + state.feastCursor) % state.players.length;
          state.automaticCheckpoint = null;
          if (occupationHook?.(state, phaseOccupationContext(
            state, seat, 'phase-started', 'feast', 'when', {}, true,
          ))) return;
        }
        feastQueueFeast(state);
        return;
      case 'bonus':
        state.phaseNumber = 10;
        if (!['bonus:started', 'bonus:rewards', 'bonus:after'].includes(state.automaticCheckpoint ?? '')) {
          state.automaticCheckpoint = 'bonus:started'; state.automaticSeatCursor = 0;
        }
        if (state.automaticCheckpoint === 'bonus:started') {
          if (runAutomaticHookForPlayers(state, occupationHook, (seat) => phaseOccupationContext(
            state, seat, 'phase-started', 'bonus', 'during', {}, true,
          ))) return;
          if (state.round < state.rounds) prepareAutomaticBonuses(state);
          state.automaticCheckpoint = 'bonus:rewards'; state.automaticSeatCursor = 0;
        }
        if (state.automaticCheckpoint === 'bonus:rewards') {
          // Defaults also make pre-scheduler serialized states safe to resume.
          state.automaticBonusStage ??= 'offer';
          state.automaticBonusContexts ??= [];
          state.automaticBonusContextCursor ??= 0;
          while (state.automaticBonusCursor < state.automaticBonuses.length) {
            const bonus = state.automaticBonuses[state.automaticBonusCursor];
            const eligibleReplacement = bonus.reward.kind === 'good' && bonus.reward.amount === 1
              && bonus.producerGoodCount === 1
              && (bonus.boardKind === 'stone-house' || bonus.boardKind === 'long-house');
            if (state.automaticBonusStage === 'offer') {
              if (!state.automaticBonusOffered && eligibleReplacement) {
                state.automaticBonusOffered = true;
                const context = phaseOccupationContext(
                  state, bonus.seat, 'bonus-produced', 'bonus-production', 'instead', {
                    producer: 'stone-or-long-house', boardId: bonus.boardId,
                    goodId: bonus.reward.id, batchAmount: bonus.reward.amount,
                    producerGoodCount: bonus.producerGoodCount,
                  },
                );
                context.eventId = bonus.eventId;
                if (occupationHook?.(state, context)) return;
              }
              state.automaticBonusStage = 'apply';
            }

            if (state.automaticBonusStage === 'apply') {
              const replaced = eligibleReplacement && state.occupationReplacements.some((record) =>
                record.eventId === bonus.eventId && record.cardId === 'occupation-177'
                && record.target === 'bonus-good');
              state.automaticBonusContexts = [];
              state.automaticBonusContextCursor = 0;
              if (!replaced) {
                const beforePlayer = structuredClone(state.players[bonus.seat]);
                feastApplySingleBonusReward(state, bonus.seat, bonus.reward);
                state.automaticBonusContexts = automaticBonusMutationContexts(
                  state, bonus, beforePlayer,
                );
              }
              state.automaticBonusStage = 'receipts';
            }

            while (state.automaticBonusContextCursor < state.automaticBonusContexts.length) {
              const context = state.automaticBonusContexts[state.automaticBonusContextCursor++];
              if (occupationHook?.(state, context)) return;
            }
            state.automaticBonusCursor++;
            state.automaticBonusOffered = false;
            state.automaticBonusStage = 'offer';
            state.automaticBonusContexts = [];
            state.automaticBonusContextCursor = 0;
          }
          feastEvent(state, null, 'Board bonuses paid', `${state.automaticBonuses.length}`);
          state.automaticBonuses = []; state.automaticBonusCursor = 0;
          state.automaticBonusOffered = false; state.automaticBonusStage = 'offer';
          state.automaticBonusContexts = []; state.automaticBonusContextCursor = 0;
          state.automaticCheckpoint = 'bonus:after'; state.automaticSeatCursor = 0;
        }
        if (state.automaticCheckpoint === 'bonus:after') {
          if (runAutomaticHookForPlayers(state, occupationHook, (seat) => phaseOccupationContext(
            state, seat, 'phase-resolved', 'bonus', 'after', {},
          ))) return;
          state.automaticCheckpoint = null; state.phase = 'mountains';
        }
        break;
      case 'mountains': {
        state.phaseNumber = 11;
        if (state.automaticCheckpoint !== 'mountains:after') {
          state.automaticItems = state.mountains.map((strip) => strip.items[0]).filter((item): item is NonNullable<typeof item> => item !== undefined);
          state.automaticItemCursor = 0;
          updateMountains(state);
          state.automaticCheckpoint = 'mountains:after';
        }
        while (state.automaticItemCursor < state.automaticItems.length * state.players.length) {
          const cursor = state.automaticItemCursor++;
          const itemIndex = Math.floor(cursor / state.players.length);
          const item = state.automaticItems[itemIndex];
          const seat = (state.firstPlayer + (cursor % state.players.length)) % state.players.length;
          const context = phaseOccupationContext(
            state, seat, 'mountain-item-removed', 'mountain-remove', 'after',
            { phase: 'mountain-strips', item, removedItemIndex: itemIndex },
          );
          // A phase-11 removal is one event per physical arrow-end item. Keep
          // that identity stable across a paused occupation decision so
          // once-per-event clauses can reward every removed Ore/2-Silver token.
          context.eventId = `${context.eventId}:item:${itemIndex}`;
          if (occupationHook?.(state, context)) return;
        }
        state.automaticItems = []; state.automaticItemCursor = 0;
        state.automaticCheckpoint = null; state.phase = 'return_vikings'; break;
      }
      case 'return_vikings':
        state.phaseNumber = 12; returnVikings(state);
        if (state.round >= state.rounds) {
          feastFinishGame(state);
          return;
        }
        state.round++;
        state.phase = 'new_viking';
        break;
      case 'ended': return;
      default: return;
    }
  }
}

function activeShips(player: FeastPlayer, type?: FeastShipType): number {
  return player.ships.filter((x) => !x.emigrated && (!type || x.type === type)).length;
}

function hasUpgradableGood(player: FeastPlayer, steps: 1 | 2 = 1): boolean {
  return FEAST_GOOD_IDS.some((id) => {
    if (player.goods[id] < 1 || id === 'pregnant-sheep' || id === 'pregnant-cattle') return false;
    let destination: FeastGood | null = id;
    for (let step = 0; step < steps; step++) destination = destination ? FEAST_GOOD_BY_ID[destination]?.upgrade ?? null : null;
    return destination !== null;
  });
}

function printedChoiceOptionPossible(
  state: FeastState, player: FeastPlayer, effects: readonly import('./types.js').FeastPrintedEffect[],
): boolean {
  return effects.every((effect) => {
    if (effect.kind === 'mountain') return state.mountains.some((strip) => strip.items.length > 0);
    if (effect.kind === 'upgrade') return hasUpgradableGood(player, effect.steps);
    if (effect.kind === 'build') return state.buildingSupply[effect.building] > 0;
    if (effect.kind === 'ship') {
      return effect.ship === 'whaling-boat'
        ? activeShips(player, 'whaling-boat') < 3
        : activeShips(player, 'knarr') + activeShips(player, 'longship') < 4;
    }
    if (effect.kind === 'choose') {
      return effect.options.filter((option) => printedChoiceOptionPossible(state, player, option.effects)).length >= effect.min;
    }
    return true;
  });
}

/**
 * Resource inventories reachable through still-unused "before this action"
 * mountain occupations. This is deliberately finite (at most two grants in
 * the base deck) and is used only for optimistic legality/choice previews;
 * the real mountain decisions and printed payment remain reducer-authoritative.
 */
export function feastPreActionResourcePlayers(
  state: FeastState, player: FeastPlayer, def: FeastActionSpaceDefinition,
): FeastPlayer[] {
  const unusedForAction = (cardId: string): boolean => player.playedOccupations.includes(cardId)
    && (!player.turnActionId || !state.occupationUsage.some((record) =>
      record.cardId === cardId && record.actionId === player.turnActionId));
  let grants = 0;
  if (def.group === 'Crafting' && unusedForAction('occupation-113')) grants++;
  if ((def.group === 'Build Houses' || def.group === 'Build Ships')
    && unusedForAction('occupation-121')) grants++;
  if ((def.id === 'forge' || def.id === 'craft-chest')
    && unusedForAction('occupation-103')) grants++;
  if (!grants || !state.mountains.some((strip) => strip.items.length)) return [player];

  const candidates: FeastPlayer[] = [player];
  const seen = new Set<string>([`${player.resources.wood}:${player.resources.stone}:${player.resources.ore}`]);
  const walk = (resources: FeastPlayer['resources'], strips: string[][], depth: number): void => {
    if (depth >= grants) return;
    for (let stripIndex = 0; stripIndex < strips.length; stripIndex++) {
      const item = strips[stripIndex][0];
      if (!item) continue;
      const nextStrips = strips.map((strip) => [...strip]);
      nextStrips[stripIndex].shift();
      const nextResources = { ...resources };
      if (item === 'wood' || item === 'stone' || item === 'ore') nextResources[item]++;
      const key = `${nextResources.wood}:${nextResources.stone}:${nextResources.ore}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({ ...player, resources: nextResources });
      }
      walk(nextResources, nextStrips, depth + 1);
    }
  };
  walk({ ...player.resources }, state.mountains.map((strip) => [...strip.items]), 0);
  return candidates;
}

export function feastOccupationEventForAction(def: FeastActionSpaceDefinition): FeastOccupationEvent {
  if (def.id === 'plunder') return 'plundering';
  if (def.id === 'raid') return 'raiding';
  if (def.id.startsWith('pillage')) return 'pillaging';
  if (def.id.startsWith('whaling')) return 'whaling';
  if (def.id.startsWith('hunt')) return 'hunting-game';
  if (def.id.startsWith('snare')) return 'laying-snare';
  if (def.effects.some((effect) => effect.kind === 'explore')) return 'exploration';
  if (def.effects.some((effect) => effect.kind === 'emigrate')) return 'emigration';
  if (def.effects.some((effect) => effect.kind === 'overseas-trade')) return 'overseas-trading';
  if (def.effects.some((effect) => effect.kind === 'mountain')) return 'mountain-action';
  if (def.effects.some((effect) => effect.kind === 'upgrade')) return 'upgrade-action';
  if (def.effects.some((effect) => effect.kind === 'occupation')) return 'occupation-action';
  if (def.group === 'Livestock Market') return 'livestock-market';
  if (def.group === 'Weekly Market') return 'weekly-market';
  if (def.group === 'Crafting') return 'crafting';
  if (def.group === 'Build Houses') return 'house-building';
  if (def.group === 'Build Ships') return 'ship-building';
  return 'viking-action';
}

/** Printed worker count after permanent, mandatory occupation modifiers. */
export function feastActionWorkerCost(state: FeastState, seat: number, def: FeastActionSpaceDefinition): number {
  const context = {
    hook: 'action-proposed' as const, event: feastOccupationEventForAction(def), window: 'before' as const,
    actionId: `preview:${state.round}:${seat}:${def.id}`,
    fields: { seat, round: state.round, actionSpaceId: def.id, action: def.id, column: def.column, workers: def.workers },
  };
  const records = (state.occupationUsage ?? []) as FeastOccupationUsageRecord[];
  return feastOccupationActionModifiers(state, seat, context, { records }).workerCost ?? def.workers;
}

/** Pure, specific disable reason shared by views, previews, reducer, and bot. */
export function feastActionReason(
  state: FeastState, seat: number, def: FeastActionSpaceDefinition,
  imitate = false, allowOccupationReplacements = true,
): string | null {
  const player = state.players[seat];
  if (!player) return 'Unknown seat';
  if (state.phase !== 'actions') return 'Worker placement is only available in phase 5';
  if (state.pending.length) return `${state.players[state.pending[0].seat].name} must finish a decision`;
  if (state.turn !== seat) return 'Wait for your turn';
  if (player.passed) return 'You already passed this round';
  if (player.turnActionTaken) return 'End this turn before placing more Vikings';
  const workerCost = feastActionWorkerCost(state, seat, def);
  if (player.workersAvailable < workerCost) return `Needs ${workerCost} Vikings (you have ${player.workersAvailable})`;
  const space = state.actionSpaces.find((x) => x.id === def.id)!;
  const direct = space.occupants.find((x) => x.copiedFrom === null);
  if (!imitate && direct) return `${state.players[direct.seat].name} already occupies this space`;
  if (imitate) {
    if (state.players.length !== 4 || !state.imitationColumns.includes(def.column)) return `Imitation is not enabled in column ${def.column}`;
    if (!direct) return 'Imitation can only copy an occupied space';
    if (direct.seat === seat) return 'You cannot imitate your own Vikings';
    const used = state.actionSpaces.some((x) => FEAST_ACTION_BY_ID[x.id]?.column === def.column && x.occupants.some((o) => o.copiedFrom !== null));
    if (used) return `The column ${def.column} imitation space is already occupied`;
  }

  const played = new Set(player.playedOccupations);
  const resourceCandidates = feastPreActionResourcePlayers(state, player, def);
  const activeLargeShips = activeShips(player, 'knarr') + activeShips(player, 'longship');
  const replacement102 = allowOccupationReplacements && played.has('occupation-102')
    && def.effects.some((effect) => effect.kind === 'upgrade' && effect.count === 1 && effect.steps === 1)
    && (player.goods['game-meat'] > 0 || player.goods.silk > 0);
  const replacement105 = allowOccupationReplacements && played.has('occupation-105')
    && def.id === 'build-whaling-boat'
    && resourceCandidates.some((candidate) => candidate.resources.wood >= 3)
    && activeLargeShips < 4;
  const replacement107 = allowOccupationReplacements && played.has('occupation-107')
    && def.id === 'explore-short' && activeShips(player) > 0
    && state.explorations.some((board) => board.claimedBy === null
      && !['shetland', 'faroe-islands'].includes(board.face));
  const replacement185 = allowOccupationReplacements && played.has('occupation-185')
    && def.id === 'raid' && hasUpgradableGood(player);
  const fullReplacement = replacement105 || replacement107 || replacement185;
  const eligibility = feastOccupationActionModifiers(state, seat, {
    hook: 'action-proposed', event: 'viking-action', window: 'before',
    actionId: `eligibility:${state.round}:${seat}:${def.id}`,
    fields: {
      seat, round: state.round, action: feastOccupationEventForAction(def),
      actionSpaceId: def.id, column: def.column, workers: def.workers,
    },
  }, { records: (state.occupationUsage ?? []) as FeastOccupationUsageRecord[] }).eligibility;
  const knarrSubstitutesLongship = eligibility.includes('knarr-substitutes-longship')
    && activeShips(player, 'knarr') > 0;

  const mandatory = def.effects.filter((x) => x.kind === 'pay').flatMap((x) => x.items).map((item) => {
    if (item.kind === 'silver') return { ...item, amount: feastActionSilverCost(player, def.id, item.amount) };
    if (item.kind === 'resource' && (item.id === 'wood' || item.id === 'stone' || item.id === 'ore')) {
      return { ...item, amount: feastActionResourceCost(player, def.id, item.id, item.amount) };
    }
    return item;
  });
  const cost = fullReplacement ? null
    : resourceCandidates.every((candidate) => feastCanAfford(candidate, mandatory) !== null)
      ? feastCanAfford(player, mandatory) : null;
  if (cost) return cost;
  if (def.id === 'craft-chest'
    && !resourceCandidates.some((candidate) => candidate.resources.wood > 0 || candidate.resources.ore > 0)) {
    return 'Needs 1 wood or 1 ore';
  }
  if (def.id === 'build-house-and-ship') {
    if (state.buildingSupply['stone-house'] < 1 && state.buildingSupply['long-house'] < 1) return 'No matching house remains';
    if (activeShips(player) >= 7 || activeShips(player, 'knarr') + activeShips(player, 'longship') >= 4) return 'All four large-ship berths are full';
  }
  if (def.effects.some((x) => x.kind === 'build')) {
    const building = def.effects.find((x) => x.kind === 'build') as Extract<typeof def.effects[number], { kind: 'build' }>;
    if (state.buildingSupply[building.building] < 1) return `No ${building.building.replace('-', ' ')} remains`;
  }
  const shipEffect = def.effects.find((x) => x.kind === 'ship') as Extract<typeof def.effects[number], { kind: 'ship' }> | undefined;
  if (shipEffect) {
    const small = shipEffect.ship === 'whaling-boat';
    if (small && activeShips(player, 'whaling-boat') >= 3 && !replacement105) return 'All three whaling-boat berths are full';
    if (!small && activeShips(player, 'knarr') + activeShips(player, 'longship') >= 4) return 'All four large-ship berths are full';
  }
  if (def.id.startsWith('whaling') && activeShips(player, 'whaling-boat') < 1) return 'Needs a whaling boat';
  if ((def.id === 'raid' || def.id.startsWith('pillage')) && activeShips(player, 'longship') < 1
    && !replacement185 && !knarrSubstitutesLongship) return 'Needs a longship';
  if (def.id === 'plunder' && activeShips(player, 'longship') < 2 && !knarrSubstitutesLongship) return 'Needs two longships';
  if ((def.id.startsWith('overseas-trade') || def.id === 'special-sale') && activeShips(player, 'knarr') < 1) return 'Needs a knarr';
  if (def.id === 'special-sale') {
    const costs = state.specialSupply.filter((id) => id !== 'english-crown').map((id) => FEAST_SPECIAL_BY_ID[id]?.silverCost ?? Infinity);
    const affordable = costs.some((cost) => feastActionSilverCost(player, def.id, cost) <= player.silver)
      || costs.some((a, i) => costs.some((b, j) => i !== j && feastActionSilverCost(player, def.id, a + b) <= player.silver));
    if (!affordable) return 'No affordable purchasable special tile remains';
  }
  if (def.id === 'produce-milk' && player.goods.cattle + player.goods['pregnant-cattle'] < 1) return 'Needs at least one cattle';
  if (def.id === 'produce-wool' && player.goods.sheep + player.goods['pregnant-sheep'] < 1) return 'Needs at least one sheep';
  if (def.effects.some((x) => x.kind === 'mountain') && !state.mountains.some((x) => x.items.length)) {
    if (!def.effects.some((x) => x.kind === 'upgrade') || !hasUpgradableGood(player)) return 'No mountain items remain';
  }
  if (def.effects.some((x) => x.kind === 'upgrade') && !hasUpgradableGood(player) && !replacement102
    && !def.effects.some((x) => x.kind === 'mountain')) return 'You have no good that can be upgraded';
  if (def.id === 'explore-short') {
    if (activeShips(player) < 1) return 'Needs any ship';
    if (!state.explorations.some((x) => x.claimedBy === null && ['shetland', 'faroe-islands'].includes(x.face))
      && !replacement107) return 'No named nearby exploration face is available';
  }
  if (def.id === 'explore-medium') {
    if (activeShips(player, 'knarr') + activeShips(player, 'longship') < 1) return 'Needs a knarr or longship';
    if (!state.explorations.some((x) => x.claimedBy === null && ['iceland', 'greenland', 'bear-island'].includes(x.face))) return 'No named medium exploration face is available';
  }
  if (def.id === 'explore-long') {
    if (activeShips(player, 'longship') < 1 && !knarrSubstitutesLongship) return 'Needs a longship';
    if (!state.explorations.some((x) => x.claimedBy === null && ['baffin-island', 'labrador', 'newfoundland'].includes(x.face))) return 'No named distant exploration face is available';
  }
  if (def.effects.some((x) => x.kind === 'emigrate')) {
    if (activeShips(player, 'knarr') + activeShips(player, 'longship') < 1 && !(def.id === 'upgrade-boat-and-emigrate' && activeShips(player, 'whaling-boat') > 0)) return 'Needs a knarr or longship';
    const emigrationCost = feastActionSilverCost(player, def.id, state.round);
    if (player.silver < emigrationCost) return `Emigration costs ${emigrationCost} silver${emigrationCost !== state.round ? ' after Patron' : ''}`;
    if (player.ships.filter((x) => x.emigrated).length >= 12) return 'No Banquet Table position remains';
  }
  if ((def.id === 'play-occupations-2' || def.id === 'play-occupations-4') && !player.occupationHand.length) return 'You have no occupation to play';
  for (const choice of def.effects.filter((effect) => effect.kind === 'choose')) {
    const possible = choice.options.filter((option) => printedChoiceOptionPossible(state, player, option.effects));
    if (possible.length < choice.min) return 'No printed choice can currently be resolved';
  }
  return null;
}

export function feastActingSeat(state: FeastState): number | null {
  if (state.phase === 'ended') return null;
  if (state.pending.length) return state.pending[0].seat;
  if (state.phase === 'actions') return state.turn;
  return null;
}

export function feastScorePlayer(state: FeastState, player: FeastPlayer): FeastScoreBreakdown {
  const ships = player.ships.filter((x) => !x.emigrated).reduce((n, x) => n + ({ 'whaling-boat': 3, knarr: 5, longship: 8 }[x.type]), 0);
  const emigrations = player.ships.filter((x) => x.emigrated).reduce((n, x) => n + (x.type === 'knarr' ? 18 : 21), 0);
  const explorations = player.boards.filter((x) => x.kind === 'exploration').reduce((n, x) => n + (FEAST_BOARD_BY_ID[x.definitionId]?.points ?? ({ shetland: 6, 'bear-island': 12, 'faroe-islands': 4, 'baffin-island': 12, iceland: 16, labrador: 36, greenland: 12, newfoundland: 38 }[x.definitionId] ?? 0)), 0);
  const buildings = player.boards.filter((x) => x.kind === 'building').reduce((n, x) => n + (FEAST_BOARD_BY_ID[x.definitionId]?.points ?? 0), 0);
  const animals = player.goods.sheep * 2 + player.goods['pregnant-sheep'] * 3 + player.goods.cattle * 3 + player.goods['pregnant-cattle'] * 4;
  const occupations = player.playedOccupations.reduce((n, id) => n + (FEAST_OCCUPATION_BY_ID[id]?.points ?? 0), 0);
  const englishCrown = player.specials.includes('english-crown') ? 2 : 0;
  const cardAdjustments = player.scoreAdjustments.reduce((n, x) => n + x.amount, 0);
  const scoringSilver = feastOccupationScoringModifiers(
    state, player.seat, undefined, { records: (state.occupationUsage ?? []) as FeastOccupationUsageRecord[] },
  ).filter((modifier) => modifier.currency === 'silver').reduce((sum, modifier) => sum + modifier.amount, 0);
  const boardNegatives = -player.boards.reduce((n, x) => n + feastUncoveredNegative(x), 0);
  const thingPenalties = -player.thingPenalties * 3;
  const out = {
    seat: player.seat, ships, emigrations, explorations, buildings, animals,
    occupations, silver: player.silver + scoringSilver, finalIncome: player.finalIncome,
    englishCrown, cardAdjustments, boardNegatives, thingPenalties, total: 0,
  };
  out.total = ships + emigrations + explorations + buildings + animals + occupations
    + out.silver + out.finalIncome + englishCrown + cardAdjustments + boardNegatives + thingPenalties;
  return out;
}

export function feastFinishGame(state: FeastState): void {
  state.phase = 'ended';
  state.phaseNumber = 12;
  state.scores = state.players.map((x) => feastScorePlayer(state, x));
  const best = Math.max(...state.scores.map((x) => x.total));
  state.winners = state.scores.filter((x) => x.total === best).map((x) => state.players[x.seat].color);
  feastEvent(state, null, 'Game over', `${state.winners.join(' and ')} win${state.winners.length === 1 ? 's' : ''} with ${best} points`);
}

function pendingView(state: FeastState, viewer: number | null | 'dev'): FeastView['pending'] {
  const p = state.pending[0];
  if (!p) return null;
  const canSee = viewer === 'dev' || viewer === p.seat || !p.private;
  const { continuation: _continuation, ...visible } = p;
  if (canSee) return structuredClone(visible);
  return {
    ...structuredClone(visible),
    label: 'Private choice', prompt: `${state.players[p.seat].name} is making a private choice.`,
    options: [], min: undefined, max: undefined,
  };
}

export function feastViewFor(state: FeastState, viewer: number | null | 'dev'): FeastView {
  const you = typeof viewer === 'number' ? viewer : null;
  const actingSeat = feastActingSeat(state);
  const players: FeastPlayerView[] = state.players.map((p) => {
    const mine = viewer === 'dev' || viewer === p.seat;
    const { occupationHand, ...publicPlayer } = p;
    return {
      ...structuredClone(publicPlayer), occupationHandCount: occupationHand.length,
      ...(mine ? { occupationHand: [...occupationHand] } : {}),
    };
  });
  return {
    game: 'feast', you, edition: state.edition, options: { ...state.options },
    phase: state.phase, phaseNumber: state.phaseNumber, round: state.round, rounds: state.rounds,
    turn: state.turn, actingSeat, firstPlayer: state.firstPlayer, players,
    actionSpaces: FEAST_ACTION_SPACES.map((def) => {
      const occupants = structuredClone(state.actionSpaces.find((x) => x.id === def.id)?.occupants ?? []);
      const direct = occupants.find((x) => x.copiedFrom === null);
      const reason = typeof viewer === 'number' ? feastActionReason(state, viewer, def) : 'Open a player view to test legality';
      const imitationReason = typeof viewer === 'number' ? feastActionReason(state, viewer, def, true) : 'Open a player view to test imitation legality';
      return {
        ...structuredClone(def), effectiveWorkers: typeof viewer === 'number' ? feastActionWorkerCost(state, viewer, def) : def.workers, occupants,
        occupiedBy: direct?.seat ?? null,
        imitatedBy: occupants.filter((x) => x.copiedFrom !== null).map((x) => x.seat),
        legal: reason === null, ...(reason ? { reason } : {}),
        imitationLegal: imitationReason === null, ...(imitationReason ? { imitationReason } : {}),
      };
    }),
    imitationColumns: [...state.imitationColumns],
    mountains: structuredClone(state.mountains), explorations: structuredClone(state.explorations),
    specialSupply: [...state.specialSupply], buildingSupply: { ...state.buildingSupply },
    occupationDeckCount: state.occupationDeck.length, occupationDiscardCount: state.occupationDiscard.length,
    weaponDeckCount: state.weaponDeck.length, weaponDiscard: [...state.weaponDiscard],
    weaponSubstitutes: { ...state.weaponSubstitutes },
    pending: pendingView(state, viewer), eventSeq: state.eventSeq,
    lastEvent: state.lastEvent ? structuredClone(state.lastEvent) : null,
    events: structuredClone((state.events ?? []).slice(-80)),
    scorePreview: state.players.map((player) => feastScorePlayer(state, player)),
    scores: state.scores ? structuredClone(state.scores) : null,
    winners: state.winners ? [...state.winners] : null,
    log: state.log.slice(-80),
  };
}
