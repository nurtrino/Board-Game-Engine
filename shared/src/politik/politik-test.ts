// Politik engine verification: deterministic 2-6 player CPU games, privacy,
// transactional invariants, setup decisions, core actions, all Clash arenas,
// explicit Final Say rulings, and victory variants.

import {
  ARENAS, BASES, COUNCIL_SEATS, INDUSTRIES, NATIONS, POLITIK_ADJACENCY,
  LANDSCAPES, LANDSCAPE_BY_ID, MARKETS_PER_INDUSTRY, MAX_COMPANIES, NATION_BY_ID, POLITIK_CARDS, POLITIK_DATA, POLITIK_SEATS, PRICE_TRACKS, PROPAGANDA_BY_ID, STARTUP_BY_ID,
  beginPolitikLandscape, controlledCouncil, controlledRegions, councilController, createPolitik,
  locationController, meetsVictory, politikTieContests, politikViewFor, recomputeFinalSay, regionController,
  victoryThreshold,
  type PolitikState,
} from './state.js';
import { applyPolitikAction, politikBotAction, type PolitikAction } from './actions.js';

let pass = 0;
let fail = 0;
function check(value: unknown, label: string): void {
  if (value) { pass++; return; }
  fail++;
  console.error(`FAIL: ${label}`);
}

function seated(count: number) {
  return POLITIK_SEATS.slice(0, count).map((color, i) => ({ name: `Nation ${i + 1}`, color }));
}

function assertInvariants(s: PolitikState, label: string): void {
  check(Object.values(s.prices).every((x) => Number.isInteger(x) && x >= 1 && x <= 10), `${label}: Prices 1-10`);
  check(s.players.every((p) => p.capital >= 0 && p.carbon >= 0 && p.food >= 0 && p.corruption >= 0), `${label}: public resources nonnegative`);
  check(s.players.every((p) => [...BASES.map((x) => p.support[x]), ...ARENAS.map((x) => p.leaders[x])].every((n) => n >= 0)), `${label}: Support/leaders nonnegative`);
  check(Object.values(s.locations).every((x) => x.imperialInfluence >= 0 && x.influence.length === s.players.length && x.influence.every((n) => n >= 0)), `${label}: Influence shape/nonnegative`);
  check(INDUSTRIES.every((x) => s.marketSupply[x] >= 0), `${label}: Market supply nonnegative`);
  check(INDUSTRIES.every((x) => s.marketReserve[x] >= 0), `${label}: Market reserve nonnegative`);
  check(s.players.reduce((total, player) => total + player.companies.length, 0) <= MAX_COMPANIES, `${label}: no more than 20 physical Company boards/Margin dials in use`);
  check(s.eventSeq >= 1 && s.lastEvent?.seq === s.eventSeq, `${label}: state-carried event sequence`);
  check(JSON.parse(JSON.stringify(s)).game === 'politik', `${label}: state and pending serialize`);
  const suspendedClash = s.pending?.kind === 'clash' ? s.pending
    : (s.pending?.kind === 'guided' || s.pending?.kind === 'trade') && s.pending.resume?.kind === 'clash' ? s.pending.resume : null;
  const clashPolitik = suspendedClash
    ? Object.values(suspendedClash.commitments).reduce((n, commitment) => n + (commitment?.cards.filter((card) => card.card.kind === 'politik').length ?? 0), 0)
      + (suspendedClash.imperialCommitment?.cards.filter((card) => card.card.kind === 'politik').length ?? 0)
    : 0;
  const clashStartup = suspendedClash
    ? Object.values(suspendedClash.commitments).reduce((n, commitment) => n + (commitment?.cards.filter((card) => card.card.kind === 'startup').length ?? 0), 0)
    : 0;
  const politikPhysical = s.politicsDeck.length + s.politicsDiscard.length + s.players.reduce((total, p) => total
    + p.hand.filter((x) => x.kind === 'politik').length
    + p.companies.filter((x) => x.card.kind === 'politik').length
    + p.companies.reduce((n, c) => n + c.assets.filter((x) => x.card.kind === 'politik').length, 0)
    + p.propaganda.filter((x) => x.card.kind === 'politik').length
    + p.eventsInPlay.filter((x) => x.card.kind === 'politik').length, 0)
    + clashPolitik;
  const obligationPhysical = s.obligationDeck.length + s.players.reduce((n, p) => n + p.hand.filter((x) => x.kind === 'obligation').length, 0);
  const startupPhysical = s.startupDeck.length + s.startupDiscard.length + clashStartup + s.players.reduce((total, p) => total + p.hand.filter((x) => x.kind === 'startup').length + p.companies.filter((x) => x.card.kind === 'startup').length, 0);
  const landscapePhysical = s.landscapeDeck.length + s.landscapeDiscard.length + (s.activeLandscape ? 1 : 0) + (s.upcomingLandscape ? 1 : 0);
  check(politikPhysical === 412, `${label}: 412 Politik cards conserved (${politikPhysical})`);
  check(obligationPhysical === 24, `${label}: 24 Obligations conserved (${obligationPhysical})`);
  check(startupPhysical === 12, `${label}: 12 Startup cards conserved (${startupPhysical})`);
  check(landscapePhysical === 54, `${label}: 54 playable Landscapes conserved (${landscapePhysical})`);
  check(INDUSTRIES.every((industry) => s.marketSupply[industry] + s.marketReserve[industry] + s.players.reduce((n, p) => n + p.companies.reduce((m, c) => m + (c.markets[industry] ?? 0), 0), 0) === MARKETS_PER_INDUSTRY), `${label}: 90 Markets conserved across supply, Companies, and reserve`);
}

function drive(s: PolitikState, max = 20_000): { steps: number; error?: string } {
  for (let steps = 0; steps < max; steps++) {
    if (s.phase === 'ended') return { steps };
    const seat = s.pending?.seat ?? s.turn;
    const action = politikBotAction(s, seat);
    const result = applyPolitikAction(s, seat, action);
    if (!result.ok) return { steps, error: `${s.phase} seat ${seat} ${JSON.stringify(action)}: ${result.error}` };
    if (steps % 100 === 0) assertInvariants(s, `bot ${s.players.length}p step ${steps}`);
  }
  return { steps: max, error: 'guard exhausted' };
}

function ready(count = 2, seed = 1234): PolitikState {
  const s = createPolitik(seated(count), seed);
  for (let guard = 0; guard < 2000; guard++) {
    if (s.phase === 'playing' && !s.pending) return s;
    const seat = s.pending?.seat ?? s.turn;
    const result = applyPolitikAction(s, seat, politikBotAction(s, seat));
    if (!result.ok) throw new Error(`setup failed: ${result.error}`);
  }
  throw new Error('setup guard');
}

function act(s: PolitikState, seat: number, action: PolitikAction, label: string): boolean {
  const result = applyPolitikAction(s, seat, action);
  check(result.ok, `${label}${result.error ? ` (${result.error})` : ''}`);
  return result.ok;
}

function passClashWindow(s: PolitikState, label: string): void {
  if (s.pending?.kind !== 'clash' || s.pending.stage === 'attacker_commit' || s.pending.stage === 'defender_commit') throw new Error(`${label}: no Clash response window`);
  const stage = s.pending.stage;
  while (s.pending?.kind === 'clash' && s.pending.stage === stage) {
    const responder = s.pending.seat;
    if (!act(s, responder, { type: 'pass_clash' }, `${label} ${stage} PASS`)) break;
  }
}

function finishClashResponses(s: PolitikState, label: string): void {
  for (let guard = 0; guard < 20 && s.pending?.kind === 'clash'; guard++) {
    if (s.pending.stage === 'attacker_commit' || s.pending.stage === 'defender_commit') throw new Error(`${label}: unresolved ${s.pending.stage}`);
    passClashWindow(s, label);
  }
}

function cardWithFocus(arena: (typeof ARENAS)[number], highest: boolean): string {
  return Object.values(POLITIK_CARDS).sort((a, b) => (highest ? b.focus[arena] - a.focus[arena] : a.focus[arena] - b.focus[arena]))[0].id;
}

// Authentic catalog/count gates.
check(Object.keys(POLITIK_CARDS).length === 412, '412 compact Politik catalog entries');
check(Object.values(POLITIK_CARDS).every((x) => x.focusVerified), 'all 1,236 Politik Focus fields are independently art-verified');
check(Object.values(POLITIK_CARDS).every((x) => x.declarationVerified && Number.isInteger(x.capitalCost) && Number.isInteger(x.carbonCost) && Number.isInteger(x.corruptionRequirement) && Number.isInteger(x.supportCost) && x.bases.every((base) => BASES.includes(base))), 'all 2,060 fixed declaration fields are two-pass art-verified');
check(Object.values(POLITIK_CARDS).every((x) => x.titleVerified && x.structureVerified && x.industries.every((industry) => INDUSTRIES.includes(industry)) && x.edgeTimings.every((timing) => ['at_any_time', 'after_cost', 'during_focus', 'after_reveal', 'before_resolve', 'other'].includes(timing)) && (x.edgeTimings.includes('other') === (x.edgeTriggerText.length > 0))), 'all titles and 2,884 structural symbol fields are multi-pass art-verified');
check(NATIONS.length === 12, '12 Nations');
check(Object.keys(PROPAGANDA_BY_ID).length === 24, '24 Starting Propaganda');
check(Object.values(POLITIK_CARDS).every((x) => ARENAS.every((a) => Number.isInteger(x.focus[a]))), 'every Politik card has normalized Focus');
check(POLITIK_DATA.board.adjacency.length === 40 && Object.keys(POLITIK_ADJACENCY).length === 35, '40 authentic board connections cover 35 locations');
check(LANDSCAPES.length === 54 && new Set(LANDSCAPES.map((x) => x.id)).size === 54, '54 unique exact Landscape definitions');
check(LANDSCAPES.every((x) => [-2, -1, 1, 2].includes(x.delta) && x.industries.length > 0 && x.industries.every((industry) => INDUSTRIES.includes(industry)) && x.priceTracks.length > 0 && x.priceTracks.every((price) => Object.hasOwn(POLITIK_DATA.board.prices, price))), 'every Landscape definition has valid delta, Industries, and Price tracks');

