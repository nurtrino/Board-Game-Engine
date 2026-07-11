import { FEAST_OCCUPATIONS } from './data.js';
import type {
  FeastBuildingResource, FeastBuildingType, FeastGood, FeastPhase,
  FeastShipType, FeastWeapon,
} from './types.js';

/** The complete classic occupation-card number domain. */
export const FEAST_OCCUPATION_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
  81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
  141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160,
  161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180,
  181, 182, 183, 184, 185, 186, 187, 188, 189, 190,
] as const;

export type FeastOccupationNumber = typeof FEAST_OCCUPATION_NUMBERS[number];
export type FeastOccupationRuleId = `occupation-${FeastOccupationNumber}`;
export type FeastOccupationTiming = 'immediate' | 'anytime' | 'each-time' | 'as-soon-as';
export type FeastOccupationRequirement = 'mandatory' | 'optional' | 'replacement' | 'choice';
export type FeastOccupationLimit =
  | 'once-per-card' | 'once-per-round' | 'once-per-action' | 'once-per-event' | 'unlimited';

/** Reducer event surfaces used by every classic occupation. */
export type FeastOccupationHook =
  | 'card-played' | 'anytime' | 'action-proposed' | 'action-started' | 'action-resolved'
  | 'die-rolled' | 'die-resolved' | 'phase-started' | 'phase-resolved'
  | 'good-received' | 'resource-received' | 'weapon-received' | 'ship-acquired'
  | 'house-built' | 'animal-entered-stable' | 'tile-placed' | 'workers-placed'
  | 'workers-returned' | 'thing-count-changed' | 'mountain-item-taken'
  | 'mountain-item-removed' | 'bonus-produced' | 'occupation-received'
  | 'occupation-played-in-action' | 'state-changed' | 'scoring';

export type FeastOccupationRuleFamily =
  | 'action-cost' | 'action-reward' | 'action-grant' | 'action-replacement'
  | 'dice' | 'phase' | 'inventory' | 'conversion' | 'placement'
  | 'ship' | 'building' | 'livestock' | 'weapon' | 'worker'
  | 'special-tile' | 'threshold' | 'scoring' | 'compound';

export type FeastOccupationEvent =
  | 'play' | 'use-anytime' | 'livestock-market' | 'weekly-market' | 'crafting'
  | 'house-building' | 'ship-building' | 'hunting-game' | 'laying-snare'
  | 'whaling' | 'raiding' | 'pillaging' | 'plundering' | 'exploration'
  | 'emigration' | 'overseas-trading' | 'mountain-action' | 'upgrade-action'
  | 'occupation-action' | 'viking-action' | 'longship-used' | 'dice-action' | 'actions'
  | 'new-weapon' | 'harvest' | 'income' | 'breeding' | 'feast' | 'bonus'
  | 'mountain-strips' | 'good-gained' | 'resource-gained' | 'ship-gained'
  | 'house-gained' | 'animal-gained' | 'tile-placement' | 'worker-placement'
  | 'worker-return' | 'thing-count' | 'mountain-take' | 'mountain-remove'
  | 'bonus-production' | 'occupation-gained' | 'occupation-played'
  | 'inventory-threshold' | 'score';

export type FeastRuleScalar = string | number | boolean | null;
export type FeastRuleValue = FeastRuleScalar | readonly FeastRuleValue[] | { readonly [key: string]: FeastRuleValue };
export type FeastRuleRecord = Readonly<Record<string, FeastRuleValue>>;

export type FeastRuleComparator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'contains';
export type FeastRuleMetric =
  | 'silver' | 'round' | 'player-count' | 'income' | 'goods' | 'resources'
  | 'weapons' | 'ships' | 'large-ships' | 'houses' | 'special-tiles'
  | 'exploration-boards' | 'workers-on-spaces' | 'workers-in-thing'
  | 'ore-on-ships' | 'event-amount' | 'event-cost' | 'event-roll'
  | 'event-workers' | 'event-distinct-types' | 'event-items' | 'empty-berths';

export type FeastOccupationPredicate =
  | { kind: 'metric'; metric: FeastRuleMetric; comparator: FeastRuleComparator; value: FeastRuleValue; filter?: FeastRuleRecord }
  | { kind: 'event'; field: string; comparator: FeastRuleComparator; value: FeastRuleValue }
  | { kind: 'available'; subject: string; comparator?: 'eq' | 'gte'; value?: number }
  | { kind: 'all'; terms: readonly FeastOccupationPredicate[] }
  | { kind: 'any'; terms: readonly FeastOccupationPredicate[] }
  | { kind: 'not'; term: FeastOccupationPredicate };

export type FeastOccupationQuantity =
  | number
  | { kind: 'count'; metric: FeastRuleMetric; filter?: FeastRuleRecord; multiplier?: number; cap?: number }
  | { kind: 'tier'; metric: FeastRuleMetric; filter?: FeastRuleRecord; tiers: readonly { atLeast?: number; exactly?: number; atMost?: number; value: number }[]; default: number }
  | { kind: 'event'; field: string; multiplier?: number; cap?: number }
  | { kind: 'round'; offset?: number; floor?: number }
  | { kind: 'player-count'; offset: number };

export type FeastOccupationItemId =
  | FeastGood | FeastBuildingResource | FeastWeapon | FeastShipType | FeastBuildingType
  | 'silver' | 'weapon-card' | 'occupation-card' | 'viking' | 'special-tile'
  | 'exploration-board' | 'bonus-good' | 'good' | 'building-resource'
  | 'ship' | 'house' | 'farm-animal';

export interface FeastOccupationItem {
  item: FeastOccupationItemId;
  quantity: FeastOccupationQuantity;
  id?: string;
  state?: FeastRuleRecord;
}

export type FeastOccupationAction =
  | 'hunting-game' | 'laying-snare' | 'whaling' | 'raiding' | 'pillaging'
  | 'plundering' | 'exploration' | 'emigration' | 'overseas-trading'
  | 'upgrade-good' | 'mountain-take' | 'bonus' | 'breeding' | 'harvest'
  | 'feast' | 'play-occupation' | 'buy-ship' | 'build-house' | 'action-space';

export type FeastOccupationOperation =
  | { kind: 'transfer'; mode: 'gain' | 'pay' | 'discard' | 'return'; items: readonly FeastOccupationItem[]; source?: string; destination?: string }
  | { kind: 'exchange'; from: readonly FeastOccupationItem[]; to: readonly FeastOccupationItem[]; repeat: 'once' | 'up-to-event-amount' | 'unlimited'; parameters?: FeastRuleRecord }
  | { kind: 'choice'; min: number; max: number; options: readonly { id: string; operations: readonly FeastOccupationOperation[] }[] }
  | { kind: 'discount'; target: FeastOccupationEvent; amount: FeastOccupationQuantity; floor: number; exclusions?: readonly string[]; parameters?: FeastRuleRecord }
  | { kind: 'modify-die'; actions: readonly FeastOccupationAction[]; delta: number; per?: FeastOccupationItem; parameters?: FeastRuleRecord }
  | { kind: 'draw-weapons'; quantity: FeastOccupationQuantity; selection: 'random' | 'named' | 'fill-to-count'; named?: FeastWeapon[] }
  | { kind: 'grant-action'; action: FeastOccupationAction; parameters?: FeastRuleRecord }
  | { kind: 'replace'; target: 'action' | 'reward' | 'payment' | 'ship' | 'harvest-good' | 'bonus-good' | 'weapon-draw' | 'loot'; replacement: readonly FeastOccupationOperation[]; parameters?: FeastRuleRecord }
  | { kind: 'modify-rule'; rule: 'action-eligibility' | 'worker-cost' | 'weapon-substitution' | 'loot-color' | 'loot-split' | 'sword-value' | 'placement-material' | 'placement-limit' | 'bonus-destination' | 'roll-limit'; value: FeastRuleValue; parameters?: FeastRuleRecord }
  | { kind: 'move'; subject: FeastOccupationItem; from: string; to: string; parameters?: FeastRuleRecord }
  | { kind: 'return-workers'; quantity: FeastOccupationQuantity; parameters: FeastRuleRecord }
  | { kind: 'phase'; phase: Extract<FeastPhase, 'harvest' | 'income' | 'breeding' | 'feast' | 'bonus'>; scope: 'self' | 'houses' | 'home-board' }
  | { kind: 'score'; currency: 'points' | 'silver'; amount: FeastOccupationQuantity; parameters?: FeastRuleRecord };

export interface FeastOccupationTrigger {
  hook: FeastOccupationHook;
  event: FeastOccupationEvent;
  window: 'before' | 'during' | 'after' | 'instead' | 'when';
  filter?: FeastRuleRecord;
}

export interface FeastOccupationClause {
  id: string;
  triggers: readonly FeastOccupationTrigger[];
  requirement: FeastOccupationRequirement;
  limit: FeastOccupationLimit;
  condition?: FeastOccupationPredicate;
  operations: readonly FeastOccupationOperation[];
}

export interface FeastOccupationRule {
  id: FeastOccupationRuleId;
  number: FeastOccupationNumber;
  name: string;
  timing: FeastOccupationTiming;
  requirement: 'mandatory' | 'optional';
  family: FeastOccupationRuleFamily;
  triggers: readonly FeastOccupationHook[];
  clauses: readonly FeastOccupationClause[];
  /** Appendix text is retained only for provenance/UI; execution uses clauses. */
  sourceText: string;
}

const qCount = (metric: FeastRuleMetric, filter?: FeastRuleRecord, multiplier?: number, cap?: number): FeastOccupationQuantity =>
  ({ kind: 'count', metric, ...(filter ? { filter } : {}), ...(multiplier !== undefined ? { multiplier } : {}), ...(cap !== undefined ? { cap } : {}) });
const qTier = (metric: FeastRuleMetric, tiers: readonly { atLeast?: number; exactly?: number; atMost?: number; value: number }[], fallback = 0, filter?: FeastRuleRecord): FeastOccupationQuantity =>
  ({ kind: 'tier', metric, tiers, default: fallback, ...(filter ? { filter } : {}) });
const item = (id: FeastOccupationItemId, quantity: FeastOccupationQuantity = 1, extra?: Omit<FeastOccupationItem, 'item' | 'quantity'>): FeastOccupationItem =>
  ({ item: id, quantity, ...extra });
const gain = (...items: FeastOccupationItem[]): FeastOccupationOperation => ({ kind: 'transfer', mode: 'gain', items });
const gainTo = (destination: string, ...items: FeastOccupationItem[]): FeastOccupationOperation =>
  ({ kind: 'transfer', mode: 'gain', items, destination });
const pay = (...items: FeastOccupationItem[]): FeastOccupationOperation => ({ kind: 'transfer', mode: 'pay', items });
const discard = (...items: FeastOccupationItem[]): FeastOccupationOperation => ({ kind: 'transfer', mode: 'discard', items });
const exchange = (from: FeastOccupationItem[], to: FeastOccupationItem[], repeat: 'once' | 'up-to-event-amount' | 'unlimited' = 'once', parameters?: FeastRuleRecord): FeastOccupationOperation =>
  ({ kind: 'exchange', from, to, repeat, ...(parameters ? { parameters } : {}) });
const trigger = (hook: FeastOccupationHook, event: FeastOccupationEvent, window: FeastOccupationTrigger['window'] = 'when', filter?: FeastRuleRecord): FeastOccupationTrigger =>
  ({ hook, event, window, ...(filter ? { filter } : {}) });
