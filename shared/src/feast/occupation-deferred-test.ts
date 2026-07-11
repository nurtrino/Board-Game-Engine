// Focused atomic deferred-command interpreter suite.
// Run: npx tsx shared/src/feast/occupation-deferred-test.ts

import { FEAST_ACTION_SPACES } from './data.js';
import {
  feastDecodeOccupationPlacementTarget, feastEncodeOccupationPlacementTarget,
  feastInterpretOccupationDeferred, feastInterpretOccupationDeferredCommands,
  type FeastOccupationDeferredIntent,
} from './occupationDeferred.js';
import type { FeastOccupationDeferredCommand } from './occupationExecutor.js';
import { feastMakePlacement, feastPlacementPreviewError } from './placement.js';
import { createFeast } from './state.js';
import type { FeastOccupationAction, FeastRuleRecord } from './occupationRules.js';
import type { FeastSeatColor, FeastState } from './types.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected),
    `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const seated = (count = 1) => (['Red', 'Blue', 'Green', 'Purple'] as FeastSeatColor[]).slice(0, count)
  .map((color, index) => ({ name: `Player ${index + 1}`, color }));
const fixture = (count = 1): FeastState => {
  const state = createFeast(seated(count), 99117 + count, { occupationMode: 'all' });
  state.pending = [];
  return state;
};

function success(
  state: FeastState, command: FeastOccupationDeferredCommand, seat = 0,
) {
  const result = feastInterpretOccupationDeferred(state, seat, command);
  check(result.ok, `${command.kind} command succeeds${result.ok ? '' : `: ${result.error.message}`}`);
  if (!result.ok) throw new Error(result.error.message);
  return result;
}

function grant(action: FeastOccupationAction, parameters: FeastRuleRecord = {}): FeastOccupationDeferredCommand {
  return { kind: 'grant-action', order: 1, path: `test.${action}`, action, parameters };
}

// Stable direct-placement codec.
{
  const encoded = feastEncodeOccupationPlacementTarget('player-0-home', 3, 4, 90);
  equal(encoded, 'player-0-home@3,4,90', 'placement target encoding is stable');
  equal(feastDecodeOccupationPlacementTarget(encoded), { boardId: 'player-0-home', x: 3, y: 4, rotation: 90 },
    'canonical placement target round trips');
  equal(feastDecodeOccupationPlacementTarget('{"boardId":"shed-9","x":1,"y":2,"rotation":0}'),
    { boardId: 'shed-9', x: 1, y: 2, rotation: 0 }, 'JSON tooling placement target decodes');
  check(feastDecodeOccupationPlacementTarget('plain-board') === null, 'plain board id is not mistaken for placement target');
}

// Phase commands resolve on a clone; Feast is intentionally serialized.
{
  const state = fixture();
  const player = state.players[0];
  player.goods.sheep = 2;
  const result = success(state, { kind: 'phase', order: 2, path: 'phase.breed', phase: 'breeding', scope: 'self' });
  check(result.intent === null, 'breeding resolves without a nested reducer decision');
  check(result.nextState.players[0].goods.sheep === 1 && result.nextState.players[0].goods['pregnant-sheep'] === 1,
    'private breeding uses ordinary pregnancy transition');
  check(player.goods.sheep === 2 && player.goods['pregnant-sheep'] === 0, 'private breeding does not mutate caller state');
  check(result.audit[0]?.kind === 'phase', 'private breeding emits typed phase audit');

  const feast = success(state, { kind: 'phase', order: 3, path: 'phase.feast', phase: 'feast', scope: 'self' });
  check(feast.intent?.kind === 'feast', 'private Feast returns typed Feast intent');
  check(feast.nextState.pending.length === state.pending.length, 'Feast interpreter does not manufacture reducer decisions');
}

{
  const state = fixture();
  state.round = 2; // long game harvest level 2
  const result = success(state, { kind: 'phase', order: 1, path: 'phase.harvest', phase: 'harvest', scope: 'self' });
  for (const good of ['peas', 'beans', 'flax', 'grain'] as const) {
    check(result.nextState.players[0].goods[good] === state.players[0].goods[good] + 1, `round-two harvest gives ${good}`);
  }
  check(result.nextState.players[0].goods.cabbage === state.players[0].goods.cabbage, 'round-two harvest does not overpay cabbage');
}

{
  const state = fixture();
  const before = state.players[0].silver;
  const result = success(state, { kind: 'phase', order: 1, path: 'phase.income', phase: 'income', scope: 'self' });
  check(result.nextState.players[0].silver >= before, 'private income resolves from authentic board income');
  const bad = feastInterpretOccupationDeferred(state, 0,
    { kind: 'phase', order: 1, path: 'phase.bad-scope', phase: 'income', scope: 'houses' });
  check(!bad.ok && bad.error.code === 'parameters', 'invalid non-bonus phase scope is rejected');
}

// Returned workers revalidate physical occupants and preserve color pools.
{
  const state = fixture();
  const space = state.actionSpaces[0];
  state.players[0].workersAvailable -= 2;
  space.occupants = [{ seat: 0, workers: 2, workerColor: state.players[0].activeWorkerColor, copiedFrom: null }];
  const result = success(state, {
    kind: 'return-workers', order: 4, path: 'workers.return', quantity: 1,
    actionSpaceIds: [space.id], parameters: { from: 'one-action-space', maximumPerSpace: 1, to: 'thing-square' },
  });
  check(result.nextState.actionSpaces[0].occupants[0]?.workers === 1, 'returns exact requested worker count');
  check(result.nextState.players[0].workersAvailable === state.players[0].workersAvailable + 1, 'returned active worker reaches Thing Square');
  check(state.actionSpaces[0].occupants[0]?.workers === 2, 'worker command leaves source state unchanged');

  const stale = feastInterpretOccupationDeferred(result.nextState, 0, {
    kind: 'return-workers', order: 5, path: 'workers.stale', quantity: 2,
    actionSpaceIds: [space.id], parameters: { from: 'one-action-space', to: 'thing-square' },
  });
  check(!stale.ok && stale.error.code === 'inventory', 'stale worker quantity rejects atomically');
  check(result.nextState.actionSpaces[0].occupants[0]?.workers === 1, 'failed stale command cannot partially remove workers');
}

// Concrete ship ore removal and Sponsor transfer preserve inventories/capacity.
{
  const state = fixture();
  state.players[0].ships.push({ id: 'longship-500', type: 'longship', ore: 3, emigrated: false, emigratedRound: null });
  const result = success(state, {
    kind: 'move', order: 1, path: 'ore.remove', subject: { item: 'ore', id: 'ore', quantity: 2 },
    from: 'whaling-boat-or-longship', to: 'supply', target: 'longship-500', parameters: { excludePrintedOre: true },
  });
  check(result.nextState.players[0].ships[0].ore === 1, 'ship move removes only added ore');
  check(state.players[0].ships[0].ore === 3, 'ore removal leaves caller ship unchanged');
  check(result.audit[0]?.kind === 'ore' && result.audit[0].amount === -2, 'ore removal audit is concrete');

  const stale = feastInterpretOccupationDeferred(result.nextState, 0, {
    kind: 'move', order: 2, path: 'ore.stale', subject: { item: 'ore', id: 'ore', quantity: 2 },
    from: 'selected-raiding-longship', to: 'general-supply', target: 'longship-500',
  }, { eventFields: { shipId: 'longship-500' } });
  check(!stale.ok && stale.error.code === 'inventory', 'stale ore removal rejects');
  check(result.nextState.players[0].ships[0].ore === 1, 'stale ore failure is atomic');
}

{
  const state = fixture();
  state.players[0].resources.ore = 3;
  state.players[0].ships.push({ id: 'longship-901', type: 'longship', ore: 0, emigrated: false, emigratedRound: null });
  const result = success(state, {
    kind: 'move', order: 1, path: 'sponsor.ore', subject: { item: 'ore', id: 'ore', quantity: 3 },
    from: 'supply', to: 'new-longship', target: 'new-longship',
  });
  check(result.nextState.players[0].ships[0].ore === 3, 'Sponsor places three ore on newest longship');
  check(result.nextState.players[0].resources.ore === 0, 'Sponsor consumes ore from player supply');
  const overflow = feastInterpretOccupationDeferred(result.nextState, 0, {
    kind: 'move', order: 2, path: 'sponsor.overflow', subject: { item: 'ore', id: 'ore', quantity: 1 },
    from: 'supply', to: 'new-longship', target: 'longship-901',
  });
  check(!overflow.ok && overflow.error.code === 'capacity', 'ship ore capacity is enforced before inventory mutation');
}

// Shed placement pauses without coordinates, then consumes owned resource on a direct target.
{
  const state = fixture();
  state.players[0].resources.wood = 1;
  state.buildingSupply.shed--;
  state.players[0].boards.push({ id: 'shed-test', definitionId: 'shed', kind: 'building', owner: 0, placements: [] });
  const command: FeastOccupationDeferredCommand = {
    kind: 'move', order: 1, path: 'shed.wood', subject: { item: 'wood', id: 'wood', quantity: 1 },
    from: 'supply', to: 'empty-shed-cell', target: 'shed-test',
  };
  const prompt = success(state, command);
  check(prompt.intent?.kind === 'placement' && prompt.intent.source === 'supply-to-shed', 'plain shed target returns placement intent');
  check((prompt.intent?.options.length ?? 0) > 0, 'shed intent exposes server-derived legal cells');
  const encoded = prompt.intent!.options[0].id;
  const placed = success(state, { ...command, target: encoded });
  check(placed.nextState.players[0].resources.wood === 0, 'shed placement consumes owned wood');
  check(placed.nextState.players[0].boards.find((board) => board.id === 'shed-test')?.placements.length === 1,
    'shed placement commits exact board geometry');
}

// Immediate gained placement does not consume a pre-existing player token.
{
  const state = fixture();
  state.players[0].resources.ore = 2;
  const plain: FeastOccupationDeferredCommand = {
    kind: 'placement', order: 1, path: 'gain.ore', mode: 'gain-direct',
    destination: 'immediate-home-or-exploration-placement', target: 'player-0-home',
    items: [{ item: 'ore', id: 'ore', quantity: 1 }],
  };
  const prompt = success(state, plain);
  check(prompt.intent?.kind === 'placement' && prompt.intent.options.length > 0, 'unlocated gain returns legal placement cells');
  const placed = success(state, { ...plain, target: prompt.intent!.options[0].id });
  check(placed.nextState.players[0].resources.ore === 2, 'general-supply direct gain leaves existing player ore unchanged');
  check(placed.nextState.players[0].boards[0].placements.length === 1, 'direct gained ore commits placement');

  const badTarget = feastEncodeOccupationPlacementTarget('player-0-home', -4, -4, 0);
  const bad = feastInterpretOccupationDeferred(state, 0, { ...plain, target: badTarget });
  check(!bad.ok && bad.error.code === 'geometry', 'illegal encoded placement rejects with geometry error');
  check(state.players[0].boards[0].placements.length === 0, 'illegal direct placement cannot mutate source board');
}

// Reclaiming a unique special works across players and carries its exact footprint.
{
  const state = fixture(2);
  const owner = state.players[1];
  const specialAt = state.specialSupply.indexOf('cloakpin');
  state.specialSupply.splice(specialAt, 1);
  owner.specials.push('cloakpin');
  let placed = false;
  for (const rotation of [0, 90, 180, 270] as const) for (let y = 0; y < 12 && !placed; y++) for (let x = 0; x < 12 && !placed; x++) {
    if (feastPlacementPreviewError(owner, owner.boards[0].id, 'cloakpin', x, y, rotation, false) === null) {
      owner.boards[0].placements.push(feastMakePlacement('cloakpin-placement', 'cloakpin', x, y, rotation));
      placed = true;
    }
  }
  check(placed, 'special fixture finds legal authentic placement');
  const move: FeastOccupationDeferredCommand = {
    kind: 'move', order: 1, path: 'courier.reclaim',
    subject: { item: 'special-tile', id: 'cloakpin', quantity: 1 },
    from: 'any-player-board', to: 'owner-supply', target: 'cloakpin-placement',
  };
  const result = success(state, move);
  check(result.nextState.players[0].specials.includes('cloakpin'), 'card owner receives reclaimed special');
  check(!result.nextState.players[1].specials.includes('cloakpin'), 'old owner loses unique special ownership');
  check(result.nextState.players[1].boards[0].placements.length === 0, 'special is removed from exact source board');
  check(result.context.vacated?.placement.id === 'cloakpin-placement', 'vacated exact placement provenance is carried');

  const fill: FeastOccupationDeferredCommand = {
    kind: 'placement', order: 2, path: 'courier.fill', mode: 'gain-direct',
    destination: 'vacated-cloakpin-cells', target: result.context.vacated!.boardId,
    items: [{ item: 'silverware', id: 'silverware', quantity: 1 }, { item: 'rune-stone', id: 'rune-stone', quantity: 1 }],
  };
  const fillResult = feastInterpretOccupationDeferred(result.nextState, 0, fill, result.context);
  check(fillResult.ok && fillResult.intent?.kind === 'placement', 'vacated footprint produces typed placement intent');
  if (fillResult.ok && fillResult.intent?.kind === 'placement') {
    equal(fillResult.intent.requiredCells, result.context.vacated!.placement.covered,
      'vacated placement intent carries exact required footprint');
    check(fillResult.intent.destinationBoardIds[0] === owner.boards[0].id, 'vacated fill targets original player board');
    check(fillResult.intent.selectionMode === 'configuration' && fillResult.intent.options.length > 0,
      'vacated fill exposes only complete server-derived packings');
    check(Array.isArray(fillResult.intent.options[0].meta?.targets), 'packing option carries exact encoded placement targets');
    const targets = fillResult.intent.options[0].meta?.targets as readonly string[];
    const packed = feastInterpretOccupationDeferred(result.nextState, 0, { ...fill, target: targets }, result.context);
    check(packed.ok && packed.intent === null, 'selected exact packing resolves without another decision');
    if (packed.ok) {
      check(packed.nextState.players[1].boards[0].placements.length === 2,
        'general-supply replacements commit to the original opponent board');
      check(packed.nextState.players[1].goods.silverware === result.nextState.players[1].goods.silverware,
        'general-supply replacement does not alter board owner inventory');
    }
  }

  const replay = feastInterpretOccupationDeferred(result.nextState, 0, move, result.context);
  check(!replay.ok && replay.error.code === 'target', 'replaying reclaimed special target rejects atomically');
}

// Banquet moves need coordinates; direct encoded target moves the physical tile.
{
  const state = fixture();
  state.buildingSupply['stone-house']--;
  state.players[0].boards.push({ id: 'house-test', definitionId: 'stone-house', kind: 'building', owner: 0, placements: [] });
  state.players[0].feastPlacements.push(feastMakePlacement('feast-stockfish', 'stockfish', 0, 0, 0));
  const command: FeastOccupationDeferredCommand = {
    kind: 'move', order: 1, path: 'fish-cook.move',
    subject: { item: 'stockfish', id: 'stockfish', quantity: 1 },
    from: 'banquet-table', to: 'stone-or-long-houses', target: 'house-test',
    parameters: { placementRulesApply: true },
  };
  const prompt = success(state, command);
  check(prompt.intent?.kind === 'placement' && prompt.intent.source === 'banquet-to-house', 'Banquet board id returns placement intent');
  check((prompt.intent?.options.length ?? 0) > 0, 'Banquet intent contains legal house cells');
  const result = success(state, { ...command, target: prompt.intent!.options[0].id });
  check(result.nextState.players[0].feastPlacements.length === 0, 'direct Banquet move removes source placement');
  check(result.nextState.players[0].boards.find((board) => board.id === 'house-test')?.placements[0]?.pieceId === 'stockfish',
    'direct Banquet move commits destination placement');
  check(result.nextState.players[0].goods.stockfish === state.players[0].goods.stockfish,
    'moving a served tile does not fabricate or consume supply inventory');
}

// Every declared grant action has a typed, reducer-friendly branch.
{
  const state = fixture();
  const player = state.players[0];
  player.goods.flax = 2; player.goods.oil = 1; player.goods.hide = 1;
  player.resources.wood = 8; player.resources.stone = 8; player.resources.ore = 8;
  player.silver = 20;
  player.ships.push(
    { id: 'whaler-1', type: 'whaling-boat', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'knarr-1', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'longship-1', type: 'longship', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'longship-2', type: 'longship', ore: 0, emigrated: false, emigratedRound: null },
  );
  if (state.occupationDeck[0]) player.occupationHand.push(state.occupationDeck[0]);
  const occupied = state.actionSpaces.find((space) => FEAST_ACTION_SPACES.find((def) => def.id === space.id)?.column === 2)!;
  occupied.occupants.push({ seat: 0, workers: 1, workerColor: player.activeWorkerColor, copiedFrom: null });
  const actions: FeastOccupationAction[] = [
    'hunting-game', 'laying-snare', 'whaling', 'raiding', 'pillaging', 'plundering',
    'exploration', 'emigration', 'overseas-trading', 'upgrade-good', 'mountain-take',
    'bonus', 'breeding', 'harvest', 'feast', 'play-occupation', 'buy-ship',
    'build-house', 'action-space',
  ];
  for (const action of actions) {
    const parameters: FeastRuleRecord = action === 'action-space' ? { column: 2, occupied: true, placeWorkers: false }
      : action === 'mountain-take' ? { allowances: [1], buildingResourcesOnly: true }
        : action === 'buy-ship' ? { ship: 'longship', silverCost: 3 }
          : action === 'upgrade-good' ? { count: 1, steps: 1 }
            : {};
    const result = success(state, grant(action, parameters));
    check(result.intent?.kind === 'grant-action' && result.intent.action === action, `${action} returns its typed grant intent`);
    if (result.intent?.kind === 'grant-action') {
      equal(result.intent.parameters, parameters, `${action} retains exact registry parameters`);
      check(Number.isSafeInteger(result.intent.min) && Number.isSafeInteger(result.intent.max), `${action} exposes finite selection bounds`);
    }
  }
}

// Dynamic registry parameters resolve against the current server state.
{
  const state = fixture();
  state.players[0].ships.push(
    { id: 'knarr-a', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
    { id: 'knarr-b', type: 'knarr', ore: 0, emigrated: false, emigratedRound: null },
  );
  const command = grant('buy-ship', {
    ship: 'longship',
    silverCost: { kind: 'tier', metric: 'ships', filter: { type: 'knarr' },
      tiers: [{ exactly: 0, value: 8 }, { exactly: 1, value: 6 }, { exactly: 2, value: 3 }, { atLeast: 3, value: 1 }], default: 8 },
    roundMarker: { kind: 'round' },
  });
  const result = success(state, command);
  if (result.intent?.kind !== 'grant-action') throw new Error('Expected grant action');
  check(result.intent.resolvedParameters.silverCost === 3, 'tier parameter resolves from live ship count');
  check(result.intent.resolvedParameters.roundMarker === state.round, 'round parameter resolves at interpreter boundary');
  check(typeof result.intent.parameters.silverCost === 'object', 'authored dynamic parameter remains intact for audit');
}

// Batch orchestration carries transient provenance and rolls all mutations back on failure.
{
  const state = fixture();
  const before = state.players[0].silver;
  const commands: FeastOccupationDeferredCommand[] = [
    { kind: 'phase', order: 1, path: 'batch.income', phase: 'income', scope: 'self' },
    { kind: 'return-workers', order: 2, path: 'batch.stale', quantity: 1,
      actionSpaceIds: ['missing-space'], parameters: { from: 'one-action-space', to: 'thing-square' } },
  ];
  const result = feastInterpretOccupationDeferredCommands(state, 0, commands);
  check(!result.ok && result.error.code === 'target', 'batch rejects later stale target');
  check(state.players[0].silver === before, 'failed batch never exposes earlier cloned mutation');
}

{
  const state = fixture();
  state.players[0].goods.flax = 1;
  const commands: FeastOccupationDeferredCommand[] = [
    { kind: 'phase', order: 1, path: 'batch.harvest', phase: 'harvest', scope: 'self' },
    grant('upgrade-good', { count: 1, steps: 1 }),
  ];
  const result = feastInterpretOccupationDeferredCommands(state, 0, commands);
  check(result.ok && result.intent?.kind === 'grant-action', 'batch pauses at first reducer intent');
  if (result.ok) {
    check(result.consumed === 1 && result.intentIndex === 1, 'batch reports exact consumed/intent index');
    check(result.nextState.players[0].goods.flax > state.players[0].goods.flax, 'batch returns validated mutations before intent');
  }
}

// Unknown seat and unsupported move report stable typed errors.
{
  const state = fixture();
  const command = grant('harvest');
  const seat = feastInterpretOccupationDeferred(state, 9, command);
  check(!seat.ok && seat.error.code === 'seat', 'unknown seat returns typed error');
  const unsupported = feastInterpretOccupationDeferred(state, 0, {
    kind: 'move', order: 1, path: 'move.unknown', subject: { item: 'wood', id: 'wood', quantity: 1 },
    from: 'moon', to: 'table', target: 'x',
  });
  check(!unsupported.ok && unsupported.error.code === 'unsupported', 'unknown concrete move is rejected explicitly');
}

console.log(`${passed}/${passed + failed} occupation deferred checks passed`);
if (failed) process.exit(1);