// Every transcribed Landscape drives the reducer exactly; this catches a
// definition that is present in data but omitted or interpreted generically.
for (const [index, def] of LANDSCAPES.entries()) {
  const s = createPolitik(seated(2), 50_000 + index);
  const previous = s.activeLandscape!;
  if (s.upcomingLandscape === def.id) {
    s.upcomingLandscape = previous;
  } else if (previous !== def.id) {
    const at = s.landscapeDeck.indexOf(def.id);
    if (at >= 0) s.landscapeDeck[at] = previous;
  }
  s.activeLandscape = def.id;
  for (const industry of INDUSTRIES) { s.marketSupply[industry] = 5; s.marketReserve[industry] = 10; }
  for (const price of PRICE_TRACKS) s.prices[price] = 5;
  s.pending = null;
  const landscapeError = beginPolitikLandscape(s, s.turn, 'refresh');
  check(landscapeError === null && s.pending === null, `${def.id} resolves without a choice when no Company can cross`);
  check(INDUSTRIES.every((industry) => s.marketSupply[industry] === 5 + (def.industries.includes(industry) ? def.delta : 0)
    && s.marketReserve[industry] === 10 - (def.industries.includes(industry) ? def.delta : 0)), `${def.id} applies its exact shared Market effects`);
  check(PRICE_TRACKS.every((price) => s.prices[price] === 5 + (def.priceTracks.includes(price) ? def.delta : 0)), `${def.id} applies its exact Price effects`);
  check(politikViewFor(s, 0).landscape.active === def.id, `${def.id} remains the public active Landscape preview`);
  assertInvariants(s, `${def.id} exact structured resolution`);
}

// Broadcast Stations connect and target adjacent Regions, but do not count as
// a State inside either Region for majority/control.
{
  const s = ready(2, 127); const seat = 0;
  for (const loc of Object.values(s.locations)) loc.influence.fill(0);
  for (const id of ['A1', 'B1', 'X1']) { s.locations[id].influence[seat] = 3; s.locations[id].imperialInfluence = 0; }
  check(locationController(s, 'X1') === seat, 'Nation controls the Broadcast Station itself');
  check(regionController(s, 'A') === null && regionController(s, 'B') === null, 'X1 adds no State to either adjacent Region majority');
  check(!politikTieContests(s).some((tie) => (tie.key === 'region:A' || tie.key === 'region:B')), 'Broadcast Station does not create adjacent Region tie contests');
}

// Produce resolves a controlled Station's Support benefit, but that Station's
// two adjacency labels do not occupy Regions for the Research portion.
{
  const s = ready(2, 128); const seat = s.turn;
  for (const loc of Object.values(s.locations)) loc.influence.fill(0);
  s.locations.X1.influence[seat] = 3; s.locations.X1.imperialInfluence = 0;
  const hand = s.players[seat].hand.length;
  const support = BASES.reduce((n, base) => n + s.players[seat].support[base], 0);
  act(s, seat, { type: 'national', action: 'produce', produceSupport: { capitalism: 1 } }, 'Produce controlled Broadcast Station');
  check(s.players[seat].hand.length === hand, 'Broadcast Station occupies zero Regions for Produce Research');
  check(BASES.reduce((n, base) => n + s.players[seat].support[base], 0) === support + 1, 'Broadcast Station still resolves its +1 Support State benefit');
}

// Setup is deterministic and private before confirmation.
{
  const a = createPolitik(seated(4), 20260710);
  const b = createPolitik(seated(4), 20260710);
  check(JSON.stringify(a) === JSON.stringify(b), 'same players/seed produce byte-identical state');
  const v0 = politikViewFor(a, 0);
  const tv = politikViewFor(a, null);
  check(v0.players[0].nationChoices?.length === 2, 'viewer sees own two Nation choices');
  check(v0.players[1].nationChoices === undefined && v0.players[1].hand === undefined, 'viewer cannot see another private setup/hand');
  check(v0.players[0].mulliganUsed === false && v0.players[1].mulliganUsed === undefined, 'mulligan decision is visible only to its owner');
  check(tv.players.every((p) => p.hand === undefined && p.nationChoices === undefined), 'neutral TV sees no private hand/setup choices');
  check(politikViewFor(a, 'dev').players.every((p) => p.hand && p.nationChoices), 'dev view sees private diagnostics');
}

// Opening Landscape resolves strictly before every player choice; its exact
// Price governs the later Exchange setup bonus.
{
  let seed = 1; let s = createPolitik(seated(2), seed);
  while (!LANDSCAPE_BY_ID[s.activeLandscape!].priceTracks.includes('food')) s = createPolitik(seated(2), ++seed);
  const active = s.activeLandscape!; const upcoming = s.upcomingLandscape;
  const def = LANDSCAPE_BY_ID[active]; const openingView = politikViewFor(s, null);
  check(s.setupStage === 'mulligan' && s.pending?.kind === 'mulligan', 'opening Landscape resolves automatically before mulligan');
  check(openingView.landscape.active === active && openingView.landscape.upcoming === upcoming, 'active and upcoming Landscapes are visible during setup');
  check(s.prices.food === Math.max(1, Math.min(10, 8 + def.delta)), 'opening Landscape applies exact bounded Food Price delta');
  for (const industry of def.industries) {
    check(s.marketSupply[industry] === Math.max(0, Math.min(MARKETS_PER_INDUSTRY, 2 + def.delta)), `opening Landscape applies exact bounded ${industry} supply delta`);
  }
  while (s.pending?.kind === 'mulligan' || s.pending?.kind === 'nation') {
    const seat = s.pending.seat;
    act(s, seat, politikBotAction(s, seat), `advance setup ${s.pending.kind}`);
  }
  check(s.pending?.kind === 'setup_bonus' && s.pending.available.includes('exchange'), 'Exchange bonus follows resolved Landscape');
  if (s.pending?.kind !== 'setup_bonus') throw new Error('expected setup bonus');
  const bonusSeat = s.pending.seat; const capital = s.players[bonusSeat].capital; const food = s.players[bonusSeat].food;
  act(s, bonusSeat, { type: 'choose_setup_bonus', bonus: 'exchange', exchange: [{ resource: 'food', mode: 'buy', amount: 1 }] }, 'Exchange setup bonus at Landscape Price');
  check(s.players[bonusSeat].capital === capital - s.prices.food && s.players[bonusSeat].food === food + 1, 'setup Exchange uses exact Landscape-modified Price');
  const bonusView = politikViewFor(s, null);
  check(bonusView.landscape.active === active && bonusView.landscape.upcoming === upcoming, 'Landscape display remains stable through player setup');
  check(def.industries.every((industry) => bonusView.marketSupply[industry] + bonusView.marketReserve[industry] === MARKETS_PER_INDUSTRY), 'device view exposes exact bounded supply/reserve split');
}

// Starting Propaganda overrides are explicit and server-authoritative.
{
  const s = createPolitik(seated(2), 131); const seat = s.setupQueue[0]; const p = s.players[seat];
  const nation = NATION_BY_ID.granSanti; const propaganda = PROPAGANDA_BY_ID.steelyWit;
  p.nationChoices = [nation.id]; s.setupStage = 'nation'; s.setupCursor = 0; s.pending = { kind: 'nation', seat };
  const choice = { type: 'choose_nation' as const, nation: nation.id, propaganda: propaganda.id, support: { fascism: nation.support }, leaders: { military: nation.leaders } };
  const snapshot = JSON.stringify(s);
  const missing = applyPolitikAction(s, seat, choice);
  check(!missing.ok && JSON.stringify(s) === snapshot, 'Steely Wit rejects setup without an explicit Council Seat');
  act(s, seat, { ...choice, steelyWitCouncil: 'justice' }, 'Steely Wit explicit starting Council Support');
  check(s.councilSupport.justice[seat] === 1, 'Steely Wit adds exactly 1 Support to the chosen Council Seat');
}
{
  const s = createPolitik(seated(2), 132); const seat = s.setupQueue[0]; const p = s.players[seat];
  const station = Object.values(s.locations).find((location) => location.kind === 'station')!;
  s.setupStage = 'state'; s.setupCursor = 0; s.pending = { kind: 'start_state', seat };
  p.startingPropaganda = 'greyArea';
  const snapshot = JSON.stringify(s);
  const barred = applyPolitikAction(s, seat, { type: 'choose_start_state', state: station.id });
  check(!barred.ok && JSON.stringify(s) === snapshot, 'only Dogmatic may choose a Broadcast Station at setup');
  p.startingPropaganda = 'dogmatic';
  const supportBefore = BASES.reduce((total, base) => total + p.support[base], 0);
  act(s, seat, { type: 'choose_start_state', state: station.id }, 'Dogmatic Broadcast Station start');
  check(s.locations[station.id].influence[seat] === 8 && s.locations[station.id].imperialInfluence === 0, 'Dogmatic places 8 Influence and clears the Station defense flag');
  check(BASES.reduce((total, base) => total + s.players[seat].support[base], 0) === supportBefore, 'Dogmatic skips the Broadcast Station initial Support benefit');
}

// Resource prices/costs, multi-transaction Exchange atomicity, and Campaign.
{
  const s = ready(2, 101);
  const seat = s.turn; let p = s.players[seat];
  p.capital = 100; p.food = 20; p.carbon = 3;
  const hand = p.hand.length;
  act(s, seat, { type: 'research', amount: 2 }, 'Research action accepted');
  p = s.players[seat];
  check(p.capital === 100 - s.prices.research * 2 && p.hand.length === hand + 2, 'Research pays Capital and draws X');
  s.actionsTaken = 0;
  const leaders = p.leaders.military;
  act(s, seat, { type: 'educate', leaders: { military: 2 } }, 'Educate action accepted');
  p = s.players[seat];
  check(p.food === 20 - s.prices.educate * 2 && p.leaders.military === leaders + 2, 'Educate pays Food Price x X and gains selected leaders');
  s.actionsTaken = 0;
  const beforeBad = JSON.stringify(s);
  const bad = applyPolitikAction(s, seat, { type: 'exchange', transactions: [{ resource: 'food', mode: 'buy', amount: 1 }, { resource: 'carbon', mode: 'sell', amount: 999 }] });
  check(!bad.ok && JSON.stringify(s) === beforeBad, 'failed multi-step Exchange rolls back every earlier transaction');
  act(s, seat, { type: 'exchange', transactions: [{ resource: 'carbon', mode: 'sell', amount: 1 }, { resource: 'food', mode: 'buy', amount: 1 }] }, 'ordered Exchange accepted');
  p = s.players[seat];
  check(p.carbon === 2 && p.food === 20 - s.prices.educate * 2 + 1, 'Exchange resolves four transaction types in declared order');
  s.actionsTaken = 0; p.support.capitalism = 2; p.capital = 100;
  act(s, seat, { type: 'campaign', council: 'chair', fromBases: { capitalism: 2 } }, 'Campaign accepted');
  p = s.players[seat];
  check(p.support.capitalism === 0 && s.councilSupport.chair[seat] === 2 && p.capital === 100 - 2 * s.prices.campaign, 'Campaign moves multi-Base Support into exactly one Seat and pays Capital');
}