const metric = (name: FeastRuleMetric, comparator: FeastRuleComparator, value: FeastRuleValue, filter?: FeastRuleRecord): FeastOccupationPredicate =>
  ({ kind: 'metric', metric: name, comparator, value, ...(filter ? { filter } : {}) });
const eventIs = (field: string, comparator: FeastRuleComparator, value: FeastRuleValue): FeastOccupationPredicate =>
  ({ kind: 'event', field, comparator, value });
const all = (...terms: FeastOccupationPredicate[]): FeastOccupationPredicate => ({ kind: 'all', terms });
const available = (subject: string): FeastOccupationPredicate => ({ kind: 'available', subject });
const clause = (
  id: string, triggers: FeastOccupationTrigger | FeastOccupationTrigger[], requirement: FeastOccupationRequirement,
  limit: FeastOccupationLimit, operations: FeastOccupationOperation[], condition?: FeastOccupationPredicate,
): FeastOccupationClause => ({ id, triggers: Array.isArray(triggers) ? triggers : [triggers], requirement, limit, operations, ...(condition ? { condition } : {}) });

const goldenByNumber = new Map(FEAST_OCCUPATIONS.map((card) => [card.number, card]));
const rule = (
  number: FeastOccupationNumber, family: FeastOccupationRuleFamily, requirement: 'mandatory' | 'optional',
  clauses: FeastOccupationClause[],
): FeastOccupationRule => {
  const card = goldenByNumber.get(number);
  if (!card) throw new Error(`Missing golden occupation ${number}`);
  const id = `occupation-${number}` as FeastOccupationRuleId;
  if (card.id !== id) throw new Error(`Golden occupation id mismatch for ${number}`);
  return {
    id, number, name: card.name, timing: card.type, family, requirement,
    triggers: [...new Set(clauses.flatMap((entry) => entry.triggers.map((x) => x.hook)))],
    clauses, sourceText: card.clarification,
  };
};

const play = trigger('card-played', 'play');
const anytime = trigger('anytime', 'use-anytime');

const RULES_001_040: FeastOccupationRule[] = [
  rule(1, 'action-cost', 'mandatory', [
    clause('livestock-discount', trigger('action-proposed', 'livestock-market', 'before'), 'mandatory', 'once-per-action', [
      { kind: 'discount', target: 'livestock-market', amount: 1, floor: 0, parameters: { appliesToTotalCost: true, paidGoodsOnly: true } },
    ], eventIs('printedCost', 'gt', 0)),
  ]),
  rule(2, 'action-cost', 'mandatory', [
    clause('costly-space-discount', trigger('action-proposed', 'viking-action', 'before'), 'mandatory', 'once-per-action', [
      { kind: 'discount', target: 'viking-action', amount: 1, floor: 0, exclusions: ['ship-purchase'], parameters: { appliesToCombinedActionCost: true } },
    ], eventIs('printedSilverCost', 'gte', 2)),
  ]),
  rule(3, 'weapon', 'mandatory', [
    clause('printed-one-silver-snare', trigger('action-resolved', 'viking-action', 'after'), 'mandatory', 'once-per-action', [
      { kind: 'draw-weapons', quantity: 1, selection: 'named', named: ['snare'] },
    ], all(eventIs('printedSilverReward', 'eq', 1), eventIs('rewardSource', 'eq', 'action-space'))),
  ]),
  rule(4, 'dice', 'mandatory', [
    clause('all-rolls-minus-one', trigger('die-rolled', 'dice-action', 'when'), 'mandatory', 'once-per-event', [
      { kind: 'modify-die', actions: ['hunting-game', 'laying-snare', 'whaling', 'raiding', 'pillaging'], delta: -1 },
    ]),
  ]),
  rule(5, 'phase', 'mandatory', [
    clause('private-feast', play, 'mandatory', 'once-per-card', [{ kind: 'phase', phase: 'feast', scope: 'self' }]),
  ]),
  rule(6, 'action-reward', 'mandatory', [
    clause('stone-from-mountain-silver', trigger('mountain-item-taken', 'mountain-take'), 'mandatory', 'once-per-event', [gain(item('silver'))], eventIs('item', 'eq', 'stone')),
  ]),
  rule(7, 'phase', 'mandatory', [
    clause('grain-after-feast', trigger('phase-resolved', 'feast', 'after'), 'mandatory', 'once-per-round', [
      gain(item('silver', qTier('goods', [{ exactly: 1, value: 1 }, { exactly: 2, value: 2 }], 0, { id: 'grain', location: 'supply' }))),
    ]),
  ]),
  rule(8, 'phase', 'mandatory', [
    clause('craft-workers-oil', trigger('phase-started', 'income', 'before'), 'mandatory', 'once-per-round', [gain(item('oil'))],
      metric('workers-on-spaces', 'gte', 5, { group: 'Crafting', countCurrentWorkers: true })),
  ]),
  rule(9, 'placement', 'mandatory', [
    clause('longship-ore-placement', trigger('phase-started', 'income', 'before'), 'mandatory', 'once-per-round', [
      gainTo('immediate-home-or-exploration-placement', item('ore', qCount('ships', { type: 'longship' }))),
    ]),
  ]),
  rule(10, 'livestock', 'mandatory', [
    clause('milk-and-silver-per-animal-kind', play, 'mandatory', 'once-per-card', [
      gain(
        item('milk', qCount('goods', { ids: ['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle'], location: 'stable', distinctAnimalTypes: true, cap: 2 })),
        item('silver', qCount('goods', { ids: ['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle'], location: 'stable', distinctAnimalTypes: true, cap: 2 })),
      ),
    ]),
  ]),
  rule(11, 'compound', 'mandatory', [
    clause('take-spear', play, 'mandatory', 'once-per-card', [{ kind: 'draw-weapons', quantity: 1, selection: 'named', named: ['spear'] }]),
    clause('spear-whaling-value', trigger('die-rolled', 'whaling'), 'mandatory', 'once-per-event', [
      { kind: 'modify-die', actions: ['whaling'], delta: -2, per: item('spear'), parameters: { replacesNormalWeaponValue: true } },
    ]),
  ]),
  rule(12, 'compound', 'mandatory', [
    clause('take-chest', play, 'mandatory', 'once-per-card', [gain(item('chest'))]),
    clause('weapon-after-longship-use', trigger('action-resolved', 'longship-used', 'after'), 'optional', 'once-per-action', [
      { kind: 'draw-weapons', quantity: 1, selection: 'random' },
    ]),
  ]),
  rule(13, 'compound', 'mandatory', [
    clause('take-bow', play, 'mandatory', 'once-per-card', [{ kind: 'draw-weapons', quantity: 1, selection: 'named', named: ['bow'] }]),
    clause('hunting-minus-one', trigger('die-rolled', 'hunting-game'), 'mandatory', 'once-per-event', [
      { kind: 'modify-die', actions: ['hunting-game'], delta: -1 },
    ]),
  ]),
  rule(14, 'ship', 'mandatory', [
    clause('complete-fleet-whale-meat', play, 'mandatory', 'once-per-card', [
      gain(item('whale-meat', qCount('ships', { completeSets: ['whaling-boat', 'knarr', 'longship'], cap: 2 }))),
    ]),
  ]),
  rule(15, 'compound', 'mandatory', [
    clause('mead-per-house-on-play', play, 'mandatory', 'once-per-card', [gain(item('mead', qCount('houses', { types: ['stone-house', 'long-house'] }, 2)))]),
    clause('hide-after-house', trigger('house-built', 'house-gained', 'after'), 'mandatory', 'once-per-event', [gain(item('hide'))],
      all(eventIs('houseType', 'in', ['stone-house', 'long-house']), eventIs('classifiedAsHouseBuilding', 'eq', true))),
  ]),
  rule(16, 'ship', 'mandatory', [
    clause('ore-fleet-silver', play, 'mandatory', 'once-per-card', [
      gain(item('silver', qTier('ore-on-ships', [{ atLeast: 4, value: 2 }, { atLeast: 5, value: 3 }, { atLeast: 6, value: 4 }, { atLeast: 7, value: 5 }], 0, { shipTypes: ['whaling-boat', 'longship'], printedOre: false }))),
    ]),
  ]),
  rule(17, 'conversion', 'optional', [
    clause('triple-upgrade-one-good', play, 'optional', 'once-per-card', [{ kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 3, destinationColor: 'blue', sameDimensions: true } }]),
  ]),
  rule(18, 'inventory', 'mandatory', [
    clause('one-armed-longship', play, 'mandatory', 'once-per-card', [gain(item('silk'))], metric('ships', 'eq', 1, { type: 'longship', oreAtLeast: 2 })),
    clause('two-armed-longships', play, 'mandatory', 'once-per-card', [gain(item('jewelry'))], metric('ships', 'eq', 2, { type: 'longship', oreAtLeast: 2 })),
    clause('three-armed-longships', play, 'mandatory', 'once-per-card', [gain(item('silver-hoard'))], metric('ships', 'gte', 3, { type: 'longship', oreAtLeast: 2 })),
  ]),
  rule(19, 'inventory', 'mandatory', [
    clause('three-specials', play, 'mandatory', 'once-per-card', [gain(item('silk'))], metric('special-tiles', 'eq', 3, { locations: ['supply', 'boards'] })),
    clause('four-specials', play, 'mandatory', 'once-per-card', [gain(item('spices'))], metric('special-tiles', 'eq', 4, { locations: ['supply', 'boards'] })),
    clause('five-specials', play, 'mandatory', 'once-per-card', [gain(item('jewelry'))], metric('special-tiles', 'gte', 5, { locations: ['supply', 'boards'] })),
  ]),
  rule(20, 'phase', 'optional', [clause('houses-bonus', play, 'optional', 'once-per-card', [{ kind: 'phase', phase: 'bonus', scope: 'houses' }])]),
  rule(21, 'phase', 'optional', [clause('home-bonus', play, 'optional', 'once-per-card', [{ kind: 'phase', phase: 'bonus', scope: 'home-board' }])]),
  rule(22, 'ship', 'mandatory', [
    clause('miner-longship-yield', play, 'mandatory', 'once-per-card', [gain(
      item('stone', qCount('ships', { type: 'longship' })), item('ore', qCount('ships', { type: 'longship' })), item('silver', qCount('ships', { type: 'longship' })),
    )]),
  ]),
  rule(23, 'building', 'mandatory', [clause('silver-per-house', play, 'mandatory', 'once-per-card', [gain(item('silver', qCount('houses', { types: ['stone-house', 'long-house'] }, 2)))])]),
  rule(24, 'ship', 'mandatory', [clause('ship-type-yield', play, 'mandatory', 'once-per-card', [gain(
    item('oil', qCount('ships', { type: 'knarr' })), item('wood', qCount('ships', { type: 'whaling-boat' })),
  )])]),
  rule(25, 'ship', 'mandatory', [clause('salt-meat-per-knarr', play, 'mandatory', 'once-per-card', [gain(item('salt-meat', qCount('ships', { type: 'knarr' })))])]),
  rule(26, 'inventory', 'mandatory', [clause('red-good-types-silver', play, 'mandatory', 'once-per-card', [gain(
    item('silver', qCount('goods', { color: 'red', locations: ['supply', 'stable'], distinctTypes: true, mergePregnancy: true })),
  )])]),
  rule(27, 'ship', 'mandatory', [clause('stockfish-per-whaler', play, 'mandatory', 'once-per-card', [gain(item('stockfish', qCount('ships', { type: 'whaling-boat' }, 1, 3)))])]),
  rule(28, 'conversion', 'optional', [
    clause('buy-oil-with-new-chest', trigger('good-received', 'good-gained', 'after'), 'optional', 'once-per-event', [
      exchange([item('silver')], [item('oil')], 'up-to-event-amount'),
    ], eventIs('goodId', 'in', ['chest', 'treasure-chest'])),
  ]),
  rule(29, 'inventory', 'mandatory', [clause('meat-pairs', play, 'mandatory', 'once-per-card', [gain(
    item('salt-meat', qCount('goods', { pairedIds: ['game-meat', 'whale-meat'], location: 'supply' })),
  )])]),
  rule(30, 'inventory', 'mandatory', [clause('silk-tier-silver', play, 'mandatory', 'once-per-card', [gain(
    item('silver', qTier('goods', [{ exactly: 1, value: 1 }, { exactly: 2, value: 3 }, { atLeast: 3, value: 6 }], 0, { id: 'silk', location: 'supply' })),
  )])]),
  rule(31, 'inventory', 'mandatory', [clause('fourth-copy', play, 'mandatory', 'once-per-card', [gain(
    item('good', 1, { id: '$selected-type', state: { mustHaveExactly: 3, excludeAnimals: true, locations: ['supply'] } }),
  )], metric('goods', 'contains', 3, { location: 'supply', someTypeExactly: 3, excludeAnimals: true }))]),
  rule(32, 'weapon', 'mandatory', [clause('weapons-by-longships', play, 'mandatory', 'once-per-card', [
    { kind: 'draw-weapons', quantity: qTier('ships', [{ exactly: 0, value: 0 }, { exactly: 1, value: 2 }, { exactly: 2, value: 5 }, { atLeast: 3, value: 10 }], 0, { type: 'longship' }), selection: 'random' },
  ])]),
  rule(33, 'livestock', 'mandatory', [clause('wool-by-sheep', play, 'mandatory', 'once-per-card', [gain(
    item('wool', qTier('goods', [{ atLeast: 3, value: 1 }, { atLeast: 4, value: 2 }, { atLeast: 6, value: 3 }], 0, { animal: 'sheep', location: 'stable', includePregnant: true })),
  )])]),
  rule(34, 'livestock', 'mandatory', [
    clause('shepherd-milk', play, 'mandatory', 'once-per-card', [gain(item('milk'))], metric('goods', 'gte', 2, { animal: 'sheep', location: 'stable', includePregnant: true })),
    clause('shepherd-wool', play, 'mandatory', 'once-per-card', [gain(item('wool', qTier('goods', [{ atLeast: 2, value: 1 }, { atLeast: 4, value: 2 }], 0, { animal: 'sheep', location: 'stable', includePregnant: true })))]),
  ]),
  rule(35, 'phase', 'optional', [clause('private-breeding', play, 'optional', 'once-per-card', [{ kind: 'phase', phase: 'breeding', scope: 'self' }])]),
  rule(36, 'conversion', 'optional', [clause('meat-upgrade-before-trade', trigger('action-started', 'overseas-trading', 'before'), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 1, allowedGoods: ['salt-meat', 'game-meat', 'whale-meat'] } },
  ])]),
  rule(37, 'conversion', 'optional', [clause('upgrade-before-trade', trigger('action-started', 'overseas-trading', 'before'), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 1 } },
  ])]),
  rule(38, 'phase', 'optional', [clause('resource-instead-of-weapon', trigger('phase-started', 'new-weapon', 'instead'), 'replacement', 'once-per-round', [
    { kind: 'replace', target: 'weapon-draw', parameters: { exactlyOne: true }, replacement: [{ kind: 'choice', min: 1, max: 1, options: [
      { id: 'wood', operations: [gain(item('wood'))] }, { id: 'stone', operations: [gain(item('stone'))] }, { id: 'ore', operations: [gain(item('ore'))] },
    ] }] },
  ])]),
  rule(39, 'placement', 'optional', [clause('remove-ship-ore', anytime, 'optional', 'unlimited', [
    { kind: 'move', subject: item('ore'), from: 'whaling-boat-or-longship', to: 'supply', parameters: { excludePrintedOre: true } },
  ])]),
  rule(40, 'placement', 'optional', [clause('wood-as-house-silver', anytime, 'optional', 'unlimited', [
    { kind: 'modify-rule', rule: 'placement-material', value: 'wood-as-silver', parameters: { boards: ['stone-house', 'long-house'], emptyCellsOnly: true } },
  ])]),
];

