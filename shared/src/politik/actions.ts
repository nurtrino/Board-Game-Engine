// Politik action reducer. All mutations are atomic and server-authoritative.
// Unique card text which is not encoded is routed through a typed guided
// resolver with a public audit entry; it is never silently ignored.

import {
  ARENAS, BASES, COUNCIL_SEATS, INDUSTRIES, NATIONAL_ACTIONS, NATION_BY_ID,
  MAX_COMPANIES, POLITIK_ADJACENCY, POLITIK_CARDS, PRICE_TRACKS, PROPAGANDA_BY_ID, STARTUP_BY_ID,
  controlledCouncil, controlledIndustries, controlledRegions,
  beginPolitikLandscape,
  councilController, drawObligation, drawPolitik, industryController,
  locationController, meetsVictory, nextInstanceId, politikEvent,
  politikTieContests, recomputeFinalSay, resolvePolitikLandscapeOverflow,
  type Arena, type BaseId, type ClashCommitment, type ClashPending, type ClashStage, type ClashTarget,
  type CompanyState, type CouncilId, type HandCard, type IndustryId,
  type LocationId, type NationalActionId, type PolitikLocation, type PolitikPending,
  type PolitikCardDef, type PolitikPlayer, type PolitikResume, type PolitikState, type PriceId, type PublicClash,
  type ResourceId, type SetupBonus, type TableauCard, type TradeTransfer,
} from './state.js';

export interface ExchangeTransaction {
  resource: 'food' | 'carbon';
  mode: 'buy' | 'sell';
  amount: number;
}

interface PlayCommon {
  title?: string;
  capitalCost?: number;
  carbonCost?: number;
  /** Printed minimum Corruption required to declare this card. */
  corruptionRequirement?: number;
  /** Required when a player has entered authoritative values from an unverified physical card. */
  requirementsConfirmed?: boolean;
  corruption?: boolean;
}

export type CardPlaySpec =
  | (PlayCommon & { kind: 'company'; industries?: IndustryId[]; startingMargin?: number })
  | (PlayCommon & { kind: 'asset'; industries: IndustryId[]; startingMargin: number })
  | (PlayCommon & { kind: 'propaganda'; base: BaseId; supportCost?: number; negotiation?: boolean })
  | (PlayCommon & { kind: 'event'; edge?: boolean })
  | (PlayCommon & { kind: 'obligation' });

export type GuidedOperation =
  | { kind: 'resource'; seat: number; resource: ResourceId; amount: number }
  | { kind: 'corruption'; seat: number; amount: number }
  | { kind: 'support'; seat: number; from?: { zone: 'base' | 'council'; id: string }; to?: { zone: 'base' | 'council'; id: string }; amount: number }
  | { kind: 'influence'; seat: number; location: LocationId; amount: number }
  | { kind: 'market'; seat: number; company: string; industry: IndustryId; amount: number }
  | { kind: 'market_supply'; industry: IndustryId; amount: number }
  | { kind: 'industry_margin'; industry: IndustryId; amount: number; overflowChoices?: Partial<Record<string, IndustryId | null>> }
  | { kind: 'margin'; seat: number; company: string; amount: number }
  | { kind: 'price'; price: PriceId; amount: number }
  | { kind: 'ready'; seat: number; source: 'company' | 'asset' | 'propaganda' | 'station'; id: string; ready: boolean }
  | { kind: 'leader'; seat: number; arena: Arena; amount: number }
  | { kind: 'draw'; seat: number; deck: 'politik' | 'obligation'; amount: number }
  | { kind: 'immunity'; seat: number; active: boolean }
  | { kind: 'move_card'; seat: number; handIndex: number; to: 'politik_discard' | 'obligation_bottom' }
  | { kind: 'clash_modifier'; side: 'attacker' | 'defender'; amount: number; source?: string }
  | { kind: 'cancel_clash'; source?: string }
  | { kind: 'acknowledge'; text: string };

export type AbilitySource = { kind: 'company' | 'asset' | 'propaganda' | 'station'; id: string };

export type PolitikAction =
  | { type: 'mulligan'; take: boolean }
  | { type: 'choose_nation'; nation: string; propaganda: string; support?: Partial<Record<BaseId, number>>; supportBase?: BaseId; leaders: Partial<Record<Arena, number>>; steelyWitCouncil?: CouncilId }
  | { type: 'choose_setup_bonus'; bonus: SetupBonus; exchange?: ExchangeTransaction[] }
  | { type: 'choose_start_state'; state: string }
  | { type: 'research'; amount: number }
  | { type: 'educate'; leaders: Partial<Record<Arena, number>> }
  | { type: 'exchange'; transactions: ExchangeTransaction[] }
  | { type: 'campaign'; council: CouncilId; fromBases: Partial<Record<BaseId, number>> }
  | {
      type: 'national'; action: NationalActionId;
      incomeMarket?: { company: string; industry: IndustryId } | null;
      rallySupport?: Partial<Record<BaseId, number>>;
      chair?: { seat: number; council: CouncilId };
      commerceMarket?: { company: string; industry: IndustryId };
      commerceExchange?: ExchangeTransaction[];
      laborLeader?: Arena;
      laborPrices?: { price: PriceId; amount: number }[];
      defenseInfluence?: { location: LocationId; amount: number }[];
      produceSupport?: Partial<Record<BaseId, number>>;
    }
  | { type: 'play_card'; handIndex: number; spec: CardPlaySpec; targetCompany?: string; marketIndustry?: IndustryId; replacePropaganda?: string; marginMarket?: IndustryId | null }
  | { type: 'use_ability'; source: AbilitySource; asEdge?: boolean; activate?: boolean }
  | { type: 'broadcast'; station: LocationId; mode: 'signal' | 'noise'; base: BaseId }
  | { type: 'clash'; target: ClashTarget; payment?: 'carbon' | 'leader' }
  | { type: 'clash_commit'; cards: { handIndex: number; focus?: number }[]; leaders?: number; focusInfluence?: Partial<Record<LocationId, number>> }
  | { type: 'resolve_corporate_loss'; margin: number; markets?: Partial<Record<IndustryId, number>> }
  | { type: 'resolve_corporate_gain'; choice: IndustryId | null }
  | { type: 'resolve_guided'; operations: GuidedOperation[]; note: string; canceled?: boolean }
  | { type: 'resolve_landscape'; choice: IndustryId | null }
  | { type: 'discard'; handIndices: number[] }
  | { type: 'shirk_obligation'; handIndex: number }
  | { type: 'propose_trade'; participants: number[]; transfers: TradeTransfer[] }
  | { type: 'respond_trade'; accept: boolean }
  | { type: 'final_say'; contest: string; winner: number }
  | { type: 'allocate_support'; support: Partial<Record<BaseId, number>> }
  | { type: 'open_edge_window'; reason: string; order?: number[] }
  | { type: 'pass_edge' }
  | { type: 'pass_clash' }
  | { type: 'clash_modifier'; side: 'attacker' | 'defender'; amount: number; source: string }
  | { type: 'cancel_clash'; source: string }
  | { type: 'end_turn' };

export interface PolitikResult { ok: boolean; error?: string }
const ok = (): PolitikResult => ({ ok: true });
const err = (error: string): PolitikResult => ({ ok: false, error });

function integer(n: number, min = 0, max = 100): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

function sumRecord<K extends string>(keys: readonly K[], record: Partial<Record<K, number>> | undefined): number {
  return keys.reduce((n, key) => n + (record?.[key] ?? 0), 0);
}

function companyById(s: PolitikState, id: string): { player: PolitikPlayer; company: CompanyState } | null {
  for (const player of s.players) {
    const company = player.companies.find((c) => c.id === id);
    if (company) return { player, company };
  }
  return null;
}

function ownCompany(p: PolitikPlayer, id: string | undefined): CompanyState | null {
  return id ? p.companies.find((c) => c.id === id) ?? null : null;
}

function cardName(card: HandCard): string {
  if (card.kind === 'politik') return POLITIK_CARDS[card.id]?.name ?? card.id;
  return card.id;
}

function cardInstruction(card: HandCard): string {
  if (card.kind === 'politik') return POLITIK_CARDS[card.id]?.rulesText || 'Resolve the printed card text using typed operations.';
  return 'Resolve the printed card text using typed operations.';
}

function consumeMain(s: PolitikState, seat: number): PolitikResult | null {
  if (s.phase !== 'playing') return err('the game is not in play');
  if (s.turn !== seat) return err('not your turn');
  if (s.actionsTaken >= s.actionsAllowed) return err('no Main Actions remain');
  s.actionsTaken++;
  return null;
}

function totalHand(p: PolitikPlayer): number { return p.hand.length; }

function checkHandLimit(s: PolitikState, seat: number): void {
  if (s.pending || s.phase === 'ended') return;
  const order = [seat, ...s.players.map((p) => p.seat).filter((x) => x !== seat)];
  const over = order.find((x) => totalHand(s.players[x]) > 10);
  if (over !== undefined) s.pending = { kind: 'hand_limit', seat: over, excess: totalHand(s.players[over]) - 10 };
}

function stateBenefit(s: PolitikState, p: PolitikPlayer, location: LocationId): string {
  const loc = s.locations[location];
  if (!loc) return 'no printed State benefit';
  if (loc.benefit === 'food') { p.food++; return 'gained 1 Food'; }
  if (loc.benefit === 'carbon') { p.carbon++; return 'gained 1 Carbon'; }
  if (loc.benefit === 'research') { drawPolitik(s, p, 1); return 'researched 1 card'; }
  if (loc.benefit === 'support') return 'gained 1 Support (Base allocation required)';
  return 'no printed State benefit';
}

function updateDefenseImmunity(s: PolitikState): void {
  for (const p of s.players) p.immunity.defense = councilController(s, 'defense') === p.seat;
}

/** Clear the flag on a gain; restore it after the last player token leaves. */
function syncImperialDefense(loc: PolitikLocation, playerInfluenceAdded = false): void {
  if (playerInfluenceAdded) loc.imperialInfluence = 0;
  if (loc.influence.every((amount) => amount <= 0) && loc.imperialInfluence <= 0) loc.imperialInfluence = 1;
}

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

function setupPrompt(stage: PolitikState['setupStage'], seat: number, s: PolitikState): PolitikPending {
  if (stage === 'mulligan') return { kind: 'mulligan', seat };
  if (stage === 'nation') return { kind: 'nation', seat };
  if (stage === 'bonus') {
    const available = (['capital', 'food', 'carbon', 'research', 'exchange'] as SetupBonus[]).filter((x) => !s.setupBonusesTaken.includes(x));
    return { kind: 'setup_bonus', seat, available };
  }
  return { kind: 'start_state', seat };
}

function enterSetupStage(s: PolitikState, stage: PolitikState['setupStage'], queue: number[]): void {
  s.setupStage = stage;
  s.setupQueue = queue;
  s.setupCursor = 0;
  if (queue.length) s.pending = setupPrompt(stage, queue[0], s);
}

function advanceSetup(s: PolitikState): void {
  s.setupCursor++;
  if (s.setupCursor < s.setupQueue.length) {
    s.pending = setupPrompt(s.setupStage, s.setupQueue[s.setupCursor], s);
    return;
  }
  const clockwise = Array.from({ length: s.players.length }, (_, i) => (s.first + i) % s.players.length);
  if (s.setupStage === 'mulligan') {
    enterSetupStage(s, 'nation', clockwise);
    return;
  }
  if (s.setupStage === 'nation') {
    recomputeFinalSay(s);
    const bonusOrder = s.players.length === 2 ? [clockwise[1]] : clockwise.slice(2).reverse();
    enterSetupStage(s, 'bonus', bonusOrder);
    return;
  }
  if (s.setupStage === 'bonus') {
    enterSetupStage(s, 'state', clockwise);
    return;
  }
  s.setupStage = 'done';
  s.phase = 'playing';
  s.turn = s.first;
  s.actionsTaken = 0;
  s.actionsAllowed = s.players[s.turn].corruption >= 9 ? 3 : 2;
  s.pending = null;
  politikEvent(s, null, 'setup complete', `${s.players[s.turn].name} begins Main Action 1`);
}

function setupMulligan(s: PolitikState, seat: number, take: boolean): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'mulligan' || pending.seat !== seat) return err('not your mulligan prompt');
  const p = s.players[seat];
  if (take) {
    const keep = p.hand.filter((c) => c.kind !== 'politik');
    const old = p.hand.filter((c) => c.kind === 'politik');
    p.hand = keep;
    s.politicsDiscard.push(...old.map((c) => c.id));
    drawPolitik(s, p, old.length);
    p.mulliganUsed = true;
  }
  politikEvent(s, seat, 'completed the private opening-hand choice', 'mulligan decision remains private');
  advanceSetup(s);
  return ok();
}

