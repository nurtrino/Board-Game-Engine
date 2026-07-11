// Focused declarative registry suite for all 190 classic occupation cards.
// Run: npx tsx shared/src/feast/occupation-rules-test.ts

import { FEAST_OCCUPATIONS } from './data.js';
import {
  FEAST_OCCUPATION_NUMBERS,
  FEAST_OCCUPATION_RULE_LIST,
  FEAST_OCCUPATION_RULES,
  feastOccupationClausesForHook,
  feastOccupationRule,
  feastOccupationRulesForFamily,
  feastOccupationRulesForHook,
  validateFeastOccupationRuleRegistry,
  type FeastOccupationHook,
  type FeastOccupationOperation,
  type FeastOccupationPredicate,
  type FeastOccupationRule,
  type FeastOccupationRuleFamily,
  type FeastOccupationRuleId,
} from './occupationRules.js';

let passed = 0;
let failed = 0;
const check = (condition: unknown, message: string): void => {
  if (condition) passed++;
  else { failed++; console.error(`FAIL: ${message}`); }
};
const equal = (actual: unknown, expected: unknown, message: string): void =>
  check(JSON.stringify(actual) === JSON.stringify(expected), `${message} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);

const card = (number: number): FeastOccupationRule => {
  const result = feastOccupationRule(`occupation-${number}`);
  if (!result) throw new Error(`Missing test card ${number}`);
  return result;
};
const operations = (entry: FeastOccupationRule): FeastOccupationOperation[] => {
  const walk = (values: readonly FeastOccupationOperation[]): FeastOccupationOperation[] => values.flatMap((operation) => [
    operation,
    ...(operation.kind === 'choice' ? operation.options.flatMap((option) => walk(option.operations)) : []),
    ...(operation.kind === 'replace' ? walk(operation.replacement) : []),
  ]);
  return entry.clauses.flatMap((candidate) => walk(candidate.operations));
};
const predicateSome = (
  predicate: FeastOccupationPredicate | undefined,
  match: (candidate: FeastOccupationPredicate) => boolean,
): boolean => {
  if (!predicate) return false;
  if (match(predicate)) return true;
  if (predicate.kind === 'all' || predicate.kind === 'any') {
    return predicate.terms.some((term) => predicateSome(term, match));
  }
  return predicate.kind === 'not' && predicateSome(predicate.term, match);
};

// Exhaustive identity and golden parity gates.
equal(FEAST_OCCUPATION_RULE_LIST.length, 190, 'exactly 190 declarative rules');
equal(Object.keys(FEAST_OCCUPATION_RULES).length, 190, 'record has exactly 190 keys');
equal(FEAST_OCCUPATION_NUMBERS, Array.from({ length: 190 }, (_, index) => index + 1), 'number domain is exactly 1 through 190');
equal(FEAST_OCCUPATION_RULE_LIST.map((entry) => entry.id), FEAST_OCCUPATION_NUMBERS.map((number) => `occupation-${number}`), 'ids are exhaustive and ordered');
equal(new Set(FEAST_OCCUPATION_RULE_LIST.map((entry) => entry.id)).size, 190, 'ids are unique');
equal(new Set(FEAST_OCCUPATION_RULE_LIST.map((entry) => entry.number)).size, 190, 'numbers are unique');
for (const golden of FEAST_OCCUPATIONS) {
  const entry = card(golden.number);
  check(entry.id === golden.id, `${golden.id}: exact id`);
  check(entry.name === golden.name, `${golden.id}: exact name`);
  check(entry.timing === golden.type, `${golden.id}: exact timing`);
  check(entry.sourceText === golden.clarification, `${golden.id}: exact appendix provenance`);
  check(entry.clauses.length > 0, `${golden.id}: at least one executable clause`);
  check(entry.clauses.every((candidate) => candidate.triggers.length > 0 && candidate.operations.length > 0), `${golden.id}: no empty trigger/effect shell`);
}
equal(validateFeastOccupationRuleRegistry(), [], 'built-in registry validator passes');

// No manual acknowledgement or generic net-state escape hatch exists.
const everyOperation = FEAST_OCCUPATION_RULE_LIST.flatMap(operations);
check(!everyOperation.some((operation) => ['manual', 'acknowledge', 'generic'].includes((operation as { kind: string }).kind)), 'no manual/acknowledge/generic operation');
check(!FEAST_OCCUPATION_RULE_LIST.some((entry) => ['manual', 'generic'].includes(entry.family)), 'no manual/generic family');
check(FEAST_OCCUPATION_RULE_LIST.every((entry) => entry.clauses.every((candidate) =>
  ['mandatory', 'optional', 'replacement', 'choice'].includes(candidate.requirement)
  && ['once-per-card', 'once-per-round', 'once-per-action', 'once-per-event', 'unlimited'].includes(candidate.limit))),
'every clause has explicit optionality and cardinality');
equal(new Set(everyOperation.map((operation) => operation.kind)).size, 13, 'all 13 typed operation families are exercised');

// Every emitted reducer hook has a known semantic representative.
const hookSpots: Readonly<Partial<Record<FeastOccupationHook, FeastOccupationRuleId>>> = {
  'action-proposed': 'occupation-1',
  'action-resolved': 'occupation-3',
  'die-rolled': 'occupation-4',
  'card-played': 'occupation-5',
  'mountain-item-taken': 'occupation-6',
  'phase-resolved': 'occupation-7',
  'phase-started': 'occupation-8',
  'house-built': 'occupation-15',
  'good-received': 'occupation-28',
  'action-started': 'occupation-36',
  anytime: 'occupation-39',
  'tile-placed': 'occupation-98',
  'occupation-received': 'occupation-99',
  'die-resolved': 'occupation-104',
  'ship-acquired': 'occupation-117',
  'workers-returned': 'occupation-151',
  'resource-received': 'occupation-154',
  'workers-placed': 'occupation-164',
  'thing-count-changed': 'occupation-168',
  'mountain-item-removed': 'occupation-173',
  'animal-entered-stable': 'occupation-174',
  'occupation-played-in-action': 'occupation-176',
  'bonus-produced': 'occupation-177',
  'state-changed': 'occupation-178',
  scoring: 'occupation-189',
};
const emittedHooks = [...new Set(FEAST_OCCUPATION_RULE_LIST.flatMap((entry) => entry.triggers))];
equal([...Object.keys(hookSpots)].sort(), [...emittedHooks].sort(), 'semantic spot map covers every emitted hook');
for (const [hook, id] of Object.entries(hookSpots) as [FeastOccupationHook, FeastOccupationRuleId][]) {
  check(feastOccupationRulesForHook(hook).some((entry) => entry.id === id), `${hook}: query finds ${id}`);
  check(feastOccupationClausesForHook(id, hook).length > 0, `${hook}: card-level query finds executable clause`);
}

// Every rule family is populated and has a card-specific semantic assertion.
const familySpots: Readonly<Record<FeastOccupationRuleFamily, FeastOccupationRuleId>> = {
  'action-cost': 'occupation-1',
  'action-reward': 'occupation-126',
  'action-grant': 'occupation-121',
  'action-replacement': 'occupation-185',
  dice: 'occupation-153',
  phase: 'occupation-5',
  inventory: 'occupation-30',
  conversion: 'occupation-44',
  placement: 'occupation-40',
  ship: 'occupation-184',
  building: 'occupation-72',
  livestock: 'occupation-33',
  weapon: 'occupation-69',
  worker: 'occupation-60',
  'special-tile': 'occupation-70',
  threshold: 'occupation-178',
  scoring: 'occupation-189',
  compound: 'occupation-187',
};
for (const [family, id] of Object.entries(familySpots) as [FeastOccupationRuleFamily, FeastOccupationRuleId][]) {
  check(feastOccupationRulesForFamily(family).some((entry) => entry.id === id), `${family}: family query finds ${id}`);
}

// High-risk mechanics stay encoded as parameters, not source-text inference.
check(card(2).clauses[0].operations.some((operation) => operation.kind === 'discount' && operation.exclusions?.includes('ship-purchase')), 'Patron excludes ship purchase');
check(card(5).clauses[0].requirement === 'mandatory' && operations(card(5)).some((operation) => operation.kind === 'phase' && operation.phase === 'feast'), 'Chief forces a private Feast');
check(operations(card(11)).some((operation) => operation.kind === 'draw-weapons' && operation.selection === 'named' && operation.named?.[0] === 'spear'), 'Trident Hunter fetches an exact spear');
check(card(39).clauses[0].limit === 'unlimited' && operations(card(39)).some((operation) => operation.kind === 'move' && operation.from.includes('ship')), 'Modifier is an unlimited ore move');
const inspectorReturns = operations(card(60)).filter((operation): operation is Extract<FeastOccupationOperation, { kind: 'return-workers' }> => operation.kind === 'return-workers');
check(inspectorReturns.length === 2 && inspectorReturns.every((operation) => operation.parameters.soloActiveColorOnly === true),
  'Inspector returns only the currently active solo color');
const homecomerReturn = operations(card(76)).find((operation): operation is Extract<FeastOccupationOperation, { kind: 'return-workers' }> => operation.kind === 'return-workers');
check(homecomerReturn?.parameters.soloActiveColorOnly === true
  && typeof homecomerReturn.quantity === 'object' && homecomerReturn.quantity.kind === 'count'
  && homecomerReturn.quantity.filter?.countCurrentWorkers === true,
'Homecomer counts and returns only the currently active solo color');
check(operations(card(77)).some((operation) => operation.kind === 'grant-action' && operation.parameters?.column === 2 && operation.parameters.occupied === true), 'Follower binds occupied second-column spaces');
check(operations(card(91)).some((operation) => operation.kind === 'grant-action' && operation.parameters?.adjacentVerticalToOwnWorkerInColumn1 === true), 'Latecomer binds vertical first-column adjacency');
check(operations(card(99)).some((operation) => operation.kind === 'replace' && operation.target === 'reward'), 'Preceptor is an explicit occupation-reward replacement');
check(operations(card(106)).some((operation) => operation.kind === 'modify-rule' && operation.rule === 'worker-cost'), 'Warmonger changes Plundering worker cost');
check(card(136).clauses.length === 2 && operations(card(136)).some((operation) => operation.kind === 'modify-die') && operations(card(136)).some((operation) => operation.kind === 'modify-rule' && operation.rule === 'loot-split'), 'Raider encodes both die and split-loot mechanics');
check(card(157).clauses[0].triggers[0].filter?.destination === 'banquet-table', 'Skinner binds Feast placement destination');
const weaponsWardenCondition = card(166).clauses[0].condition;
check(predicateSome(weaponsWardenCondition, (candidate) => candidate.kind === 'event'
  && candidate.field === 'matchingPlacementsEarlierThisRound' && candidate.comparator === 'gte' && candidate.value === 1),
'Weapons Warden suppresses the first matching placement each round');
check(predicateSome(card(15).clauses[1].condition, (candidate) => candidate.kind === 'event'
  && candidate.field === 'classifiedAsHouseBuilding' && candidate.comparator === 'eq' && candidate.value === true),
'Cottager requires authoritative House Building provenance');
check(card(89).requirement === 'mandatory' && card(89).clauses[0].requirement === 'mandatory'
  && operations(card(89)).some((operation) => operation.kind === 'modify-die'),
'Catapulter is a passive mandatory payment modifier');
check(card(186).requirement === 'mandatory' && card(186).clauses[0].requirement === 'mandatory'
  && operations(card(186)).some((operation) => operation.kind === 'modify-rule' && operation.rule === 'placement-limit'),
'Pea Flour Baker is a passive mandatory placement modifier');
const boatBuilderCondition = card(178).clauses[0].condition;
check(boatBuilderCondition?.kind === 'metric' && boatBuilderCondition.metric === 'large-ships', 'Boat Builder uses a large-ship threshold');
equal(card(180).clauses.map((candidate) => (operations({ ...card(180), clauses: [candidate] })[0] as Extract<FeastOccupationOperation, { kind: 'transfer' }>).items[0].quantity), [4, 3, 2], 'Beach Raider has exact 4/3/2 silverware tiers');
check(operations(card(189)).some((operation) => operation.kind === 'score' && operation.currency === 'silver'), 'Seafarer resolves during scoring as silver');
check(operations(card(190)).some((operation) => operation.kind === 'transfer' && typeof operation.items[0].quantity === 'object' && operation.items[0].quantity.kind === 'event'), 'Bosporus Merchant scales oil to every new spices tile');

// Validator must reject representative corruption instead of tolerating fallback data.
check(validateFeastOccupationRuleRegistry(FEAST_OCCUPATION_RULE_LIST.slice(0, -1)).some((error) => error.includes('190')), 'validator rejects missing card');
check(validateFeastOccupationRuleRegistry([...FEAST_OCCUPATION_RULE_LIST.slice(0, -1), card(1)]).some((error) => error.includes('unique')), 'validator rejects duplicate card');
const immediateWithoutPlay: FeastOccupationRule = {
  ...card(5),
  triggers: ['phase-started'],
  clauses: [{ ...card(5).clauses[0], triggers: [{ hook: 'phase-started', event: 'feast', window: 'when' }] }],
};
check(validateFeastOccupationRuleRegistry(FEAST_OCCUPATION_RULE_LIST.map((entry) => entry.id === immediateWithoutPlay.id ? immediateWithoutPlay : entry))
  .some((error) => error.includes('immediate card lacks card-played')), 'validator rejects immediate rule without play trigger');
const manualOperation: FeastOccupationRule = {
  ...card(43),
  clauses: [{ ...card(43).clauses[0], operations: [{ kind: 'manual', note: 'trust client' } as unknown as FeastOccupationOperation] }],
};
check(validateFeastOccupationRuleRegistry(FEAST_OCCUPATION_RULE_LIST.map((entry) => entry.id === manualOperation.id ? manualOperation : entry))
  .some((error) => error.includes('generic/manual')), 'validator rejects a manual operation');
const invalidChoice: FeastOccupationRule = {
  ...card(51),
  clauses: [{ ...card(51).clauses[0], operations: [{ kind: 'choice', min: 2, max: 1, options: [] }] }],
};
check(validateFeastOccupationRuleRegistry(FEAST_OCCUPATION_RULE_LIST.map((entry) => entry.id === invalidChoice.id ? invalidChoice : entry))
  .some((error) => error.includes('invalid choice cardinality')), 'validator rejects malformed choice payload');

if (failed) {
  console.error(`\n${failed} failed, ${passed} passed`);
  process.exitCode = 1;
} else {
  console.log(`${passed}/${passed} occupation registry checks passed`);
}