const RULES_041_080: FeastOccupationRule[] = [
  rule(41, 'conversion', 'optional', [clause('after-bonus-oil', trigger('phase-resolved', 'bonus', 'after'), 'optional', 'once-per-round', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'silver', operations: [exchange([item('silver')], [item('oil')])] },
      { id: 'mead', operations: [exchange([item('mead')], [item('oil')])] },
    ] },
  ])]),
  rule(42, 'placement', 'optional', [clause('shed-resource-before-income', trigger('phase-started', 'income', 'before'), 'optional', 'once-per-round', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'wood', operations: [{ kind: 'move', subject: item('wood'), from: 'supply', to: 'empty-shed-cell' }, gain(item('silver'))] },
      { id: 'stone', operations: [{ kind: 'move', subject: item('stone'), from: 'supply', to: 'empty-shed-cell' }, gain(item('silver'))] },
    ] },
  ])]),
  rule(43, 'inventory', 'mandatory', [clause('take-fruits', play, 'mandatory', 'once-per-card', [gain(item('fruits'))])]),
  rule(44, 'conversion', 'optional', [clause('tailor-exchange', anytime, 'optional', 'unlimited', [
    exchange([item('hide'), item('wool'), item('linen')], [item('clothing'), item('silver', 3)]),
  ])]),
  rule(45, 'conversion', 'optional', [clause('pirate-exchange', anytime, 'optional', 'unlimited', [
    exchange([item('wood'), item('silver', 6)], [item('treasure-chest')]),
  ])]),
  rule(46, 'ship', 'optional', [clause('architect-longship', anytime, 'optional', 'unlimited', [
    { kind: 'choice', min: 1, max: 1, options: [
      { id: 'wool-sail', operations: [exchange([item('wood', 3), item('wool')], [item('longship')], 'once', { shipBuildingAction: false })] },
      { id: 'linen-sail', operations: [exchange([item('wood', 3), item('linen')], [item('longship')], 'once', { shipBuildingAction: false })] },
    ] },
  ], metric('empty-berths', 'gte', 1, { berth: 'large' }))]),
  rule(47, 'conversion', 'optional', [clause('salt-meat-to-hide', anytime, 'optional', 'unlimited', [exchange([item('salt-meat')], [item('hide')], 'unlimited')])]),
  rule(48, 'livestock', 'optional', [clause('cattle-to-jewelry', anytime, 'optional', 'unlimited', [
    exchange([item('farm-animal', 1, { id: 'cattle', state: { pregnancy: 'either', location: 'stable' } })], [item('jewelry')], 'once'),
  ])]),
  rule(49, 'compound', 'optional', [clause('plow-cattle', anytime, 'optional', 'unlimited', [
    exchange([item('farm-animal', 1, { id: 'cattle', state: { pregnancy: 'either', location: 'stable' } })], [
      item('peas'), item('flax'), item('beans'), item('grain'), item('cabbage'),
    ], 'once'),
    { kind: 'grant-action', action: 'harvest', parameters: { classificationOnly: true, rewardsAlreadyApplied: true } },
  ])]),
  rule(50, 'conversion', 'optional', [clause('rune-to-hide', anytime, 'optional', 'unlimited', [exchange([item('rune-stone')], [item('hide')], 'unlimited')])]),
  rule(51, 'conversion', 'optional', [clause('mason-exchange', anytime, 'optional', 'unlimited', [
    pay(item('rune-stone')),
    gain(item('silver')),
    { kind: 'choice', min: 1, max: 1, options: [
      { id: 'milk', operations: [gain(item('milk'))] }, { id: 'cabbage', operations: [gain(item('cabbage'))] },
    ] },
  ])]),
  rule(52, 'conversion', 'optional', [clause('tutor-play', anytime, 'optional', 'unlimited', [
    pay(item('silver')), { kind: 'grant-action', action: 'play-occupation', parameters: { source: 'hand', count: 1 } },
  ])]),
  rule(53, 'conversion', 'optional', [clause('orange-to-red', anytime, 'optional', 'unlimited', [
    pay(item('silver')), { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 1, originColor: 'orange', destinationColor: 'red' } },
  ])]),
  rule(54, 'conversion', 'optional', [clause('silverware-trade', anytime, 'optional', 'unlimited', [
    { kind: 'choice', min: 1, max: 1, options: [
      { id: 'silk', operations: [exchange([item('silverware')], [item('silk')])] },
      { id: 'chest', operations: [exchange([item('silverware')], [item('chest')])] },
    ] },
  ])]),
  rule(55, 'conversion', 'optional', [clause('chest-upgrade', anytime, 'optional', 'unlimited', [
    exchange([item('silver', 3), item('chest')], [item('treasure-chest')]),
  ])]),
  rule(56, 'weapon', 'optional', [clause('weapons-to-ore', anytime, 'optional', 'unlimited', [
    exchange([item('weapon-card', 2, { state: { anyTypes: true } })], [item('ore')]),
  ])]),
  rule(57, 'conversion', 'optional', [clause('beans-combination', anytime, 'optional', 'unlimited', [
    exchange([item('beans', 2)], [item('peas'), item('mead'), item('stockfish')]),
  ])]),
  rule(58, 'conversion', 'optional', [clause('flax-to-oil', anytime, 'optional', 'unlimited', [exchange([item('flax', 2)], [item('oil', 3)])])]),
  rule(59, 'conversion', 'optional', [clause('weave-linen', anytime, 'optional', 'unlimited', [exchange([item('flax', 2), item('silver')], [item('linen', 2)])])]),
  rule(60, 'worker', 'optional', [clause('inspect-action-space', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'one-worker', operations: [{ kind: 'return-workers', quantity: 1, parameters: { from: 'one-action-space', to: 'thing-square', soloActiveColorOnly: true } }] },
      { id: 'two-workers', operations: [pay(item('silver', { kind: 'round' })), { kind: 'return-workers', quantity: 2, parameters: { from: 'one-action-space', to: 'thing-square', sameSpace: true, soloActiveColorOnly: true } }] },
    ] },
  ])]),
  rule(61, 'ship', 'optional', [clause('sell-longship', play, 'optional', 'once-per-card', [
    exchange([item('longship', 1, { state: { discardAllOre: true } })], [item('silver', 8)], 'once'),
  ])]),
  rule(62, 'special-tile', 'optional', [clause('blacksmith-special', play, 'optional', 'once-per-card', [
    pay(item('ore'), item('silver')),
    { kind: 'choice', min: 1, max: 1, options: [
      { id: 'crucifix', operations: [gain(item('special-tile', 1, { id: 'crucifix' }))] },
      { id: 'cloakpin', operations: [gain(item('special-tile', 1, { id: 'cloakpin' }))] },
    ] },
  ], { kind: 'any', terms: [available('crucifix'), available('cloakpin')] })]),
  rule(63, 'compound', 'optional', [clause('hornturner-options', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 2, options: [
      { id: 'butcher-sheep', operations: [exchange(
        [item('farm-animal', 1, { id: 'sheep', state: { pregnancy: 'either', location: 'stable' } })],
        [item('salt-meat'), item('hide'), item('wool')],
      )] },
      { id: 'buy-drinking-horn', operations: [pay(item('silver', 3)), gain(item('special-tile', 1, { id: 'drinking-horn' }))] },
    ] },
  ])]),
  rule(64, 'ship', 'optional', [clause('upgrade-whaler-to-longship', play, 'optional', 'once-per-card', [
    exchange([item('silver', 2), item('whaling-boat', 1, { state: { discardAllOre: true } })], [item('longship')], 'once', { shipBuildingAction: false }),
  ], metric('empty-berths', 'gte', 1, { berth: 'large' }))]),
  rule(65, 'weapon', 'optional', [clause('dragon-slayer-trade', play, 'optional', 'once-per-card', [
    exchange([item('snare', 2), item('spear', 2)], [item('treasure-chest')]),
  ])]),
  rule(66, 'conversion', 'optional', [clause('diagonal-farm-upgrade', play, 'optional', 'once-per-card', [
    pay(item('silver')), { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, originColor: 'orange', geometry: 'diagonal-up-right', stepsMin: 1, stepsMax: 2 } },
  ])]),
  rule(67, 'conversion', 'optional', [clause('chef-bundle', play, 'optional', 'once-per-card', [
    exchange([item('silver', 4)], [item('silverware', 2), item('game-meat'), item('mead')]),
  ])]),
  rule(68, 'weapon', 'optional', [clause('draw-four-weapons', play, 'optional', 'once-per-card', [{ kind: 'draw-weapons', quantity: 4, selection: 'random' }])]),
  rule(69, 'weapon', 'mandatory', [clause('fill-two-each-weapon', play, 'mandatory', 'once-per-card', [
    { kind: 'draw-weapons', quantity: 2, selection: 'fill-to-count', named: ['bow', 'snare', 'spear', 'long-sword'] },
  ])]),
  rule(70, 'special-tile', 'optional', [clause('reclaim-cloakpin', play, 'optional', 'once-per-card', [
    { kind: 'move', subject: item('special-tile', 1, { id: 'cloakpin' }), from: 'any-player-board', to: 'owner-supply' },
    gainTo('vacated-cloakpin-cells', item('silverware'), item('rune-stone')),
  ], eventIs('cloakpinLocation', 'eq', 'board'))]),
  rule(71, 'special-tile', 'optional', [clause('reclaim-drinking-horn', play, 'optional', 'once-per-card', [
    { kind: 'move', subject: item('special-tile', 1, { id: 'drinking-horn' }), from: 'any-player-board', to: 'owner-supply' },
    gainTo('vacated-drinking-horn-cells', item('chest'), item('rune-stone')),
  ], eventIs('drinkingHornLocation', 'eq', 'board'))]),
  rule(72, 'building', 'optional', [clause('buy-round-cost-house', play, 'optional', 'once-per-card', [
    exchange([item('silver', { kind: 'round' })], [item('stone-house')], 'once', { houseBuildingAction: false }),
  ], available('stone-house'))]),
  rule(73, 'special-tile', 'optional', [clause('metalsmith-choice', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'silverware', operations: [gain(item('silverware'))] },
      { id: 'crucifix', operations: [pay(item('silver', 2)), gain(item('special-tile', 1, { id: 'crucifix' }))] },
      { id: 'chalice', operations: [pay(item('silver', 5)), gain(item('special-tile', 1, { id: 'chalice' }))] },
    ] },
  ])]),
  rule(74, 'livestock', 'optional', [clause('buy-cattle-with-grain', play, 'optional', 'once-per-card', [
    exchange([item('silver', 2), item('grain')], [item('cattle', 1, { state: { pregnant: false, destination: 'stable' } })]),
  ])]),
  rule(75, 'conversion', 'optional', [clause('buy-skin-bones', play, 'optional', 'once-per-card', [exchange([item('silver')], [item('skin-and-bones')])])]),
  rule(76, 'worker', 'optional', [clause('return-fourth-column-workers', play, 'optional', 'once-per-card', [
    { kind: 'return-workers', quantity: qCount('workers-on-spaces', { column: 4, onePerOccupiedSpace: true, countCurrentWorkers: true }), parameters: { from: 'each-fourth-column-space', maximumPerSpace: 1, to: 'thing-square', soloActiveColorOnly: true } },
  ])]),
  rule(77, 'action-grant', 'optional', [clause('follow-occupied-second-column', play, 'optional', 'once-per-card', [
    { kind: 'grant-action', action: 'action-space', parameters: { column: 2, occupied: true, placeWorkers: false, failureReturnsWorkers: false } },
  ])]),
  rule(78, 'conversion', 'optional', [clause('flip-goods-by-knarrs', play, 'optional', 'once-per-card', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: {
      mode: 'flip-to-other-side', classifiedAsUpgrade: false,
      count: { kind: 'tier', metric: 'ships', filter: { type: 'knarr' }, tiers: [{ exactly: 1, value: 2 }, { exactly: 2, value: 4 }, { exactly: 3, value: 6 }, { atLeast: 4, value: 7 }], default: 0 },
    } },
  ])]),
  rule(79, 'livestock', 'optional', [clause('make-cattle-pregnant', play, 'optional', 'once-per-card', [
    exchange([item('cattle', 1, { state: { pregnant: false, location: 'stable' } })], [item('pregnant-cattle', 1, { state: { destination: 'stable' } })], 'once', { breedingPhase: false }),
  ])]),
  rule(80, 'livestock', 'optional', [clause('buy-sheep', play, 'optional', 'once-per-card', [
    exchange([item('silver', 2)], [item('sheep', 1, { state: { pregnant: false, destination: 'stable' } })]),
  ])]),
];