function setupNation(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'choose_nation' }>): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'nation' || pending.seat !== seat) return err('not your Nation prompt');
  const p = s.players[seat];
  if (!p.nationChoices.includes(a.nation)) return err('Nation was not one of your two private choices');
  const nation = NATION_BY_ID[a.nation];
  if (!nation || !nation.propaganda.includes(a.propaganda)) return err('Starting Propaganda does not belong to that Nation');
  const propaganda = PROPAGANDA_BY_ID[a.propaganda];
  if (!propaganda) return err('unknown Starting Propaganda');
  const steelyWit = propaganda.id === 'steelyWit';
  if (steelyWit && (!a.steelyWitCouncil || !COUNCIL_SEATS.includes(a.steelyWitCouncil))) return err('Steely Wit must place its starting Support in one chosen Council Seat');
  if (!steelyWit && a.steelyWitCouncil !== undefined) return err('only Steely Wit places starting Support in a Council Seat');

  const support = a.support ?? (a.supportBase ? { [a.supportBase]: nation.support } : {});
  if (BASES.some((base) => !integer(support[base] ?? 0, 0, nation.support))) return err('invalid Support assignment');
  if (sumRecord(BASES, support) !== nation.support) return err(`assign exactly ${nation.support} starting Support`);
  if (BASES.some((base) => (support[base] ?? 0) > 0 && !propaganda.bases.includes(base))) return err('Support must match a Base on the selected Propaganda');
  if (ARENAS.some((arena) => !integer(a.leaders[arena] ?? 0, 0, nation.leaders))) return err('invalid leader assignment');
  if (sumRecord(ARENAS, a.leaders) !== nation.leaders) return err(`select exactly ${nation.leaders} leaders`);

  p.nation = nation.id;
  p.startingPropaganda = propaganda.id;
  p.capital = nation.capital;
  p.carbon = nation.carbon;
  p.food = nation.food;
  for (const base of BASES) p.support[base] = support[base] ?? 0;
  for (const arena of ARENAS) p.leaders[arena] = a.leaders[arena] ?? 0;
  p.propaganda.push({
    instanceId: nextInstanceId(s, 'propaganda'),
    card: { kind: 'starting_propaganda', id: `${propaganda.card.sheet}:${propaganda.card.cell}` },
    title: propaganda.name,
    ready: true,
    bases: [...propaganda.bases],
    corruption: propaganda.corruption,
    negotiation: propaganda.negotiation,
    industries: [],
  });
  if (propaganda.corruption) {
    p.corruption++;
    drawObligation(s, p);
  }
  if (propaganda.negotiation) p.negotiation++;
  if (a.steelyWitCouncil) s.councilSupport[a.steelyWitCouncil][seat]++;
  politikEvent(s, seat, `selected ${nation.name}`, `${propaganda.name}; ${nation.capital} Capital, ${nation.carbon} Carbon, ${nation.food} Food`);
  advanceSetup(s);
  return ok();
}

function applyExchange(s: PolitikState, p: PolitikPlayer, transactions: ExchangeTransaction[]): string | null {
  if (transactions.length < 1 || transactions.length > 20) return 'Exchange needs 1-20 transactions';
  for (const t of transactions) {
    if ((t.resource !== 'food' && t.resource !== 'carbon') || (t.mode !== 'buy' && t.mode !== 'sell') || !integer(t.amount, 1, 100)) return 'invalid Exchange transaction';
    const value = s.prices[t.resource] * t.amount;
    if (t.mode === 'buy') {
      if (p.capital < value) return `need ${value} Capital to buy ${t.amount} ${t.resource}`;
      p.capital -= value;
      p[t.resource] += t.amount;
    } else {
      if (p[t.resource] < t.amount) return `not enough ${t.resource} to sell`;
      p[t.resource] -= t.amount;
      p.capital += value;
    }
  }
  return null;
}

function setupBonus(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'choose_setup_bonus' }>): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'setup_bonus' || pending.seat !== seat) return err('not your setup bonus prompt');
  if (!pending.available.includes(a.bonus)) return err('that unique setup bonus is unavailable');
  const p = s.players[seat];
  if (a.bonus === 'capital') p.capital += 8;
  else if (a.bonus === 'food') p.food++;
  else if (a.bonus === 'carbon') p.carbon++;
  else if (a.bonus === 'research') drawPolitik(s, p, 1);
  else {
    const bad = applyExchange(s, p, a.exchange ?? []);
    if (bad) return err(bad);
  }
  s.setupBonusesTaken.push(a.bonus);
  politikEvent(s, seat, 'selected setup bonus', a.bonus);
  advanceSetup(s);
  return ok();
}

function setupStartState(s: PolitikState, seat: number, state: string): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'start_state' || pending.seat !== seat) return err('not your starting State prompt');
  const loc = s.locations[state];
  const p = s.players[seat];
  const dogmatic = p.startingPropaganda === 'dogmatic';
  if (!loc || (loc.kind === 'station' && !dogmatic)) return err(dogmatic ? 'choose a State or Broadcast Station' : 'choose a non-Broadcast State');
  if (loc.influence.some((n) => n > 0)) return err('that starting State is already occupied');
  loc.influence[seat] = 8;
  loc.imperialInfluence = 0;
  p.setupComplete = true;
  const benefit = loc.kind === 'station' ? 'skipped the Broadcast Station starting benefit' : stateBenefit(s, p, state);
  politikEvent(s, seat, `began in ${loc.name}`, `placed 8 Influence and ${benefit}`, { location: state });
  advanceSetup(s);
  return ok();
}

// ---------------------------------------------------------------------------
// Typed guided resolution
// ---------------------------------------------------------------------------

function supportValue(s: PolitikState, op: { seat: number; zone: 'base' | 'council'; id: string }): number | null {
  const p = s.players[op.seat];
  if (!p) return null;
  if (op.zone === 'base') return BASES.includes(op.id as BaseId) ? p.support[op.id as BaseId] : null;
  return COUNCIL_SEATS.includes(op.id as CouncilId) ? s.councilSupport[op.id as CouncilId][op.seat] : null;
}

function setSupportValue(s: PolitikState, op: { seat: number; zone: 'base' | 'council'; id: string }, value: number): boolean {
  const p = s.players[op.seat];
  if (!p || !integer(value, 0, 999)) return false;
  if (op.zone === 'base' && BASES.includes(op.id as BaseId)) { p.support[op.id as BaseId] = value; return true; }
  if (op.zone === 'council' && COUNCIL_SEATS.includes(op.id as CouncilId)) { s.councilSupport[op.id as CouncilId][op.seat] = value; return true; }
  return false;
}

function applyGuidedOperation(s: PolitikState, op: GuidedOperation): string | null {
  if (op.kind === 'acknowledge') return op.text.trim().length >= 3 ? null : 'acknowledgement must explain the printed resolution';
  if (op.kind === 'price') {
    if (!PRICE_TRACKS.includes(op.price) || !integer(Math.abs(op.amount), 1, 10)) return 'invalid Price movement';
    const next = s.prices[op.price] + op.amount;
    if (next < 1 || next > 10) return `${op.price} Price must stay from 1 to 10`;
    s.prices[op.price] = next;
    return null;
  }
  if (op.kind === 'market_supply') {
    if (!INDUSTRIES.includes(op.industry) || !integer(Math.abs(op.amount), 1, 15)) return 'invalid shared Market-supply movement';
    if (op.amount > 0) {
      if (s.marketReserve[op.industry] < op.amount) return `only ${s.marketReserve[op.industry]} ${op.industry} Markets remain in reserve`;
    } else if (s.marketSupply[op.industry] < -op.amount) {
      return `only ${s.marketSupply[op.industry]} ${op.industry} Markets are in shared supply`;
    }
    s.marketSupply[op.industry] += op.amount;
    s.marketReserve[op.industry] -= op.amount;
    return null;
  }
  if (op.kind === 'industry_margin') {
    if (!INDUSTRIES.includes(op.industry) || !integer(Math.abs(op.amount), 1, 10)) return 'invalid Industry Margin movement';
    const companies = s.players.flatMap((player) => player.companies).filter((company) => company.industries.includes(op.industry));
    const crossing = new Set(companies.filter((company) => op.amount > 0 && company.margin + op.amount > 9).map((company) => company.id));
    for (const id of Object.keys(op.overflowChoices ?? {})) if (!crossing.has(id)) return `overflow choice ${id} does not match a crossing Company`;
    for (const company of companies) {
      const total = company.margin + op.amount;
      if (op.amount < 0) {
        company.margin = Math.max(0, total);
        continue;
      }
      if (total <= 9) {
        company.margin = total;
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(op.overflowChoices ?? {}, company.id)) return `${company.title} crosses 9 Margin and needs an explicit Market or remain-at-9 choice`;
      const choice = op.overflowChoices?.[company.id];
      if (choice === null) {
        company.margin = 9;
        continue;
      }
      if (!choice || !company.industries.includes(choice)) return `${company.title} must take a Market matching one of its Industries`;
      if (s.marketSupply[choice] <= 0) return `no ${choice} Market remains for ${company.title}`;
      s.marketSupply[choice]--;
      company.markets[choice] = (company.markets[choice] ?? 0) + 1;
      company.margin = Math.min(9, total - 10);
    }
    return null;
  }
  const p = 'seat' in op ? s.players[op.seat] : null;
  if ('seat' in op && !p) return 'bad guided-operation seat';
  if (op.kind === 'resource') {
    if (!integer(Math.abs(op.amount), 1, 999)) return 'invalid resource adjustment';
    const next = p![op.resource] + op.amount;
    if (!integer(next, 0, 9999)) return `${op.resource} cannot become negative`;
    p![op.resource] = next;
    return null;
  }
  if (op.kind === 'corruption') {
    if (!integer(Math.abs(op.amount), 1, 20)) return 'invalid Corruption adjustment';
    const next = p!.corruption + op.amount;
    if (!integer(next, 0, 999)) return 'Corruption cannot become negative';
    p!.corruption = next;
    return null;
  }
  if (op.kind === 'support') {
    if (!integer(op.amount, 1, 100) || (!op.from && !op.to)) return 'invalid Support movement';
    if (op.from) {
      const from = supportValue(s, { seat: op.seat, ...op.from });
      if (from === null || from < op.amount) return 'not enough Support at the source';
      if (!setSupportValue(s, { seat: op.seat, ...op.from }, from - op.amount)) return 'bad Support source';
    }
    if (op.to) {
      const to = supportValue(s, { seat: op.seat, ...op.to });
      if (to === null || !setSupportValue(s, { seat: op.seat, ...op.to }, to + op.amount)) return 'bad Support destination';
    }
    return null;
  }
  if (op.kind === 'influence') {
    if (!s.locations[op.location] || !integer(Math.abs(op.amount), 1, 100)) return 'invalid Influence adjustment';
    const next = s.locations[op.location].influence[op.seat] + op.amount;
    if (!integer(next, 0, 999)) return 'Influence cannot become negative';
    s.locations[op.location].influence[op.seat] = next;
    syncImperialDefense(s.locations[op.location], op.amount > 0);
    return null;
  }
  if (op.kind === 'market') {
    if (!INDUSTRIES.includes(op.industry) || !integer(Math.abs(op.amount), 1, 20)) return 'invalid Market adjustment';
    const c = ownCompany(p!, op.company);
    if (!c) return 'Company is not controlled by that Nation';
    const have = c.markets[op.industry] ?? 0;
    if (op.amount > 0) {
      if (!c.industries.includes(op.industry)) return 'Company lacks that Industry keyword';
      if (s.marketSupply[op.industry] < op.amount) return 'not enough Markets in supply';
      s.marketSupply[op.industry] -= op.amount;
    } else {
      if (have < -op.amount) return 'Company lacks those Markets';
      s.marketSupply[op.industry] += -op.amount;
    }
    c.markets[op.industry] = have + op.amount;
    return null;
  }
  if (op.kind === 'margin') {
    if (!integer(Math.abs(op.amount), 1, 20)) return 'invalid Margin adjustment';
    const c = ownCompany(p!, op.company);
    if (!c) return 'Company is not controlled by that Nation';
    const next = c.margin + op.amount;
    if (!integer(next, 0, 9)) return 'Margin must stay from 0 to 9; resolve a Market crossing explicitly';
    c.margin = next;
    return null;
  }
  if (op.kind === 'leader') {
    if (!ARENAS.includes(op.arena) || !integer(Math.abs(op.amount), 1, 72)) return 'invalid leader adjustment';
    const next = p!.leaders[op.arena] + op.amount;
    if (!integer(next, 0, 999)) return 'leader count cannot become negative';
    p!.leaders[op.arena] = next;
    return null;
  }
  if (op.kind === 'draw') {
    if (!integer(op.amount, 1, 20)) return 'invalid draw amount';
    if (op.deck === 'politik') drawPolitik(s, p!, op.amount);
    else for (let i = 0; i < op.amount; i++) drawObligation(s, p!);
    return null;
  }
  if (op.kind === 'immunity') {
    p!.immunity.temporary = op.active;
    return null;
  }
  if (op.kind === 'move_card') {
    const card = p!.hand[op.handIndex];
    if (!card) return 'bad hand-card index';
    if (op.to === 'obligation_bottom') {
      if (card.kind !== 'obligation') return 'only an Obligation goes to the Obligation deck';
      s.obligationDeck.unshift(card.id);
    } else {
      if (card.kind === 'obligation') return 'Obligations cannot be discarded normally';
      if (card.kind === 'politik') s.politicsDiscard.push(card.id);
      if (card.kind === 'startup') s.startupDiscard.push(card.id);
    }
    p!.hand.splice(op.handIndex, 1);
    return null;
  }
  if (op.kind === 'ready') {
    if (op.source === 'station') {
      const loc = s.locations[op.id];
      if (!loc || loc.kind !== 'station' || locationController(s, loc.id) !== op.seat) return 'Nation does not control that Broadcast Station';
      loc.stationReady = op.ready;
      return null;
    }
    if (op.source === 'company') {
      const c = ownCompany(p!, op.id);
      if (!c) return 'Nation does not control that Company';
      c.ready = op.ready;
      return null;
    }
    if (op.source === 'propaganda') {
      const card = p!.propaganda.find((x) => x.instanceId === op.id);
      if (!card) return 'Nation does not control that Propaganda';
      card.ready = op.ready;
      return null;
    }
    for (const c of p!.companies) {
      const asset = c.assets.find((x) => x.instanceId === op.id);
      if (asset) { asset.ready = op.ready; return null; }
    }
    return 'Nation does not control that Asset';
  }
  return 'unsupported guided operation';
}