// National Action token cycle and all four procedures.
{
  const s = ready(2, 102); const seat = s.turn; let p = s.players[seat];
  p.capital = 100;
  act(s, seat, { type: 'national', action: 'income' }, 'Income National Action');
  p = s.players[seat];
  check(p.capital >= 105 && p.nationalUsed.includes('income'), 'Income gains base 5 and places its token');
  s.actionsTaken = 0;
  const supportBefore = BASES.reduce((n, x) => n + p.support[x], 0);
  act(s, seat, { type: 'national', action: 'rally' }, 'Rally National Action');
  p = s.players[seat];
  check(BASES.reduce((n, x) => n + p.support[x], 0) === supportBefore + p.propaganda.length, 'Rally gains one matching Support per Propaganda');
  s.actionsTaken = 0;
  const stationSupport = Object.values(s.locations).filter((x) => x.benefit === 'support' && locationController(s, x.id) === seat).length;
  act(s, seat, { type: 'national', action: 'produce', produceSupport: stationSupport ? { capitalism: stationSupport } : {} }, 'Produce National Action');
  p = s.players[seat];
  check(p.nationalUsed.includes('produce'), 'Produce resolves controlled State benefits and occupied-Region research');
  s.actionsTaken = 0;
  act(s, seat, { type: 'national', action: 'refresh' }, 'Refresh National Action');
  p = s.players[seat];
  check(p.nationalUsed.length === 0 && s.pending === null, 'fourth National Action returns all four tokens and no-choice Landscape resolves automatically');
}

// Rally resolves live Council control left-to-right; Chair is mandatory and
// may remove either an opponent's or the controller's own Support.
{
  const s = ready(2, 133); const seat = s.turn; const other = (seat + 1) % 2; const p = s.players[seat];
  for (const council of COUNCIL_SEATS) s.councilSupport[council].fill(0);
  s.councilSupport.chair[seat] = 2;
  s.councilSupport.commerce[seat] = 2; s.councilSupport.commerce[other] = 2;
  p.companies = [{ id: 'rally-company', card: { kind: 'startup', id: 'rally-company' }, title: 'Rally Company', ready: true, printedIndustries: ['energy'], industries: ['energy'], markets: {}, margin: 0, assets: [], negotiation: false }];
  s.marketSupply.energy = Math.max(1, s.marketSupply.energy);
  const missingSnapshot = JSON.stringify(s);
  const missing = applyPolitikAction(s, seat, { type: 'national', action: 'rally' });
  check(!missing.ok && JSON.stringify(s) === missingSnapshot, 'controlled Chair requires an explicit target whenever any Council Support exists');
  act(s, seat, { type: 'national', action: 'rally', chair: { seat: other, council: 'commerce' } }, 'Chair removal unlocks later live Commerce control');
  check(s.councilSupport.commerce[other] === 1 && s.players[seat].companies[0].markets.energy === 1, 'Chair resolves first and newly controlled Commerce resolves later in the same Rally');
  s.actionsTaken = 0; s.players[seat].nationalUsed = []; for (const council of COUNCIL_SEATS) s.councilSupport[council].fill(0); s.councilSupport.chair[seat] = 2;
  act(s, seat, { type: 'national', action: 'rally', chair: { seat, council: 'chair' } }, 'Chair removes own Support');
  check(s.councilSupport.chair[seat] === 1, 'Chair may explicitly remove its controller own Support');
}
{
  const s = ready(2, 134); const seat = s.turn; const p = s.players[seat];
  for (const council of COUNCIL_SEATS) s.councilSupport[council].fill(0);
  s.councilSupport.intel[seat] = 2;
  const corruption = p.corruption; const hand = p.hand.length; const obligations = s.obligationDeck.length;
  act(s, seat, { type: 'national', action: 'rally' }, 'Intel Rally exact benefit');
  check(s.players[seat].corruption === corruption + 1 && s.players[seat].hand.length === hand + 1 && s.obligationDeck.length === obligations, 'Intel is exactly +1 Corruption and Research 1 with no Obligation');
}

// Company/Asset play, multi-Industry Market selection, Margin crossing, and
// mandatory guided resolution for unique text.
{
  const s = ready(2, 103); const seat = s.turn; let p = s.players[seat];
  p.capital = 100; p.carbon = 10;
  const startup = p.hand.findIndex((x) => x.kind === 'startup');
  const startupDef = STARTUP_BY_ID[p.hand[startup].id];
  act(s, seat, { type: 'play_card', handIndex: startup, spec: { kind: 'company' }, marketIndustry: startupDef.industries[0] }, 'Company play');
  p = s.players[seat];
  check(p.companies.length === 1 && p.companies[0].markets[startupDef.industries[0]] === 1 && p.companies[0].margin === startupDef.startingMargin && p.capital === 100 - startupDef.capitalCost && p.carbon === 10 - startupDef.carbonCost, 'Startup strictly uses printed costs, Industry, Margin, and matching Market');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Company text checked.' }], note: 'Company text resolved' }, 'Company guided resolver');
  p = s.players[seat];
  s.actionsTaken = 0;
  const assetAt = s.politicsDeck.findIndex((id) => POLITIK_CARDS[id].type === 'asset' && typeof POLITIK_CARDS[id].margin === 'number' && POLITIK_CARDS[id].margin! > 0);
  const assetId = s.politicsDeck.splice(assetAt, 1)[0]; const assetDef = POLITIK_CARDS[assetId];
  p.hand.push({ kind: 'politik', id: assetId });
  const industry = assetDef.industries[0]; const assetMargin = assetDef.margin as number;
  p.companies[0].margin = 10 - assetMargin; const marketBefore = p.companies[0].markets[industry] ?? 0;
  act(s, seat, { type: 'play_card', handIndex: p.hand.length - 1, spec: { kind: 'asset', industries: assetDef.industries, startingMargin: assetMargin }, targetCompany: p.companies[0].id, marginMarket: industry }, 'Asset play');
  p = s.players[seat];
  check(p.companies[0].assets.length === 1 && p.companies[0].markets[industry] === marketBefore + 1 && p.companies[0].margin === 0, 'Asset targets Company; crossing 9 takes Market, resets, and continues');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Asset text checked.' }], note: 'Asset text resolved' }, 'Asset guided resolver');
}

// The physical twenty-board/twenty-dial limit and regular declaration audit
// are enforced before any cost or card movement.
{
  const s = ready(2, 135); const seat = s.turn; const p = s.players[seat];
  const makeCompany = (id: string) => ({ id, card: { kind: 'starting_propaganda' as const, id }, title: id, ready: true, printedIndustries: ['energy' as const], industries: ['energy' as const], markets: {}, margin: 0, assets: [], negotiation: false });
  s.players[0].companies = Array.from({ length: MAX_COMPANIES / 2 }, (_, index) => makeCompany(`cap-a-${index}`));
  s.players[1].companies = Array.from({ length: MAX_COMPANIES / 2 }, (_, index) => makeCompany(`cap-b-${index}`));
  const startupAt = p.hand.findIndex((card) => card.kind === 'startup'); const startup = STARTUP_BY_ID[p.hand[startupAt].id]; p.capital = 100; p.carbon = 10;
  const snapshot = JSON.stringify(s);
  const capped = applyPolitikAction(s, seat, { type: 'play_card', handIndex: startupAt, spec: { kind: 'company' }, marketIndustry: startup.industries[0] });
  check(!capped.ok && JSON.stringify(s) === snapshot, 'a twenty-first Company is rejected before costs by the physical board/dial cap');
}
{
  const s = ready(2, 136); const seat = s.turn; const p = s.players[seat];
  const at = s.politicsDeck.findIndex((id) => POLITIK_CARDS[id].type === 'event' && !POLITIK_CARDS[id].keywordsText.toLowerCase().includes('corruption'));
  const id = s.politicsDeck.splice(at, 1)[0]; p.hand.push({ kind: 'politik', id }); p.capital = 100; p.carbon = 1; p.corruption = 0;
  const verifiedDeclaration = POLITIK_CARDS[id].declarationVerified; const verifiedStructure = POLITIK_CARDS[id].structureVerified; POLITIK_CARDS[id].declarationVerified = false; POLITIK_CARDS[id].structureVerified = false;
  const handIndex = p.hand.length - 1; const before = JSON.stringify(s);
  check(!applyPolitikAction(s, seat, { type: 'play_card', handIndex, spec: { kind: 'event', capitalCost: 0, carbonCost: 1 } }).ok && JSON.stringify(s) === before, 'regular card declaration requires explicit printed-requirement confirmation');
  check(!applyPolitikAction(s, seat, { type: 'play_card', handIndex, spec: { kind: 'event', capitalCost: 0, carbonCost: 1, corruptionRequirement: 1, requirementsConfirmed: true } }).ok && JSON.stringify(s) === before, 'insufficient declared Corruption rejects atomically');
  p.corruption = 1; p.carbon = 0; const beforeCarbon = JSON.stringify(s);
  check(!applyPolitikAction(s, seat, { type: 'play_card', handIndex, spec: { kind: 'event', capitalCost: 0, carbonCost: 1, corruptionRequirement: 1, requirementsConfirmed: true } }).ok && JSON.stringify(s) === beforeCarbon, 'insufficient editable regular-card Carbon rejects atomically');
  p.carbon = 1;
  act(s, seat, { type: 'play_card', handIndex, spec: { kind: 'event', capitalCost: 0, carbonCost: 1, corruptionRequirement: 1, requirementsConfirmed: true } }, 'confirmed regular card declaration');
  check(s.players[seat].carbon === 0 && s.actionsTaken === 1 && s.players[seat].eventsInPlay.some((card) => card.card.id === id), 'confirmed declaration pays Carbon and places the card atomically');
  act(s, seat, { type: 'resolve_guided', operations: [], note: 'Printed effect canceled after declaration costs', canceled: true }, 'cancel guided card effect');
  check(s.players[seat].carbon === 0 && s.actionsTaken === 1 && s.players[seat].eventsInPlay.some((card) => card.card.id === id), 'guided cancellation retains paid costs, consumed action, and card placement');
  POLITIK_CARDS[id].declarationVerified = verifiedDeclaration;
  POLITIK_CARDS[id].structureVerified = verifiedStructure;
}