const RULES_081_120: FeastOccupationRule[] = [
  rule(81, 'ship', 'optional', [clause('weapon-discount-longship', play, 'optional', 'once-per-card', [
    { kind: 'grant-action', action: 'buy-ship', parameters: {
      ship: 'longship', baseSilverCost: 8, floor: 0, roundFinalCost: 'down',
      discount: { longSword: 1, bow: 0.5, spear: 0.5, snare: 0 },
    } },
  ], metric('empty-berths', 'gte', 1, { berth: 'large' }))]),
  rule(82, 'ship', 'optional', [clause('knarr-discount-longship', play, 'optional', 'once-per-card', [
    { kind: 'grant-action', action: 'buy-ship', parameters: {
      ship: 'longship', silverCost: { kind: 'tier', metric: 'ships', filter: { type: 'knarr' }, tiers: [{ exactly: 0, value: 8 }, { exactly: 1, value: 6 }, { exactly: 2, value: 3 }, { atLeast: 3, value: 1 }], default: 8 },
    } },
  ], metric('empty-berths', 'gte', 1, { berth: 'large' }))]),
  rule(83, 'conversion', 'optional', [clause('four-same-goods-upgrade', play, 'optional', 'once-per-card', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: { min: 0, max: 4, steps: 1, allSameType: true, pregnancyStatesSameType: true } },
  ])]),
  rule(84, 'ship', 'optional', [clause('discounted-emigration', play, 'optional', 'once-per-card', [
    { kind: 'grant-action', action: 'emigration', parameters: {
      baseSilverCost: { kind: 'round' }, discountPerLargeShipBeforeEmigration: 1, floor: 0,
    } },
  ])]),
  rule(85, 'action-grant', 'optional', [clause('hornblower-actions', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 2, options: [
      { id: 'hunt', operations: [pay(item('silver')), { kind: 'grant-action', action: 'hunting-game', parameters: { failureReturnsWorkers: false } }] },
      { id: 'snare', operations: [pay(item('silver', 2)), { kind: 'grant-action', action: 'laying-snare', parameters: { failureReturnsWorkers: false } }] },
    ] },
  ])]),
  rule(86, 'conversion', 'optional', [clause('buy-hides', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'one', operations: [exchange([item('silver', 2)], [item('hide')])] },
      { id: 'two', operations: [exchange([item('silver', 4)], [item('hide', 2)])] },
      { id: 'three', operations: [exchange([item('silver', 6)], [item('hide', 3)])] },
    ] },
  ])]),
  rule(87, 'compound', 'optional', [clause('preacher-choice', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'crucifix', operations: [gain(item('special-tile', 1, { id: 'crucifix' }))] },
      { id: 'mountain-four', operations: [{ kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [4], sameStrip: true } }] },
    ] },
  ])]),
  rule(88, 'conversion', 'optional', [clause('paid-up-left-before-trade', trigger('action-started', 'overseas-trading', 'before'), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: {
      geometry: 'diagonal-up-left', steps: 1, silverCostEach: 1,
      max: { kind: 'count', metric: 'ships', filter: { type: 'knarr' } },
    } },
  ])]),
  rule(89, 'dice', 'mandatory', [clause('stone-plus-two', trigger('die-rolled', 'dice-action'), 'mandatory', 'once-per-event', [
    { kind: 'modify-die', actions: ['raiding', 'pillaging'], delta: 2, per: item('stone'), parameters: { replacesNormalSpendValue: true } },
  ], eventIs('action', 'in', ['raiding', 'pillaging']))]),
  rule(90, 'dice', 'optional', [clause('raid-ore-plus-two', trigger('action-started', 'raiding', 'before'), 'optional', 'once-per-action', [
    { kind: 'move', subject: item('ore'), from: 'selected-raiding-longship', to: 'general-supply' },
    { kind: 'modify-die', actions: ['raiding'], delta: 2, parameters: { appliesToEveryRollThisAction: true } },
  ], eventIs('shipId', 'neq', ''))]),
  rule(91, 'action-grant', 'optional', [clause('latecomer-space', trigger('phase-resolved', 'actions', 'after'), 'optional', 'once-per-round', [
    pay(item('silver')),
    { kind: 'grant-action', action: 'action-space', parameters: {
      column: 1, occupied: false, placeWorkers: false, adjacentVerticalToOwnWorkerInColumn1: true, soloActiveColorOnly: true,
    } },
  ])]),
  rule(92, 'phase', 'mandatory', [clause('no-harvest-special-silver', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'mandatory', 'once-per-round', [
    gain(item('silver', qTier('special-tiles', [{ exactly: 3, value: 1 }, { exactly: 4, value: 2 }, { atLeast: 5, value: 3 }], 0, { locations: ['supply', 'boards'] }))),
  ])]),
  rule(93, 'phase', 'mandatory', [
    clause('one-boat-beans', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'mandatory', 'once-per-round', [gain(item('beans'))], metric('ships', 'eq', 1, { type: 'whaling-boat' })),
    clause('two-boats-grain', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'mandatory', 'once-per-round', [gain(item('grain'))], metric('ships', 'eq', 2, { type: 'whaling-boat' })),
    clause('three-boats-cabbage', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'mandatory', 'once-per-round', [gain(item('cabbage'))], metric('ships', 'eq', 3, { type: 'whaling-boat' })),
  ]),
  rule(94, 'phase', 'optional', [clause('no-harvest-oil-spices', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'optional', 'once-per-round', [
    exchange([item('oil', 2)], [item('spices')]),
  ])]),
  rule(95, 'phase', 'optional', [clause('no-harvest-mountain-two', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'optional', 'once-per-round', [
    { kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [2], sameStrip: true } },
  ])]),
  rule(96, 'phase', 'optional', [clause('no-harvest-meat-exchange', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'choice', 'once-per-round', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'game-to-whale', operations: [exchange([item('game-meat')], [item('whale-meat')])] },
      { id: 'whale-to-game', operations: [exchange([item('whale-meat')], [item('game-meat', 2)])] },
    ] },
  ])]),
  rule(97, 'phase', 'optional', [clause('no-harvest-double-peas', trigger('phase-started', 'harvest', 'during', { harvest: false }), 'optional', 'once-per-round', [
    gain(item('peas', qTier('goods', [
      { exactly: 1, value: 1 }, { exactly: 2, value: 2 }, { exactly: 3, value: 3 }, { exactly: 4, value: 4 },
      { exactly: 5, value: 3 }, { exactly: 6, value: 2 }, { exactly: 7, value: 1 }, { atLeast: 8, value: 0 },
    ], 0, { id: 'peas', location: 'supply' }))),
  ])]),
  rule(98, 'placement', 'optional', [clause('grain-house-buy-silk', trigger('tile-placed', 'tile-placement', 'after'), 'optional', 'once-per-event', [
    exchange([item('silver', 2)], [item('silk')]),
  ], all(eventIs('pieceId', 'eq', 'grain'), eventIs('boardKind', 'in', ['stone-house', 'long-house'])))]),
  rule(99, 'action-replacement', 'optional', [clause('play-instead-of-draw', trigger('occupation-received', 'occupation-gained', 'instead'), 'replacement', 'once-per-event', [
    { kind: 'replace', target: 'reward', parameters: { original: 'occupation-card', eachCardIndependently: true }, replacement: [{ kind: 'grant-action', action: 'play-occupation', parameters: { source: 'hand', count: 1 } }] },
  ])]),
  rule(100, 'placement', 'mandatory', [clause('rune-on-exploration-silver', trigger('tile-placed', 'tile-placement', 'after'), 'mandatory', 'once-per-event', [gain(item('silver'))],
    all(eventIs('pieceId', 'eq', 'rune-stone'), eventIs('boardKind', 'eq', 'exploration')))]),
  rule(101, 'placement', 'mandatory', [clause('rune-in-house-reward', trigger('tile-placed', 'tile-placement', 'after'), 'mandatory', 'once-per-event', [gain(item('mead'), item('silver'))],
    all(eventIs('pieceId', 'eq', 'rune-stone'), eventIs('boardKind', 'in', ['stone-house', 'long-house'])))]),
  rule(102, 'action-replacement', 'optional', [clause('fur-instead-of-one-upgrade', trigger('action-proposed', 'upgrade-action', 'instead'), 'replacement', 'once-per-action', [
    { kind: 'replace', target: 'action', parameters: { printedActionOnly: true, originalSteps: 1, originalCount: 1 }, replacement: [{ kind: 'choice', min: 0, max: 1, options: [
      { id: 'game-meat', operations: [exchange([item('game-meat')], [item('fur')])] },
      { id: 'silk', operations: [exchange([item('silk')], [item('fur')])] },
    ] }] },
  ], all(eventIs('upgradeSteps', 'eq', 1), eventIs('upgradeCountCapacity', 'eq', 1)))]),
  rule(103, 'action-grant', 'optional', [clause('mountain-before-ore-crafting', trigger('action-started', 'crafting', 'before', { actionSpaceIds: ['craft-chest', 'forge'], selectedPayment: 'ore' }), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [1], buildingResourcesOnly: true } },
  ])]),
  rule(104, 'dice', 'optional', [clause('early-raid-failure-reward', trigger('die-resolved', 'raiding', 'after'), 'choice', 'once-per-action', [
    { kind: 'choice', min: 1, max: 1, options: [
      { id: 'stockfish', operations: [gain(item('stockfish'))] }, { id: 'oil', operations: [gain(item('oil'))] },
    ] },
  ], all(eventIs('success', 'eq', false), eventIs('rollsUsed', 'lte', 2), eventIs('declaredFailure', 'eq', true)))]),
  rule(105, 'action-replacement', 'optional', [clause('knarr-instead-of-whaler', trigger('action-proposed', 'ship-building', 'instead', { actionSpaceId: 'build-whaling-boat' }), 'replacement', 'once-per-action', [
    { kind: 'replace', target: 'ship', parameters: { original: 'whaling-boat', classifiedAsShipBuilding: true }, replacement: [exchange([item('wood', 3)], [item('knarr')])] },
  ])]),
  rule(106, 'worker', 'mandatory', [clause('reduced-plunder-workers', trigger('action-proposed', 'plundering', 'before'), 'mandatory', 'once-per-action', [
    { kind: 'modify-rule', rule: 'worker-cost', value: qTier('ships', [{ exactly: 3, value: 3 }, { atLeast: 4, value: 2 }], 4, { type: 'longship' }), parameters: { action: 'plundering', normalWorkers: 4 } },
  ])]),
  rule(107, 'action-replacement', 'optional', [clause('far-exploration-on-short-space', trigger('action-proposed', 'exploration', 'instead', { actionSpaceId: 'explore-short' }), 'replacement', 'once-per-action', [
    { kind: 'replace', target: 'reward', parameters: { originalBoards: ['shetland', 'faroe-islands'] }, replacement: [{ kind: 'transfer', mode: 'gain', items: [item('exploration-board', 1, { id: '$any-face-up', state: { excludeFaces: ['shetland', 'faroe-islands'] } })] }] },
    { kind: 'modify-rule', rule: 'action-eligibility', value: 'any-ship', parameters: { action: 'exploration', appliesToReplacement: true } },
  ])]),
  rule(108, 'worker', 'optional', [clause('ore-crafting-return-worker', trigger('action-resolved', 'crafting', 'after', { actionSpaceIds: ['craft-chest', 'forge'], selectedPayment: 'ore' }), 'optional', 'once-per-action', [
    pay(item('silver')), { kind: 'return-workers', quantity: 1, parameters: { from: 'resolving-action-space', to: 'thing-square' } },
  ])]),
  rule(109, 'action-reward', 'mandatory', [clause('two-worker-trade-silver', trigger('action-resolved', 'overseas-trading', 'after', { workers: 2 }), 'mandatory', 'once-per-action', [
    gain(item('silver', qCount('ships', { type: 'knarr' }))),
  ])]),
  rule(110, 'action-grant', 'optional', [clause('emigrate-after-two-worker-trade', trigger('action-resolved', 'overseas-trading', 'after', { workers: 2 }), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'emigration', parameters: { normalRulesAndCost: true } },
  ])]),
  rule(111, 'action-reward', 'mandatory', [clause('craft-resource-types-silver', trigger('action-resolved', 'crafting', 'after'), 'mandatory', 'once-per-action', [
    gain(item('silver', { kind: 'event', field: 'distinctBuildingResourceTypesPaid' })),
  ], eventIs('distinctBuildingResourceTypesPaid', 'gte', 1))]),
  rule(112, 'action-reward', 'mandatory', [clause('craft-mead', trigger('action-resolved', 'crafting', 'after'), 'mandatory', 'once-per-action', [gain(item('mead'))])]),
  rule(113, 'action-grant', 'optional', [clause('mountain-before-craft', trigger('action-started', 'crafting', 'before'), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [1], buildingResourcesOnly: true } },
  ])]),
  rule(114, 'conversion', 'optional', [clause('silk-after-craft', trigger('action-resolved', 'crafting', 'after'), 'optional', 'once-per-action', [exchange([item('silver', 3)], [item('silk')])])]),
  rule(115, 'action-reward', 'mandatory', [clause('silverware-with-house-space', trigger('action-resolved', 'house-building', 'after'), 'mandatory', 'once-per-action', [gain(item('silverware'))])]),
  rule(116, 'action-cost', 'mandatory', [clause('stone-house-discount', trigger('action-proposed', 'house-building', 'before'), 'mandatory', 'once-per-action', [
    { kind: 'discount', target: 'house-building', amount: 1, floor: 0, parameters: { currency: 'stone', houseTypes: ['stone-house', 'long-house'], includeShedIfStoneCost: true } },
  ])]),
  rule(117, 'conversion', 'optional', [clause('upgrade-after-large-ship-build', trigger('ship-acquired', 'ship-gained', 'after'), 'optional', 'once-per-event', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 1 } },
  ], all(eventIs('shipType', 'in', ['knarr', 'longship']), eventIs('woodPaid', 'gte', 1), eventIs('classifiedAsShipBuilding', 'eq', true)))]),
  rule(118, 'action-reward', 'mandatory', [clause('weekly-mead-stone', trigger('action-resolved', 'weekly-market', 'after'), 'mandatory', 'once-per-action', [gain(item('mead'), item('stone'))])]),
  rule(119, 'action-reward', 'mandatory', [clause('weekly-milk', trigger('action-resolved', 'weekly-market', 'after'), 'mandatory', 'once-per-action', [gain(item('milk'))])]),
  rule(120, 'conversion', 'optional', [clause('weekly-paid-upgrade', trigger('action-resolved', 'weekly-market', 'after'), 'optional', 'once-per-action', [
    pay(item('silver')), { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 1 } },
  ])]),
];