function resolveGuided(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'resolve_guided' }>): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'guided' || pending.seat !== seat) return err('not your guided resolver');
  if (a.canceled && a.operations.length) return err('a canceled effect cannot also apply operations');
  if (!a.canceled && !a.operations.length) return err('record at least one typed operation or an explicit acknowledgement');
  if (a.note.trim().length < 3 || a.note.length > 500) return err('add a short audit note describing the printed effect');
  let cancelResumedClash = false;
  for (const op of a.operations) {
    if (op.kind === 'clash_modifier' || op.kind === 'cancel_clash') {
      const resumed = pending.resume;
      if (resumed?.kind !== 'clash' || !isClashResponse(resumed) || resumed.seat !== seat) return err('this guided effect is not interrupting a live Clash timing window');
      if (op.kind === 'clash_modifier') {
        if (!integer(Math.abs(op.amount), 1, 100)) return err('Clash Focus modifier must be a nonzero integer from -100 to 100');
        resumed.modifiers.push({ seat, side: op.side, amount: op.amount, source: op.source?.trim() || pending.source });
      } else cancelResumedClash = true;
      continue;
    }
    const bad = applyGuidedOperation(s, op);
    if (bad) return err(bad);
  }
  s.pending = pending.resume ?? null;
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  politikEvent(s, seat, `${a.canceled ? 'canceled' : 'resolved'} ${pending.source}`, `${a.note}${a.canceled ? '; paid declaration/use costs remain spent' : `; operations: ${a.operations.map((x) => x.kind).join(', ')}`}`, pending.sourceCard ? { card: pending.sourceCard } : {});
  if (cancelResumedClash && pending.resume?.kind === 'clash') cancelClashState(s, pending.resume, seat, pending.source);
  checkHandLimit(s, seat);
  return ok();
}

// ---------------------------------------------------------------------------
// Core Main Actions
// ---------------------------------------------------------------------------

function doResearch(s: PolitikState, seat: number, amount: number): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (!integer(amount, 1, 10)) return err('Research amount must be 1-10');
  const p = s.players[seat];
  const cost = s.prices.research * amount;
  if (p.capital < cost) return err(`Research ${amount} costs ${cost} Capital`);
  const bad = consumeMain(s, seat); if (bad) return bad;
  p.capital -= cost;
  const drew = drawPolitik(s, p, amount);
  politikEvent(s, seat, `researched ${drew}`, `paid ${cost} Capital at Price ${s.prices.research}`);
  checkHandLimit(s, seat);
  return ok();
}

function doEducate(s: PolitikState, seat: number, leaders: Partial<Record<Arena, number>>): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (ARENAS.some((x) => !integer(leaders[x] ?? 0, 0, 10))) return err('invalid leader selection');
  const amount = sumRecord(ARENAS, leaders);
  if (!integer(amount, 1, 10)) return err('Educate at least 1 leader');
  const p = s.players[seat];
  const cost = s.prices.educate * amount;
  if (p.food < cost) return err(`Educate ${amount} costs ${cost} Food`);
  const bad = consumeMain(s, seat); if (bad) return bad;
  p.food -= cost;
  for (const arena of ARENAS) p.leaders[arena] += leaders[arena] ?? 0;
  politikEvent(s, seat, `educated ${amount}`, `paid ${cost} Food; ${ARENAS.map((x) => `${x} ${leaders[x] ?? 0}`).join(', ')}`);
  return ok();
}

function doExchange(s: PolitikState, seat: number, transactions: ExchangeTransaction[]): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (s.phase !== 'playing' || s.turn !== seat || s.actionsTaken >= s.actionsAllowed) return err('Exchange is not a legal Main Action now');
  const p = s.players[seat];
  const badExchange = applyExchange(s, p, transactions);
  if (badExchange) return err(badExchange);
  const bad = consumeMain(s, seat); if (bad) return bad;
  politikEvent(s, seat, 'exchanged resources', transactions.map((x) => `${x.mode} ${x.amount} ${x.resource}`).join(', '));
  return ok();
}

function doCampaign(s: PolitikState, seat: number, council: CouncilId, fromBases: Partial<Record<BaseId, number>>): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (!COUNCIL_SEATS.includes(council)) return err('Campaign targets exactly one Council Seat');
  if (BASES.some((x) => !integer(fromBases[x] ?? 0, 0, 100))) return err('invalid Support movement');
  const amount = sumRecord(BASES, fromBases);
  if (!integer(amount, 1, 20)) return err('Campaign at least 1 Support');
  const p = s.players[seat];
  if (BASES.some((x) => p.support[x] < (fromBases[x] ?? 0))) return err('not enough Support in those Bases');
  const cost = s.prices.campaign * amount;
  if (p.capital < cost) return err(`Campaign ${amount} costs ${cost} Capital`);
  const bad = consumeMain(s, seat); if (bad) return bad;
  p.capital -= cost;
  for (const base of BASES) p.support[base] -= fromBases[base] ?? 0;
  s.councilSupport[council][seat] += amount;
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  politikEvent(s, seat, `campaigned ${amount} to ${council}`, `paid ${cost} Capital`);
  return ok();
}

function validRallyDistribution(p: PolitikPlayer, gains: Partial<Record<BaseId, number>>): boolean {
  const tokens: BaseId[] = [];
  for (const base of BASES) for (let i = 0; i < (gains[base] ?? 0); i++) tokens.push(base);
  if (tokens.length !== p.propaganda.length) return false;
  const cards = p.propaganda.map((x) => x.bases);
  const used = new Set<number>();
  const search = (at: number): boolean => {
    if (at === tokens.length) return true;
    for (let i = 0; i < cards.length; i++) {
      if (!used.has(i) && cards[i].includes(tokens[at])) {
        used.add(i);
        if (search(at + 1)) return true;
        used.delete(i);
      }
    }
    return false;
  };
  return search(0);
}

function defaultRallySupport(p: PolitikPlayer): Partial<Record<BaseId, number>> {
  const out: Partial<Record<BaseId, number>> = {};
  for (const card of p.propaganda) {
    const base = card.bases[0];
    if (base) out[base] = (out[base] ?? 0) + 1;
  }
  return out;
}

function firstMarketChoice(s: PolitikState, p: PolitikPlayer): { company: string; industry: IndustryId } | null {
  for (const company of p.companies) {
    for (const industry of company.industries) {
      if (s.marketSupply[industry] > 0) return { company: company.id, industry };
    }
  }
  return null;
}

function takeMarket(s: PolitikState, p: PolitikPlayer, choice: { company: string; industry: IndustryId }): string | null {
  const company = ownCompany(p, choice.company);
  if (!company) return 'selected Company is not yours';
  if (!company.industries.includes(choice.industry)) return 'Company lacks that Industry keyword';
  if (s.marketSupply[choice.industry] <= 0) return `no ${choice.industry} Market remains`;
  s.marketSupply[choice.industry]--;
  company.markets[choice.industry] = (company.markets[choice.industry] ?? 0) + 1;
  return null;
}

function autoPriceThree(s: PolitikState): { price: PriceId; amount: number }[] {
  const moves: { price: PriceId; amount: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const down = PRICE_TRACKS.find((x) => s.prices[x] > 1);
    const price = down ?? PRICE_TRACKS.find((x) => s.prices[x] < 10)!;
    const amount = down ? -1 : 1;
    s.prices[price] += amount;
    moves.push({ price, amount });
  }
  return moves;
}

function resolveRallyCouncil(s: PolitikState, p: PolitikPlayer, a: Extract<PolitikAction, { type: 'national' }>): string | null {
  // Seat effects resolve left-to-right. Always ask the live controller again:
  // Chair can alter Justice/Final Say before any later Seat resolves.
  const controls = (council: CouncilId): boolean => {
    recomputeFinalSay(s);
    return councilController(s, council) === p.seat;
  };
  if (controls('chair')) {
    const anySupport = COUNCIL_SEATS.some((council) => s.councilSupport[council].some((amount) => amount > 0));
    if (anySupport && !a.chair) return 'Chair must explicitly choose any Support to remove';
    if (!anySupport && a.chair) return 'Chair has no Support to remove';
    if (a.chair) {
      if (!COUNCIL_SEATS.includes(a.chair.council) || !s.players[a.chair.seat] || s.councilSupport[a.chair.council][a.chair.seat] <= 0) return 'Chair target has no Support there';
      s.councilSupport[a.chair.council][a.chair.seat]--;
    }
  }
  if (controls('justice')) {
    // Justice changes no pieces; controlling it is itself the Final Say benefit.
  }
  if (controls('commerce')) {
    const choice = a.commerceMarket ?? firstMarketChoice(s, p);
    if (choice) { const bad = takeMarket(s, p, choice); if (bad) return bad; }
    if (a.commerceExchange?.length) { const bad = applyExchange(s, p, a.commerceExchange); if (bad) return bad; }
  }
  if (controls('labor')) {
    p.leaders[a.laborLeader ?? 'military']++;
    if (a.laborPrices?.length) {
      if (a.laborPrices.some((x) => !PRICE_TRACKS.includes(x.price) || !integer(Math.abs(x.amount), 1, 3))) return 'invalid Labor Price movement';
      if (a.laborPrices.reduce((n, x) => n + Math.abs(x.amount), 0) !== 3) return 'Labor moves Prices a total of exactly 3';
      for (const move of a.laborPrices) {
        const next = s.prices[move.price] + move.amount;
        if (next < 1 || next > 10) return `${move.price} Price must stay from 1 to 10`;
        s.prices[move.price] = next;
      }
    } else autoPriceThree(s);
  }
  if (controls('intel')) {
    p.corruption++;
    drawPolitik(s, p, 1);
  }
  if (controls('defense')) {
    const legal = Object.values(s.locations).filter((x) => locationController(s, x.id) === p.seat);
    if (legal.length) {
      const choices = a.defenseInfluence ?? [{ location: legal[0].id, amount: 5 }];
      if (choices.some((x) => !integer(x.amount, 1, 5) || locationController(s, x.location) !== p.seat)) return 'Defense Influence must go among controlled States';
      if (choices.reduce((n, x) => n + x.amount, 0) !== 5) return 'Defense distributes exactly 5 Influence';
      for (const x of choices) {
        s.locations[x.location].influence[p.seat] += x.amount;
        syncImperialDefense(s.locations[x.location], true);
      }
    }
  }
  return null;
}

function doNational(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'national' }>): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (!NATIONAL_ACTIONS.includes(a.action)) return err('unknown National Action');
  const p = s.players[seat];
  if (p.nationalUsed.includes(a.action)) return err(`${a.action} cannot be reused until all four National Actions are used`);
  if (s.phase !== 'playing' || s.turn !== seat || s.actionsTaken >= s.actionsAllowed) return err('National Action is not legal now');

  if (a.action === 'income') {
    const companyIncome = p.companies.reduce((total, company) => {
      const markets = INDUSTRIES.reduce((n, industry) => n + (company.markets[industry] ?? 0), 0);
      return total + company.margin * markets;
    }, 0);
    const industryIncome = controlledIndustries(s, seat).length * 5;
    p.capital += 5 + companyIncome + industryIncome;
    if (a.incomeMarket) {
      if (p.capital < 20) return err('buying the optional Income Market costs 20 Capital');
      const marketBad = takeMarket(s, p, a.incomeMarket); if (marketBad) return err(marketBad);
      p.capital -= 20;
    }
    politikEvent(s, seat, 'took Income', `gained ${5 + companyIncome + industryIncome} Capital${a.incomeMarket ? '; bought 1 Market for 20' : ''}`);
  } else if (a.action === 'rally') {
    const gains = a.rallySupport ?? defaultRallySupport(p);
    if (BASES.some((x) => !integer(gains[x] ?? 0, 0, p.propaganda.length)) || !validRallyDistribution(p, gains)) return err('assign one matching Base Support for each controlled Propaganda');
    for (const base of BASES) p.support[base] += gains[base] ?? 0;
    recomputeFinalSay(s);
    const councilBad = resolveRallyCouncil(s, p, a); if (councilBad) return err(councilBad);
    politikEvent(s, seat, 'rallied', `gained ${p.propaganda.length} Support and resolved controlled Council Seats`);
  } else if (a.action === 'produce') {
    let states = 0;
    let support = 0;
    for (const loc of Object.values(s.locations)) {
      if (locationController(s, loc.id) === seat) {
        if (loc.benefit === 'support') support++;
        else stateBenefit(s, p, loc.id);
        states++;
      }
    }
    const allocation = a.produceSupport ?? {};
    if (BASES.some((x) => !integer(allocation[x] ?? 0, 0, support)) || sumRecord(BASES, allocation) !== support) return err(`assign exactly ${support} Produce Support among Bases`);
    for (const base of BASES) p.support[base] += allocation[base] ?? 0;
    const occupiedRegions = new Set<string>();
    for (const loc of Object.values(s.locations)) {
      if (loc.kind === 'state' && loc.region && loc.influence[seat] > 0) occupiedRegions.add(loc.region);
    }
    const drew = drawPolitik(s, p, occupiedRegions.size);
    politikEvent(s, seat, 'produced', `resolved ${states} controlled States (${support} Support) and researched ${drew} for occupied Regions`);
  } else {
    for (const company of p.companies) {
      company.ready = true;
      for (const asset of company.assets) asset.ready = true;
    }
    for (const card of p.propaganda) card.ready = true;
    for (const loc of Object.values(s.locations)) if (loc.kind === 'station' && locationController(s, loc.id) === seat) loc.stationReady = true;
    if (s.activeLandscape) s.landscapeDiscard.push(s.activeLandscape);
    s.activeLandscape = s.upcomingLandscape;
    s.upcomingLandscape = s.landscapeDeck.pop() ?? null;
    politikEvent(s, seat, 'refreshed', `Readied all controlled cards and revealed Landscape ${s.activeLandscape ?? 'none'}`);
    if (s.activeLandscape) {
      const landscapeError = beginPolitikLandscape(s, seat, 'refresh');
      if (landscapeError) return err(landscapeError);
    }
  }

  p.nationalUsed.push(a.action);
  if (p.nationalUsed.length === 4) {
    p.nationalUsed = [];
    politikEvent(s, seat, 'recovered National Action tokens', 'all four had been used');
  }
  const bad = consumeMain(s, seat); if (bad) return bad;
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  checkHandLimit(s, seat);
  return ok();
}