// Verified costs and requirements are server authority and cannot be reduced
// by a forged or stale client declaration.
{
  const s = ready(2, 139); const seat = s.turn; const p = s.players[seat];
  const at = s.politicsDeck.findIndex((id) => {
    const card = POLITIK_CARDS[id];
    return card.type === 'event' && (card.capitalCost! > 0 || card.carbonCost! > 0);
  });
  const id = s.politicsDeck.splice(at, 1)[0]; const card = POLITIK_CARDS[id];
  p.hand.push({ kind: 'politik', id }); p.capital = 100; p.carbon = 10; p.corruption = 10;
  const capital = p.capital; const carbon = p.carbon;
  act(s, seat, { type: 'play_card', handIndex: p.hand.length - 1, spec: { kind: 'event', capitalCost: 0, carbonCost: 0, corruptionRequirement: 0, requirementsConfirmed: true } }, 'play card with forged zero declaration');
  check(s.players[seat].capital === capital - card.capitalCost! && s.players[seat].carbon === carbon - card.carbonCost!, 'server charges verified printed costs instead of client-supplied zeroes');
  act(s, seat, { type: 'resolve_guided', operations: [], note: 'Verified declaration authority test', canceled: true }, 'close verified declaration authority test');
}

// OCR is a hint only. A human's confirmed physical-card declaration controls
// type and mechanics when the catalog is uncertain.
{
  const s = ready(2, 137); const seat = s.turn; const p = s.players[seat];
  const at = s.politicsDeck.findIndex((id) => POLITIK_CARDS[id].type === 'event');
  const id = s.politicsDeck.splice(at, 1)[0]; p.hand.push({ kind: 'politik', id });
  const verifiedDeclaration = POLITIK_CARDS[id].declarationVerified; const verifiedStructure = POLITIK_CARDS[id].structureVerified; POLITIK_CARDS[id].declarationVerified = false; POLITIK_CARDS[id].structureVerified = false;
  p.support.capitalism = 2;
  act(s, seat, { type: 'play_card', handIndex: p.hand.length - 1, spec: { kind: 'propaganda', title: 'Manual physical declaration', base: 'capitalism', supportCost: 1, capitalCost: 0, carbonCost: 0, corruption: false, negotiation: false, requirementsConfirmed: true } }, 'manual type overrides OCR card classification');
  check(s.players[seat].propaganda.some((card) => card.card.id === id && card.bases.length === 1 && card.bases[0] === 'capitalism'), 'manual Propaganda Base is authoritative instead of OCR keywords');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Physical card resolved.' }], note: 'Physical card resolved' }, 'resolve manually declared card');
  POLITIK_CARDS[id].declarationVerified = verifiedDeclaration;
  POLITIK_CARDS[id].structureVerified = verifiedStructure;
}
{
  const s = ready(2, 138); const seat = s.turn; const p = s.players[seat];
  const at = s.politicsDeck.findIndex((id) => /corruption|negotiation/i.test(POLITIK_CARDS[id].keywordsText));
  const id = s.politicsDeck.splice(at, 1)[0]; p.hand.push({ kind: 'politik', id });
  const verifiedDeclaration = POLITIK_CARDS[id].declarationVerified; const verifiedStructure = POLITIK_CARDS[id].structureVerified; POLITIK_CARDS[id].declarationVerified = false; POLITIK_CARDS[id].structureVerified = false;
  const corruption = p.corruption; const negotiation = p.negotiation;
  act(s, seat, { type: 'play_card', handIndex: p.hand.length - 1, spec: { kind: 'event', title: 'Manual no-icon declaration', capitalCost: 0, carbonCost: 0, corruption: false, requirementsConfirmed: true } }, 'manual icon declaration overrides OCR keyword hint');
  check(s.players[seat].corruption === corruption && s.players[seat].negotiation === negotiation, 'OCR keyword hints cannot add Corruption or Negotiation mechanics');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Physical card resolved.' }], note: 'Physical card resolved' }, 'resolve manual icon test');
  POLITIK_CARDS[id].declarationVerified = verifiedDeclaration;
  POLITIK_CARDS[id].structureVerified = verifiedStructure;
}

// Refresh uses exact definitions. A multi-Industry Company receives the delta
// once per listed Industry, pausing only for a serializable overflow choice.
{
  const s = ready(2, 124); const seat = s.turn; let p = s.players[seat];
  p.capital = 100; p.carbon = 10;
  const startupAt = p.hand.findIndex((x) => x.kind === 'startup');
  const startup = STARTUP_BY_ID[p.hand[startupAt].id];
  act(s, seat, { type: 'play_card', handIndex: startupAt, spec: { kind: 'company' }, marketIndustry: startup.industries[0] }, 'play Company before strict Refresh Landscape');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Startup ability checked.' }], note: 'Startup ability resolved' }, 'resolve Startup before strict Refresh');
  p = s.players[seat];
  const owner = (seat + 1) % s.players.length;
  const company = p.companies.shift()!;
  s.players[owner].companies.push(company);
  const def = LANDSCAPES.find((candidate) => candidate.delta === 2 && candidate.industries.length >= 2 && candidate.id !== s.activeLandscape && candidate.id !== s.upcomingLandscape)!;
  const deckAt = s.landscapeDeck.indexOf(def.id);
  s.landscapeDeck[deckAt] = s.upcomingLandscape!; s.upcomingLandscape = def.id;
  for (const industry of INDUSTRIES) {
    const held = company.markets[industry] ?? 0;
    if (held) { s.marketSupply[industry] += held; company.markets[industry] = 0; }
  }
  company.printedIndustries = [...def.industries]; company.industries = [...def.industries]; company.margin = 8;
  const marketIndustry = def.industries[0];
  s.marketSupply[marketIndustry]--; company.markets[marketIndustry] = 1;
  const supplyBefore = { ...s.marketSupply }; const reserveBefore = { ...s.marketReserve }; const pricesBefore = { ...s.prices };
  s.actionsTaken = 0;
  act(s, seat, { type: 'national', action: 'refresh' }, 'Refresh reveals exact in-play Landscape');
  check(s.pending?.kind === 'landscape' && s.pending.card === def.id && s.pending.context === 'refresh' && s.pending.delta === def.delta && s.pending.initiator === seat && s.pending.seat === owner && s.pending.overflow?.company === company.id, 'Landscape pending previews exact card/context/delta and assigns the crossing Company owner');
  check(JSON.parse(JSON.stringify(s)).pending?.kind === 'landscape', 'Landscape overflow reconnect state is fully serializable');
  for (const industry of def.industries) {
    check(s.marketSupply[industry] === supplyBefore[industry] + def.delta, `strict Landscape adds exact ${industry} shared supply`);
    check(s.marketReserve[industry] === reserveBefore[industry] - def.delta, `strict Landscape removes exact ${industry} reserve`);
  }
  for (const price of def.priceTracks) check(s.prices[price] === Math.max(1, Math.min(10, pricesBefore[price] + def.delta)), `strict Landscape applies bounded ${price} Price`);
  const beforeWrongOwner = JSON.stringify(s);
  const wrongOwner = applyPolitikAction(s, seat, { type: 'resolve_landscape', choice: marketIndustry });
  check(!wrongOwner.ok && JSON.stringify(s) === beforeWrongOwner, 'only the crossing Company owner may resolve its Landscape overflow');
  act(s, owner, { type: 'resolve_landscape', choice: marketIndustry }, 'owner resolves exact Landscape overflow choice');
  p = s.players[owner];
  check(p.companies[0].margin === 2, 'multi-Industry Company receives delta once for each of two listed Industries');
  check(p.companies[0].markets[marketIndustry] === 2, 'Landscape overflow takes matching Market and resets/continues');
  check(s.marketSupply[marketIndustry] === supplyBefore[marketIndustry] + def.delta - 1, 'overflow Market leaves exact shared supply');
  assertInvariants(s, 'strict in-play Landscape effects');
}

// Landscape supply and Price changes stop at physical/printed bounds.
{
  const s = ready(2, 129); const seat = s.turn;
  const def = LANDSCAPES.find((candidate) => candidate.delta < 0 && candidate.id !== s.activeLandscape && candidate.id !== s.upcomingLandscape)!;
  const deckAt = s.landscapeDeck.indexOf(def.id);
  s.landscapeDeck[deckAt] = s.upcomingLandscape!; s.upcomingLandscape = def.id;
  for (const industry of def.industries) { s.marketReserve[industry] += s.marketSupply[industry]; s.marketSupply[industry] = 0; }
  for (const price of def.priceTracks) s.prices[price] = 1;
  s.actionsTaken = 0;
  act(s, seat, { type: 'national', action: 'refresh' }, 'Refresh bounded negative Landscape');
  check(def.industries.every((industry) => s.marketSupply[industry] === 0), 'negative Landscape cannot remove below zero shared Markets');
  check(def.priceTracks.every((price) => s.prices[price] === 1), 'negative Landscape cannot move Price below 1');
  assertInvariants(s, 'bounded strict Landscape effects');
}
{
  const s = ready(2, 130); const seat = s.turn;
  const def = LANDSCAPES.find((candidate) => candidate.delta > 0 && candidate.id !== s.activeLandscape && candidate.id !== s.upcomingLandscape)!;
  const deckAt = s.landscapeDeck.indexOf(def.id);
  s.landscapeDeck[deckAt] = s.upcomingLandscape!; s.upcomingLandscape = def.id;
  for (const industry of def.industries) { s.marketReserve[industry] = 0; s.marketSupply[industry] = MARKETS_PER_INDUSTRY; }
  for (const price of def.priceTracks) s.prices[price] = 10;
  s.actionsTaken = 0;
  act(s, seat, { type: 'national', action: 'refresh' }, 'Refresh bounded positive Landscape');
  check(def.industries.every((industry) => s.marketSupply[industry] === MARKETS_PER_INDUSTRY), 'positive Landscape cannot add beyond the physical Market supply');
  check(def.priceTracks.every((price) => s.prices[price] === 10), 'positive Landscape cannot move Price above 10');
  assertInvariants(s, 'upper-bounded strict Landscape effects');
}

