// Focused acceptance tests for the complete SETI project catalog.
// Run: npx tsx shared/src/seti/project-catalog-test.ts

import { createHash } from 'node:crypto';
import {
  SETI_BASE_PROJECT_CATALOG,
  SETI_PROJECT_CATALOG,
  SETI_PROJECT_CATALOG_BY_CARD_ID,
  SETI_PROJECT_CATALOG_BY_ID,
  SETI_PROJECT_FAQ_BASE_CARD_NUMBERS,
  SETI_PROJECT_FAQ_PROMO_CARD_IDS,
  SETI_PROJECT_FAQ_RUNTIME_COVERAGE,
  SETI_PROMO_PROJECT_CATALOG,
  type SetiProjectCatalogCard,
  type SetiProjectEffect,
  type SetiProjectOp,
} from './projectCatalog.js';

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

function base(number: number): SetiProjectCatalogCard {
  const card = SETI_BASE_PROJECT_CATALOG.find((candidate) => candidate.officialNumber === number);
  if (!card) throw new Error(`Missing official SETI project #${number}`);
  return card;
}

function allOps(card: SetiProjectCatalogCard): SetiProjectOp[] {
  const collected: SetiProjectOp[] = [];
  const visit = (op: SetiProjectOp): void => {
    collected.push(op);
    if (op.kind === 'if') op.then.forEach(visit);
    if (op.kind === 'install-pluto') {
      op.orbitReward.forEach(visit);
      op.landReward.forEach(visit);
    }
  };
  for (const effect of card.effects) {
    if (effect.timing === 'triggerable-mission') effect.slots.forEach((slot) => slot.operations.forEach(visit));
    else effect.operations.forEach(visit);
  }
  return collected;
}

function effect(card: SetiProjectCatalogCard, timing: SetiProjectEffect['timing']): SetiProjectEffect | undefined {
  return card.effects.find((candidate) => candidate.timing === timing);
}

equal(SETI_PROJECT_CATALOG.length, 140, 'catalog includes base deck and both promos');
equal(SETI_BASE_PROJECT_CATALOG.length, 138, 'base deck contains exactly 138 cards');
equal(SETI_PROMO_PROJECT_CATALOG.length, 2, 'promo catalog contains exactly two cards');
equal(new Set(SETI_PROJECT_CATALOG.map((card) => card.id)).size, 140, 'stable ids are unique');
equal(new Set(SETI_PROJECT_CATALOG.map((card) => card.sourceCardId)).size, 140, 'CardIDs are unique');
equal(new Set(SETI_BASE_PROJECT_CATALOG.map((card) => card.officialNumber)).size, 138, 'official numbers are unique');

for (let number = 1; number <= 138; number++) equal(base(number).officialNumber, number, `official card #${number} exists`);
for (const card of SETI_PROJECT_CATALOG) {
  equal(SETI_PROJECT_CATALOG_BY_ID[card.id], card, `${card.canonicalName} stable-id lookup`);
  equal(SETI_PROJECT_CATALOG_BY_CARD_ID[card.sourceCardId], card, `${card.canonicalName} CardID lookup`);
  ok(card.effects.length > 0, `${card.canonicalName} has gameplay effects`);
  ok(card.cost >= 0 && card.cost <= 4, `${card.canonicalName} has a printed cost`);
  ok(['red', 'yellow', 'blue', 'black'].includes(card.signalColor), `${card.canonicalName} has a printed signal color`);
  ok(['move', 'publicity', 'data'].includes(card.freeCorner), `${card.canonicalName} has a free-action corner`);
  ok(['credit', 'energy', 'card'].includes(card.income), `${card.canonicalName} has an income corner`);
  if (card.cardType === 'triggerable-mission') {
    const trigger = effect(card, 'triggerable-mission');
    ok(trigger?.timing === 'triggerable-mission' && trigger.slots.length > 0, `${card.canonicalName} has mission slots`);
    if (trigger?.timing === 'triggerable-mission') {
      equal(trigger.claimLimitPerTrigger, 1, `${card.canonicalName} claims one slot per trigger`);
      equal(new Set(trigger.slots.map((slot) => slot.id)).size, trigger.slots.length, `${card.canonicalName} mission slot ids are unique`);
    }
  }
  if (card.cardType === 'conditional-mission') {
    ok(effect(card, 'conditional-mission')?.timing === 'conditional-mission', `${card.canonicalName} has a typed condition`);
  }
  if (card.cardType === 'end-game') ok(effect(card, 'end-game')?.timing === 'end-game', `${card.canonicalName} has end-game scoring`);
}

const metadataFingerprint = [...SETI_PROJECT_CATALOG]
  .sort((left, right) => left.sourceCardId - right.sourceCardId)
  .map((card) => [card.sourceCardId, card.officialNumber, card.cost, card.signalColor, card.freeCorner, card.income, card.cardType].join(':'))
  .join('|');
equal(
  createHash('sha256').update(metadataFingerprint).digest('hex'),
  'fcc37534633f8a21a78e3700bc4d07973a350b690dec0c3f751d8004167dc7e9',
  'all printed metadata and card classifications match the inspected deck',
);

equal(JSON.stringify(SETI_PROJECT_CATALOG).includes('untranscribed'), false, 'catalog contains no untranscribed fields');
equal(JSON.stringify(SETI_PROJECT_CATALOG).includes('TODO'), false, 'catalog contains no TODO placeholders');
equal(JSON.stringify(SETI_PROJECT_CATALOG).includes('unknown-effect'), false, 'catalog contains no opaque effects');