// ---------------------------------------------------------------------------
// Card play and controlled abilities
// ---------------------------------------------------------------------------

function playType(card: HandCard): CardPlaySpec['kind'] | null {
  if (card.kind === 'startup') return 'company';
  if (card.kind === 'obligation') return 'obligation';
  if (card.kind !== 'politik') return null;
  return POLITIK_CARDS[card.id]?.type ?? null;
}

function addAssetMargin(
  s: PolitikState,
  company: CompanyState,
  amount: number,
  decision: IndustryId | null | undefined,
): string | null {
  const total = company.margin + amount;
  if (total <= 9) { company.margin = total; return null; }
  if (decision === undefined) return 'crossing 9 Margin requires a take-Market or remain-at-9 choice';
  if (decision === null) { company.margin = 9; return null; }
  if (!company.industries.includes(decision)) return 'Margin Market must match a Company Industry';
  if (s.marketSupply[decision] <= 0) return `no ${decision} Market remains`;
  s.marketSupply[decision]--;
  company.markets[decision] = (company.markets[decision] ?? 0) + 1;
  company.margin = Math.min(9, total - 10);
  return null;
}

function interruptResume(s: PolitikState, seat: number): PolitikResume | null {
  if (s.pending?.kind === 'edge_window' && s.pending.seat === seat) return structuredClone(s.pending);
  if (s.pending?.kind === 'clash' && isClashResponse(s.pending) && s.pending.seat === seat) return structuredClone(s.pending);
  return null;
}

function currentEdgeTiming(s: PolitikState): PolitikCardDef['edgeTimings'][number] | null {
  if (s.pending?.kind === 'edge_window') return 'at_any_time';
  if (s.pending?.kind !== 'clash') return null;
  if (s.pending.stage === 'after_cost') return 'after_cost';
  if (s.pending.stage === 'attacker_focus' || s.pending.stage === 'defender_focus') return 'during_focus';
  if (s.pending.stage === 'after_reveal') return 'after_reveal';
  if (s.pending.stage === 'before_resolve') return 'before_resolve';
  return null;
}

function verifiedEdgeIsOpen(s: PolitikState, definition: PolitikCardDef): boolean {
  const timing = currentEdgeTiming(s);
  return timing !== null && (definition.edgeTimings.includes('at_any_time') || definition.edgeTimings.includes(timing));
}

function doPlayCard(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'play_card' }>): PolitikResult {
  const p = s.players[seat];
  if (!p) return err('bad seat');
  const card = p.hand[a.handIndex];
  if (!card) return err('bad hand-card index');
  const definition = card.kind === 'politik' ? POLITIK_CARDS[card.id] : null;
  const catalogType = playType(card);
  // Regular Politik cards were OCR-cataloged. A confirmed manual declaration
  // is authoritative for their physical card type; exact Startups and
  // Obligations remain locked to structured data.
  const actual = definition?.structureVerified ? definition.type : card.kind === 'politik' ? a.spec.kind : catalogType;
  if (card.kind !== 'politik' && actual !== a.spec.kind) return err(`that card is ${actual ?? 'not playable'}, not ${a.spec.kind}`);
  if (definition?.structureVerified && actual !== a.spec.kind) return err(`verified printed card type is ${actual}`);
  if (actual === 'company' && s.players.reduce((total, player) => total + player.companies.length, 0) >= MAX_COMPANIES) return err(`all ${MAX_COMPANIES} physical Company boards and Margin tokens are in use`);
  const variableStructure = definition?.structureVerified && definition.margin === 'X';
  if (card.kind === 'politik' && (!definition?.structureVerified || variableStructure) && a.spec.requirementsConfirmed !== true) return err('enter and confirm the unresolved printed values before playing this card');
  const corruptionRequirement = definition?.declarationVerified
    ? definition.corruptionRequirement ?? 0
    : a.spec.corruptionRequirement ?? 0;
  if (!integer(corruptionRequirement, 0, 100)) return err('declared Corruption requirement must be a nonnegative integer');
  if (p.corruption < corruptionRequirement) return err(`this card requires at least ${corruptionRequirement} Corruption`);
  const obligationAtLimit = s.pending?.kind === 'hand_limit' && s.pending.seat === seat && actual === 'obligation';
  const edge = a.spec.kind === 'event' && !!a.spec.edge;
  if (edge && definition?.structureVerified && !verifiedEdgeIsOpen(s, definition)) return err('this printed Edge timing is not open now');
  const resume = interruptResume(s, seat);
  if (s.pending && !(edge && resume) && !obligationAtLimit) return err('finish the current decision first');
  if (!edge && (s.phase !== 'playing' || s.turn !== seat || s.actionsTaken >= s.actionsAllowed)) return err('Play is not a legal Main Action now');
  if (edge && s.phase !== 'playing') return err('Edge Event timing is not open');
  const startup = card.kind === 'startup' ? STARTUP_BY_ID[card.id] : null;
  let cost = definition?.declarationVerified ? definition.capitalCost ?? 0 : a.spec.capitalCost ?? 0;
  let carbonCost = definition?.declarationVerified ? definition.carbonCost ?? 0 : a.spec.carbonCost ?? 0;
  if (startup) {
    if (a.spec.kind !== 'company') return err('Startup cards are Companies');
    if (a.spec.capitalCost !== undefined && a.spec.capitalCost !== startup.capitalCost) return err(`printed Startup cost is ${startup.capitalCost} Capital`);
    if (a.spec.carbonCost !== undefined && a.spec.carbonCost !== startup.carbonCost) return err(`printed Startup cost includes ${startup.carbonCost} Carbon`);
    if (a.spec.startingMargin !== undefined && a.spec.startingMargin !== startup.startingMargin) return err(`printed Startup Margin is ${startup.startingMargin}`);
    if (a.spec.industries !== undefined && [...a.spec.industries].sort().join(',') !== [...startup.industries].sort().join(',')) return err('Startup Industry keywords must match its printed card');
    cost = startup.capitalCost;
    carbonCost = startup.carbonCost;
  }
  if (!integer(cost, 0, 100) || p.capital < cost) return err(`cannot pay the declared ${cost} Capital card cost`);
  if (!integer(carbonCost, 0, 10) || p.carbon < carbonCost) return err(`cannot pay the declared ${carbonCost} Carbon card cost`);

  if (startup && a.spec.title !== undefined && a.spec.title.trim() !== startup.name) return err(`Startup name is ${startup.name}`);
  const title = startup?.name ?? (definition?.structureVerified ? definition.name : (a.spec.title?.trim() || cardName(card)));
  const corruption = definition?.structureVerified ? definition.corruption : !!a.spec.corruption || !!startup?.corruption;
  const negotiation = definition?.structureVerified ? definition.negotiation : a.spec.kind === 'propaganda' && !!a.spec.negotiation;
  const declaredIndustry = definition?.structureVerified ? definition.industries : ('industries' in a.spec ? a.spec.industries : []) ?? [];
  const startupIndustry = startup?.industries ?? [];
  const industries = [...new Set([...startupIndustry, ...declaredIndustry])];
  if (industries.some((x) => !INDUSTRIES.includes(x))) return err('unknown Industry keyword');

  p.capital -= cost;
  p.carbon -= carbonCost;
  p.hand.splice(a.handIndex, 1);
  let destination: TableauCard | CompanyState | null = null;

  if (a.spec.kind === 'company') {
    const startingMargin = typeof definition?.margin === 'number' ? definition.margin : a.spec.startingMargin ?? startup?.startingMargin;
    if (startingMargin === undefined || !integer(startingMargin, 0, 9) || !industries.length) return err('Company needs an Industry and starting Margin 0-9');
    const company: CompanyState = {
      id: nextInstanceId(s, 'company'), card, title, ready: true,
      printedIndustries: [...industries], industries, markets: {}, margin: startingMargin, assets: [], negotiation,
    };
    const available = industries.filter((x) => s.marketSupply[x] > 0);
    if (available.length) {
      if (!a.marketIndustry || !available.includes(a.marketIndustry)) return err('choose one available Market matching a Company Industry');
      s.marketSupply[a.marketIndustry]--;
      company.markets[a.marketIndustry] = 1;
    }
    p.companies.push(company);
    if (negotiation) p.negotiation++;
    destination = company;
  } else if (a.spec.kind === 'asset') {
    const company = ownCompany(p, a.targetCompany);
    if (!company) return err('attach the Asset to one of your Companies');
    const assetMargin = typeof definition?.margin === 'number' ? definition.margin : a.spec.startingMargin;
    if (!integer(assetMargin, 0, 9)) return err('Asset Margin must be 0-9');
    const asset: TableauCard = {
      instanceId: nextInstanceId(s, 'asset'), card, title, ready: true,
      bases: [], corruption, negotiation, industries,
    };
    company.assets.push(asset);
    if (negotiation) p.negotiation++;
    company.industries = [...new Set([...company.industries, ...industries])];
    const marginBad = addAssetMargin(s, company, assetMargin, a.marginMarket); if (marginBad) return err(marginBad);
    destination = asset;
  } else if (a.spec.kind === 'propaganda') {
    const bases = [a.spec.base];
    if (definition?.declarationVerified && definition.bases.length && !definition.bases.includes(a.spec.base)) return err('Support must come from a Base printed on this Propaganda');
    const supportCost = definition?.declarationVerified ? definition.supportCost ?? 0 : a.spec.supportCost ?? 1;
    if (!integer(supportCost, 0, 10) || p.support[a.spec.base] < supportCost) return err(`not enough ${a.spec.base} Support`);
    if (p.propaganda.length >= 4) {
      const replace = p.propaganda.findIndex((x) => x.instanceId === a.replacePropaganda);
      if (replace < 0) return err('a fifth Propaganda requires an explicit replacement');
      const [old] = p.propaganda.splice(replace, 1);
      if (old.card.kind === 'politik') s.politicsDiscard.push(old.card.id);
      if (old.negotiation) p.negotiation--;
    }
    p.support[a.spec.base] -= supportCost;
    const propaganda: TableauCard = {
      instanceId: nextInstanceId(s, 'propaganda'), card, title, ready: true,
      bases, corruption, negotiation, industries: [],
    };
    p.propaganda.push(propaganda);
    if (negotiation) p.negotiation++;
    destination = propaganda;
  } else if (a.spec.kind === 'event') {
    const event: TableauCard = {
      instanceId: nextInstanceId(s, 'event'), card, title, ready: false,
      bases: [], corruption, negotiation, industries: [],
    };
    p.eventsInPlay.push(event);
    if (negotiation) p.negotiation++;
    destination = event;
  } else {
    s.obligationDeck.unshift(card.id);
  }

  if (corruption) {
    p.corruption++;
    drawObligation(s, p);
  }
  if (!edge) {
    const bad = consumeMain(s, seat); if (bad) return bad;
  }
  recomputeFinalSay(s);
  s.pending = {
    kind: 'guided', seat, source: title, sourceCard: card,
    instruction: cardInstruction(card), context: 'card', ...(resume ? { resume } : {}),
  };
  politikEvent(s, seat, `played ${title}`, `${a.spec.kind}; paid ${cost} Capital${carbonCost ? ` and ${carbonCost} Carbon` : ''}${card.kind === 'politik' ? `; used manually entered printed values${corruptionRequirement ? ` including Corruption ${corruptionRequirement}` : ''}` : ''}${destination ? '' : '; returned to the bottom of the Obligation deck'}`, { card });
  return ok();
}

function abilityCard(s: PolitikState, p: PolitikPlayer, source: AbilitySource): { title: string; card: HandCard | null; ready: boolean; setReady: (ready: boolean) => void } | null {
  if (source.kind === 'station') {
    const loc = s.locations[source.id];
    if (!loc || loc.kind !== 'station' || locationController(s, source.id) !== p.seat) return null;
    return { title: `${loc.name} Broadcast Station`, card: loc.stationCard ? { kind: 'politik', id: loc.stationCard } : null, ready: loc.stationReady, setReady: (ready) => { loc.stationReady = ready; } };
  }
  if (source.kind === 'company') {
    const c = ownCompany(p, source.id); if (!c) return null;
    return { title: c.title, card: c.card, ready: c.ready, setReady: (ready) => { c.ready = ready; } };
  }
  if (source.kind === 'propaganda') {
    const card = p.propaganda.find((x) => x.instanceId === source.id); if (!card) return null;
    return { title: card.title, card: card.card, ready: card.ready, setReady: (ready) => { card.ready = ready; } };
  }
  for (const c of p.companies) {
    const card = c.assets.find((x) => x.instanceId === source.id);
    if (card) return { title: card.title, card: card.card, ready: card.ready, setReady: (ready) => { card.ready = ready; } };
  }
  return null;
}

function doAbility(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'use_ability' }>): PolitikResult {
  const p = s.players[seat];
  if (!p || s.phase !== 'playing') return err('ability timing is not open');
  if (a.source.kind === 'station') return err('Broadcast Stations use the structured Signal/Noise action');
  const resume = interruptResume(s, seat);
  if (s.pending && !(a.asEdge && resume)) return err('finish the current decision first');
  if (!a.asEdge && (s.turn !== seat || s.actionsTaken >= s.actionsAllowed)) return err('Use Ability is not a legal Main Action now');
  const source = abilityCard(s, p, a.source);
  if (!source) return err('you do not control that ability');
  const definition = source.card?.kind === 'politik' ? POLITIK_CARDS[source.card.id] : null;
  if (a.asEdge && definition?.structureVerified && !verifiedEdgeIsOpen(s, definition)) return err('this printed Edge ability is not eligible in the current timing window');
  if (a.activate && !source.ready) return err('that Activate-cost ability is already Activated');
  if (a.activate) source.setReady(false);
  if (!a.asEdge) { const bad = consumeMain(s, seat); if (bad) return bad; }
  s.pending = {
    kind: 'guided', seat, source: source.title, sourceCard: source.card,
    instruction: source.card ? cardInstruction(source.card) : 'Resolve the printed ability.', context: 'ability', ...(resume ? { resume } : {}),
  };
  politikEvent(s, seat, `${a.activate ? 'activated' : 'used'} ${source.title}`, `${a.asEdge ? 'Edge Ability' : 'Main Action ability'}${a.activate ? '; paid its Activate cost' : '; no Activate cost declared'}`, source.card ? { card: source.card } : {});
  return ok();
}

