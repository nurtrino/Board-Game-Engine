// Run: npx tsx shared/src/seti/alien-catalog-test.ts

import {
  SETI_ALIEN_CARDS,
  SETI_ALIEN_CARDS_BY_CARD_ID,
  SETI_ALIEN_CARDS_BY_ID,
  SETI_ALIEN_CARD_COUNTS,
  SETI_ALIEN_DISCOVERY_SLOTS,
  SETI_ALIEN_OVERFLOW,
  SETI_ALIEN_RESEARCH_RULES,
  SETI_ALIEN_SPECIES,
  SETI_ALIEN_SPECIES_BY_ID,
  SETI_ANOMALY_TOKENS,
  SETI_CENTAURIAN_MESSAGE_REWARDS,
  SETI_MASCAMITE_SAMPLE_REWARDS,
  setiAlienRewardSignature,
  type SetiAlienCardDefinition,
  type SetiAlienSpeciesId,
} from './alienCatalog.js';

let passed = 0;
let failed = 0;

function ok(value: unknown, message: string): asserts value {
  if (value) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function equal<T>(actual: T, expected: T, message: string): void {
  ok(Object.is(actual, expected), `${message} (got ${String(actual)}, expected ${String(expected)})`);
}

function card(cardId: number): SetiAlienCardDefinition {
  const found = SETI_ALIEN_CARDS_BY_CARD_ID[cardId];
  ok(found, `CardID ${cardId} is present`);
  return found;
}

// Inventory, stable identity, authentic sheet cells, and completeness.
equal(SETI_ALIEN_CARDS.length, 55, 'all 55 alien cards are transcribed');
equal(new Set(SETI_ALIEN_CARDS.map((entry) => entry.id)).size, 55, 'card ids are unique');
equal(new Set(SETI_ALIEN_CARDS.map((entry) => entry.cardId)).size, 55, 'TTS CardIDs are unique');
equal(new Set(SETI_ALIEN_CARDS.map((entry) => entry.sourceGuid)).size, 55, 'TTS source GUIDs are unique');
equal(Object.keys(SETI_ALIEN_CARDS_BY_ID).length, 55, 'id index contains every card');
equal(Object.keys(SETI_ALIEN_CARDS_BY_CARD_ID).length, 55, 'CardID index contains every card');

for (const species of Object.keys(SETI_ALIEN_CARD_COUNTS) as SetiAlienSpeciesId[]) {
  equal(SETI_ALIEN_CARDS.filter((entry) => entry.species === species).length, SETI_ALIEN_CARD_COUNTS[species], `${species} card count`);
}

for (const entry of SETI_ALIEN_CARDS) {
  equal(entry.art.cell, entry.cardId % 100, `${entry.cardId} art cell follows CardID`);
  equal(entry.art.column, entry.art.cell % 5, `${entry.cardId} art column is row-major`);
  equal(entry.art.row, Math.floor(entry.art.cell / 5), `${entry.cardId} art row is row-major`);
  ok(entry.name.length > 0 && entry.printedText.length > 0, `${entry.cardId} has a complete printed transcription`);
  ok(!/untranscribed|placeholder|todo|tbd/i.test(JSON.stringify(entry)), `${entry.cardId} contains no transcription placeholder`);
  if (entry.species === 'exertians') {
    ok(entry.exertian !== null, `${entry.cardId} has secret-danger scoring semantics`);
    ok(entry.playCost === null && entry.freeCorner.length === 0 && entry.signalCorner === null && entry.incomeCorner === null, `${entry.cardId} correctly has no ordinary card corners`);
  } else {
    ok(entry.playCost !== null, `${entry.cardId} has a printed play cost`);
    ok(entry.freeCorner.length > 0 && entry.signalCorner !== null && entry.incomeCorner !== null, `${entry.cardId} has all three ordinary corners`);
    ok(entry.effects.length > 0 || entry.message !== null, `${entry.cardId} has reducer-usable effect semantics`);
  }
}

// Discovery and shared FAQ rules.
equal(SETI_ALIEN_DISCOVERY_SLOTS[0].rewardPerSpace[0].kind, 'gain', 'first species slot reward is typed');
equal(SETI_ALIEN_DISCOVERY_SLOTS[0].rewardPerSpace[0].kind === 'gain' ? SETI_ALIEN_DISCOVERY_SLOTS[0].rewardPerSpace[0].amount : -1, 5, 'first species discovery space gives 5 VP');
equal(SETI_ALIEN_DISCOVERY_SLOTS[1].rewardPerSpace[0].kind === 'gain' ? SETI_ALIEN_DISCOVERY_SLOTS[1].rewardPerSpace[0].amount : -1, 3, 'second species discovery space gives 3 VP');
equal(SETI_ALIEN_OVERFLOW.reward[0].kind === 'gain' ? SETI_ALIEN_OVERFLOW.reward[0].amount : -1, 3, 'overflow gives 3 VP');
ok(SETI_ALIEN_OVERFLOW.mayChooseWhileResearchSpaceIsOpen, 'FAQ permits choosing overflow while a normal space is open');
ok(SETI_ALIEN_OVERFLOW.countsAsTraceForSpecies && SETI_ALIEN_OVERFLOW.discoverySpacesCountAsTraceForSpecies, 'discovery and overflow markers count for species conditions');
ok(!SETI_ALIEN_OVERFLOW.rewardsAlienDiscovery, 'overflow markers receive no discovery reward');
ok(SETI_ALIEN_RESEARCH_RULES.spacesNeedNotBeFilledBottomToTop, 'alien-board research spaces are unordered');
ok(SETI_ALIEN_RESEARCH_RULES.alienCardsMayBeDiscardedFromHandForTechSignal, 'ordinary alien hand cards support tech-discard signals');
ok(SETI_ALIEN_RESEARCH_RULES.faceUpAlienMarketCardIsNotAProjectRowCard, 'face-up alien market card is excluded from project-row signal discards');
ok(SETI_ALIEN_RESEARCH_RULES.exertianCardsCanNeverBeDiscarded, 'Exertian cards cannot be discarded');

// Board space inventories and module components.
equal(SETI_ALIEN_SPECIES.length, 5, 'five species definitions');
equal(SETI_ALIEN_SPECIES_BY_ID.mascamites.researchSpaces.length, 17, 'Mascamite board has ten fixed spaces and seven dynamic sample spaces');
equal(SETI_ALIEN_SPECIES_BY_ID.mascamites.researchSpaces.filter((space) => space.dynamic === 'mascamite-sample-token').length, 7, 'all seven sample rewards become blue spaces');
equal(SETI_ALIEN_SPECIES_BY_ID.anomalies.researchSpaces.length, 15, 'Anomaly board has five spaces in each column');
equal(SETI_ALIEN_SPECIES_BY_ID.anomalies.researchSpaces.filter((space) => space.repeatable).length, 3, 'one repeatable 2-VP Anomaly space per color');
equal(SETI_ALIEN_SPECIES_BY_ID.oumuamua.researchSpaces.filter((space) => space.repeatable && space.payment?.amount === 1).length, 3, "one repeatable 1-exofossil 'Oumuamua space per color");
equal(SETI_ALIEN_SPECIES_BY_ID.oumuamua.researchSpaces.filter((space) => space.payment?.amount === 4).length, 3, "one 25-VP 'Oumuamua space per color");
equal(SETI_ALIEN_SPECIES_BY_ID.centaurians.researchSpaces.filter((space) => space.repeatable && space.payment?.amount === 1).length, 3, 'one repeatable 1-data Centaurian space per color');
equal(SETI_ALIEN_SPECIES_BY_ID.centaurians.researchSpaces.filter((space) => space.payment?.amount === 3).length, 3, 'one 15-VP 3-data Centaurian space per color');
equal(SETI_ALIEN_SPECIES_BY_ID.exertians.researchSpaces.filter((space) => space.danger === 1).length, 3, 'Exertian top tier has three 1-danger spaces');
equal(SETI_ALIEN_SPECIES_BY_ID.exertians.researchSpaces.filter((space) => space.danger === 2).length, 6, 'Exertian middle tier has six 2-danger spaces');
equal(SETI_ALIEN_SPECIES_BY_ID.exertians.researchSpaces.filter((space) => space.danger === 3).length, 6, 'Exertian bottom tier has six 3-danger spaces');
equal(SETI_MASCAMITE_SAMPLE_REWARDS.length, 7, 'seven exact Mascamite sample faces');
equal(new Set(SETI_MASCAMITE_SAMPLE_REWARDS.map(setiAlienRewardSignature)).size, 7, 'all sample faces have distinct rewards');
equal(SETI_ANOMALY_TOKENS.length, 3, 'three double-sided anomaly tokens');
ok(SETI_ANOMALY_TOKENS.every((token) => token.sides.length === 2), 'each anomaly token has two typed sides');
equal(SETI_CENTAURIAN_MESSAGE_REWARDS.length, 4, 'four exclusive Centaurian board rewards');

// Representative exact card semantics and FAQ corrections.
{
  const breeding = card(203800);
  equal(breeding.name, 'Breeding Sample', 'Mascamite CardID/name mapping');
  equal(breeding.playCost?.amount, 1, 'Breeding Sample costs 1 credit');
  equal(breeding.mission?.kind, 'delivery', 'Breeding Sample is a delivery mission');
  if (breeding.mission?.kind === 'delivery') {
    equal(breeding.mission.destination, 'Earth', 'Breeding Sample destination');
    const resolve = breeding.mission.reward.find((reward) => reward.kind === 'resolve-mascamite-sample');
    equal(resolve?.kind === 'resolve-mascamite-sample' ? resolve.multiplier : 0, 2, 'Breeding Sample resolves the token twice');
  }
}
{
  const simulation = card(203801);
  equal(simulation.playCost?.amount, 3, 'Computer Simulations costs 3 credits');
  ok(simulation.mission?.kind === 'conditional' && simulation.mission.condition.kind === 'trace-count' && simulation.mission.condition.color === 'blue' && simulation.mission.condition.atLeast === 2, 'Computer Simulations requires two blue Mascamite traces');
}
{
  const uncertainty = card(203900);
  ok(uncertainty.effects.some((effect) => effect.kind === 'score-signals-in-anomaly-sectors' && effect.timing === 'before-completed-sector-resolution'), 'Amazing Uncertainty scores before sector completion');
  const listening = card(203905);
  ok(listening.effects.some((effect) => effect.kind === 'main-action' && effect.action === 'scan' && effect.baseCost === 'waived'), 'Listening Carefully waives base Scan cost');
  ok(listening.faq.some((line) => /additional costs/i.test(line)), 'Listening Carefully retains optional tech costs');
}
{
  const comparative = card(203701);
  ok(comparative.mission?.kind === 'triggerable' && comparative.mission.rewardOrder === 'any' && comparative.mission.oneSpacePerTrigger, 'Comparative Analysis uses one freely chosen reward per trace event');
  const visitor = card(203709);
  ok(visitor.mission?.kind === 'conditional' && visitor.mission.condition.kind === 'paid-oumuamua-space' && visitor.mission.condition.acceptedCosts.join(',') === '1,4', 'Visitor in the Sky accepts exactly the paid 1- and 4-exofossil spaces');
  ok(visitor.effects.some((effect) => effect.kind === 'score-oumuamua-signals-from-this-effect' && effect.vpPerSignal === 2), "Visitor scores only signals this effect places on 'Oumuamua");
}
{
  const torrent = card(203508);
  equal(torrent.playCost?.resource, 'energy', 'Centaurian cards cost energy');
  ok(torrent.message?.immediate.some((effect) => effect.kind === 'mark-signal' && effect.amount === 2 && effect.location === 'one-chosen-sector'), 'Torrent-chain Signal puts both signals in one chosen sector');
  ok(torrent.message?.delayed.some((effect) => effect.kind === 'tuck-income'), 'Torrent-chain Signal becomes data income after its message milestone');
  ok(SETI_ALIEN_CARDS.filter((entry) => entry.species === 'centaurians').every((entry) => entry.message?.milestoneOffset === 15 && entry.mission === null), 'all Centaurian cards create ordered +15 messages and are not missions');
}
{
  const neuralab = card(203609);
  equal(neuralab.exertian?.danger, 9, 'Neuralab has danger 9');
  equal(neuralab.exertian?.victoryPoints, 20, 'Neuralab scores 20 VP');
  ok(neuralab.exertian?.condition.kind === 'trace-count' && neuralab.exertian.condition.species === 'other' && neuralab.exertian.condition.atLeast === 6, 'Neuralab checks six traces for the other species');
  const dangers = new Set(SETI_ALIEN_CARDS.filter((entry) => entry.species === 'exertians').map((entry) => entry.exertian?.danger));
  ok(Array.from({ length: 10 }, (_, value) => value).every((value) => dangers.has(value)), 'Exertian deck includes every danger value 0 through 9');
  ok(SETI_ALIEN_CARDS.filter((entry) => entry.species === 'exertians').every((entry) => entry.exertian?.scoreAtMostOnce), 'every Exertian condition scores at most once');
}

if (failed) {
  console.error(`\n${failed} SETI alien-catalog test(s) failed; ${passed} passed.`);
  process.exitCode = 1;
} else {
  console.log(`SETI alien catalog: ${passed} assertions passed.`);
}
