/**
 * Directed reducer parity for all 61 printed Classic (2016) action spaces.
 *
 * This is deliberately not a catalog-count or bot-soak test. Every action is
 * placed on in an isolated, seeded legal fixture, every decision it creates is
 * rejected once atomically and then resolved deterministically, and the final
 * player/supply deltas are compared with an independent printed-effect ledger.
 *
 * Run: npx tsx shared/src/feast/action-space-parity-test.ts
 */

import {
  FEAST_ACTION_SPACES, FEAST_GOOD_BY_ID, FEAST_GOOD_IDS, FEAST_OCCUPATION_BY_ID,
  FEAST_SEATS, FEAST_SPECIAL_BY_ID, applyFeastAction, createFeast,
  feastActionReason,
  type FeastActionSpaceDefinition, type FeastAmount, type FeastDecisionChoice,
  type FeastGood, type FeastPendingDecision, type FeastPrintedEffect,
  type FeastShipType, type FeastState, type FeastWeapon,
} from './index.js';

type MetricMap = Record<string, number>;

let assertions = 0;
let failures = 0;

function check(condition: unknown, message: string): asserts condition {
  assertions++;
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function equal(actual: unknown, expected: unknown, message: string): void {
  check(
    JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`,
  );
}

function add(ledger: MetricMap, key: string, amount: number): void {
  if (!amount) return;
  ledger[key] = (ledger[key] ?? 0) + amount;
  if (ledger[key] === 0) delete ledger[key];
}

function ship(player: FeastState['players'][number], type: FeastShipType, id: string): void {
  player.ships.push({ id, type, ore: 0, emigrated: false, emigratedRound: null });
}

function ensureFourMountains(state: FeastState): void {
  while (state.mountains.length < 4 && state.mountainDeck.length) {
    state.mountains.push(state.mountainDeck.shift()!);
  }
  // The extracted strips all begin with seven items. Reestablish that fixture
  // invariant if a setup change ever exposes a partially depleted strip.
  for (const [i, strip] of state.mountains.entries()) {
    if (!strip.items.length) strip.items = ['wood', 'stone', 'ore', 'wood', 'stone', 'ore', 'silver-2'];
    strip.id = `parity-mountain-${i + 1}`;
  }
}

function ensureOccupationHand(state: FeastState, amount: number): void {
  const hand = state.players[0].occupationHand;
  while (hand.length < amount && state.occupationDeck.length) hand.push(state.occupationDeck.pop()!);
  // Printed occupation-space accounting is isolated from the cards' own
  // on-play effects; exhaustive card-effect execution has dedicated suites.
  for (let index = 0; index < Math.min(amount, hand.length); index++) {
    if (FEAST_OCCUPATION_BY_ID[hand[index]]?.type !== 'immediate') continue;
    const replacement = state.occupationDeck.findIndex((id) => FEAST_OCCUPATION_BY_ID[id]?.type !== 'immediate');
    if (replacement < 0) continue;
    const previous = hand[index];
    hand[index] = state.occupationDeck[replacement];
    state.occupationDeck[replacement] = previous;
  }
  check(hand.length >= amount, `fixture provides ${amount} occupation cards`);
}

function fixture(def: FeastActionSpaceDefinition, salt = 0): FeastState {
  const state = createFeast(
    [{ name: 'Parity Viking', color: FEAST_SEATS[0] }],
    0x5e_a5_7000 + def.order * 101 + salt,
    { length: 'long', occupationMode: 'all', soloStartingOccupation: 'random' },
  );
  const player = state.players[0];
  state.phase = 'actions';
  state.phaseNumber = 5;
  state.turn = 0;
  state.pending = [];
  player.passed = false;
  player.turnActionTaken = false;
  player.turnMayEnd = false;
  player.turnEffectUsed = false;
  player.workersTotal = 12;
  player.workersAvailable = 12;
  player.silver = 100;
  player.resources = { wood: 100, stone: 100, ore: 100 };
  for (const id of FEAST_GOOD_IDS) player.goods[id] = 8;
  player.weapons = { bow: 20, snare: 20, spear: 20, 'long-sword': 20 };
  player.ships = [];
  ensureOccupationHand(state, 6);
  ensureFourMountains(state);

  if (def.id === 'whaling-major' || def.id === 'whaling-minor') {
    ship(player, 'whaling-boat', 'fixture-whaler-1');
    ship(player, 'whaling-boat', 'fixture-whaler-2');
    ship(player, 'whaling-boat', 'fixture-whaler-3');
  }
  if (def.id.startsWith('overseas-trade') || def.id === 'special-sale') {
    ship(player, 'knarr', 'fixture-knarr');
  }
  if (def.id === 'raid' || def.id.startsWith('pillage')) {
    ship(player, 'longship', 'fixture-longship-1');
  }
  if (def.id === 'plunder') {
    ship(player, 'longship', 'fixture-longship-1');
    ship(player, 'longship', 'fixture-longship-2');
  }
  if (def.id === 'explore-short') ship(player, 'whaling-boat', 'fixture-exploration-ship');
  if (def.id === 'explore-medium') ship(player, 'knarr', 'fixture-exploration-ship');
  if (def.id === 'explore-long') ship(player, 'longship', 'fixture-exploration-ship');
  if (def.id === 'emigrate-2') ship(player, 'knarr', 'fixture-emigration-ship');
  if (def.id === 'emigrate-3') ship(player, 'longship', 'fixture-emigration-ship');
  // Exercise the printed optional exchange, not merely the ordinary large-ship
  // branch, on the fourth-column action.
  if (def.id === 'upgrade-boat-and-emigrate') ship(player, 'whaling-boat', 'fixture-exchange-whaler');

  // Distant faces enter later in the physical round schedule. A directed
  // action-space fixture exposes one valid named face without bypassing any
  // reducer requirement.
  if (def.id === 'explore-long') {
    const explore = def.effects.find((x) => x.kind === 'explore');
    if (explore?.kind === 'explore') state.explorations[0].face = explore.faces[0];
  }

  return state;
}

function metrics(state: FeastState): MetricMap {
  const player = state.players[0];
  const out: MetricMap = {
    silver: player.silver,
    'resource.wood': player.resources.wood,
    'resource.stone': player.resources.stone,
    'resource.ore': player.resources.ore,
    hand: player.occupationHand.length,
    played: player.playedOccupations.length,
    specials: player.specials.length,
    emigrated: player.ships.filter((x) => x.emigrated).length,
    'ships.whaling-boat': player.ships.filter((x) => x.type === 'whaling-boat').length,
    'ships.knarr': player.ships.filter((x) => x.type === 'knarr').length,
    'ships.longship': player.ships.filter((x) => x.type === 'longship').length,
    'boards.shed': player.boards.filter((x) => x.definitionId === 'shed').length,
    'boards.stone-house': player.boards.filter((x) => x.definitionId === 'stone-house').length,
    'boards.long-house': player.boards.filter((x) => x.definitionId === 'long-house').length,
    'boards.exploration': player.boards.filter((x) => x.kind === 'exploration').length,
    'supply.shed': state.buildingSupply.shed,
    'supply.stone-house': state.buildingSupply['stone-house'],
    'supply.long-house': state.buildingSupply['long-house'],
    'supply.special': state.specialSupply.length,
    'supply.exploration-claimed': state.explorations.filter((x) => x.claimedBy !== null).length,
    'supply.mountain-items': state.mountains.reduce((n, x) => n + x.items.length, 0),
    'deck.occupation': state.occupationDeck.length,
    'deck.weapon': state.weaponDeck.length,
    'discard.weapon': state.weaponDiscard.length,
  };
  for (const id of FEAST_GOOD_IDS) out[`good.${id}`] = player.goods[id];
  for (const id of ['bow', 'snare', 'spear', 'long-sword'] as const) out[`weapon.${id}`] = player.weapons[id];
  return out;
}

function deltas(before: MetricMap, after: MetricMap): MetricMap {
  const out: MetricMap = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const n = (after[key] ?? 0) - (before[key] ?? 0);
    if (n) out[key] = n;
  }
  return out;
}

function accountAmount(ledger: MetricMap, amount: FeastAmount, direction: 1 | -1, playerCount: number, actionSpaceId: string): void {
  let n = amount.amount * direction;
  if (direction === 1 && actionSpaceId === 'wood-per-player' && amount.kind === 'resource' && amount.id === 'wood') {
    n = playerCount;
  }
  if (amount.kind === 'silver') add(ledger, 'silver', n);
  else if (amount.kind === 'resource') add(ledger, `resource.${amount.id}`, n);
  else if (amount.kind === 'good') add(ledger, `good.${amount.id}`, n);
  else if (amount.kind === 'weapon') add(ledger, `weapon.${amount.id}`, n);
}

/** Independent interpreter for effects which resolve without a choice. */
function accountSimpleEffects(
  state: FeastState,
  actionSpaceId: string,
  effects: readonly FeastPrintedEffect[],
  ledger: MetricMap,
): void {
  const player = state.players[0];
  for (const effect of effects) {
    switch (effect.kind) {
      case 'pay':
        for (const item of effect.items) accountAmount(ledger, item, -1, state.players.length, actionSpaceId);
        break;
      case 'gain':
        for (const item of effect.items) accountAmount(ledger, item, 1, state.players.length, actionSpaceId);
        break;
      case 'build':
        add(ledger, `boards.${effect.building}`, 1);
        add(ledger, `supply.${effect.building}`, -1);
        break;
      case 'ship':
        check(effect.mode === 'gain', `${actionSpaceId}: direct ship effect uses supported gain mode`);
        add(ledger, `ships.${effect.ship}`, 1);
        break;
      case 'conditional-production': {
        const animals = effect.animal === 'cattle'
          ? player.goods.cattle + player.goods['pregnant-cattle']
          : player.goods.sheep + player.goods['pregnant-sheep'];
        add(ledger, `good.${effect.good}`, Math.min(effect.max, animals));
        break;
      }
      case 'weekly-four':
        add(ledger, 'good.spices', 1);
        add(ledger, 'silver', 1);
        if (player.goods.cattle + player.goods['pregnant-cattle'] > 0) add(ledger, 'good.milk', 2);
        if (player.goods.sheep + player.goods['pregnant-sheep'] > 0) add(ledger, 'good.wool', 1);
        break;
      case 'draw-weapons': {
        const drawn = state.weaponDeck.slice(-effect.amount);
        check(drawn.length === effect.amount, `${actionSpaceId}: fixture has ${effect.amount} weapon cards to draw`);
        for (const weapon of drawn) add(ledger, `weapon.${weapon}`, 1);
        add(ledger, 'deck.weapon', -drawn.length);
        break;
      }
      case 'plunder':
        add(ledger, 'good.silver-hoard', 1);
        break;
      case 'occupation':
        if (effect.mode === 'draw') {
          add(ledger, 'hand', 1);
          add(ledger, 'deck.occupation', -1);
        }
        break;
      default:
        // Queued effects are accounted at the deterministic decision which
        // actually resolves them.
        break;
    }
  }
}

function atomicDecisionProbe(state: FeastState, decision: FeastPendingDecision, tag: string): void {
  let choice: FeastDecisionChoice;
  if (decision.kind === 'mountain') choice = { allocations: [{ id: decision.options[0]?.id ?? 'missing-strip', amount: (decision.max ?? 0) + 100 }] };
  else if (decision.kind === 'goods' && decision.meta?.mode === 'upgrade') choice = { allocations: [{ id: 'not-a-good', amount: 1 }] };
  else choice = { optionIds: ['not-a-real-option'] };
  const snapshot = JSON.stringify(state);
  const result = applyFeastAction(state, decision.seat, { type: 'resolve_decision', decisionId: decision.id, choice });
  check(!result.ok, `${tag}: ${decision.kind} rejects an invalid resolution`);
  check(JSON.stringify(state) === snapshot, `${tag}: ${decision.kind} rejection is atomic`);
}

function choosePrintedOption(def: FeastActionSpaceDefinition, decision: FeastPendingDecision): string[] {
  const enabled = decision.options.filter((x) => !x.disabled);
  check(enabled.length >= (decision.min ?? 0), `${def.id}: printed choice has enough enabled options`);
  if (def.id === 'build-house-and-ship') return ['stone-house-longship'];
  if (def.id === 'livestock-choice') return ['cattle'];
  if (def.id === 'craft-chest') return ['wood'];
  if (def.id === 'master-crafting') return ['wool-robe', 'silverware-jewelry'];
  if (def.id === 'mountain-2x4-or-double-3') return ['mountains'];
  return enabled.slice(0, Math.max(decision.min ?? 0, 1)).map((x) => x.id);
}

function selectedPrintedEffects(def: FeastActionSpaceDefinition, decision: FeastPendingDecision, ids: string[]): FeastPrintedEffect[] {
  if (decision.continuation.kind !== 'printed') return [];
  const effect = def.effects[decision.continuation.effectIndex - 1];
  if (!effect || effect.kind !== 'choose') return [];
  return ids.flatMap((id) => effect.options.find((x) => x.id === id)?.effects ?? []);
}

function resolveAll(
  state: FeastState,
  def: FeastActionSpaceDefinition,
  ledger: MetricMap,
  decisionKinds: Set<string>,
  effectSemantics: Set<string>,
): void {
  let guard = 0;
  while (state.pending.length) {
    check(++guard < 40, `${def.id}: decisions terminate`);
    if (guard >= 40) return;
    const decision = state.pending[0];
    decisionKinds.add(decision.kind);
    check(
      ['occupation-timing', 'occupation', 'mountain', 'goods', 'special', 'ship', 'exploration', 'emigration', 'die', 'die-spend'].includes(decision.kind),
      `${def.id}: no unsupported decision kind (${decision.kind})`,
    );
    atomicDecisionProbe(state, decision, def.id);

    let choice: FeastDecisionChoice;
    if (decision.kind === 'occupation-timing') {
      choice = { optionIds: ['skip'] };
    } else if (decision.kind === 'goods' && decision.meta?.mode === 'printed-choice') {
      const ids = choosePrintedOption(def, decision);
      accountSimpleEffects(state, def.id, selectedPrintedEffects(def, decision, ids), ledger);
      choice = { optionIds: ids };
    } else if (decision.kind === 'goods' && decision.meta?.mode === 'upgrade') {
      const steps = Number(decision.meta.steps) as 1 | 2;
      const amount = Math.min(Number(decision.meta.count ?? decision.max ?? 0), decision.options.length);
      const selected = decision.options.slice(0, amount).map((x) => ({ id: x.id, amount: 1 }));
      for (const allocation of selected) {
        let destination: FeastGood | null = allocation.id as FeastGood;
        for (let i = 0; i < steps; i++) destination = destination ? FEAST_GOOD_BY_ID[destination].upgrade : null;
        check(destination !== null, `${def.id}: ${allocation.id} has a ${steps}-step upgrade`);
        add(ledger, `good.${allocation.id}`, -1);
        add(ledger, `good.${destination}`, 1);
      }
      choice = { allocations: selected };
    } else if (decision.kind === 'goods' && decision.meta?.mode === 'overseas') {
      const ids = decision.options.slice(0, Math.min(2, decision.options.length)).map((x) => x.id as FeastGood);
      check(ids.length === 2, `${def.id}: fixture exercises two different overseas flips`);
      for (const id of ids) {
        const destination = FEAST_GOOD_BY_ID[id].upgrade;
        check(destination !== null, `${def.id}: ${id} has a blue reverse`);
        add(ledger, `good.${id}`, -1);
        add(ledger, `good.${destination}`, 1);
      }
      choice = { optionIds: ids };
    } else if (decision.kind === 'mountain') {
      const allowances = (decision.meta?.allowances as number[] | undefined) ?? [];
      const allocations: { id: string; amount: number }[] = [];
      for (let i = 0; i < allowances.length && i < decision.options.length; i++) {
        const strip = state.mountains.find((x) => x.id === decision.options[i].id)!;
        const amount = Math.min(allowances[i], strip.items.length);
        if (!amount) continue;
        allocations.push({ id: strip.id, amount });
        for (const item of strip.items.slice(0, amount)) {
          if (item === 'silver-2') add(ledger, 'silver', 2);
          else add(ledger, `resource.${item}`, 1);
          add(ledger, 'supply.mountain-items', -1);
        }
      }
      check(allocations.reduce((n, x) => n + x.amount, 0) >= (decision.min ?? 0), `${def.id}: mountain fixture satisfies printed minimum`);
      choice = { allocations };
    } else if (decision.kind === 'special' && decision.meta?.mode === 'forge') {
      const forged = decision.options.find((x) => x.id !== 'jewelry' && !x.disabled);
      check(forged, `${def.id}: an authentic forge-tongs special is available`);
      add(ledger, 'specials', 1);
      add(ledger, 'supply.special', -1);
      choice = { optionIds: [forged!.id] };
    } else if (decision.kind === 'special' && decision.meta?.mode === 'sale') {
      const ids = decision.options.filter((x) => !x.disabled).slice(0, 2).map((x) => x.id);
      check(ids.length === 2, `${def.id}: fixture buys the printed maximum of two specials`);
      const cost = ids.reduce((n, id) => n + (FEAST_SPECIAL_BY_ID[id].silverCost ?? 0), 0);
      add(ledger, 'silver', -cost);
      add(ledger, 'specials', ids.length);
      add(ledger, 'supply.special', -ids.length);
      choice = { optionIds: ids };
    } else if (decision.kind === 'exploration') {
      const id = decision.options[0]?.id;
      if (decision.meta?.stage === 'ship') {
        check(state.players[0].ships.some((ship) => ship.id === id && !ship.emigrated), `${def.id}: physical exploration ship is available`);
        choice = { optionIds: [id] };
      } else {
        const target = state.explorations.find((x) => x.boardId === id);
        check(target, `${def.id}: named exploration is available`);
        add(ledger, 'silver', target!.silver);
        add(ledger, 'boards.exploration', 1);
        add(ledger, 'supply.exploration-claimed', 1);
        choice = { optionIds: [id] };
      }
    } else if (decision.kind === 'ship' && decision.meta?.mode === 'plunder-ships') {
      const configuration = decision.options[0];
      check(configuration, `${def.id}: a physical Plundering ship configuration is available`);
      choice = { optionIds: [configuration!.id] };
    } else if (decision.kind === 'emigration') {
      const exchange = def.id === 'upgrade-boat-and-emigrate';
      const option = exchange
        ? decision.options.find((x) => x.id.startsWith('exchange:'))
        : decision.options.find((x) => !x.id.startsWith('exchange:'));
      check(option, `${def.id}: intended emigration option is available`);
      add(ledger, 'silver', -state.round);
      add(ledger, 'emigrated', 1);
      if (exchange) {
        effectSemantics.add('emigrate:exchange-whaling');
        add(ledger, 'ships.whaling-boat', -1);
        add(ledger, 'ships.knarr', 1);
      } else effectSemantics.add('emigrate:large-ship');
      choice = { optionIds: [option!.id] };
    } else if (decision.kind === 'occupation') {
      const count = Math.min(decision.max ?? 0, decision.options.length);
      const ids = decision.options.slice(0, count).map((x) => x.id);
      if (def.id === 'play-occupation-paid') {
        check(ids.length === 1, `${def.id}: plays one occupation`);
        add(ledger, 'resource.stone', -1);
      }
      if (def.id === 'play-occupations-2') check(ids.length === 2, `${def.id}: plays the printed maximum of two`);
      if (def.id === 'play-occupations-4') check(ids.length === 4, `${def.id}: plays the printed maximum of four`);
      add(ledger, 'hand', -ids.length);
      add(ledger, 'played', ids.length);
      choice = { optionIds: ids, ...(def.id === 'play-occupation-paid' && ids.length ? { allocations: [{ id: 'stone', amount: 1 }] } : {}) };
    } else if (decision.kind === 'die') {
      const stage = String(decision.meta?.stage ?? 'roll');
      if (stage === 'boats') {
        const max = Math.min(decision.max ?? 1, decision.options.length);
        choice = { optionIds: decision.options.slice(0, max).map((x) => x.id) };
      } else if (stage === 'roll') {
        choice = { optionIds: ['roll'] };
      } else {
        const result = Number(decision.meta?.result ?? 0);
        const direction = String(decision.meta?.direction ?? def.effects.find((x) => x.kind === 'die')?.rule.direction);
        const die = def.effects.find((x) => x.kind === 'die');
        check(die?.kind === 'die', `${def.id}: die decision maps to printed die rule`);
        if (direction === 'low') {
          add(ledger, 'resource.wood', -result);
          if (die!.rule.kind === 'hunt') {
            add(ledger, 'good.hide', 1);
            add(ledger, 'good.game-meat', 1);
          } else if (die!.rule.kind === 'snare') {
            add(ledger, 'good.fur', 1);
            add(ledger, 'weapon.snare', 1);
            add(ledger, 'deck.weapon', -1);
          } else {
            add(ledger, 'good.oil', 1);
            add(ledger, 'good.skin-and-bones', 1);
            add(ledger, 'good.whale-meat', 1);
          }
          choice = { optionIds: ['resolve'], allocations: result ? [{ id: 'wood', amount: result }] : [] };
        } else {
          const stone = Math.max(0, 6 - result);
          add(ledger, 'resource.stone', -stone);
          choice = { optionIds: ['resolve'], allocations: stone ? [{ id: 'stone', amount: stone }] : [] };
        }
      }
    } else if (decision.kind === 'die-spend') {
      const option = decision.options.find((x) => x.id.startsWith('good:')) ?? decision.options[0];
      check(option, `${def.id}: successful battle exposes loot`);
      if (option!.id.startsWith('good:')) add(ledger, `good.${option!.id.slice(5)}`, 1);
      else {
        add(ledger, 'specials', 1);
        add(ledger, 'supply.special', -1);
      }
      choice = { optionIds: [option!.id] };
    } else {
      check(false, `${def.id}: deterministic resolver supports ${decision.kind}`);
      return;
    }

    const id = decision.id;
    const result = applyFeastAction(state, decision.seat, { type: 'resolve_decision', decisionId: id, choice });
    check(result.ok, `${def.id}: resolves ${decision.kind}${result.error ? ` (${result.error})` : ''}`);
    if (!result.ok) return;
  }
}

function rejectAtomically(state: FeastState, def: FeastActionSpaceDefinition, label: string, expectedText?: string): void {
  const reason = feastActionReason(state, 0, def, false);
  check(reason !== null, `${def.id}: ${label} has a preview rejection reason`);
  if (expectedText) check(reason?.toLowerCase().includes(expectedText.toLowerCase()), `${def.id}: ${label} reason mentions ${expectedText} (got ${reason})`);
  const snapshot = JSON.stringify(state);
  const result = applyFeastAction(state, 0, { type: 'place_workers', spaceId: def.id });
  check(!result.ok, `${def.id}: ${label} rejects in reducer`);
  check(JSON.stringify(state) === snapshot, `${def.id}: ${label} rejection is atomic`);
}

function setAmount(player: FeastState['players'][number], item: FeastAmount, amount: number): void {
  if (item.kind === 'silver') player.silver = amount;
  else if (item.kind === 'resource') player.resources[item.id as 'wood' | 'stone' | 'ore'] = amount;
  else if (item.kind === 'good') player.goods[item.id as FeastGood] = amount;
  else if (item.kind === 'weapon') player.weapons[item.id as FeastWeapon] = amount;
}

function prerequisiteRejections(def: FeastActionSpaceDefinition): void {
  // Every space gets a directed worker-requirement rejection.
  {
    const state = fixture(def, 1);
    state.players[0].workersAvailable = def.workers - 1;
    rejectAtomically(state, def, 'worker shortfall', `${def.workers} Vikings`);
  }

  // Every mandatory printed payment is independently insufficient once.
  for (const effect of def.effects) {
    if (effect.kind !== 'pay') continue;
    for (const item of effect.items) {
      const state = fixture(def, 10 + effect.items.indexOf(item));
      setAmount(state.players[0], item, Math.max(0, item.amount - 1));
      rejectAtomically(state, def, `missing printed ${String(item.id ?? item.kind)} payment`, String(item.id ?? item.kind));
    }
  }

  const specialReject = (label: string, mutate: (state: FeastState) => void, expected?: string): void => {
    const state = fixture(def, 50);
    mutate(state);
    rejectAtomically(state, def, label, expected);
  };

  const directBuild = def.effects.find((x) => x.kind === 'build');
  if (directBuild?.kind === 'build') {
    specialReject('empty building supply', (s) => { s.buildingSupply[directBuild.building] = 0; }, directBuild.building.replace('-', ' '));
  }
  const directShip = def.effects.find((x) => x.kind === 'ship');
  if (directShip?.kind === 'ship') {
    specialReject('full ship berth', (s) => {
      const p = s.players[0];
      p.ships = [];
      const types: FeastShipType[] = directShip.ship === 'whaling-boat'
        ? ['whaling-boat', 'whaling-boat', 'whaling-boat']
        : ['knarr', 'knarr', 'longship', 'longship'];
      types.forEach((type, i) => ship(p, type, `full-berth-${i}`));
    }, 'berth');
  }
  if (def.id === 'build-house-and-ship') {
    specialReject('no matching house', (s) => { s.buildingSupply['stone-house'] = 0; s.buildingSupply['long-house'] = 0; }, 'house');
    specialReject('full large-ship berth', (s) => {
      s.players[0].ships = [];
      for (let i = 0; i < 4; i++) ship(s.players[0], i % 2 ? 'longship' : 'knarr', `full-large-${i}`);
    }, 'berth');
  }
  if (def.id === 'craft-chest') {
    specialReject('neither alternate material', (s) => { s.players[0].resources.wood = 0; s.players[0].resources.ore = 0; }, 'wood or 1 ore');
  }
  if (def.id === 'whaling-major' || def.id === 'whaling-minor') {
    specialReject('missing whaling boat', (s) => { s.players[0].ships = []; }, 'whaling boat');
  }
  if (def.id === 'raid' || def.id.startsWith('pillage')) {
    specialReject('missing longship', (s) => { s.players[0].ships = []; }, 'longship');
  }
  if (def.id === 'plunder') {
    specialReject('only one longship', (s) => { s.players[0].ships = []; ship(s.players[0], 'longship', 'only-one'); }, 'two longships');
  }
  if (def.id === 'produce-milk') {
    specialReject('missing cattle', (s) => { s.players[0].goods.cattle = 0; s.players[0].goods['pregnant-cattle'] = 0; }, 'cattle');
  }
  if (def.id === 'produce-wool') {
    specialReject('missing sheep', (s) => { s.players[0].goods.sheep = 0; s.players[0].goods['pregnant-sheep'] = 0; }, 'sheep');
  }
  if (def.id.startsWith('overseas-trade') || def.id === 'special-sale') {
    specialReject('missing knarr', (s) => { s.players[0].ships = []; }, 'knarr');
  }
  if (def.id === 'special-sale') {
    specialReject('no affordable special', (s) => {
      s.players[0].silver = 0;
      s.specialSupply = s.specialSupply.filter((id) => id === 'english-crown' || (FEAST_SPECIAL_BY_ID[id]?.silverCost ?? 0) > 0);
    }, 'affordable');
  }
  if (def.id === 'explore-short' || def.id === 'explore-medium' || def.id === 'explore-long') {
    specialReject('missing required exploration ship', (s) => { s.players[0].ships = []; }, 'ship');
    specialReject('named faces exhausted', (s) => {
      const faces = def.effects.find((x) => x.kind === 'explore');
      if (faces?.kind === 'explore') for (const x of s.explorations) if (faces.faces.includes(x.face)) x.claimedBy = 0;
    }, 'available');
  }
  if (def.effects.some((x) => x.kind === 'emigrate')) {
    specialReject('missing emigration ship', (s) => { s.players[0].ships = []; }, 'ship');
    specialReject('missing emigration silver', (s) => { s.players[0].silver = 0; }, 'costs');
  }
  if (def.id === 'play-occupations-2' || def.id === 'play-occupations-4') {
    specialReject('empty occupation hand', (s) => { s.players[0].occupationHand = []; }, 'occupation');
  }
  const rootMountain = def.effects.some((x) => x.kind === 'mountain');
  const rootUpgrade = def.effects.some((x) => x.kind === 'upgrade');
  if (def.id === 'mountain-2x4-or-double-3') {
    specialReject('neither printed branch can produce an effect', (s) => {
      for (const strip of s.mountains) strip.items = [];
      for (const id of FEAST_GOOD_IDS) s.players[0].goods[id] = 0;
    });
  }
  if (rootMountain && !def.effects.some((x) => x.kind === 'draw-weapons')) {
    specialReject('no mountain item or upgrade', (s) => {
      for (const strip of s.mountains) strip.items = [];
      for (const id of FEAST_GOOD_IDS) s.players[0].goods[id] = 0;
    }, 'mountain');
  } else if (rootUpgrade && !rootMountain && !def.effects.some((x) => x.kind === 'draw-weapons')) {
    specialReject('no upgradable good', (s) => { for (const id of FEAST_GOOD_IDS) s.players[0].goods[id] = 0; }, 'upgraded');
  }
}

const actionCoverage = new Set<string>();
const effectKinds = new Set<string>();
const effectSemantics = new Set<string>();
const decisionKinds = new Set<string>();

for (const def of FEAST_ACTION_SPACES) {
  prerequisiteRejections(def);

  const state = fixture(def, 500);
  const player = state.players[0];
  const before = metrics(state);
  const ledger: MetricMap = {};

  // The third-column occupation draw is a board rule layered on top of the
  // printed effect and must happen on every third-column space.
  if (def.column === 3) {
    add(ledger, 'hand', 1);
    add(ledger, 'deck.occupation', -1);
  }
  accountSimpleEffects(state, def.id, def.effects, ledger);

  const preview = feastActionReason(state, 0, def, false);
  check(preview === null, `${def.id}: directed fixture is legal${preview ? ` (${preview})` : ''}`);
  const result = applyFeastAction(state, 0, { type: 'place_workers', spaceId: def.id });
  check(result.ok, `${def.id}: real reducer accepts worker placement${result.error ? ` (${result.error})` : ''}`);
  if (!result.ok) continue;

  equal(player.workersAvailable, 12, `${def.id}: atomic reducer may replace player identity without mutating stale fixture reference`);
  check(state.players[0].workersAvailable === 12 - def.workers, `${def.id}: spends exactly ${def.workers} Vikings`);
  const occupant = state.actionSpaces.find((x) => x.id === def.id)?.occupants.find((x) => x.seat === 0 && x.copiedFrom === null);
  check(occupant?.workers === def.workers, `${def.id}: records exact printed worker occupancy`);

  for (const effect of def.effects) {
    effectKinds.add(effect.kind);
    if (effect.kind !== 'emigrate') effectSemantics.add(effect.kind);
  }
  resolveAll(state, def, ledger, decisionKinds, effectSemantics);
  check(state.pending.length === 0, `${def.id}: all resulting decisions resolve`);
  check(state.players[0].turnMayEnd, `${def.id}: completed action enables explicit END TURN`);
  check(state.players[0].turnEffectUsed, `${def.id}: legal fixture uses at least one printed effect`);

  equal(deltas(before, metrics(state)), ledger, `${def.id}: exact printed costs/rewards/supplies`);
  actionCoverage.add(def.id);
}

const schemaKinds = new Set<string>();
const walkKinds = (effect: FeastPrintedEffect): void => {
  schemaKinds.add(effect.kind);
  if (effect.kind === 'choose') for (const option of effect.options) for (const nested of option.effects) walkKinds(nested);
};
for (const def of FEAST_ACTION_SPACES) for (const effect of def.effects) walkKinds(effect);

// FeastPrintedEffect currently has 18 discriminants in the schema. The
// nineteenth printed semantic path is the exchange-whaling variant of
// emigration, and it is exercised specifically through action space 61.
check(schemaKinds.size === 18, `schema exposes all 18 discriminated FeastPrintedEffect kinds (got ${schemaKinds.size})`);
check(effectKinds.size === 18, `successful real-reducer executions cover all 18 effect discriminants (got ${effectKinds.size})`);
check(effectSemantics.has('emigrate:large-ship'), 'ordinary large-ship emigration branch executed');
check(effectSemantics.has('emigrate:exchange-whaling'), 'exchange-whaling emigration branch executed');
check(effectSemantics.size === 19, `17 non-emigration kinds plus both explicit emigration semantics are recorded (got ${effectSemantics.size})`);
check(actionCoverage.size === 61, `all 61 exact action spaces execute successfully (got ${actionCoverage.size})`);
equal([...actionCoverage], FEAST_ACTION_SPACES.map((x) => x.id), 'action execution follows exact extracted order 1-61');

console.log(`Action-space execution coverage: ${actionCoverage.size}/61`);
console.log(`Printed-effect coverage: ${effectKinds.size}/18 discriminants, 19/19 semantic kinds (ordinary and exchange-whaling emigration both directed)`);
console.log(`Decision kinds exercised: ${[...decisionKinds].sort().join(', ')}`);
console.log(`Assertions: ${assertions - failures}/${assertions}`);

if (failures) {
  console.error(`${failures} action-space parity assertion${failures === 1 ? '' : 's'} failed.`);
  process.exitCode = 1;
} else {
  console.log('PASS: 61/61 Feast action spaces execute with directed success, requirement, reward, and atomic-rejection coverage.');
}