function propagandaCount(p: PolitikPlayer, base: BaseId): number {
  return p.propaganda.filter((card) => card.bases.includes(base)).length;
}

/** Resolve the complete printed Broadcast Station ability without guided edits. */
function doBroadcast(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'broadcast' }>): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (s.phase !== 'playing' || s.turn !== seat || s.actionsTaken >= s.actionsAllowed) return err('Broadcast is not a legal Main Action now');
  if (!BASES.includes(a.base)) return err('choose a valid Signal/Noise Base');
  const station = s.locations[a.station];
  if (!station || station.kind !== 'station' || locationController(s, station.id) !== seat) return err('you do not control that Broadcast Station');
  if (!station.stationReady) return err('that Broadcast Station is already Activated');
  const strength = propagandaCount(s.players[seat], a.base);
  const adjacent = new Set(station.regions);
  let affected = 0;
  let influence = 0;
  if (a.mode === 'signal') {
    for (const loc of Object.values(s.locations)) {
      if (loc.kind !== 'state' || !loc.region || !adjacent.has(loc.region) || locationController(s, loc.id) !== seat) continue;
      loc.influence[seat] += strength;
      syncImperialDefense(loc, true);
      affected++;
      influence += strength;
    }
  } else if (a.mode === 'noise') {
    for (const loc of Object.values(s.locations)) {
      if (loc.kind !== 'state' || !loc.region || !adjacent.has(loc.region)) continue;
      const controller = locationController(s, loc.id);
      if (controller === null || controller === seat || s.players[controller].immunity.defense || s.players[controller].immunity.temporary) continue;
      const amount = Math.max(0, strength - propagandaCount(s.players[controller], a.base));
      const removed = Math.min(amount, loc.influence[controller]);
      loc.influence[controller] -= removed;
      syncImperialDefense(loc);
      affected++;
      influence += removed;
    }
  } else return err('unknown Broadcast mode');
  station.stationReady = false;
  const bad = consumeMain(s, seat); if (bad) return bad;
  recomputeFinalSay(s);
  politikEvent(s, seat, `broadcast ${a.mode}`, `${a.base}; strength ${strength}; ${affected} adjacent ordinary State${affected === 1 ? '' : 's'}; ${influence} Influence ${a.mode === 'signal' ? 'added' : 'removed'}`, { location: station.id });
  return ok();
}

// ---------------------------------------------------------------------------
// Three-arena Clash procedure
// ---------------------------------------------------------------------------

function findDefenderForLocation(s: PolitikState, attacker: number, location: LocationId): number | null {
  const loc = s.locations[location];
  const controller = locationController(s, location);
  if (controller !== null && controller !== attacker) return controller;
  const others = loc.influence.map((v, seat) => ({ v, seat })).filter((x) => x.seat !== attacker && x.v > 0);
  if (!others.length) return null;
  const max = Math.max(...others.map((x) => x.v));
  const tied = others.filter((x) => x.v === max).map((x) => x.seat);
  return tied.includes(s.finalSay) ? s.finalSay : tied[0];
}

const CLASH_RESPONSE_STAGES: ClashStage[] = ['after_cost', 'attacker_focus', 'defender_focus', 'after_reveal', 'before_resolve'];

function isClashResponse(pending: ClashPending | null | undefined): pending is ClashPending {
  return !!pending && CLASH_RESPONSE_STAGES.includes(pending.stage);
}

function clashResponseOrder(s: PolitikState, requester: number): number[] {
  recomputeFinalSay(s);
  const simultaneous = Array.from({ length: s.players.length }, (_, index) => (s.finalSay + index) % s.players.length);
  return [requester, ...simultaneous.filter((seat) => seat !== requester)];
}

function openClashResponse(s: PolitikState, pending: ClashPending, stage: Extract<ClashStage, 'after_cost' | 'attacker_focus' | 'defender_focus' | 'after_reveal' | 'before_resolve'>, requester: number, reason: string): void {
  const order = clashResponseOrder(s, requester);
  pending.stage = stage;
  pending.order = order;
  pending.cursor = 0;
  pending.passed = [];
  pending.reason = reason;
  pending.seat = order[0];
}

function openClashCommit(pending: ClashPending, stage: 'attacker_commit' | 'defender_commit', seat: number): void {
  pending.stage = stage;
  pending.seat = seat;
  pending.order = [];
  pending.cursor = 0;
  pending.passed = [];
  pending.reason = stage === 'attacker_commit' ? 'Attacker commits hidden Focus' : 'Defender commits hidden Focus';
}

function advanceClashResponse(s: PolitikState, pending: ClashPending): void {
  if (pending.stage === 'after_cost') {
    openClashCommit(pending, 'attacker_commit', pending.attacker);
    return;
  }
  if (pending.stage === 'attacker_focus') {
    if (pending.defender !== null) {
      openClashCommit(pending, 'defender_commit', pending.defender);
    } else {
      const count = (pending.arena === 'military' && s.locations[(pending.target as Extract<ClashTarget, { arena: 'military' }>).location].kind === 'station' ? 2 : 1) + (s.options.ragingImperials ? 1 : 0);
      pending.imperialCommitment = imperialCommitment(s, pending.arena, count);
      openClashResponse(s, pending, 'defender_focus', s.finalSay, 'During Imperial Focus');
    }
    return;
  }
  if (pending.stage === 'defender_focus') {
    openClashResponse(s, pending, 'after_reveal', s.finalSay, 'After Focus cards are revealed');
    politikEvent(s, null, `${pending.arena} Clash Focus revealed`, 'both commitments are now public');
    return;
  }
  if (pending.stage === 'after_reveal') {
    openClashResponse(s, pending, 'before_resolve', s.finalSay, 'Before the Clash resolves');
    return;
  }
  resolveClash(s, pending);
}

function doClash(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'clash' }>): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  const p = s.players[seat];
  if (s.phase !== 'playing' || s.turn !== seat || s.actionsTaken >= s.actionsAllowed) return err('Clash is not a legal Main Action now');
  if (!ARENAS.includes(a.target.arena)) return err('unknown Clash arena');

  let defender: number | null;
  if (a.target.arena === 'military') {
    if (!s.locations[a.target.location]) return err('unknown Military Clash target');
    defender = findDefenderForLocation(s, seat, a.target.location);
    const loc = s.locations[a.target.location];
    if (defender === null && loc.imperialInfluence <= 0 && loc.influence.every((n, i) => i === seat || n <= 0)) return err('there is no opposing force in that State');
  } else if (a.target.arena === 'political') {
    defender = a.target.defender;
    if (!s.players[defender] || defender === seat) return err('Political Clash needs another Nation');
    if (!COUNCIL_SEATS.includes(a.target.council) || s.councilSupport[a.target.council][defender] <= 0) return err('target Nation has no Support in that Seat');
  } else {
    defender = a.target.defender;
    if (!s.players[defender] || defender === seat) return err('Corporate Clash needs another Nation');
    if (!ownCompany(p, a.target.attackerCompany)) return err('choose one of your Companies');
    const defending = ownCompany(s.players[defender], a.target.defenderCompany);
    if (!defending) return err('choose an opposing Company');
  }

  const payment = a.payment ?? (p.carbon >= s.prices.clash ? 'carbon' : 'leader');
  if (payment === 'carbon') {
    if (p.carbon < s.prices.clash) return err(`Clash costs ${s.prices.clash} Carbon or one matching leader`);
    p.carbon -= s.prices.clash;
  } else {
    if (p.leaders[a.target.arena] <= 0) return err(`you need one ${a.target.arena} leader to pay for this Clash`);
    p.leaders[a.target.arena]--;
  }
  const bad = consumeMain(s, seat); if (bad) return bad;
  const politicalLimit = a.target.arena === 'political'
    ? { attacker: s.councilSupport[a.target.council][seat], defender: s.councilSupport[a.target.council][a.target.defender] }
    : { attacker: 0, defender: 0 };
  const pending: ClashPending = {
    kind: 'clash', seat, stage: 'after_cost', arena: a.target.arena, attacker: seat, defender, target: a.target,
    commitments: {}, imperialCommitment: null, politicalLimit, modifiers: [], order: [], cursor: 0, passed: [], reason: '',
  };
  openClashResponse(s, pending, 'after_cost', seat, 'After Clash costs, before Focus');
  s.pending = pending;
  politikEvent(s, seat, `declared a ${a.target.arena} Clash`, `${payment === 'carbon' ? `${s.prices.clash} Carbon` : `1 ${a.target.arena} leader`} paid`);
  return ok();
}

function focusFor(card: HandCard, arena: Arena, supplied: number | undefined): number | null {
  if (card.kind === 'startup') {
    if (supplied !== undefined && supplied !== 1) return null;
    return 1;
  }
  if (card.kind !== 'politik') return null;
  const definition = POLITIK_CARDS[card.id];
  // A fully art-reviewed Focus value is authoritative for humans, bots, and
  // Imperial draws. Client-supplied values cannot override verified print.
  if (definition?.focusVerified) return definition.focus[arena];
  // Unverified future cards retain the manual physical-card fallback.
  if (supplied !== undefined) return integer(supplied, 0, 10) ? supplied : null;
  const printed = definition?.focus[arena];
  return printed !== undefined && printed !== null ? printed : null;
}

function imperialCommitment(s: PolitikState, arena: Arena, count: number): ClashCommitment {
  const cards: ClashCommitment['cards'] = [];
  for (let i = 0; i < count; i++) {
    const id = s.politicsDeck.pop();
    if (!id) break;
    const card: HandCard = { kind: 'politik', id };
    cards.push({ card, focus: POLITIK_CARDS[id]?.focus[arena] ?? 0 });
  }
  return { cards, leaders: 0, focusInfluence: {}, total: cards.reduce((n, x) => n + x.focus, 0) };
}

function removeOpposingInfluence(s: PolitikState, location: LocationId, winner: number | null, loser: number | null, amount: number): void {
  const loc = s.locations[location];
  let remaining = amount;
  let playerInfluenceAdded = false;
  if (loser !== null) {
    const remove = Math.min(remaining, loc.influence[loser]);
    loc.influence[loser] -= remove;
    remaining -= remove;
  } else {
    const remove = Math.min(remaining, loc.imperialInfluence);
    loc.imperialInfluence -= remove;
    remaining -= remove;
  }
  if (winner !== null) {
    for (let other = 0; other < s.players.length && remaining > 0; other++) {
      if (other === winner || other === loser) continue;
      const remove = Math.min(remaining, loc.influence[other]);
      loc.influence[other] -= remove;
      remaining -= remove;
    }
    const imperial = Math.min(remaining, loc.imperialInfluence);
    loc.imperialInfluence -= imperial;
    remaining -= imperial;
    loc.influence[winner] += remaining;
    playerInfluenceAdded = remaining > 0;
  } else {
    loc.imperialInfluence += remaining;
  }
  syncImperialDefense(loc, playerInfluenceAdded);
}

function discardClashCommitments(s: PolitikState, pending: ClashPending): void {
  const discard = (card: HandCard): void => {
    if (card.kind === 'politik') s.politicsDiscard.push(card.id);
    else if (card.kind === 'startup') s.startupDiscard.push(card.id);
  };
  for (const commitment of Object.values(pending.commitments)) for (const focused of commitment?.cards ?? []) discard(focused.card);
  for (const focused of pending.imperialCommitment?.cards ?? []) discard(focused.card);
}

function emptyCommitment(): ClashCommitment {
  return { cards: [], leaders: 0, focusInfluence: {}, total: 0 };
}

function clashTotals(pending: ClashPending): { attacker: number; defender: number } {
  const attackerBase = pending.commitments[pending.attacker]?.total ?? 0;
  const defenderBase = pending.defender === null ? pending.imperialCommitment?.total ?? 0 : pending.commitments[pending.defender]?.total ?? 0;
  const modifier = (side: 'attacker' | 'defender'): number => pending.modifiers.filter((entry) => entry.side === side).reduce((total, entry) => total + entry.amount, 0);
  return { attacker: Math.max(0, attackerBase + modifier('attacker')), defender: Math.max(0, defenderBase + modifier('defender')) };
}

function cancelClashState(s: PolitikState, pending: ClashPending, seat: number, source: string): void {
  const attackerCommitment = pending.commitments[pending.attacker] ?? emptyCommitment();
  const defenderCommitment = pending.defender === null ? pending.imperialCommitment : pending.commitments[pending.defender] ?? null;
  const totals = clashTotals(pending);
  discardClashCommitments(s, pending);
  s.lastClash = {
    arena: pending.arena, attacker: pending.attacker, defender: pending.defender, target: pending.target,
    attackerCommitment, defenderCommitment, attackerTotal: totals.attacker, defenderTotal: totals.defender,
    winner: null, imperialWon: false, difference: 0, modifiers: pending.modifiers.map((entry) => ({ ...entry })), cancelled: true,
  };
  s.pending = null;
  politikEvent(s, seat, `canceled ${pending.arena} Clash`, `${source}; paid Clash/Focus costs remain spent`);
  checkHandLimit(s, s.turn);
}