const RULES_121_160: FeastOccupationRule[] = [
  rule(121, 'action-grant', 'optional', [clause('mountain-before-building', [
    trigger('action-started', 'ship-building', 'before'), trigger('action-started', 'house-building', 'before'),
  ], 'optional', 'once-per-action', [{ kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [1], buildingResourcesOnly: true } }])]),
  rule(122, 'action-reward', 'optional', [
    clause('one-mountain-type-wood', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('wood'))],
      all(eventIs('distinctMountainItemTypes', 'eq', 1), eventIs('mountainItemTypes', 'contains', 'wood'))),
    clause('one-mountain-type-stone', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('stone'))],
      all(eventIs('distinctMountainItemTypes', 'eq', 1), eventIs('mountainItemTypes', 'contains', 'stone'))),
    clause('one-mountain-type-ore', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('ore'))],
      all(eventIs('distinctMountainItemTypes', 'eq', 1), eventIs('mountainItemTypes', 'contains', 'ore'))),
    clause('one-mountain-type-silver', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('silver', 2))],
      all(eventIs('distinctMountainItemTypes', 'eq', 1), eventIs('mountainItemTypes', 'contains', 'silver'))),
    clause('two-mountain-types', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('mead'))], eventIs('distinctMountainItemTypes', 'eq', 2)),
    clause('three-mountain-types', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('hide'))], eventIs('distinctMountainItemTypes', 'eq', 3)),
    clause('four-mountain-types', trigger('action-resolved', 'mountain-action', 'after'), 'optional', 'once-per-action', [gain(item('chest'))], eventIs('distinctMountainItemTypes', 'eq', 4)),
  ]),
  rule(123, 'conversion', 'optional', [clause('oil-after-one-upgrade', trigger('action-resolved', 'upgrade-action', 'after'), 'optional', 'once-per-action', [
    exchange([item('oil')], [item('silverware')]),
  ], all(eventIs('upgradeCountCapacity', 'eq', 1), eventIs('upgradeCount', 'eq', 1),
    eventIs('upgradeSteps', 'eq', 1), eventIs('source', 'eq', 'action-space')))]),
  rule(124, 'conversion', 'optional', [clause('spend-exact-two-reward', trigger('action-resolved', 'viking-action', 'after'), 'optional', 'once-per-action', [
    exchange([item('silver', 2, { state: { useEventReward: true } })], [item('grain'), item('wood', 2)]),
  ], eventIs('printedSilverReward', 'eq', 2))]),
  rule(125, 'action-reward', 'mandatory', [clause('rune-on-travel', [
    trigger('action-resolved', 'exploration', 'after'), trigger('action-resolved', 'emigration', 'after'),
  ], 'mandatory', 'once-per-action', [gain(item('rune-stone'))])]),
  rule(126, 'action-reward', 'mandatory', [clause('snare-success-silver', trigger('die-resolved', 'laying-snare', 'after'), 'mandatory', 'once-per-action', [gain(item('silver'))], eventIs('success', 'eq', true))]),
  rule(127, 'action-reward', 'mandatory', [clause('snare-success-stockfish', trigger('die-resolved', 'laying-snare', 'after'), 'mandatory', 'once-per-action', [gain(item('stockfish'))], eventIs('success', 'eq', true))]),
  rule(128, 'action-grant', 'mandatory', [clause('snare-success-mountain', trigger('die-resolved', 'laying-snare', 'after'), 'mandatory', 'once-per-action', [
    { kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [1], buildingResourcesOnly: true } },
  ], eventIs('success', 'eq', true))]),
  rule(129, 'conversion', 'optional', [clause('snare-success-cure-meat', trigger('die-resolved', 'laying-snare', 'after'), 'optional', 'once-per-action', [
    exchange([item('snare')], [item('salt-meat')]),
  ], eventIs('success', 'eq', true))]),
  rule(130, 'worker', 'optional', [clause('snare-worker-refund', trigger('die-resolved', 'laying-snare', 'after'), 'optional', 'once-per-action', [
    discard(item('snare', 2)), { kind: 'return-workers', quantity: 1, parameters: { from: 'resolving-action-space', to: 'thing-square', placedByThisAction: true } },
  ], all(eventIs('success', 'eq', true), eventIs('source', 'eq', 'action-space'), eventIs('workers', 'eq', 2)))]),
  rule(131, 'conversion', 'optional', [clause('bait-exchange', trigger('die-resolved', 'laying-snare', 'after'), 'optional', 'once-per-action', [
    exchange([item('stockfish')], [item('game-meat')]),
  ])]),
  rule(132, 'dice', 'optional', [clause('pillage-ore-plus-three', trigger('action-started', 'pillaging', 'before'), 'optional', 'once-per-action', [
    { kind: 'move', subject: item('ore'), from: 'selected-pillaging-longship', to: 'general-supply' },
    { kind: 'modify-die', actions: ['pillaging'], delta: 3, parameters: { appliesToEveryRollThisAction: true } },
  ], eventIs('shipId', 'neq', ''))]),
  rule(133, 'action-reward', 'optional', [clause('raid-success-choice', trigger('die-resolved', 'raiding', 'after'), 'choice', 'once-per-action', [
    { kind: 'choice', min: 1, max: 1, options: [
      { id: 'silver', operations: [gain(item('silver'))] }, { id: 'peas', operations: [gain(item('peas'))] },
    ] },
  ], eventIs('success', 'eq', true))]),
  rule(134, 'action-reward', 'mandatory', [clause('raid-failure-mead', trigger('die-resolved', 'raiding', 'after'), 'mandatory', 'once-per-action', [gain(item('mead'))], eventIs('success', 'eq', false))]),
  rule(135, 'weapon', 'mandatory', [clause('single-sword-refund', trigger('die-resolved', 'dice-action', 'after'), 'mandatory', 'once-per-action', [gain(item('long-sword'))],
    all(eventIs('action', 'in', ['raiding', 'pillaging']), eventIs('success', 'eq', true), eventIs('longSwordsSpent', 'eq', 1)))]),
  rule(136, 'compound', 'mandatory', [
    clause('battle-plus-one', trigger('die-rolled', 'dice-action'), 'mandatory', 'once-per-event', [{ kind: 'modify-die', actions: ['raiding', 'pillaging'], delta: 1 }], eventIs('action', 'in', ['raiding', 'pillaging'])),
    clause('split-battle-loot', trigger('die-resolved', 'dice-action', 'after'), 'optional', 'once-per-action', [{ kind: 'modify-rule', rule: 'loot-split', value: 2, parameters: { actions: ['raiding', 'pillaging'], totalSwordValueAtMostBattleResult: true } }],
      all(eventIs('action', 'in', ['raiding', 'pillaging']), eventIs('success', 'eq', true))),
  ]),
  rule(137, 'weapon', 'optional', [clause('spears-as-swords', trigger('action-started', 'dice-action', 'before'), 'optional', 'once-per-action', [
    { kind: 'modify-rule', rule: 'weapon-substitution', value: { from: 'long-sword', to: 'spear', ratio: 1 }, parameters: { actions: ['raiding', 'pillaging'], mixedUse: true } },
  ], eventIs('action', 'in', ['raiding', 'pillaging']))]),
  rule(138, 'action-replacement', 'optional', [clause('green-battle-loot', trigger('die-resolved', 'dice-action', 'after'), 'replacement', 'once-per-action', [
    { kind: 'modify-rule', rule: 'loot-color', value: 'green-instead-of-blue', parameters: { actions: ['raiding', 'pillaging'] } },
    { kind: 'modify-rule', rule: 'sword-value', value: -1, parameters: { greenTileValueFromBlueBack: true } },
  ], all(eventIs('action', 'in', ['raiding', 'pillaging']), eventIs('success', 'eq', true)))]),
  rule(139, 'dice', 'mandatory', [clause('top-special-sword-reduction', trigger('action-started', 'dice-action', 'before'), 'mandatory', 'once-per-action', [
    { kind: 'modify-rule', rule: 'sword-value', value: -1, parameters: { target: 'all-highest-value-specials-on-supply', actions: ['raiding', 'pillaging'] } },
  ], eventIs('action', 'in', ['raiding', 'pillaging']))]),
  rule(140, 'action-reward', 'mandatory', [clause('whaling-success-oil', trigger('die-resolved', 'whaling', 'after'), 'mandatory', 'once-per-action', [gain(item('oil'))], eventIs('success', 'eq', true))]),
  rule(141, 'action-reward', 'mandatory', [
    clause('one-whaler-cabbage', trigger('die-resolved', 'whaling', 'after'), 'mandatory', 'once-per-action', [gain(item('cabbage'))], all(eventIs('success', 'eq', true), eventIs('woodSpent', 'eq', 0), eventIs('whalingBoatsUsed', 'eq', 1))),
    clause('two-whalers-beans', trigger('die-resolved', 'whaling', 'after'), 'mandatory', 'once-per-action', [gain(item('beans'))], all(eventIs('success', 'eq', true), eventIs('woodSpent', 'eq', 0), eventIs('whalingBoatsUsed', 'eq', 2))),
    clause('three-whalers-peas', trigger('die-resolved', 'whaling', 'after'), 'mandatory', 'once-per-action', [gain(item('peas'))], all(eventIs('success', 'eq', true), eventIs('woodSpent', 'eq', 0), eventIs('whalingBoatsUsed', 'eq', 3))),
  ]),
  rule(142, 'weapon', 'mandatory', [clause('single-spear-whale-refund', trigger('die-resolved', 'whaling', 'after'), 'mandatory', 'once-per-action', [gain(item('spear'))],
    all(eventIs('success', 'eq', true), eventIs('spearsSpent', 'eq', 1)))]),
  rule(143, 'action-reward', 'mandatory', [clause('hunt-success-silver', trigger('die-resolved', 'hunting-game', 'after'), 'mandatory', 'once-per-action', [gain(item('silver'))], eventIs('success', 'eq', true))]),
  rule(144, 'conversion', 'optional', [clause('hunt-success-buy-skin', trigger('die-resolved', 'hunting-game', 'after'), 'optional', 'once-per-action', [exchange([item('silver', 2)], [item('skin-and-bones')])], eventIs('success', 'eq', true))]),
  rule(145, 'action-grant', 'optional', [clause('mountain-before-hunt', trigger('action-started', 'hunting-game', 'before'), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [1], buildingResourcesOnly: true } },
  ])]),
  rule(146, 'dice', 'mandatory', [clause('hunt-snare-minus-one', trigger('die-rolled', 'dice-action'), 'mandatory', 'once-per-event', [
    { kind: 'modify-die', actions: ['hunting-game', 'laying-snare'], delta: -1 },
  ], eventIs('action', 'in', ['hunting-game', 'laying-snare']))]),
  rule(147, 'action-grant', 'mandatory', [clause('knarr-as-longship', trigger('action-proposed', 'viking-action', 'before'), 'mandatory', 'once-per-action', [
    { kind: 'modify-rule', rule: 'action-eligibility', value: 'knarr-substitutes-longship', parameters: { actions: ['raiding', 'pillaging', 'plundering', 'far-exploration'], orePlacementOnKnarr: false } },
  ], metric('ships', 'gte', 1, { type: 'knarr' }))]),
  rule(148, 'conversion', 'optional', [clause('spices-after-knarr-build', trigger('ship-acquired', 'ship-gained', 'after'), 'optional', 'once-per-event', [exchange([item('silver', 3)], [item('spices')])],
    all(eventIs('shipType', 'eq', 'knarr'), eventIs('woodPaid', 'gte', 1), eventIs('classifiedAsShipBuilding', 'eq', true)))]),
  rule(149, 'action-reward', 'mandatory', [clause('oil-before-printed-trade', trigger('action-started', 'overseas-trading', 'before'), 'mandatory', 'once-per-action', [gain(item('oil'))], eventIs('source', 'eq', 'action-space'))]),
  rule(150, 'action-replacement', 'optional', [clause('replace-one-meat-pair', trigger('good-received', 'good-gained', 'instead'), 'replacement', 'once-per-event', [
    { kind: 'replace', target: 'reward', parameters: { replaceCount: 1, originalIds: ['stockfish', 'salt-meat'], originalBatchAmount: 2 }, replacement: [gain(item('game-meat'))] },
  ], all(
    eventIs('goodId', 'in', ['stockfish', 'salt-meat']), eventIs('batchAmount', 'eq', 2),
    eventIs('source', 'in', ['action-space', 'occupation']),
  ))]),
  rule(151, 'worker', 'mandatory', [clause('silver-on-worker-return', trigger('workers-returned', 'worker-return', 'after'), 'mandatory', 'once-per-event', [gain(item('silver'))], eventIs('workersReturned', 'in', [1, 2]))]),
  rule(152, 'conversion', 'optional', [clause('extra-upgrade-after-large-upgrade', trigger('action-resolved', 'upgrade-action', 'after'), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'upgrade-good', parameters: { count: 1, steps: 1, originMustBeOneOfGoodsExchangedThisAction: true } },
  ], all(eventIs('upgradeCountCapacity', 'in', [3, 4]), eventIs('upgradeSteps', 'eq', 1),
    eventIs('upgradeCount', 'gte', 1)))]),
  rule(153, 'dice', 'mandatory', [clause('four-rolls', trigger('action-started', 'dice-action', 'before'), 'mandatory', 'once-per-action', [
    { kind: 'modify-rule', rule: 'roll-limit', value: 4, parameters: { replacesNormalMaximum: 3 } },
  ])]),
  rule(154, 'action-reward', 'mandatory', [clause('wood-viking-silver', trigger('resource-received', 'resource-gained', 'after'), 'mandatory', 'once-per-action', [gain(item('silver'))],
    all(eventIs('resourceId', 'eq', 'wood'), eventIs('batchAmount', 'gte', 2), eventIs('source', 'eq', 'action-space'), eventIs('phase', 'eq', 'actions')))]),
  rule(155, 'conversion', 'optional', [clause('wood-viking-stockfish', trigger('resource-received', 'resource-gained', 'after'), 'optional', 'once-per-action', [exchange([item('wood')], [item('stockfish')])],
    all(eventIs('resourceId', 'eq', 'wood'), eventIs('batchAmount', 'gte', 2), eventIs('source', 'eq', 'action-space'), eventIs('phase', 'eq', 'actions')))]),
  rule(156, 'action-reward', 'mandatory', [clause('stone-viking-silver', trigger('resource-received', 'resource-gained', 'after'), 'mandatory', 'once-per-action', [gain(item('silver'))],
    all(eventIs('resourceId', 'eq', 'stone'), eventIs('batchAmount', 'gte', 1), eventIs('source', 'eq', 'action-space'), eventIs('phase', 'eq', 'actions')))]),
  rule(157, 'action-reward', 'mandatory', [clause('feast-animal-skin', trigger('tile-placed', 'tile-placement', 'after', { destination: 'banquet-table' }), 'mandatory', 'once-per-event', [gain(item('skin-and-bones'))],
    all(eventIs('pieceId', 'in', ['sheep', 'pregnant-sheep', 'cattle', 'pregnant-cattle']), eventIs('phase', 'eq', 'feast')))]),
  rule(158, 'compound', 'mandatory', [clause('feast-meat-weapons', trigger('tile-placed', 'tile-placement', 'after', { destination: 'banquet-table' }), 'mandatory', 'once-per-event', [
    { kind: 'draw-weapons', quantity: 3, selection: 'random' }, gain(item('silver')),
  ], all(eventIs('pieceId', 'in', ['game-meat', 'whale-meat']), eventIs('phase', 'eq', 'feast')))]),
  rule(159, 'action-grant', 'optional', [clause('hunt-after-game-meat-feast', trigger('phase-resolved', 'feast', 'after'), 'optional', 'once-per-round', [
    { kind: 'grant-action', action: 'hunting-game', parameters: { placeWorkers: false } },
  ], eventIs('gameMeatPlacedThisFeast', 'gte', 1))]),
  rule(160, 'phase', 'optional', [clause('no-mead-feast-silver', trigger('phase-started', 'feast', 'during'), 'optional', 'once-per-round', [gain(item('silver'))],
    eventIs('declaredMeadPlacements', 'eq', 0))]),
];