equal(SETI_PROJECT_FAQ_BASE_CARD_NUMBERS.length, 74, 'all 74 base-card entries on official FAQ pages 12-22 are inventoried');
equal(SETI_PROJECT_FAQ_PROMO_CARD_IDS.length, 1, 'the promo entry on official FAQ page 26 is inventoried');
equal(SETI_PROJECT_FAQ_RUNTIME_COVERAGE.length, 75, 'every FAQ-listed project has a machine-readable runtime coverage record');
equal(new Set(SETI_PROJECT_FAQ_RUNTIME_COVERAGE.map((entry) => entry.sourceCardId)).size, 75, 'FAQ coverage records are unique');
for (const entry of SETI_PROJECT_FAQ_RUNTIME_COVERAGE) {
  const card = SETI_PROJECT_CATALOG_BY_CARD_ID[entry.sourceCardId];
  ok(!!card, `FAQ CardID ${entry.sourceCardId} resolves to a typed catalog card`);
  equal(entry.coverage, 'typed-catalog-and-executor', `${card.canonicalName} has explicit FAQ runtime classification`);
  equal(entry.cardType, card.cardType, `${card.canonicalName} FAQ classification matches its runtime destination`);
  ok(card.effects.length > 0, `${card.canonicalName} FAQ entry has executable effects`);
}

// Official FAQ corrections and current replacement-card art.
for (const number of [58, 60] as const) {
  const condition = effect(base(number), 'conditional-mission');
  ok(condition?.timing === 'conditional-mission', `#${number} is a conditional mission`);
  if (condition?.timing === 'conditional-mission') {
    ok(condition.condition.kind === 'piece-at-body' && condition.condition.includeMoons, `#${number} includes the planet's moon`);
  }
  ok(base(number).rulings.some((ruling) => ruling.kind === 'include-moons'), `#${number} carries the FAQ correction`);
}

const mapping112 = effect(base(112), 'conditional-mission');
ok(mapping112?.timing === 'conditional-mission', '#112 is a conditional mission');
if (mapping112?.timing === 'conditional-mission') {
  ok(mapping112.condition.kind === 'planetary-system-pair' && mapping112.condition.includeMoons, '#112 accepts a lander on a moon in the same planetary system');
}

const gateway117 = effect(base(117), 'triggerable-mission');
ok(gateway117?.timing === 'triggerable-mission', '#117 is a triggerable mission');
if (gateway117?.timing === 'triggerable-mission') {
  equal(gateway117.claimLimitPerTrigger, 1, '#117 orbit/land claims only one reward');
  ok(gateway117.slots.every((slot) => slot.trigger.kind === 'orbit-or-land'), '#117 both spaces accept either Orbit or Land');
}

const herschel134 = base(134);
const herschelSignal = allOps(herschel134).find((op) => op.kind === 'mark-signal');
ok(herschelSignal?.kind === 'mark-signal', '#134 has a signal effect');
if (herschelSignal?.kind === 'mark-signal') {
  equal(herschelSignal.amount, 1, '#134 marks one signal, matching the current card art');
  ok(herschelSignal.target.kind === 'own-probe-sector' && herschelSignal.target.probeMustBeOnSolarSystem, '#134 requires a probe on the solar-system board');
}
const herschelCondition = effect(herschel134, 'conditional-mission');
ok(herschelCondition?.timing === 'conditional-mission', '#134 is a conditional mission');
if (herschelCondition?.timing === 'conditional-mission') {
  ok(herschelCondition.condition.kind === 'current-signals-in-distinct-sectors' && herschelCondition.condition.currentOnly, '#134 counts only currently marked signals');
}

// A card-provided Scan waives 1 credit + 2 energy, never optional tech costs.
for (const card of SETI_PROJECT_CATALOG) {
  for (const op of allOps(card).filter((candidate) => candidate.kind === 'scan')) {
    if (op.kind !== 'scan') continue;
    equal(op.baseCost, 'waived', `${card.canonicalName} waives the base Scan cost`);
    equal(op.optionalTechnologyCosts, 'pay', `${card.canonicalName} still pays optional telescope-tech costs`);
  }
}

const gatewayPromo = SETI_PROJECT_CATALOG_BY_CARD_ID[41500];
equal(gatewayPromo.promoCode, 'SE EN 02', 'Gateway to Mars promo code');
const gatewayMission = effect(gatewayPromo, 'triggerable-mission');
ok(gatewayMission?.timing === 'triggerable-mission' && gatewayMission.slots.length === 2, 'Gateway to Mars has both printed mission rewards');

const plutoPromo = SETI_PROJECT_CATALOG_BY_CARD_ID[204700];
equal(plutoPromo.promoCode, 'SE EN 01', 'Pluto promo code');
equal(plutoPromo.cardType, 'permanent', 'Pluto remains in play');
const pluto = allOps(plutoPromo).find((op) => op.kind === 'install-pluto');
ok(pluto?.kind === 'install-pluto', 'Pluto installs its own orbit and landing spaces');
if (pluto?.kind === 'install-pluto') {
  equal(pluto.probeRequirement.ring, 'outermost', 'Pluto requires a probe in the outermost ring');
  equal(pluto.orbitCapacity, 1, 'Pluto has one orbiter space');
  equal(pluto.landCapacity, 1, 'Pluto has one lander space');
  equal(pluto.countsAsPlanet, true, 'Pluto counts as a planet for other effects');
}

console.log(`SETI project catalog: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