function resolveClash(s: PolitikState, pending: ClashPending): void {
  const attackerCommitment = pending.commitments[pending.attacker]!;
  const defenderCommitment = pending.defender === null ? pending.imperialCommitment : pending.commitments[pending.defender] ?? null;
  const totals = clashTotals(pending);
  const attackerTotal = totals.attacker;
  const defenderTotal = totals.defender;
  const winner = attackerTotal === defenderTotal ? null : attackerTotal > defenderTotal ? pending.attacker : pending.defender;
  const imperialWon = pending.defender === null && defenderTotal > attackerTotal;
  const difference = Math.abs(attackerTotal - defenderTotal);
  const publicClash: PublicClash = {
    arena: pending.arena, attacker: pending.attacker, defender: pending.defender, target: pending.target,
    attackerCommitment, defenderCommitment, attackerTotal, defenderTotal, winner, imperialWon, difference,
    modifiers: pending.modifiers.map((entry) => ({ ...entry })), cancelled: false,
  };
  s.lastClash = publicClash;
  discardClashCommitments(s, pending);

  if (pending.arena === 'military') {
    const target = pending.target as Extract<ClashTarget, { arena: 'military' }>;
    const before = locationController(s, target.location);
    if (winner === pending.attacker) removeOpposingInfluence(s, target.location, pending.attacker, pending.defender, difference);
    else if (winner === pending.defender) removeOpposingInfluence(s, target.location, pending.defender, pending.attacker, difference);
    else if (winner === null && pending.defender === null && defenderTotal > attackerTotal) removeOpposingInfluence(s, target.location, null, pending.attacker, difference);
    const after = locationController(s, target.location);
    let supportPending = false;
    if (after !== null && after !== before && after === winner) {
      const benefit = stateBenefit(s, s.players[after], target.location);
      politikEvent(s, after, `gained control of ${s.locations[target.location].name}`, benefit, { location: target.location });
      if (s.locations[target.location].benefit === 'support') {
        s.pending = { kind: 'allocate_support', seat: after, amount: 1, eligible: [...BASES], reason: `control of ${s.locations[target.location].name}` };
        supportPending = true;
      }
    }
    if (!supportPending) s.pending = null;
  } else if (pending.arena === 'political') {
    const target = pending.target as Extract<ClashTarget, { arena: 'political' }>;
    if (winner !== null && difference > 0) {
      const loser = winner === pending.attacker ? target.defender : pending.attacker;
      const startingLimit = winner === pending.attacker ? pending.politicalLimit.defender : pending.politicalLimit.attacker;
      const amount = Math.min(difference, startingLimit, s.councilSupport[target.council][loser]);
      s.councilSupport[target.council][loser] -= amount;
      s.councilSupport[target.council][winner] += amount;
    }
    s.pending = null;
  } else if (winner !== null && difference > 0) {
    const target = pending.target as Extract<ClashTarget, { arena: 'corporate' }>;
    const loser = winner === pending.attacker ? target.defender : pending.attacker;
    const loserCompany = winner === pending.attacker ? target.defenderCompany : target.attackerCompany;
    const winnerCompany = winner === pending.attacker ? target.attackerCompany : target.defenderCompany;
    s.pending = { kind: 'corporate_loss', seat: loser, loser, loserCompany, winnerCompany, amount: difference, clash: publicClash };
  } else {
    s.pending = null;
  }
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  politikEvent(s, winner, `${pending.arena} Clash resolved`, `${attackerTotal}-${defenderTotal}; ${imperialWon ? `Imperials won by ${difference}` : winner === null ? 'tie' : `${s.players[winner].name} won by ${difference}`}`);
}

function doClashCommit(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'clash_commit' }>): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'clash' || pending.seat !== seat) return err('not your hidden Clash commitment');
  const expectedStage = seat === pending.attacker ? 'attacker_commit' : 'defender_commit';
  if (pending.stage !== expectedStage || (seat !== pending.attacker && seat !== pending.defender)) return err('Clash Focus commitment is not open at this stage');
  if (pending.commitments[seat]) return err('commitment already locked');
  const p = s.players[seat];
  const indices = a.cards.map((x) => x.handIndex);
  if (new Set(indices).size !== indices.length || indices.some((i) => !integer(i, 0, p.hand.length - 1))) return err('invalid or duplicate Focus card index');
  const cards: ClashCommitment['cards'] = [];
  for (const x of a.cards) {
    const card = p.hand[x.handIndex];
    const focus = focusFor(card, pending.arena, x.focus);
    if (focus === null) return err('only Politik cards or universal-Focus Startup cards may be committed');
    cards.push({ card: { ...card }, focus });
  }
  const leaders = a.leaders ?? 0;
  if (!integer(leaders, 0, p.leaders[pending.arena]) || leaders > p.leaders[pending.arena]) return err(`not enough ${pending.arena} leaders`);
  const focusInfluence = a.focusInfluence ?? {};
  const focusSources = Object.entries(focusInfluence).filter(([, amount]) => (amount ?? 0) !== 0);
  if (pending.arena !== 'military' && focusSources.length) return err('only Military Clashes Focus adjacent Influence');
  if (pending.arena === 'military') {
    const target = (pending.target as Extract<ClashTarget, { arena: 'military' }>).location;
    for (const [source, raw] of focusSources) {
      const amount = raw ?? 0;
      if (!POLITIK_ADJACENCY[target]?.includes(source)) return err(`${source} is not adjacent to ${target}`);
      if (!integer(amount, 1, 100) || locationController(s, source) !== seat || s.locations[source].influence[seat] < amount) return err('Focused Influence must come from an adjacent controlled State');
    }
  }
  const influenceTotal = focusSources.reduce((n, [, amount]) => n + (amount ?? 0), 0);
  const commitment: ClashCommitment = { cards, leaders, focusInfluence: { ...focusInfluence }, total: cards.reduce((n, x) => n + x.focus, 0) + leaders + influenceTotal };
  for (const index of [...indices].sort((x, y) => y - x)) p.hand.splice(index, 1);
  p.leaders[pending.arena] -= leaders;
  for (const [source, amount] of focusSources) {
    s.locations[source].influence[seat] -= amount ?? 0;
    syncImperialDefense(s.locations[source]);
  }
  pending.commitments[seat] = commitment;
  openClashResponse(
    s, pending, seat === pending.attacker ? 'attacker_focus' : 'defender_focus', seat,
    seat === pending.attacker ? 'During attacker Focus' : 'During defender Focus',
  );
  return ok();
}

function passClashResponse(s: PolitikState, seat: number): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'clash' || !isClashResponse(pending) || pending.seat !== seat) return err('not your Clash timing response');
  pending.passed.push(seat);
  pending.cursor++;
  if (pending.cursor < pending.order.length) pending.seat = pending.order[pending.cursor];
  else advanceClashResponse(s, pending);
  return ok();
}

function modifyClash(s: PolitikState, seat: number, side: 'attacker' | 'defender', amount: number, source: string): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'clash' || !isClashResponse(pending) || pending.seat !== seat) return err('Clash modifier timing is not open for you');
  if (!integer(Math.abs(amount), 1, 100)) return err('Clash Focus modifier must be a nonzero integer from -100 to 100');
  const label = source.trim();
  if (label.length < 3 || label.length > 160) return err('name the printed Clash modifier source');
  pending.modifiers.push({ seat, side, amount, source: label });
  politikEvent(s, seat, 'modified Clash Focus', `${side} ${amount > 0 ? '+' : ''}${amount}; ${label}`);
  return ok();
}

function cancelClash(s: PolitikState, seat: number, source: string): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'clash' || !isClashResponse(pending) || pending.seat !== seat) return err('Clash cancellation timing is not open for you');
  const label = source.trim();
  if (label.length < 3 || label.length > 160) return err('name the printed Clash cancellation source');
  cancelClashState(s, pending, seat, label);
  return ok();
}

function resolveCorporateLoss(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'resolve_corporate_loss' }>): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'corporate_loss' || pending.seat !== seat) return err('not your Corporate loss allocation');
  const losing = ownCompany(s.players[seat], pending.loserCompany);
  const winningEntry = companyById(s, pending.winnerCompany);
  if (!losing || !winningEntry) return err('Clash Company no longer exists');
  const marketLoss = sumRecord(INDUSTRIES, a.markets);
  const available = losing.margin + INDUSTRIES.reduce((n, x) => n + (losing.markets[x] ?? 0), 0);
  const required = Math.min(pending.amount, available);
  if (!integer(a.margin, 0, losing.margin) || INDUSTRIES.some((x) => !integer(a.markets?.[x] ?? 0, 0, losing.markets[x] ?? 0))) return err('invalid Margin/Market loss');
  if (a.margin + marketLoss !== required) return err(`allocate exactly ${required} total Margin/Market loss`);
  losing.margin -= a.margin;
  const marketsTransferred: Partial<Record<IndustryId, number>> = {};
  for (const industry of INDUSTRIES) {
    const amount = a.markets?.[industry] ?? 0;
    if (!amount) continue;
    losing.markets[industry] = (losing.markets[industry] ?? 0) - amount;
    marketsTransferred[industry] = amount;
    if (winningEntry.company.industries.includes(industry)) {
      winningEntry.company.markets[industry] = (winningEntry.company.markets[industry] ?? 0) + amount;
    }
    else s.marketSupply[industry] += amount;
  }
  const winnerTotal = winningEntry.company.margin + a.margin;
  if (winnerTotal <= 9) {
    winningEntry.company.margin = winnerTotal;
    s.pending = null;
  } else {
    s.pending = {
      kind: 'corporate_gain', seat: winningEntry.player.seat,
      loser: pending.loser, loserCompany: pending.loserCompany, winnerCompany: pending.winnerCompany,
      marginTransferred: a.margin, marketsTransferred, total: winnerTotal,
      eligibleIndustries: [...winningEntry.company.industries], clash: pending.clash,
    };
  }
  politikEvent(s, seat, 'allocated Corporate Clash loss', `${a.margin} Margin and ${marketLoss} Market; Margin transferred to ${winningEntry.company.title}`);
  return ok();
}

function resolveCorporateGain(s: PolitikState, seat: number, choice: IndustryId | null): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'corporate_gain' || pending.seat !== seat) return err('not your winning Company Margin choice');
  const winner = companyById(s, pending.winnerCompany);
  if (!winner || winner.player.seat !== seat) return err('winning Company no longer exists');
  if (choice === null) {
    winner.company.margin = 9;
  } else {
    if (!pending.eligibleIndustries.includes(choice)) return err('winner overflow Market must match a winning Company Industry');
    if (s.marketSupply[choice] <= 0) return err(`no ${choice} Market remains`);
    s.marketSupply[choice]--;
    winner.company.markets[choice] = (winner.company.markets[choice] ?? 0) + 1;
    winner.company.margin = Math.min(9, pending.total - 10);
  }
  s.pending = null;
  politikEvent(s, seat, `resolved ${winner.company.title} transferred Margin`, choice === null ? 'remained at 9 Margin' : `took 1 ${choice} Market and reset/continued`);
  return ok();
}

function resolveLandscape(s: PolitikState, seat: number, choice: IndustryId | null): PolitikResult {
  const landscapeError = resolvePolitikLandscapeOverflow(s, seat, choice);
  return landscapeError ? err(landscapeError) : ok();
}

// ---------------------------------------------------------------------------
// Limits, obligations, Final Say, and Trade
// ---------------------------------------------------------------------------

function allocateSupport(s: PolitikState, seat: number, allocation: Partial<Record<BaseId, number>>): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'allocate_support' || pending.seat !== seat) return err('not your Support allocation');
  if (BASES.some((x) => !integer(allocation[x] ?? 0, 0, pending.amount)) || sumRecord(BASES, allocation) !== pending.amount) return err(`assign exactly ${pending.amount} Support among Bases`);
  for (const base of BASES) s.players[seat].support[base] += allocation[base] ?? 0;
  s.pending = null;
  politikEvent(s, seat, 'allocated gained Support', `${pending.amount} from ${pending.reason}`);
  checkHandLimit(s, seat);
  return ok();
}

function discardToLimit(s: PolitikState, seat: number, indices: number[]): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'hand_limit' || pending.seat !== seat) return err('you are not resolving a hand limit');
  const p = s.players[seat];
  if (indices.length !== pending.excess || new Set(indices).size !== indices.length) return err(`discard exactly ${pending.excess} cards`);
  if (indices.some((i) => !integer(i, 0, p.hand.length - 1) || p.hand[i].kind === 'obligation')) return err('bad discard; Obligations cannot be discarded normally');
  const cards = indices.map((i) => p.hand[i]);
  for (const i of [...indices].sort((a, b) => b - a)) p.hand.splice(i, 1);
  for (const card of cards) if (card.kind === 'politik') s.politicsDiscard.push(card.id);
  for (const card of cards) if (card.kind === 'startup') s.startupDiscard.push(card.id);
  s.pending = null;
  politikEvent(s, seat, 'discarded to the hand limit', `${cards.length} cards; hand is now ${p.hand.length}`);
  checkHandLimit(s, s.turn);
  return ok();
}

function shirkObligation(s: PolitikState, seat: number, handIndex: number): PolitikResult {
  if (s.phase !== 'playing') return err('Shirk timing is not open');
  const edge = !!interruptResume(s, seat);
  if (s.pending && !(s.pending.kind === 'hand_limit' && s.pending.seat === seat) && !edge) return err('finish the current decision first');
  const p = s.players[seat];
  const card = p?.hand[handIndex];
  if (!card || card.kind !== 'obligation') return err('choose one of your Obligations');
  const cost = 10 * p.corruption;
  if (p.capital < cost) return err(`Shirking costs ${cost} Capital at Corruption ${p.corruption}`);
  p.capital -= cost;
  p.hand.splice(handIndex, 1);
  s.obligationDeck.unshift(card.id);
  if (s.pending?.kind === 'hand_limit') {
    const excess = p.hand.length - 10;
    s.pending = excess > 0 ? { kind: 'hand_limit', seat, excess } : null;
  }
  politikEvent(s, seat, 'shirked an Obligation', `paid ${cost} Capital; card returned to the bottom of the deck`, { card });
  checkHandLimit(s, s.turn);
  return ok();
}