const RULES_161_190: FeastOccupationRule[] = [
  rule(161, 'phase', 'mandatory', [clause('third-column-bonus-cabbage', trigger('phase-started', 'bonus', 'during'), 'mandatory', 'once-per-round', [gain(item('cabbage'))],
    metric('workers-on-spaces', 'gte', 7, { column: 3, countCurrentWorkers: true }))]),
  rule(162, 'phase', 'mandatory', [clause('second-column-bonus-flax', trigger('phase-started', 'bonus', 'during'), 'mandatory', 'once-per-round', [gain(item('flax'))],
    metric('workers-on-spaces', 'gte', 7, { column: 2, countCurrentWorkers: true }))]),
  rule(163, 'action-reward', 'mandatory', [clause('two-worker-hunt-reward', trigger('die-resolved', 'hunting-game', 'after', { imitate: false }), 'mandatory', 'once-per-action', [gain(item('hide'), item('silver'))],
    all(eventIs('success', 'eq', true), eventIs('source', 'eq', 'action-space'), eventIs('column', 'eq', 2), eventIs('workers', 'eq', 2)))]),
  rule(164, 'action-grant', 'optional', [clause('resource-before-fourth-column', trigger('workers-placed', 'worker-placement', 'before', { column: 4, count: 4, imitate: false }), 'optional', 'once-per-action', [
    { kind: 'grant-action', action: 'mountain-take', parameters: { allowances: [1], allowedItems: ['stone', 'ore'] } },
  ])]),
  rule(165, 'phase', 'mandatory', [clause('clothing-feast-silver', trigger('phase-started', 'feast', 'when'), 'mandatory', 'once-per-round', [gain(item('silver', 2))],
    metric('goods', 'gte', 1, { id: 'clothing', location: 'supply' }))]),
  rule(166, 'weapon', 'optional', [clause('second-column-later-weapon', trigger('workers-placed', 'worker-placement', 'before', { column: 2, count: 2, imitate: false }), 'optional', 'once-per-action', [
    { kind: 'draw-weapons', quantity: 1, selection: 'random' },
  ], eventIs('matchingPlacementsEarlierThisRound', 'gte', 1))]),
  rule(167, 'phase', 'mandatory', [clause('spices-feast-silver', trigger('phase-started', 'feast', 'when'), 'mandatory', 'once-per-round', [
    gain(item('silver', qTier('goods', [{ exactly: 1, value: 1 }, { atLeast: 2, value: 2 }], 0, { id: 'spices', location: 'supply' }))),
  ])]),
  rule(168, 'worker', 'mandatory', [clause('thing-exactly-three', trigger('thing-count-changed', 'thing-count', 'after'), 'mandatory', 'once-per-event', [gain(item('silver'))],
    eventIs('newCount', 'eq', 3))]),
  rule(169, 'phase', 'mandatory', [
    clause('extra-flax-harvest', trigger('phase-started', 'harvest', 'during', { harvest: true }), 'mandatory', 'once-per-round', [gain(item('flax'))],
      all(metric('goods', 'gte', 1, { id: 'flax', location: 'supply', snapshot: 'phase-start' }), metric('goods', 'eq', 0, { id: 'grain', location: 'supply', snapshot: 'phase-start' }))),
    clause('flax-or-grain-harvest', trigger('phase-started', 'harvest', 'during', { harvest: true }), 'choice', 'once-per-round', [
      { kind: 'choice', min: 1, max: 1, options: [
        { id: 'flax', operations: [gain(item('flax'))] }, { id: 'grain', operations: [gain(item('grain'))] },
      ] },
    ], all(metric('goods', 'gte', 1, { id: 'flax', location: 'supply', snapshot: 'phase-start' }), metric('goods', 'gte', 1, { id: 'grain', location: 'supply', snapshot: 'phase-start' }))),
  ]),
  rule(170, 'action-cost', 'mandatory', [clause('emigration-discount-two', trigger('action-proposed', 'emigration', 'before'), 'mandatory', 'once-per-action', [
    { kind: 'discount', target: 'emigration', amount: 2, floor: 0 },
  ])]),
  rule(171, 'conversion', 'optional', [clause('flax-after-harvest', trigger('phase-resolved', 'harvest', 'after', { harvest: true }), 'optional', 'once-per-round', [
    exchange([item('flax')], [item('grain'), item('silver')]),
  ])]),
  rule(172, 'placement', 'optional', [clause('move-feast-stockfish', trigger('phase-resolved', 'feast', 'after'), 'optional', 'once-per-round', [
    { kind: 'move', subject: item('stockfish', { kind: 'event', field: 'selectedAmount' }), from: 'banquet-table', to: 'stone-or-long-houses', parameters: { amountMin: 0, amountMax: 'all', placementRulesApply: true } },
  ])]),
  rule(173, 'phase', 'mandatory', [
    clause('removed-ore-silver', trigger('mountain-item-removed', 'mountain-remove', 'after', { phase: 'mountain-strips' }), 'mandatory', 'once-per-event', [gain(item('silver'))], eventIs('item', 'eq', 'ore')),
    clause('removed-silver-pair-silver', trigger('mountain-item-removed', 'mountain-remove', 'after', { phase: 'mountain-strips' }), 'mandatory', 'once-per-event', [gain(item('silver', 2))], eventIs('item', 'eq', 'silver-2')),
  ]),
  rule(174, 'conversion', 'optional', [clause('cattle-luxury-purchase', trigger('animal-entered-stable', 'animal-gained', 'after'), 'choice', 'once-per-event', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'spices', operations: [exchange([item('silver', 4)], [item('spices')])] },
      { id: 'silk', operations: [exchange([item('silver', 3)], [item('silk')])] },
    ] },
  ], eventIs('animal', 'in', ['cattle', 'pregnant-cattle']))]),
  rule(175, 'conversion', 'optional', [clause('stockfish-action-buy-oil', trigger('good-received', 'good-gained', 'after'), 'optional', 'once-per-action', [
    exchange([item('silver')], [item('oil')]),
  ], all(eventIs('goodId', 'eq', 'stockfish'), eventIs('batchAmount', 'gte', 1), eventIs('source', 'in', ['action-space', 'occupation']), eventIs('source', 'neq', 'bonus')))]),
  rule(176, 'action-reward', 'mandatory', [clause('peas-after-occupation-action', trigger('occupation-played-in-action', 'occupation-played', 'after'), 'mandatory', 'once-per-action', [gain(item('peas'))],
    eventIs('occupationsPlayed', 'gte', 1))]),
  rule(177, 'action-replacement', 'optional', [clause('single-house-bonus-to-silverware', trigger('bonus-produced', 'bonus-production', 'instead'), 'replacement', 'once-per-event', [
    { kind: 'replace', target: 'bonus-good', parameters: { producer: 'stone-or-long-house', exactBatchAmount: 1, appliesPerHouse: true }, replacement: [gain(item('silverware'))] },
  ])]),
  rule(178, 'threshold', 'mandatory', [clause('four-large-ships-whalers', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [
    gain(item('whaling-boat', qCount('empty-berths', { berth: 'small' }, 1, 2))),
  ], metric('large-ships', 'gte', 4))]),
  rule(179, 'threshold', 'mandatory', [clause('next-knarr-yield', trigger('ship-acquired', 'ship-gained', 'after'), 'mandatory', 'once-per-card', [
    gain(item('stockfish', qCount('ships', { type: 'knarr' })), item('silver', qCount('ships', { type: 'knarr' }))),
  ], eventIs('shipType', 'eq', 'knarr'))]),
  rule(180, 'threshold', 'mandatory', [
    clause('low-income-beach-raider', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [gain(item('silverware', 4))], all(metric('ships', 'gte', 3, { type: 'longship' }), metric('income', 'lte', 5))),
    clause('medium-income-beach-raider', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [gain(item('silverware', 3))], all(metric('ships', 'gte', 3, { type: 'longship' }), metric('income', 'gt', 5), metric('income', 'lte', 11))),
    clause('high-income-beach-raider', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [gain(item('silverware', 2))], all(metric('ships', 'gte', 3, { type: 'longship' }), metric('income', 'gt', 11), metric('income', 'lte', 30))),
  ]),
  rule(181, 'threshold', 'mandatory', [
    clause('low-income-sail-patcher', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [gain(item('wool', 3))], all(metric('large-ships', 'gte', 3), metric('income', 'lte', 4))),
    clause('medium-income-sail-patcher', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [gain(item('wool', 2))], all(metric('large-ships', 'gte', 3), metric('income', 'gt', 4), metric('income', 'lte', 9))),
    clause('high-income-sail-patcher', trigger('state-changed', 'inventory-threshold', 'when'), 'mandatory', 'once-per-card', [gain(item('wool'))], all(metric('large-ships', 'gte', 3), metric('income', 'gt', 9), metric('income', 'lte', 30))),
  ]),
  rule(182, 'threshold', 'optional', [clause('house-threshold-spices', [trigger('state-changed', 'inventory-threshold', 'when'), anytime], 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'one-spices', operations: [exchange([item('wood', 2)], [item('spices')])] },
      { id: 'two-spices', operations: [exchange([item('wood', 5)], [item('spices', 2)])] },
    ] },
  ], metric('houses', 'gte', 2, { types: ['stone-house', 'long-house'] }))]),
  rule(183, 'inventory', 'mandatory', [
    clause('first-knarr-crops', play, 'mandatory', 'once-per-card', [gain(item('peas'), item('beans'), item('flax'))], metric('ships', 'gte', 1, { type: 'knarr' })),
    clause('second-knarr-grain', play, 'mandatory', 'once-per-card', [gain(item('grain'))], metric('ships', 'gte', 2, { type: 'knarr' })),
    clause('third-knarr-cabbage', play, 'mandatory', 'once-per-card', [gain(item('cabbage'))], metric('ships', 'gte', 3, { type: 'knarr' })),
    clause('fourth-knarr-fruits', play, 'mandatory', 'once-per-card', [gain(item('fruits'))], metric('ships', 'gte', 4, { type: 'knarr' })),
  ]),
  rule(184, 'ship', 'optional', [clause('sponsor-longship', play, 'choice', 'once-per-card', [
    { kind: 'choice', min: 0, max: 1, options: [
      { id: 'wood', operations: [pay(item('wood', 4)), gain(item('longship', 1, { state: { classifiedAsShipBuilding: false } })), { kind: 'move', subject: item('ore', 3), from: 'supply', to: 'new-longship' }] },
      { id: 'silver', operations: [pay(item('silver', 3)), gain(item('longship', 1, { state: { classifiedAsShipBuilding: false } })), { kind: 'move', subject: item('ore', 3), from: 'supply', to: 'new-longship' }] },
    ] },
  ], all(metric('resources', 'gte', 3, { id: 'ore', location: 'supply' }), metric('empty-berths', 'gte', 1, { berth: 'large' })))]),
  rule(185, 'action-replacement', 'optional', [clause('upgrades-instead-of-raid', trigger('action-proposed', 'raiding', 'instead'), 'replacement', 'once-per-action', [
    { kind: 'replace', target: 'action', parameters: { original: 'raiding' }, replacement: [{ kind: 'grant-action', action: 'upgrade-good', parameters: { min: 1, max: 2, steps: 1 } }] },
  ])]),
  rule(186, 'placement', 'mandatory', [clause('second-horizontal-peas', trigger('phase-started', 'feast', 'during'), 'mandatory', 'once-per-round', [
    { kind: 'modify-rule', rule: 'placement-limit', value: 2, parameters: { pieceId: 'peas', orientation: 'horizontal', normalLimit: 1, laterPeasMustBeVertical: true } },
  ])]),
  rule(187, 'compound', 'optional', [
    clause('belt-after-viking-action', trigger('action-resolved', 'viking-action', 'after'), 'optional', 'once-per-action', [
      pay(item('flax', 2)), gain(item('special-tile', 1, { id: 'belt' })),
    ], available('belt')),
    clause('flax-to-treasure', anytime, 'optional', 'unlimited', [exchange([item('flax', 3)], [item('treasure-chest')])]),
  ]),
  rule(188, 'compound', 'mandatory', [
    clause('player-count-silver', play, 'mandatory', 'once-per-card', [gain(item('silver', { kind: 'player-count', offset: -1 }))]),
    clause('last-mountain-silver-bonus', trigger('mountain-item-taken', 'mountain-take', 'after'), 'mandatory', 'once-per-event', [gain(item('silver'))],
      all(eventIs('item', 'eq', 'silver-2'), eventIs('wasLastStripSpace', 'eq', true))),
  ]),
  rule(189, 'scoring', 'mandatory', [clause('exploration-scoring-silver', trigger('scoring', 'score', 'during'), 'mandatory', 'once-per-card', [
    { kind: 'score', currency: 'silver', amount: qTier('exploration-boards', [{ exactly: 2, value: 4 }, { exactly: 3, value: 9 }, { exactly: 4, value: 16 }], 0) },
  ])]),
  rule(190, 'action-reward', 'mandatory', [clause('oil-per-new-spices', trigger('good-received', 'good-gained', 'after'), 'mandatory', 'once-per-event', [
    gain(item('oil', { kind: 'event', field: 'batchAmount' })),
  ], eventIs('goodId', 'eq', 'spices'))]),
];