// Guided operations are typed and the public reducer is transactional.
{
  const s = ready(2, 104); const seat = s.turn; let p = s.players[seat];
  s.pending = { kind: 'guided', seat, source: 'Test Print', sourceCard: null, instruction: 'test', context: 'card' };
  const snapshot = JSON.stringify(s);
  const bad = applyPolitikAction(s, seat, { type: 'resolve_guided', operations: [{ kind: 'resource', seat, resource: 'capital', amount: 5 }, { kind: 'price', price: 'clash', amount: -99 }], note: 'invalid combined effect' });
  check(!bad.ok && JSON.stringify(s) === snapshot, 'invalid later guided operation rolls back earlier resource mutation');
  const capital = p.capital;
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'resource', seat, resource: 'capital', amount: 5 }, { kind: 'price', price: 'clash', amount: 1 }], note: 'confirmed two printed changes' }, 'valid guided operations');
  p = s.players[seat];
  check(p.capital === capital + 5 && s.prices.clash === 3 && s.log.at(-1)?.includes('operations: resource, price'), 'guided changes apply with precise public audit kinds');
}

// Fifth Propaganda replacement is explicit and atomic.
{
  const s = ready(2, 113); const seat = s.turn; let p = s.players[seat];
  while (p.propaganda.length < 4) p.propaganda.push({ ...structuredClone(p.propaganda[0]), instanceId: `setup-extra-${p.propaganda.length}` });
  const at = s.politicsDeck.findIndex((id) => POLITIK_CARDS[id].type === 'propaganda');
  const id = s.politicsDeck.splice(at, 1)[0];
  const definition = POLITIK_CARDS[id]; const base = definition.bases[0] ?? 'capitalism';
  p.hand.push({ kind: 'politik', id }); p.support[base] = 5; p.capital = 100; p.carbon = 10; p.corruption = definition.corruptionRequirement ?? 0;
  const snapshot = JSON.stringify(s);
  const rejected = applyPolitikAction(s, seat, { type: 'play_card', handIndex: p.hand.length - 1, spec: { kind: 'propaganda', base, capitalCost: 0, requirementsConfirmed: true } });
  check(!rejected.ok && JSON.stringify(s) === snapshot, 'fifth Propaganda without replacement is rejected atomically');
  const replaced = p.propaganda[0].instanceId;
  act(s, seat, { type: 'play_card', handIndex: p.hand.length - 1, spec: { kind: 'propaganda', base, capitalCost: 0, requirementsConfirmed: true }, replacePropaganda: replaced }, 'fifth Propaganda with replacement');
  p = s.players[seat];
  check(p.propaganda.length === 4 && !p.propaganda.some((x) => x.instanceId === replaced), 'replacement leaves exactly four controlled Propaganda');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Propaganda text checked.' }], note: 'Propaganda resolved' }, 'Propaganda guided resolver');
}

// Trade approvals, offer privacy, and transferred-property semantics.
{
  const s = ready(3, 114); const a = s.turn; const b = (a + 1) % 3;
  s.players[a].capital = 50;
  const handIndex = s.players[b].hand.findIndex((x) => x.kind !== 'obligation');
  const card = { ...s.players[b].hand[handIndex] };
  act(s, a, { type: 'propose_trade', participants: [a, b], transfers: [
    { from: a, to: b, kind: 'capital', amount: 10 },
    { from: b, to: a, kind: 'hand_card', handIndex },
    { from: a, to: b, kind: 'favor', favor: 'Support the next Chair tie.' },
  ] }, 'Trade proposal');
  const tv = politikViewFor(s, null).pending;
  const recipient = politikViewFor(s, b).pending;
  check(tv?.kind === 'trade' && tv.transfers === undefined, 'TV cannot see private offered hand card before acceptance');
  check(recipient?.kind === 'trade' && recipient.transfers?.length === 3, 'required approver sees full Trade builder');
  const visibleCard = recipient?.kind === 'trade' ? recipient.transfers?.find((x) => x.kind === 'hand_card') : undefined;
  check(visibleCard?.card?.id === card.id && !!visibleCard.label, 'Trade approver sees server-derived offered card identity and label');
  act(s, b, { type: 'respond_trade', accept: true }, 'Trade final approval');
  check(s.players[a].capital === 40 && s.players[b].capital >= 10 && s.players[a].hand.some((x) => x.kind === card.kind && x.id === card.id), 'accepted Trade transfers resources/card without gain triggers');
}

// The active player sees offered-card identity even when not participating;
// unrelated Nations and the TV see no transfer details.
{
  const s = ready(4, 125); const active = s.turn;
  const others = s.players.map((p) => p.seat).filter((seat) => seat !== active);
  const [proposer, recipient, neutral] = others;
  const handIndex = s.players[proposer].hand.findIndex((x) => x.kind === 'politik');
  const offered = s.players[proposer].hand[handIndex];
  act(s, proposer, { type: 'propose_trade', participants: [proposer, recipient], transfers: [{ from: proposer, to: recipient, kind: 'hand_card', handIndex }] }, 'non-active player proposes private-card Trade');
  const activePending = politikViewFor(s, active).pending;
  const activeOffer = activePending?.kind === 'trade' ? activePending.transfers?.[0] : undefined;
  check(activeOffer?.card?.id === offered.id && activeOffer.label === POLITIK_CARDS[offered.id].name, 'active approver sees server-derived Politik title and identity');
  check(politikViewFor(s, neutral).pending?.kind === 'trade' && (politikViewFor(s, neutral).pending as Extract<NonNullable<ReturnType<typeof politikViewFor>['pending']>, { kind: 'trade' }>).transfers === undefined, 'non-approver Nation cannot inspect offered card');
  check(politikViewFor(s, null).pending?.kind === 'trade' && (politikViewFor(s, null).pending as Extract<NonNullable<ReturnType<typeof politikViewFor>['pending']>, { kind: 'trade' }>).transfers === undefined, 'TV remains blind to offered card');
  if (s.pending?.kind !== 'trade') throw new Error('expected Trade prompt');
  act(s, s.pending.seat, { type: 'respond_trade', accept: false }, 'decline private-card Trade after inspection');
}

// Trading a State transfers its complete control stack and never its printed
// gain benefit; partial Influence offers are rejected atomically.
{
  const s = ready(2, 126); const from = s.turn; const to = (from + 1) % 2;
  const state = Object.values(s.locations).find((loc) => loc.kind === 'state' && locationController(s, loc.id) === from)!;
  const full = state.influence[from];
  const partialSnapshot = JSON.stringify(s);
  const partial = applyPolitikAction(s, from, { type: 'propose_trade', participants: [from, to], transfers: [{ from, to, kind: 'state', location: state.id, amount: full - 1 }] });
  check(!partial.ok && JSON.stringify(s) === partialSnapshot, 'partial State Influence Trade is rejected atomically');
  const resources = { capital: s.players[to].capital, carbon: s.players[to].carbon, food: s.players[to].food };
  act(s, from, { type: 'propose_trade', participants: [from, to], transfers: [{ from, to, kind: 'state', location: state.id }] }, 'offer complete State control');
  while (s.pending?.kind === 'trade') act(s, s.pending.seat, { type: 'respond_trade', accept: true }, 'approve full State Trade');
  check(s.locations[state.id].influence[from] === 0 && s.locations[state.id].influence[to] === full, 'accepted State Trade moves all controller Influence');
  check(s.players[to].capital === resources.capital && s.players[to].carbon === resources.carbon && s.players[to].food === resources.food, 'received State does not fire its printed gain benefit');
}

// Compact, explicit Edge response windows never leave the table waiting.
{
  const s = ready(3, 115); const active = s.turn; const actions = s.actionsTaken;
  act(s, active, { type: 'open_edge_window', reason: 'Before the next Main Action' }, 'open Edge response window');
  const order = s.pending?.kind === 'edge_window' ? [...s.pending.order] : [];
  for (const seat of order) act(s, seat, { type: 'pass_edge' }, `Edge PASS seat ${seat}`);
  check(!s.pending && s.actionsTaken === actions, 'all explicit PASS responses close window without consuming Main Action');
  const ordinary = s.players.map((player) => player.seat).find((seat) => seat !== active && seat !== s.finalSay) ?? (active + 1) % s.players.length;
  act(s, ordinary, { type: 'open_edge_window', reason: 'Ordinary opponent at-any-time Edge' }, 'ordinary non-active/non-Final-Say Nation opens Edge');
  const ordinaryOrder = s.pending?.kind === 'edge_window' ? [...s.pending.order] : [];
  check(ordinaryOrder[0] === ordinary && new Set(ordinaryOrder).size === s.players.length, 'Edge requester responds first, then every remaining Nation appears once');
  for (const responder of ordinaryOrder) act(s, responder, { type: 'pass_edge' }, `ordinary Edge PASS seat ${responder}`);
}