function ruleFinalSay(s: PolitikState, seat: number, contest: string, winner: number): PolitikResult {
  if (s.phase !== 'playing') return err('Final Say is not active during setup');
  recomputeFinalSay(s);
  if (s.finalSay !== seat) return err('you do not hold Final Say');
  const tie = politikTieContests(s).find((x) => x.key === contest);
  if (!tie) return err('that contest is not currently tied');
  if (!tie.candidates.includes(winner)) return err('Final Say must award the tie to a tied Nation');
  s.tieRulings[contest] = { winner, candidates: [...tie.candidates].sort((a, b) => a - b).join(','), value: tie.value };
  politikEvent(s, seat, 'gave Final Say', `${contest} awarded to ${s.players[winner].name}`);
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  return ok();
}

interface TradeExecution { bad: string | null; use?: { seat: number; title: string; card: HandCard | null } }

function executeTrade(s: PolitikState, transfers: TradeTransfer[]): TradeExecution {
  let use: TradeExecution['use'];
  const handTransfers = transfers.filter((x) => x.kind === 'hand_card');
  const seenHands = new Set<string>();
  const captured: { to: number; card: HandCard }[] = [];
  for (const x of handTransfers) {
    const from = s.players[x.from]; const to = s.players[x.to];
    if (!from || !to || x.from === x.to || x.handIndex === undefined || !integer(x.handIndex, 0, from.hand.length - 1)) return { bad: 'invalid hand-card transfer' };
    const key = `${x.from}:${x.handIndex}`;
    if (seenHands.has(key)) return { bad: 'same hand card offered twice' };
    seenHands.add(key);
    const card = from.hand[x.handIndex];
    if (card.kind === 'obligation') return { bad: 'Obligations are not tradable' };
    captured.push({ to: x.to, card: { ...card } });
  }
  const byOwner = new Map<number, number[]>();
  for (const x of handTransfers) byOwner.set(x.from, [...(byOwner.get(x.from) ?? []), x.handIndex!]);
  for (const [from, indices] of byOwner) for (const i of indices.sort((a, b) => b - a)) s.players[from].hand.splice(i, 1);
  for (const x of captured) s.players[x.to].hand.push(x.card);

  for (const x of transfers.filter((t) => t.kind !== 'hand_card')) {
    const from = s.players[x.from]; const to = s.players[x.to];
    if (!from || !to || x.from === x.to) return { bad: 'Trade transfers need two different Nations' };
    if (x.kind === 'capital' || x.kind === 'carbon' || x.kind === 'food') {
      const amount = x.amount ?? 0;
      if (!integer(amount, 1, 999) || from[x.kind] < amount) return { bad: `invalid ${x.kind} transfer` };
      from[x.kind] -= amount; to[x.kind] += amount;
    } else if (x.kind === 'margin') {
      const amount = x.amount ?? 0; const fc = ownCompany(from, x.company); const tc = ownCompany(to, x.toCompany);
      if (!fc || !tc || !integer(amount, 1, fc.margin) || tc.margin + amount > 9) return { bad: 'invalid Margin transfer' };
      fc.margin -= amount; tc.margin += amount;
    } else if (x.kind === 'market') {
      const amount = x.amount ?? 0; const industry = x.industry; const fc = ownCompany(from, x.company); const tc = ownCompany(to, x.toCompany);
      if (!industry || !fc || !tc || !tc.industries.includes(industry) || !integer(amount, 1, fc.markets[industry] ?? 0)) return { bad: 'invalid Market transfer' };
      fc.markets[industry] = (fc.markets[industry] ?? 0) - amount;
      tc.markets[industry] = (tc.markets[industry] ?? 0) + amount;
    } else if (x.kind === 'state') {
      const loc = x.location ? s.locations[x.location] : null;
      if (!loc || locationController(s, loc.id) !== x.from) return { bad: 'only a controlled State may be traded' };
      const amount = loc.influence[x.from];
      if (amount <= 0 || (x.amount !== undefined && x.amount !== amount)) return { bad: 'a State trade must transfer all of its controller\'s Influence' };
      loc.influence[x.from] = 0;
      loc.influence[x.to] += amount; // A trade is not a gain and does not fire the State benefit.
      syncImperialDefense(loc, true);
    } else if (x.kind === 'tableau_card') {
      if (x.tableauKind === 'company') {
        const at = from.companies.findIndex((c) => c.id === x.tableauId);
        if (at < 0) return { bad: 'traded Company is not controlled by its giver' };
        const company = from.companies.splice(at, 1)[0];
        const negotiation = (company.negotiation ? 1 : 0) + company.assets.filter((a) => a.negotiation).length;
        from.negotiation -= negotiation; to.negotiation += negotiation;
        to.companies.push(company);
      } else if (x.tableauKind === 'propaganda') {
        const at = from.propaganda.findIndex((c) => c.instanceId === x.tableauId);
        if (at < 0 || to.propaganda.length >= 4) return { bad: 'invalid Propaganda transfer' };
        const [card] = from.propaganda.splice(at, 1); to.propaganda.push(card);
        if (card.negotiation) { from.negotiation--; to.negotiation++; }
      } else if (x.tableauKind === 'asset') {
        let asset: TableauCard | null = null;
        for (const company of from.companies) {
          const at = company.assets.findIndex((c) => c.instanceId === x.tableauId);
          if (at >= 0) {
            asset = company.assets.splice(at, 1)[0];
            company.industries = [...new Set([...company.printedIndustries, ...company.assets.flatMap((a) => a.industries)])];
            break;
          }
        }
        const target = ownCompany(to, x.toCompany);
        if (!asset || !target) return { bad: 'traded Asset needs a receiving Company' };
        target.assets.push(asset);
        target.industries = [...new Set([...target.industries, ...asset.industries])];
        if (asset.negotiation) { from.negotiation--; to.negotiation++; }
      } else return { bad: 'unknown tableau-card transfer' };
    } else if (x.kind === 'use') {
      if (use) return { bad: 'build one traded card use at a time' };
      if (!x.source) return { bad: 'traded use needs a card source' };
      if (x.source.kind === 'station') return { bad: 'Broadcast Station Signal/Noise must use its structured action' };
      const source = abilityCard(s, from, x.source);
      if (!source || (x.activate && !source.ready)) return { bad: 'traded Activate-cost card use is unavailable' };
      if (x.activate) source.setReady(false);
      use = { seat: x.to, title: source.title, card: source.card };
    } else if (x.kind === 'favor') {
      if (!x.favor || x.favor.trim().length < 3 || x.favor.length > 240) return { bad: 'a favor needs a short public promise' };
    }
  }
  return { bad: null, use };
}

function proposeTrade(s: PolitikState, seat: number, a: Extract<PolitikAction, { type: 'propose_trade' }>): PolitikResult {
  const resume = interruptResume(s, seat) ?? undefined;
  if ((s.pending && !resume) || s.phase !== 'playing') return err('Trade timing is not open');
  if (!a.transfers.length || a.transfers.length > 30) return err('Trade needs 1-30 transfers');
  const participants = [...new Set(a.participants)].sort((x, y) => x - y);
  const involved = [...new Set(a.transfers.flatMap((x) => [x.from, x.to]))].sort((x, y) => x - y);
  if (participants.length < 2 || participants.some((x) => !s.players[x]) || participants.join(',') !== involved.join(',')) return err('participants must exactly match the multiple Nations exchanging property');
  if (!participants.includes(seat)) return err('the proposer must participate in the Trade');
  const validation = executeTrade(structuredClone(s), a.transfers);
  if (validation.bad) return err(validation.bad);
  const approvers = [...new Set([...participants, s.turn])];
  const approvals: Partial<Record<number, boolean>> = { [seat]: true };
  const next = approvers.find((x) => !approvals[x]);
  if (next === undefined) return err('Trade needs another Nation');
  s.pending = {
    kind: 'trade', seat: next, proposer: seat, participants, approvers, approvals,
    transfers: a.transfers.map(({ card: _card, label: _label, ...x }) => ({ ...x, source: x.source ? { ...x.source } : undefined })),
    ...(resume ? { resume } : {}),
  };
  politikEvent(s, seat, 'proposed a Trade', `${participants.map((x) => s.players[x].name).join(', ')}; awaiting all participants${approvers.includes(s.turn) ? ' and active-player approval' : ''}`);
  return ok();
}

function respondTrade(s: PolitikState, seat: number, accept: boolean): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'trade' || pending.seat !== seat) return err('not your Trade confirmation');
  if (!accept) {
    s.pending = pending.resume ?? null;
    politikEvent(s, seat, 'declined the Trade', 'no property changed hands');
    return ok();
  }
  pending.approvals[seat] = true;
  const next = pending.approvers.find((x) => !pending.approvals[x]);
  if (next !== undefined) { pending.seat = next; return ok(); }
  const execution = executeTrade(s, pending.transfers);
  if (execution.bad) return err(execution.bad);
  s.pending = execution.use ? {
    kind: 'guided', seat: execution.use.seat, source: `traded use of ${execution.use.title}`, sourceCard: execution.use.card,
    instruction: execution.use.card ? cardInstruction(execution.use.card) : 'Resolve the granted use with typed operations.', context: 'ability', ...(pending.resume ? { resume: pending.resume } : {}),
  } : pending.resume ?? null;
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  politikEvent(s, pending.proposer, 'completed the Trade', `${pending.transfers.length} public transfer${pending.transfers.length === 1 ? '' : 's'}; received property did not fire gain triggers`);
  checkHandLimit(s, pending.participants[0]);
  return ok();
}

function openEdgeWindow(s: PolitikState, seat: number, reason: string, requested?: number[]): PolitikResult {
  if (s.pending || s.phase !== 'playing') return err('an Edge response window cannot open now');
  recomputeFinalSay(s);
  let order: number[];
  if (requested) {
    if (seat !== s.finalSay) return err('only Final Say may set Edge Action order');
    if (requested.length !== s.players.length || requested[0] !== seat || new Set(requested).size !== requested.length || requested.some((x) => !s.players[x])) return err('Edge order must begin with the requester and contain every Nation exactly once');
    order = [...requested];
  } else {
    const simultaneous = Array.from({ length: s.players.length }, (_, i) => (s.finalSay + i) % s.players.length);
    order = [seat, ...simultaneous.filter((candidate) => candidate !== seat)];
  }
  if (reason.trim().length < 3 || reason.length > 160) return err('name the timing window');
  s.pending = { kind: 'edge_window', seat: order[0], active: s.turn, order: [...order], cursor: 0, passed: [], reason: reason.trim() };
  politikEvent(s, seat, 'opened an Edge response window', `${reason}; order ${order.map((x) => s.players[x].name).join(', ')}`);
  return ok();
}

function passEdge(s: PolitikState, seat: number): PolitikResult {
  const pending = s.pending;
  if (pending?.kind !== 'edge_window' || pending.seat !== seat) return err('not your Edge response');
  pending.passed.push(seat);
  pending.cursor++;
  if (pending.cursor >= pending.order.length) {
    s.pending = null;
    politikEvent(s, seat, 'closed the Edge response window', 'every Nation passed');
    checkHandLimit(s, s.turn);
  } else {
    pending.seat = pending.order[pending.cursor];
  }
  return ok();
}

// ---------------------------------------------------------------------------
// Explicit Check Power Grabs / End Turn
// ---------------------------------------------------------------------------

function qualifiesFor(s: PolitikState, seat: number, arena: Arena): boolean {
  if (arena === 'military') return controlledRegions(s, seat).length >= 3;
  if (arena === 'political') return controlledCouncil(s, seat).length >= 4;
  return controlledIndustries(s, seat).length >= 4;
}

function claimPowerGrabs(s: PolitikState, p: PolitikPlayer): Arena[] {
  const claimed: Arena[] = [];
  for (const arena of ARENAS) {
    if (qualifiesFor(s, p.seat, arena) && p.powerGrabs[arena] < 2) {
      p.powerGrabs[arena]++;
      claimed.push(arena);
    }
  }
  return claimed;
}

function endTurn(s: PolitikState, seat: number): PolitikResult {
  if (s.pending) return err('finish the current decision first');
  if (s.phase !== 'playing' || s.turn !== seat) return err('not your turn');
  if (s.actionsTaken < s.actionsAllowed) return err(`complete all ${s.actionsAllowed} Main Actions before Check Power Grabs`);
  const p = s.players[seat];
  if (p.hand.length > 10) return err('discard to the 10-card hand limit first');

  const claimed = claimPowerGrabs(s, p);
  for (const card of p.eventsInPlay) {
    if (card.card.kind === 'politik') s.politicsDiscard.push(card.card.id);
    if (card.negotiation) p.negotiation--;
  }
  p.eventsInPlay = [];
  p.immunity.temporary = false;
  politikEvent(s, seat, 'checked Power Grabs', claimed.length ? `claimed ${claimed.join(', ')}` : 'no new Power Grab');
  if (meetsVictory(s, p)) {
    s.phase = 'ended';
    s.winners = [seat];
    s.pending = null;
    politikEvent(s, seat, 'won Politik', `${ARENAS.map((x) => `${x} ${p.powerGrabs[x]}`).join(', ')}`);
    return ok();
  }

  s.turn = (s.turn + 1) % s.players.length;
  s.turnNumber++;
  s.actionsTaken = 0;
  s.actionsAllowed = s.players[s.turn].corruption >= 9 ? 3 : 2;
  recomputeFinalSay(s);
  updateDefenseImmunity(s);
  politikEvent(s, s.turn, 'began a turn', `${s.actionsAllowed} Main Actions available`);
  checkHandLimit(s, s.turn);
  return ok();
}

// ---------------------------------------------------------------------------
// Public atomic reducer
// ---------------------------------------------------------------------------