export type FeastOccupationOperationKind = FeastOccupationOperation['kind'];

export const FEAST_OCCUPATION_RULE_LIST: readonly FeastOccupationRule[] = [
  ...RULES_001_040,
  ...RULES_041_080,
  ...RULES_081_120,
  ...RULES_121_160,
  ...RULES_161_190,
];

export const FEAST_OCCUPATION_RULES = Object.freeze(Object.fromEntries(
  FEAST_OCCUPATION_RULE_LIST.map((entry) => [entry.id, entry]),
)) as Readonly<Record<FeastOccupationRuleId, FeastOccupationRule>>;

export function feastOccupationRule(id: string): FeastOccupationRule | undefined {
  return FEAST_OCCUPATION_RULES[id as FeastOccupationRuleId];
}

export function feastOccupationRulesForHook(hook: FeastOccupationHook): readonly FeastOccupationRule[] {
  return FEAST_OCCUPATION_RULE_LIST.filter((entry) => entry.triggers.includes(hook));
}

export function feastOccupationRulesForFamily(family: FeastOccupationRuleFamily): readonly FeastOccupationRule[] {
  return FEAST_OCCUPATION_RULE_LIST.filter((entry) => entry.family === family);
}

export function feastOccupationClausesForHook(
  id: string, hook: FeastOccupationHook,
): readonly FeastOccupationClause[] {
  return feastOccupationRule(id)?.clauses.filter((entry) => entry.triggers.some((x) => x.hook === hook)) ?? [];
}