// Edge Event dispatch reaches its resume-aware handler before the generic
// pending guard, then returns to the same responder/cursor after guided text.
{
  const s = ready(3, 117); const active = s.turn; const actions = s.actionsTaken;
  act(s, active, { type: 'open_edge_window', reason: 'Before card resolution' }, 'open Edge Event window');
  const window = structuredClone(s.pending!);
  if (window.kind !== 'edge_window') throw new Error('expected edge window');
  const responder = window.seat;
  const at = s.politicsDeck.findIndex((id) => POLITIK_CARDS[id].type === 'event' && POLITIK_CARDS[id].edgeTimings.includes('at_any_time'));
  s.players[responder].capital = 100; s.players[responder].carbon = 10; s.players[responder].corruption = 10;
  s.players[responder].hand.push({ kind: 'politik', id: s.politicsDeck.splice(at, 1)[0] });
  act(s, responder, { type: 'play_card', handIndex: s.players[responder].hand.length - 1, spec: { kind: 'event', edge: true, capitalCost: 0, requirementsConfirmed: true } }, 'play Edge Event inside window');
  check(s.pending?.kind === 'guided' && s.pending.resume?.seat === responder && s.pending.resume.cursor === window.cursor, 'Edge Event guided prompt retains exact response window');
  act(s, responder, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Edge Event text checked.' }], note: 'Edge Event resolved' }, 'resolve Edge Event text');
  check(s.pending?.kind === 'edge_window' && s.pending.seat === responder && s.pending.cursor === window.cursor, 'Edge Event resumes same responder without skipping');
  act(s, responder, { type: 'pass_edge' }, 'Edge Event user PASS');
  check(s.pending?.kind === 'edge_window' && s.pending.seat === window.order[window.cursor + 1], 'next responder follows Edge Event user');
  while (s.pending?.kind === 'edge_window') act(s, s.pending.seat, { type: 'pass_edge' }, 'remaining Edge Event PASS');
  check(s.actionsTaken === actions, 'Edge Event window consumed no Main Action');
}

// Edge Ability has the same guided-resume behavior.
{
  const s = ready(3, 118); const active = s.turn;
  act(s, active, { type: 'open_edge_window', reason: 'Before ability timing' }, 'open Edge Ability window');
  const window = structuredClone(s.pending!);
  if (window.kind !== 'edge_window') throw new Error('expected edge window');
  const source = s.players[window.seat].propaganda[0].instanceId;
  act(s, window.seat, { type: 'use_ability', source: { kind: 'propaganda', id: source }, asEdge: true }, 'use Edge Ability inside window');
  check(s.pending?.kind === 'guided' && s.pending.resume?.seat === window.seat, 'Edge Ability guided prompt retains response window');
  act(s, window.seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Edge Ability text checked.' }], note: 'Edge Ability resolved' }, 'resolve Edge Ability text');
  check(s.pending?.kind === 'edge_window' && s.pending.seat === window.seat && s.pending.cursor === window.cursor, 'Edge Ability resumes same responder');
  act(s, window.seat, { type: 'pass_edge' }, 'Edge Ability user PASS');
  check(s.pending?.kind === 'edge_window' && s.pending.seat === window.order[window.cursor + 1], 'next responder follows Edge Ability user');
  while (s.pending?.kind === 'edge_window') act(s, s.pending.seat, { type: 'pass_edge' }, 'remaining Edge Ability PASS');
}

// Already Activated cards may resolve abilities whose printed cost is not
// Activate; only an explicitly confirmed Activate cost requires Ready.
{
  const s = ready(2, 120); const seat = s.turn; const source = s.players[seat].propaganda[0].instanceId;
  s.players[seat].propaganda[0].ready = false;
  act(s, seat, { type: 'use_ability', source: { kind: 'propaganda', id: source }, activate: false }, 'use non-Activate ability on Activated card');
  check(s.pending?.kind === 'guided' && !s.players[seat].propaganda[0].ready, 'non-Activate ability is allowed and preserves Activated state');
  act(s, seat, { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Non-Activate ability checked.' }], note: 'Non-Activate ability resolved' }, 'resolve non-Activate ability');
  s.actionsTaken = 0;
  const snapshot = JSON.stringify(s);
  const rejected = applyPolitikAction(s, seat, { type: 'use_ability', source: { kind: 'propaganda', id: source }, activate: true });
  check(!rejected.ok && JSON.stringify(s) === snapshot, 'Activate-cost ability rejects already Activated source atomically');
  s.players[seat].propaganda[0].ready = true;
  act(s, seat, { type: 'use_ability', source: { kind: 'propaganda', id: source }, activate: true }, 'pay explicit Activate cost');
  check(!s.players[seat].propaganda[0].ready, 'explicit Activate cost flips Ready source to Activated');
}

// Traded card use follows the same explicit Activate-cost rule.
{
  const s = ready(3, 121); const from = s.turn; const to = (from + 1) % 3; const source = s.players[from].propaganda[0].instanceId;
  s.players[from].propaganda[0].ready = false;
  const bad = applyPolitikAction(s, from, { type: 'propose_trade', participants: [from, to], transfers: [{ from, to, kind: 'use', source: { kind: 'propaganda', id: source }, activate: true }] });
  check(!bad.ok, 'Trade cannot promise unavailable Activate-cost use');
  act(s, from, { type: 'propose_trade', participants: [from, to], transfers: [{ from, to, kind: 'use', source: { kind: 'propaganda', id: source }, activate: false }] }, 'Trade non-Activate card use');
  while (s.pending?.kind === 'trade') act(s, s.pending.seat, { type: 'respond_trade', accept: true }, 'approve traded card use');
  check(s.pending?.kind === 'guided' && s.pending.seat === to && !s.players[from].propaganda[0].ready, 'traded non-Activate use preserves source state and guides recipient');
}

// Trade approvals temporarily replace an Edge window and restore it only
// after every participant plus the active player has approved.
{
  const s = ready(3, 119); const active = s.turn;
  act(s, active, { type: 'open_edge_window', reason: 'During Trade timing' }, 'open Edge Trade window');
  const window = structuredClone(s.pending!);
  if (window.kind !== 'edge_window') throw new Error('expected edge window');
  const responder = window.seat; const partner = (responder + 1) % 3;
  s.players[responder].capital = 20;
  act(s, responder, { type: 'propose_trade', participants: [responder, partner], transfers: [{ from: responder, to: partner, kind: 'capital', amount: 1 }] }, 'propose Trade inside Edge window');
  check(s.pending?.kind === 'trade' && s.pending.resume?.seat === responder && s.pending.resume.cursor === window.cursor, 'Trade prompt retains exact Edge window');
  while (s.pending?.kind === 'trade') act(s, s.pending.seat, { type: 'respond_trade', accept: true }, 'approve Edge Trade');
  check(s.pending?.kind === 'edge_window' && s.pending.seat === responder && s.pending.cursor === window.cursor, 'accepted Trade resumes same responder');
  act(s, responder, { type: 'pass_edge' }, 'Edge Trade user PASS');
  check(s.pending?.kind === 'edge_window' && s.pending.seat === window.order[window.cursor + 1], 'next responder follows Edge Trade user');
  while (s.pending?.kind === 'edge_window') act(s, s.pending.seat, { type: 'pass_edge' }, 'remaining Edge Trade PASS');
}

// Military Clash: authentic adjacency, hidden Focus, spent Influence/leaders,
// simultaneous reveal, and card discard.
// Broadcast Station Signal/Noise are structured, adjacent-region-only effects.
{
  const s = ready(3, 137); const seat = s.turn; const other = (seat + 1) % 3; const immune = (seat + 2) % 3;
  const station = Object.values(s.locations).find((location) => location.kind === 'station')!;
  const adjacentStates = Object.values(s.locations).filter((location) => location.kind === 'state' && !!location.region && station.regions.includes(location.region));
  const signalState = adjacentStates[0]; const noiseState = adjacentStates[1]; const immuneState = adjacentStates[2];
  const distant = Object.values(s.locations).find((location) => location.kind === 'state' && !!location.region && !station.regions.includes(location.region))!;
  for (const location of [station, signalState, noiseState, immuneState, distant]) { location.influence.fill(0); location.imperialInfluence = 0; }
  station.influence[seat] = 3; station.stationReady = true;
  signalState.influence[seat] = 2; distant.influence[seat] = 2;
  noiseState.influence[other] = 1; immuneState.influence[immune] = 3;
  const propaganda = (id: string, base: (typeof BASES)[number]) => ({ instanceId: id, card: { kind: 'starting_propaganda' as const, id }, title: id, ready: true, bases: [base], corruption: false, negotiation: false, industries: [] });
  s.players[seat].propaganda = [propaganda('signal-1', 'capitalism'), propaganda('signal-2', 'capitalism')];
  s.players[other].propaganda = [propaganda('defense-1', 'capitalism')]; s.players[immune].propaganda = [];
  s.players[immune].immunity.temporary = true;
  const signalBefore = signalState.influence[seat]; const distantBefore = distant.influence[seat];
  act(s, seat, { type: 'broadcast', station: station.id, mode: 'signal', base: 'capitalism' }, 'structured Broadcast Signal');
  check(s.locations[signalState.id].influence[seat] === signalBefore + 2 && s.locations[distant.id].influence[seat] === distantBefore, 'Signal adds matching Propaganda count to each controlled ordinary State only in adjacent Regions');
  check(!s.locations[station.id].stationReady, 'Signal activates the Broadcast Station');
  s.locations[station.id].stationReady = true;
  act(s, seat, { type: 'broadcast', station: station.id, mode: 'noise', base: 'capitalism' }, 'structured Broadcast Noise');
  check(s.locations[noiseState.id].influence[other] === 0 && s.locations[noiseState.id].imperialInfluence === 1, 'Noise removes attacker-minus-controller Propaganda Influence and restores an empty State Imperial flag');
  check(s.locations[immuneState.id].influence[immune] === 3, 'Immunity prevents Broadcast Noise');
}

{
  const s = ready(2, 105); const seat = s.turn; let p = s.players[seat];
  const source = Object.values(s.locations).find((x) => locationController(s, x.id) === seat)!;
  const targetId = POLITIK_ADJACENCY[source.id].find((id) => s.locations[id].kind === 'state' && s.locations[id].imperialInfluence > 0)!;
  const high = cardWithFocus('military', true); const low = cardWithFocus('military', false);
  p.hand = [{ kind: 'politik', id: high }]; p.carbon = 10; p.leaders.military = 2; s.politicsDeck.push(low);
  const sourceBefore = source.influence[seat];
  act(s, seat, { type: 'clash', target: { arena: 'military', location: targetId }, payment: 'carbon' }, 'Military Clash declaration');
  passClashWindow(s, 'Military after cost');
  const verifiedPrintedFocus = POLITIK_CARDS[high].focus.military;
  act(s, seat, { type: 'clash_commit', cards: [{ handIndex: 0, focus: 10 }], leaders: 1, focusInfluence: { [source.id]: 2 } }, 'Military hidden commitment with verified printed Focus');
  p = s.players[seat];
  const verifiedFocus = politikViewFor(s, seat).pending;
  check(verifiedFocus?.kind === 'clash' && verifiedFocus.yourCommitment?.cards[0].focus === verifiedPrintedFocus, 'verified printed Focus cannot be overridden by client input');
  check(s.locations[source.id].influence[seat] === sourceBefore - 2 && p.leaders.military === 1, 'committed adjacent Influence and leader are spent');
  finishClashResponses(s, 'Military timing');
  check(locationController(s, targetId) === seat && s.politicsDiscard.includes(high), 'Military difference removes Imperial Influence, adds winner Influence, and discards Focus card');
}

// Political Clash redaction and capture limit.
{
  const s = ready(2, 106); const attacker = s.turn; const defender = (attacker + 1) % 2;
  s.players[attacker].carbon = 10;
  s.councilSupport.chair[defender] = 3;
  s.players[attacker].hand = [{ kind: 'politik', id: cardWithFocus('political', true) }];
  s.players[defender].hand = [{ kind: 'politik', id: cardWithFocus('political', false) }];
  act(s, attacker, { type: 'clash', target: { arena: 'political', council: 'chair', defender }, payment: 'carbon' }, 'Political Clash declaration');
  passClashWindow(s, 'Political after cost');
  act(s, attacker, { type: 'clash_commit', cards: [{ handIndex: 0 }] }, 'Political attacker commitment');
  const tvPending = politikViewFor(s, null).pending;
  const attackerPending = politikViewFor(s, attacker).pending;
  check(tvPending?.kind === 'clash' && !('yourCommitment' in tvPending), 'TV never sees hidden Clash commitment');
  check(attackerPending?.kind === 'clash' && !!attackerPending.yourCommitment, 'committer sees only own locked commitment');
  if (s.pending?.kind !== 'clash') throw new Error('expected attacker Focus timing');
  act(s, s.pending.seat, { type: 'clash_modifier', side: 'attacker', amount: 2, source: 'Directed timing test' }, 'typed during-Focus Clash modifier');
  passClashWindow(s, 'Political attacker Focus');
  act(s, defender, { type: 'clash_commit', cards: [{ handIndex: 0 }] }, 'Political defender commitment');
  passClashWindow(s, 'Political defender Focus');
  const revealed = politikViewFor(s, null).pending;
  check(revealed?.kind === 'clash' && revealed.stage === 'after_reveal' && !!revealed.revealedCommitments?.attacker && !!revealed.revealedCommitments?.defender, 'both hidden commitments become public together only after reveal');
  check(JSON.parse(JSON.stringify(s)).pending?.stage === 'after_reveal', 'Clash reveal/timing state survives reconnect serialization');
  passClashWindow(s, 'Political after reveal');
  passClashWindow(s, 'Political before resolve');
  check(s.lastClash?.modifiers?.some((modifier) => modifier.amount === 2 && modifier.side === 'attacker'), 'typed Clash Focus modifier contributes to the logged resolution');
  check(s.councilSupport.chair[defender] === 0 && s.councilSupport.chair[attacker] === 3, 'Political winner captures difference limited by starting target Support');
}

// Startup Companies carry universal Focus 1 while in hand. They reveal with
// their tagged identity and go to the Startup discard; Obligations cannot Focus.
{
  const s = ready(2, 122); const attacker = s.turn; const defender = (attacker + 1) % 2;
  s.players[attacker].carbon = 10;
  s.councilSupport.chair[defender] = 2;
  const startupIndex = s.players[attacker].hand.findIndex((x) => x.kind === 'startup');
  const startupId = s.players[attacker].hand[startupIndex].id;
  act(s, attacker, { type: 'clash', target: { arena: 'political', council: 'chair', defender }, payment: 'carbon' }, 'Startup Focus Clash declaration');
  passClashWindow(s, 'Startup Clash after cost');
  act(s, attacker, { type: 'clash_commit', cards: [{ handIndex: startupIndex, focus: 1 }] }, 'commit Startup universal Focus');
  const own = politikViewFor(s, attacker).pending;
  const tv = politikViewFor(s, null).pending;
  check(own?.kind === 'clash' && own.yourCommitment?.cards[0].card.kind === 'startup' && own.yourCommitment.cards[0].focus === 1, 'owner view retains tagged hidden Startup Focus 1');
  check(tv?.kind === 'clash' && !('yourCommitment' in tv), 'TV does not reveal focused Startup early');
  passClashWindow(s, 'Startup attacker Focus');
  const obligationId = s.obligationDeck.pop()!;
  s.players[defender].hand.push({ kind: 'obligation', id: obligationId });
  const obligationIndex = s.players[defender].hand.length - 1;
  const snapshot = JSON.stringify(s);
  const rejected = applyPolitikAction(s, defender, { type: 'clash_commit', cards: [{ handIndex: obligationIndex, focus: 1 }] });
  check(!rejected.ok && JSON.stringify(s) === snapshot, 'Obligation Focus is rejected atomically');
  act(s, defender, { type: 'clash_commit', cards: [] }, 'defender passes Focus commitment');
  finishClashResponses(s, 'Startup Clash timing');
  check(s.lastClash?.attackerCommitment.cards[0].card.kind === 'startup' && s.startupDiscard.includes(startupId), 'revealed Startup goes to Startup discard, not Politik discard');
  assertInvariants(s, 'Startup Focus conservation');
}

// Clash cancellation retains all declaration costs, and Edge Event/Shirk
// interruptions resume the exact staged Clash cursor.
{
  const s = ready(2, 140); const seat = s.turn; const p = s.players[seat];
  const target = Object.values(s.locations).find((location) => location.kind === 'state' && location.imperialInfluence > 0)!;
  p.carbon = 10; const carbon = p.carbon; const imperial = target.imperialInfluence;
  act(s, seat, { type: 'clash', target: { arena: 'military', location: target.id }, payment: 'carbon' }, 'cancelable Clash declaration');
  const paid = s.prices.clash;
  act(s, seat, { type: 'cancel_clash', source: 'Printed cancel test' }, 'cancel Clash after costs');
  check(s.players[seat].carbon === carbon - paid && s.actionsTaken === 1 && s.locations[target.id].imperialInfluence === imperial && s.lastClash?.cancelled === true, 'Clash cancellation keeps paid cost/action and skips the board effect');
}
{
  const s = ready(2, 141); const attacker = s.turn; const defender = (attacker + 1) % 2;
  s.players[attacker].carbon = 10; s.players[attacker].capital = 500; s.players[attacker].corruption = 10; s.councilSupport.chair[defender] = 1;
  act(s, attacker, { type: 'clash', target: { arena: 'political', council: 'chair', defender }, payment: 'carbon' }, 'interruptible Clash declaration');
  passClashWindow(s, 'interruptible Clash after cost');
  act(s, attacker, { type: 'clash_commit', cards: [] }, 'interruptible attacker commitment');
  const eventAt = s.politicsDeck.findIndex((id) => POLITIK_CARDS[id].type === 'event' && POLITIK_CARDS[id].edgeTimings.some((timing) => timing === 'at_any_time' || timing === 'during_focus'));
  s.players[attacker].hand.push({ kind: 'politik', id: s.politicsDeck.splice(eventAt, 1)[0] });
  act(s, attacker, { type: 'play_card', handIndex: s.players[attacker].hand.length - 1, spec: { kind: 'event', edge: true, capitalCost: 0, requirementsConfirmed: true } }, 'Edge Event during Clash Focus');
  check(s.pending?.kind === 'guided' && s.pending.resume?.kind === 'clash' && s.pending.resume.stage === 'attacker_focus', 'Edge Event serializes and suspends the exact Clash stage');
  act(s, attacker, { type: 'resolve_guided', operations: [{ kind: 'clash_modifier', side: 'attacker', amount: 1, source: 'Edge modifier' }], note: 'Edge modifies attacker Focus' }, 'resolve Clash Edge modifier');
  check(s.pending?.kind === 'clash' && s.pending.stage === 'attacker_focus' && s.pending.modifiers.some((modifier) => modifier.amount === 1), 'Edge Event resumes the same Clash responder/cursor with typed modifier');
  const obligation = s.obligationDeck.pop()!; s.players[attacker].hand.push({ kind: 'obligation', id: obligation });
  if (s.pending?.kind !== 'clash') throw new Error('expected resumed Clash');
  const stage = s.pending.stage; const cursor = s.pending.cursor; const responder = s.pending.seat;
  act(s, responder, { type: 'shirk_obligation', handIndex: s.players[responder].hand.length - 1 }, 'Shirk during Clash response');
  check(s.pending?.kind === 'clash' && s.pending.stage === stage && s.pending.cursor === cursor && s.pending.seat === responder, 'Shirk returns to the exact Clash response without advancing it');
  act(s, responder, { type: 'cancel_clash', source: 'Close interruption test' }, 'close interrupted Clash');
  assertInvariants(s, 'Clash interruption conservation');
}

// Broadcast Station capture resolves its +1 Support benefit by explicit Base.
{
  const s = ready(2, 116); const seat = s.turn; const p = s.players[seat];
  const station = Object.values(s.locations).find((x) => x.kind === 'station')!;
  const sourceId = POLITIK_ADJACENCY[station.id].find((id) => s.locations[id].kind === 'state')!;
  s.locations[sourceId].influence.fill(0); s.locations[sourceId].influence[seat] = 5; s.locations[sourceId].imperialInfluence = 0;
  p.carbon = 10; p.leaders.military = 2;
  const high = cardWithFocus('military', true);
  p.hand = [{ kind: 'politik', id: high }, { kind: 'politik', id: high }];
  const supportBefore = BASES.reduce((n, x) => n + p.support[x], 0);
  act(s, seat, { type: 'clash', target: { arena: 'military', location: station.id }, payment: 'carbon' }, 'Broadcast Station Clash');
  passClashWindow(s, 'Broadcast Station after cost');
  act(s, seat, { type: 'clash_commit', cards: [{ handIndex: 0 }, { handIndex: 1 }], leaders: 1, focusInfluence: { [sourceId]: 2 } }, 'Broadcast Station commitment');
  finishClashResponses(s, 'Broadcast Station timing');
  check(s.pending?.kind === 'allocate_support' && locationController(s, station.id) === seat, 'captured Broadcast Station opens Support Base prompt');
  act(s, seat, { type: 'allocate_support', support: { capitalism: 1 } }, 'Broadcast Station Support allocation');
  check(BASES.reduce((n, x) => n + s.players[seat].support[x], 0) === supportBefore + 1, 'Broadcast Station grants exactly 1 Support');
}

// Corporate Clash loss allocation transfers compatible Markets.
{
  const s = ready(2, 107); const attacker = s.turn; const defender = (attacker + 1) % 2;
  const makeCompany = (id: string, margin: number, markets: number) => ({ id, card: { kind: 'startup' as const, id }, title: id, ready: true, printedIndustries: ['energy' as const], industries: ['energy' as const], markets: { energy: markets }, margin, assets: [], negotiation: false });
  s.players[attacker].companies = [makeCompany('attacker-co', 0, 0)];
  s.players[defender].companies = [makeCompany('defender-co', 2, 1)];
  s.marketSupply.energy = 1;
  s.players[attacker].carbon = 10;
  s.players[attacker].hand = [{ kind: 'politik', id: cardWithFocus('corporate', true) }];
  s.players[defender].hand = [{ kind: 'politik', id: cardWithFocus('corporate', false) }];
  act(s, attacker, { type: 'clash', target: { arena: 'corporate', attackerCompany: 'attacker-co', defenderCompany: 'defender-co', defender }, payment: 'carbon' }, 'Corporate Clash declaration');
  passClashWindow(s, 'Corporate after cost');
  act(s, attacker, { type: 'clash_commit', cards: [{ handIndex: 0 }] }, 'Corporate attacker commitment');
  passClashWindow(s, 'Corporate attacker Focus');
  act(s, defender, { type: 'clash_commit', cards: [{ handIndex: 0 }] }, 'Corporate defender commitment');
  finishClashResponses(s, 'Corporate timing');
  check(s.pending?.kind === 'corporate_loss', 'Corporate loser receives serializable loss prompt');
  act(s, defender, { type: 'resolve_corporate_loss', margin: 2, markets: { energy: 1 } }, 'Corporate loss allocation');
  check(s.players[attacker].companies[0].markets.energy === 1 && s.players[attacker].companies[0].margin === 2 && s.players[defender].companies[0].margin === 0, 'compatible Market and Margin transfer to the winning Company');
}
{
  const s = ready(2, 139); const winner = s.turn; const loser = (winner + 1) % 2;
  const makeCompany = (id: string, margin: number) => ({ id, card: { kind: 'starting_propaganda' as const, id }, title: id, ready: true, printedIndustries: ['energy' as const], industries: ['energy' as const], markets: {}, margin, assets: [], negotiation: false });
  s.players[winner].companies = [makeCompany('overflow-winner', 8)]; s.players[loser].companies = [makeCompany('overflow-loser', 2)]; s.marketSupply.energy = Math.max(1, s.marketSupply.energy);
  const empty = { cards: [], leaders: 0, focusInfluence: {}, total: 0 };
  const clash = { arena: 'corporate' as const, attacker: winner, defender: loser, target: { arena: 'corporate' as const, attackerCompany: 'overflow-winner', defenderCompany: 'overflow-loser', defender: loser }, attackerCommitment: empty, defenderCommitment: empty, attackerTotal: 2, defenderTotal: 0, winner, imperialWon: false, difference: 2 };
  s.pending = { kind: 'corporate_loss', seat: loser, loser, loserCompany: 'overflow-loser', winnerCompany: 'overflow-winner', amount: 2, clash };
  act(s, loser, { type: 'resolve_corporate_loss', margin: 2 }, 'Corporate transferred Margin crossing');
  const gain = s.pending as unknown as Extract<NonNullable<PolitikState['pending']>, { kind: 'corporate_gain' }> | null;
  check(gain?.kind === 'corporate_gain' && gain.seat === winner && gain.total === 10 && gain.marginTransferred === 2, 'winning owner receives a serializable Corporate Margin overflow prompt');
  check(JSON.parse(JSON.stringify(s)).pending?.kind === 'corporate_gain', 'Corporate winner overflow survives reconnect serialization');
  const wrongSnapshot = JSON.stringify(s); const wrong = applyPolitikAction(s, loser, { type: 'resolve_corporate_gain', choice: 'energy' });
  check(!wrong.ok && JSON.stringify(s) === wrongSnapshot, 'only the winning Company owner resolves transferred Margin overflow');
  const supply = s.marketSupply.energy;
  act(s, winner, { type: 'resolve_corporate_gain', choice: 'energy' }, 'winning owner resolves Corporate Margin overflow');
  check(s.players[winner].companies[0].margin === 0 && s.players[winner].companies[0].markets.energy === 1 && s.marketSupply.energy === supply - 1, 'Corporate Margin uses normal matching-Market reset/continue semantics');
}

// Final Say can award any tied Nation; ruling expires when tie signature changes.
{
  const s = ready(2, 108); s.turn = 0; s.finalSay = 0; s.players.forEach((p) => { p.corruption = 0; p.negotiation = 0; });
  s.councilSupport.chair = [2, 2];
  act(s, 0, { type: 'final_say', contest: 'council:chair', winner: 1 }, 'Final Say awards another Nation');
  check(councilController(s, 'chair') === 1, 'persisted Final Say ruling controls tied Seat');
  s.councilSupport.chair = [3, 3];
  check(councilController(s, 'chair') === null && politikTieContests(s).find((x) => x.key === 'council:chair')?.ruling === null, 'ruling automatically expires when tied value changes');
}
{
  const s = ready(2, 138); s.turn = 0; s.players[0].corruption = 3; s.players[1].corruption = 0; s.players.forEach((player) => { player.negotiation = 0; });
  for (const council of COUNCIL_SEATS) s.councilSupport[council].fill(0);
  s.councilSupport.justice = [2, 2]; s.tieRulings = {};
  recomputeFinalSay(s);
  check(s.finalSay === 0 && councilController(s, 'justice') === null, 'an unruled Justice tie falls through to the next Final Say criterion');
  act(s, 0, { type: 'final_say', contest: 'council:justice', winner: 1 }, 'rule tied Justice to another Nation');
  check(councilController(s, 'justice') === 1 && s.finalSay === 1, 'a valid Justice ruling transfers Final Say immediately to its awarded controller');
}

// Power Grabs, standard thresholds, and corrected variants.
{
  const s = ready(5, 109); const seat = s.turn; let p = s.players[seat];
  for (const region of ['A', 'B', 'C']) {
    for (const loc of Object.values(s.locations).filter((x) => x.kind === 'state' && x.region === region).slice(0, 2)) { loc.influence.fill(0); loc.influence[seat] = 2; loc.imperialInfluence = 0; }
  }
  for (const council of COUNCIL_SEATS.slice(0, 4)) { s.councilSupport[council].fill(0); s.councilSupport[council][seat] = 2; }
  s.actionsTaken = s.actionsAllowed;
  act(s, seat, { type: 'end_turn' }, 'explicit Check Power Grabs');
  p = s.players[seat];
  check(s.phase === 'ended' && p.powerGrabs.military === 1 && p.powerGrabs.political === 1, '5p winner claims every met arena and wins at 2 total across 2 types');
  const trifecta = ready(2, 110); trifecta.options.trifecta = true; trifecta.players[0].powerGrabs = { military: 1, political: 1, corporate: 1 };
  check(meetsVictory(trifecta, trifecta.players[0]), 'Trifecta wins with one of every type and ignores standard 2p total');
  const long = ready(4, 111); long.options.longWar = true;
  check(victoryThreshold(long) === 4, 'Long War adds exactly 1 Power Grab to standard victory');
  const raging = ready(2, 112); const rs = raging.turn; const rp = raging.players[rs];
  const neutral = Object.values(raging.locations).find((x) => x.kind === 'state' && x.imperialInfluence > 0)!;
  rp.carbon = 10; rp.hand = [{ kind: 'politik', id: cardWithFocus('military', true) }, { kind: 'politik', id: cardWithFocus('military', true) }]; raging.options.ragingImperials = true;
  act(raging, rs, { type: 'clash', target: { arena: 'military', location: neutral.id }, payment: 'carbon' }, 'Raging Imperial Clash');
  passClashWindow(raging, 'Raging after cost');
  act(raging, rs, { type: 'clash_commit', cards: [{ handIndex: 0 }, { handIndex: 1 }] }, 'Raging attacker commitment');
  finishClashResponses(raging, 'Raging timing');
  check(raging.lastClash?.defenderCommitment?.cards.length === 2, 'Raging Imperials flips one additional Politik card');
}

// Full deterministic CPU games at every supported count.
for (let count = 2; count <= 6; count++) {
  const s = createPolitik(seated(count), 7000 + count);
  const result = drive(s);
  if (result.error) console.error(`${count}p bot error after ${result.steps}: ${result.error}`);
  check(!result.error, `${count}p bot game makes only legal actions`);
  check(s.phase === 'ended' && !!s.winners?.length, `${count}p bot game reaches a winner (${result.steps} steps)`);
  assertInvariants(s, `${count}p final`);
  const s2 = createPolitik(seated(count), 7000 + count);
  drive(s2);
  check(JSON.stringify(s) === JSON.stringify(s2), `${count}p full game deterministic`);
}

console.log(`${pass}/${pass + fail} Politik checks passed`);
process.exit(fail ? 1 : 0);