function applyPolitikActionDraft(s: PolitikState, seat: number, a: PolitikAction): PolitikResult {
  if (!s.players[seat]) return err('bad seat');
  if (s.phase === 'ended') return err('game over');

  if (a.type === 'mulligan') return setupMulligan(s, seat, a.take);
  if (a.type === 'choose_nation') return setupNation(s, seat, a);
  if (a.type === 'choose_setup_bonus') return setupBonus(s, seat, a);
  if (a.type === 'choose_start_state') return setupStartState(s, seat, a.state);
  if (a.type === 'resolve_landscape') return resolveLandscape(s, seat, a.choice);
  if (a.type === 'resolve_guided' && s.pending?.kind === 'guided') return resolveGuided(s, seat, a);
  if (s.phase === 'setup') return err('finish Politik setup first');

  if (a.type === 'resolve_guided') return resolveGuided(s, seat, a);
  if (a.type === 'clash_commit') return doClashCommit(s, seat, a);
  if (a.type === 'resolve_corporate_loss') return resolveCorporateLoss(s, seat, a);
  if (a.type === 'resolve_corporate_gain') return resolveCorporateGain(s, seat, a.choice);
  if (a.type === 'respond_trade') return respondTrade(s, seat, a.accept);
  if (a.type === 'discard') return discardToLimit(s, seat, a.handIndices);
  if (a.type === 'allocate_support') return allocateSupport(s, seat, a.support);
  if (a.type === 'pass_edge') return passEdge(s, seat);
  if (a.type === 'pass_clash') return passClashResponse(s, seat);
  if (a.type === 'clash_modifier') return modifyClash(s, seat, a.side, a.amount, a.source);
  if (a.type === 'cancel_clash') return cancelClash(s, seat, a.source);
  if (a.type === 'final_say') return ruleFinalSay(s, seat, a.contest, a.winner);
  if (a.type === 'shirk_obligation') return shirkObligation(s, seat, a.handIndex);
  if (a.type === 'play_card' && s.pending?.kind === 'hand_limit') return doPlayCard(s, seat, a);

  // These three Edge actions own their resume semantics in their handlers.
  // Route them before the generic pending guard, but only for the response
  // window's current Nation and only with their explicit Edge timing marker.
  const interruptResponder = (s.pending?.kind === 'edge_window' || (s.pending?.kind === 'clash' && isClashResponse(s.pending))) && s.pending.seat === seat;
  if (interruptResponder && a.type === 'play_card' && a.spec.kind === 'event' && a.spec.edge) return doPlayCard(s, seat, a);
  if (interruptResponder && a.type === 'use_ability' && a.asEdge) return doAbility(s, seat, a);
  if (interruptResponder && a.type === 'propose_trade') return proposeTrade(s, seat, a);

  if (s.pending) return err('finish the current decision first');
  if (a.type === 'open_edge_window') return openEdgeWindow(s, seat, a.reason, a.order);
  if (a.type === 'research') return doResearch(s, seat, a.amount);
  if (a.type === 'educate') return doEducate(s, seat, a.leaders);
  if (a.type === 'exchange') return doExchange(s, seat, a.transactions);
  if (a.type === 'campaign') return doCampaign(s, seat, a.council, a.fromBases);
  if (a.type === 'national') return doNational(s, seat, a);
  if (a.type === 'play_card') return doPlayCard(s, seat, a);
  if (a.type === 'use_ability') return doAbility(s, seat, a);
  if (a.type === 'broadcast') return doBroadcast(s, seat, a);
  if (a.type === 'clash') return doClash(s, seat, a);
  if (a.type === 'propose_trade') return proposeTrade(s, seat, a);
  if (a.type === 'end_turn') return endTurn(s, seat);
  return err('unknown Politik action');
}

/**
 * Apply one action atomically. Validation and every multi-step operation run
 * against a structured clone; the caller's state changes only on success.
 */
export function applyPolitikAction(s: PolitikState, seat: number, a: PolitikAction): PolitikResult {
  const draft = structuredClone(s) as PolitikState;
  const result = applyPolitikActionDraft(draft, seat, a);
  if (result.ok) {
    if (draft.phase === 'playing') {
      const printed = draft.players[draft.turn].corruption >= 9 ? 3 : 2;
      draft.actionsAllowed = Math.max(draft.actionsTaken, printed);
    }
    Object.assign(s, draft);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Deterministic CPU player used by the server and full-game tests
// ---------------------------------------------------------------------------

function botSetupNation(s: PolitikState, seat: number): PolitikAction {
  const p = s.players[seat];
  const nation = NATION_BY_ID[p.nationChoices[0]];
  const propaganda = PROPAGANDA_BY_ID[nation.propaganda[0]];
  return {
    type: 'choose_nation', nation: nation.id, propaganda: propaganda.id,
    support: { [propaganda.bases[0]]: nation.support },
    leaders: { military: nation.leaders },
    ...(propaganda.id === 'steelyWit' ? { steelyWitCouncil: COUNCIL_SEATS[seat % COUNCIL_SEATS.length] } : {}),
  };
}

function botCorporateLoss(s: PolitikState, pending: Extract<PolitikPending, { kind: 'corporate_loss' }>): PolitikAction {
  const company = ownCompany(s.players[pending.loser], pending.loserCompany)!;
  const available = company.margin + INDUSTRIES.reduce((n, x) => n + (company.markets[x] ?? 0), 0);
  let left = Math.min(pending.amount, available);
  const margin = Math.min(left, company.margin);
  left -= margin;
  const markets: Partial<Record<IndustryId, number>> = {};
  for (const industry of INDUSTRIES) {
    const take = Math.min(left, company.markets[industry] ?? 0);
    if (take) markets[industry] = take;
    left -= take;
  }
  return { type: 'resolve_corporate_loss', margin, markets };
}

function botClashCommit(s: PolitikState, seat: number, pending: Extract<PolitikPending, { kind: 'clash' }>): PolitikAction {
  const p = s.players[seat];
  const ranked = p.hand.map((card, handIndex) => ({ handIndex, focus: card.kind === 'politik' ? POLITIK_CARDS[card.id]?.focus[pending.arena] ?? -1 : card.kind === 'startup' ? 1 : -1 }))
    .filter((x) => x.focus >= 0).sort((a, b) => b.focus - a.focus || a.handIndex - b.handIndex).slice(0, 3);
  return { type: 'clash_commit', cards: ranked.map((x) => ({ handIndex: x.handIndex })), leaders: 0, focusInfluence: {} };
}

function botNational(s: PolitikState, p: PolitikPlayer): PolitikAction {
  const unused = NATIONAL_ACTIONS.filter((x) => !p.nationalUsed.includes(x));
  if (unused.includes('income')) return { type: 'national', action: 'income' };
  if (unused.includes('produce')) {
    const support = Object.values(s.locations).filter((x) => x.benefit === 'support' && locationController(s, x.id) === p.seat).length;
    return { type: 'national', action: 'produce', produceSupport: support ? { [p.propaganda[0]?.bases[0] ?? 'capitalism']: support } : {} };
  }
  if (unused.includes('refresh')) return { type: 'national', action: 'refresh' };
  if (unused.includes('rally')) {
    const chairChoices = COUNCIL_SEATS.flatMap((council) => s.players.map((player) => ({ seat: player.seat, council, amount: s.councilSupport[council][player.seat] })))
      .filter((choice) => choice.amount > 0)
      .sort((left, right) => right.amount - left.amount || left.seat - right.seat || COUNCIL_SEATS.indexOf(left.council) - COUNCIL_SEATS.indexOf(right.council));
    const chair = councilController(s, 'chair') === p.seat
      ? chairChoices.find((choice) => choice.seat === p.seat)
        ?? chairChoices.find((choice) => choice.seat !== s.first)
        ?? chairChoices[0]
      : undefined;
    return { type: 'national', action: 'rally', ...(chair ? { chair: { seat: chair.seat, council: chair.council } } : {}) };
  }
  return { type: 'national', action: 'refresh' };
}

/** Always returns one legal-intent button for the requested bot seat. */
export function politikBotAction(s: PolitikState, seat: number): PolitikAction {
  const pending = s.pending;
  if (pending) {
    if (pending.kind === 'mulligan') return { type: 'mulligan', take: false };
    if (pending.kind === 'nation') return botSetupNation(s, seat);
    if (pending.kind === 'setup_bonus') {
      const bonus = (['capital', 'food', 'carbon', 'research', 'exchange'] as SetupBonus[]).find((x) => pending.available.includes(x))!;
      const exchange = bonus === 'exchange' ? [{ resource: 'food' as const, mode: 'buy' as const, amount: 1 }] : undefined;
      return { type: 'choose_setup_bonus', bonus, exchange };
    }
    if (pending.kind === 'start_state') {
      const states = Object.values(s.locations).filter((x) => x.kind === 'state');
      const offset = seat * 5;
      const state = [...states.slice(offset), ...states.slice(0, offset)].find((x) => x.influence.every((n) => n === 0)) ?? states.find((x) => x.influence.every((n) => n === 0))!;
      return { type: 'choose_start_state', state: state.id };
    }
    if (pending.kind === 'guided') return { type: 'resolve_guided', operations: [{ kind: 'acknowledge', text: 'Printed effect checked and resolved.' }], note: 'Printed effect checked and resolved' };
    if (pending.kind === 'landscape') {
      const choice = pending.overflow?.eligibleIndustries.find((industry) => s.marketSupply[industry] > 0) ?? null;
      return { type: 'resolve_landscape', choice };
    }
    if (pending.kind === 'clash') {
      if (pending.stage === 'attacker_commit' || pending.stage === 'defender_commit') return botClashCommit(s, seat, pending);
      return { type: 'pass_clash' };
    }
    if (pending.kind === 'corporate_loss') return botCorporateLoss(s, pending);
    if (pending.kind === 'corporate_gain') {
      const choice = pending.eligibleIndustries.find((industry) => s.marketSupply[industry] > 0) ?? null;
      return { type: 'resolve_corporate_gain', choice };
    }
    if (pending.kind === 'trade') return { type: 'respond_trade', accept: false };
    if (pending.kind === 'edge_window') return { type: 'pass_edge' };
    if (pending.kind === 'allocate_support') return { type: 'allocate_support', support: { [pending.eligible[0]]: pending.amount } };
    if (pending.kind === 'hand_limit') {
      const p = s.players[seat];
      const discardable = p.hand.map((card, i) => ({ card, i })).filter((x) => x.card.kind !== 'obligation').slice(0, pending.excess).map((x) => x.i);
      if (discardable.length === pending.excess) return { type: 'discard', handIndices: discardable };
      const obligation = p.hand.findIndex((x) => x.kind === 'obligation');
      if (obligation >= 0 && p.capital >= 10 * p.corruption) return { type: 'shirk_obligation', handIndex: obligation };
      return { type: 'play_card', handIndex: obligation, spec: { kind: 'obligation', capitalCost: 0 } };
    }
  }

  const p = s.players[seat];
  const unruly = politikTieContests(s).find((x) => x.ruling === null);
  if (s.finalSay === seat && unruly) return { type: 'final_say', contest: unruly.key, winner: unruly.candidates.includes(seat) ? seat : unruly.candidates[0] };
  if (s.turn !== seat) return { type: 'open_edge_window', reason: 'Bot response check' };
  if (s.actionsTaken >= s.actionsAllowed) return { type: 'end_turn' };

  const politics = p.hand.filter((x) => x.kind === 'politik').length;
  // Keep one deterministic strategic front-runner so automated tables always
  // exercise victory rather than deadlocking every public majority in ties.
  const contender = seat === s.first;
  if (!contender) return botNational(s, p);
  const militaryDone = controlledRegions(s, seat).length >= 3;
  if (!militaryDone && politics >= 1) {
    const regionCounts: Record<string, number> = {};
    for (const region of ['A', 'B', 'C', 'D', 'E']) {
      regionCounts[region] = Object.values(s.locations).filter((x) => x.kind === 'state' && x.region === region && locationController(s, x.id) === seat).length;
    }
    const target = Object.values(s.locations).find((x) => x.kind === 'state' && (regionCounts[x.region!] ?? 0) < 2 && locationController(s, x.id) !== seat && (x.imperialInfluence > 0 || x.influence.some((n, i) => i !== seat && n > 0)) && x.influence.every((n, i) => i === seat || n === 0));
    if (target && (p.carbon >= s.prices.clash || p.leaders.military > 0)) {
      return { type: 'clash', target: { arena: 'military', location: target.id }, payment: p.carbon >= s.prices.clash ? 'carbon' : 'leader' };
    }
    if (target && p.capital >= s.prices.carbon * s.prices.clash) return { type: 'exchange', transactions: [{ resource: 'carbon', mode: 'buy', amount: s.prices.clash }] };
  }

  if (politics < 3 && p.capital >= s.prices.research * 3) return { type: 'research', amount: 3 };
  const politicalDone = controlledCouncil(s, seat).length >= 4;
  if (!politicalDone) {
    const base = BASES.find((x) => p.support[x] > 0);
    if (base && p.capital >= s.prices.campaign) {
      // Build the three non-Chair qualification Seats first. Taking Chair
      // last lets the bot check the Political Power Grab before its next
      // mandatory Chair removal can undo a fragile four-Seat majority.
      const nonChair = ['justice', 'commerce', 'labor'] as CouncilId[];
      const council = nonChair.every((candidate) => councilController(s, candidate) === seat)
        ? 'chair'
        : [...nonChair].sort((a, b) => s.councilSupport[a][seat] - s.councilSupport[b][seat])[0];
      return { type: 'campaign', council, fromBases: { [base]: 1 } };
    }
  }
  return botNational(s, p);
}

/** Seat whose input can advance the state (shared by server scheduler/tests). */
export function politikActingSeat(s: PolitikState): number {
  if (s.pending) return s.pending.seat;
  if (politikTieContests(s).some((tie) => tie.ruling === null)) return s.finalSay;
  return s.turn;
}