const jsonValueIsValid = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValueIsValid);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.entries(value as Record<string, unknown>).every(([key, child]) =>
    key !== '__proto__' && key !== 'constructor' && key !== 'prototype' && child !== undefined && jsonValueIsValid(child));
};

const validateOperations = (
  operations: readonly FeastOccupationOperation[], path: string, errors: string[],
): void => {
  if (!operations.length) errors.push(`${path}: operations must not be empty`);
  for (const [index, operation] of operations.entries()) {
    const opPath = `${path}.operations[${index}]`;
    if ((operation as { kind?: string }).kind === 'acknowledge' || (operation as { kind?: string }).kind === 'manual') {
      errors.push(`${opPath}: generic/manual operation forbidden`);
    }
    if (!jsonValueIsValid(operation)) errors.push(`${opPath}: operation is not finite JSON data`);
    if (operation.kind === 'choice') {
      if (operation.min < 0 || operation.max < operation.min || !operation.options.length) errors.push(`${opPath}: invalid choice cardinality`);
      const optionIds = operation.options.map((option) => option.id);
      if (new Set(optionIds).size !== optionIds.length) errors.push(`${opPath}: duplicate choice option id`);
      for (const option of operation.options) validateOperations(option.operations, `${opPath}.${option.id}`, errors);
    } else if (operation.kind === 'replace') {
      validateOperations(operation.replacement, `${opPath}.replacement`, errors);
    } else if (operation.kind === 'transfer') {
      if (!operation.items.length) errors.push(`${opPath}: transfer needs items`);
    } else if (operation.kind === 'exchange') {
      if (!operation.from.length || !operation.to.length) errors.push(`${opPath}: exchange needs both sides`);
    } else if (operation.kind === 'draw-weapons') {
      if (operation.selection === 'named' && !operation.named?.length) errors.push(`${opPath}: named draw needs a weapon`);
      if (operation.selection === 'fill-to-count' && operation.named?.length !== 4) errors.push(`${opPath}: fill-to-count needs all four weapons`);
    }
  }
};

/**
 * Runtime integrity gate for generated saves, tests, and server startup.
 * An empty result is the only valid registry state.
 */
export function validateFeastOccupationRuleRegistry(
  rules: readonly FeastOccupationRule[] = FEAST_OCCUPATION_RULE_LIST,
): readonly string[] {
  const errors: string[] = [];
  if (rules.length !== 190) errors.push(`registry must contain 190 cards, got ${rules.length}`);
  const ids = rules.map((entry) => entry.id);
  const numbers = rules.map((entry) => entry.number);
  if (new Set(ids).size !== ids.length) errors.push('occupation rule ids must be unique');
  if (new Set(numbers).size !== numbers.length) errors.push('occupation rule numbers must be unique');

  for (const number of FEAST_OCCUPATION_NUMBERS) {
    const expectedId = `occupation-${number}` as FeastOccupationRuleId;
    const entry = rules.find((candidate) => candidate.number === number);
    if (!entry) { errors.push(`missing ${expectedId}`); continue; }
    if (entry.id !== expectedId) errors.push(`${expectedId}: id/number mismatch`);
    const golden = goldenByNumber.get(number);
    if (!golden) errors.push(`${expectedId}: missing golden card`);
    else {
      if (entry.name !== golden.name) errors.push(`${expectedId}: name differs from golden`);
      if (entry.timing !== golden.type) errors.push(`${expectedId}: timing differs from golden`);
      if (entry.sourceText !== golden.clarification || !entry.sourceText.trim()) errors.push(`${expectedId}: source text differs from golden`);
    }
    if (!entry.clauses.length) errors.push(`${expectedId}: clauses must not be empty`);
    const clauseIds = entry.clauses.map((candidate) => candidate.id);
    if (new Set(clauseIds).size !== clauseIds.length) errors.push(`${expectedId}: duplicate clause id`);
    const hooks = [...new Set(entry.clauses.flatMap((candidate) => candidate.triggers.map((candidateTrigger) => candidateTrigger.hook)))];
    if (JSON.stringify(hooks) !== JSON.stringify(entry.triggers)) errors.push(`${expectedId}: top-level trigger index is stale`);
    if (entry.timing === 'immediate' && !hooks.includes('card-played')) errors.push(`${expectedId}: immediate card lacks card-played trigger`);
    if (entry.timing === 'anytime' && !hooks.includes('anytime')) errors.push(`${expectedId}: anytime card lacks anytime trigger`);
    if (entry.timing === 'as-soon-as' && !hooks.some((hook) => hook === 'state-changed' || hook === 'ship-acquired' || hook === 'scoring' || hook === 'anytime')) {
      errors.push(`${expectedId}: as-soon-as card lacks a threshold/scoring trigger`);
    }
    for (const candidate of entry.clauses) {
      const path = `${expectedId}.${candidate.id}`;
      if (!candidate.id.trim()) errors.push(`${expectedId}: blank clause id`);
      if (!candidate.triggers.length) errors.push(`${path}: triggers must not be empty`);
      if (candidate.requirement === 'replacement' && !candidate.operations.some((operation) => operation.kind === 'replace' || operation.kind === 'modify-rule')) {
        errors.push(`${path}: replacement clause lacks replace/modify-rule operation`);
      }
      if (candidate.condition && !jsonValueIsValid(candidate.condition)) errors.push(`${path}: invalid predicate data`);
      for (const candidateTrigger of candidate.triggers) {
        if (!candidateTrigger.hook || !candidateTrigger.event || !candidateTrigger.window) errors.push(`${path}: incomplete trigger`);
      }
      validateOperations(candidate.operations, path, errors);
    }
  }
  for (const entry of rules) {
    if (!FEAST_OCCUPATION_NUMBERS.includes(entry.number)) errors.push(`out-of-range occupation number ${entry.number}`);
    if (entry.family === ('manual' as FeastOccupationRuleFamily)) errors.push(`${entry.id}: manual family forbidden`);
  }
  return errors;
}

const occupationRuleErrors = validateFeastOccupationRuleRegistry();
if (occupationRuleErrors.length) {
  throw new Error(`Invalid Feast occupation rule registry:\n${occupationRuleErrors.join('\n')}`);
}
