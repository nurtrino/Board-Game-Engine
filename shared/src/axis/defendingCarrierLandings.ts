/**
 * Pure resolution contract for surviving fighters launched from defending
 * aircraft carriers.
 *
 * Anniversary's landing order is strict:
 *   1. return to the exact home carrier when possible;
 *   2. otherwise use an open friendly deck in the battle sea zone;
 *   3. otherwise move exactly one space to friendly land or an open friendly
 *      carrier deck;
 *   4. otherwise the fighter is destroyed.
 *
 * The engine deliberately receives an already-computed post-combat snapshot.
 * It does not inspect mutable game state, infer physical identities, search
 * beyond direct adjacency, or mutate any input. This keeps the eventual state
 * reducer and UI honest about exact fighter/carrier choices.
 */

import { POWERS, type Coalition, type PowerKey } from './config.js';

export type AxisDefendingCarrierFighterRef = string;
export type AxisDefendingCarrierRef = string;
export type AxisLandingController = PowerKey | 'china' | null;

export const AXIS_CARRIER_FIGHTER_CAPACITY = 2;

export interface AxisDefendingCarrierFighter {
  /** Durable identity for one exact surviving fighter. */
  readonly ref: AxisDefendingCarrierFighterRef;
  readonly power: PowerKey;
  /** Sea zone in which its carrier was attacked. */
  readonly originSeaZone: string;
  /** Durable pre-battle identity; absence from `carriers` means it sank. */
  readonly homeCarrierRef: AxisDefendingCarrierRef;
}

export interface AxisDefendingCarrierDeck {
  /** Durable identity for one exact surviving carrier hull. */
  readonly ref: AxisDefendingCarrierRef;
  readonly power: PowerKey;
  readonly seaZone: string;
  /** Fighters already committed to this exact deck, excluding this queue. */
  readonly occupied: number;
}

export interface AxisDefendingCarrierSeaZone {
  readonly id: string;
  /** Direct sea-zone edges only. The resolver never performs a graph search. */
  readonly adjacentSeaZones: readonly string[];
  /** Direct coast/island edges reachable from this sea zone in one move. */
  readonly adjacentTerritories: readonly string[];
  /**
   * Coalitions for which this zone is currently hostile. The integration
   * should mark enemy surface warships here; submarines/transports alone do
   * not make a carrier landing zone hostile under Anniversary rules.
   */
  readonly hostileTo?: readonly Coalition[];
}

export interface AxisDefendingCarrierTerritory {
  readonly id: string;
  readonly controller: AxisLandingController;
  /** Coalitions that cannot currently land because enemy units are present. */
  readonly hostileTo?: readonly Coalition[];
}

export interface AxisDefendingCarrierLandingTiming {
  /** Every combat declared by the acting power has concluded. */
  readonly allCombatsResolved: boolean;
  /** The acting power has begun its ordinary Noncombat Move controls. */
  readonly ordinaryNoncombatStarted: boolean;
}

export interface AxisDefendingCarrierLandingSnapshot {
  readonly timing: AxisDefendingCarrierLandingTiming;
  readonly fighters: readonly AxisDefendingCarrierFighter[];
  readonly carriers: readonly AxisDefendingCarrierDeck[];
  readonly seaZones: readonly AxisDefendingCarrierSeaZone[];
  readonly territories: readonly AxisDefendingCarrierTerritory[];
}

export type AxisDefendingCarrierLandingChoice =
  | {
    readonly fighterRef: AxisDefendingCarrierFighterRef;
    readonly kind: 'carrier';
    readonly carrierRef: AxisDefendingCarrierRef;
  }
  | {
    readonly fighterRef: AxisDefendingCarrierFighterRef;
    readonly kind: 'territory';
    readonly territory: string;
  }
  | {
    readonly fighterRef: AxisDefendingCarrierFighterRef;
    readonly kind: 'destroy';
  };

export type AxisDefendingCarrierLandingRuleStep =
  | 'home-carrier'
  | 'same-zone-carrier'
  | 'one-space'
  | 'no-landing';

export type AxisDefendingCarrierLandingOption =
  | {
    readonly fighterRef: AxisDefendingCarrierFighterRef;
    readonly fighterPower: PowerKey;
    readonly kind: 'carrier';
    readonly carrierRef: AxisDefendingCarrierRef;
    readonly carrierPower: PowerKey;
    readonly space: string;
    readonly distance: 0 | 1;
    readonly ruleStep: Extract<AxisDefendingCarrierLandingRuleStep,
      'home-carrier' | 'same-zone-carrier' | 'one-space'>;
  }
  | {
    readonly fighterRef: AxisDefendingCarrierFighterRef;
    readonly fighterPower: PowerKey;
    readonly kind: 'territory';
    readonly territory: string;
    readonly controller: Exclude<AxisLandingController, null>;
    readonly space: string;
    readonly distance: 1;
    readonly ruleStep: 'one-space';
  }
  | {
    readonly fighterRef: AxisDefendingCarrierFighterRef;
    readonly fighterPower: PowerKey;
    readonly kind: 'destroy';
    readonly space: null;
    readonly distance: null;
    readonly ruleStep: 'no-landing';
  };

export interface AxisDefendingCarrierLandingDecision {
  readonly fighter: AxisDefendingCarrierFighter;
  /** Owner of the exact fighter receives the landing prompt. */
  readonly owner: PowerKey;
  readonly ruleStep: AxisDefendingCarrierLandingRuleStep;
  /** Stable ordering; ambiguous destinations are never silently selected. */
  readonly options: readonly AxisDefendingCarrierLandingOption[];
}

export interface AxisDefendingCarrierDeckProgress {
  readonly carrierRef: AxisDefendingCarrierRef;
  readonly carrierPower: PowerKey;
  readonly seaZone: string;
  readonly occupied: number;
  readonly open: number;
}

export interface AxisDefendingCarrierLandingProgressBase {
  /** Canonical, replay-validated resolutions. */
  readonly resolutions: readonly AxisDefendingCarrierLandingOption[];
  readonly remainingFighterRefs: readonly AxisDefendingCarrierFighterRef[];
  readonly decks: readonly AxisDefendingCarrierDeckProgress[];
}

export type AxisDefendingCarrierLandingProgress =
  | (AxisDefendingCarrierLandingProgressBase & {
    readonly ok: true;
    readonly status: 'waiting-for-combat';
    readonly decision: null;
  })
  | (AxisDefendingCarrierLandingProgressBase & {
    readonly ok: true;
    readonly status: 'decision';
    readonly decision: AxisDefendingCarrierLandingDecision;
  })
  | (AxisDefendingCarrierLandingProgressBase & {
    readonly ok: true;
    readonly status: 'complete';
    readonly decision: null;
  })
  | {
    readonly ok: false;
    readonly status: 'invalid';
    readonly error: string;
    readonly decision: null;
    readonly resolutions: readonly AxisDefendingCarrierLandingOption[];
    readonly remainingFighterRefs: readonly AxisDefendingCarrierFighterRef[];
    readonly decks: readonly AxisDefendingCarrierDeckProgress[];
  };

export type AxisApplyDefendingCarrierLandingChoiceResult =
  | {
    readonly ok: true;
    readonly choices: readonly AxisDefendingCarrierLandingChoice[];
    readonly applied: AxisDefendingCarrierLandingOption;
    readonly progress: AxisDefendingCarrierLandingProgress;
  }
  | {
    readonly ok: false;
    readonly error: string;
    readonly choices: readonly AxisDefendingCarrierLandingChoice[];
    readonly progress: AxisDefendingCarrierLandingProgress;
  };

const powerKeys = new Set<PowerKey>(Object.keys(POWERS) as PowerKey[]);

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const coalitionOf = (power: PowerKey | 'china'): Coalition =>
  power === 'china' ? 'allies' : POWERS[power].coalition;

const sameSide = (a: PowerKey | 'china', b: PowerKey | 'china'): boolean =>
  coalitionOf(a) === coalitionOf(b);

const isExactRef = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.trim() === value;

const duplicateValues = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareText);
};

/** Reject malformed physical snapshots rather than guessing exact identities. */
export function validateAxisDefendingCarrierLandingSnapshot(
  snapshot: AxisDefendingCarrierLandingSnapshot,
): string[] {
  const issues: string[] = [];
  if (snapshot.timing.ordinaryNoncombatStarted && !snapshot.timing.allCombatsResolved) {
    issues.push('Ordinary noncombat cannot start before every combat has resolved.');
  }

  const fighterRefs = snapshot.fighters.map((fighter) => fighter.ref);
  const carrierRefs = snapshot.carriers.map((carrier) => carrier.ref);
  const seaZoneIds = snapshot.seaZones.map((zone) => zone.id);
  const territoryIds = snapshot.territories.map((territory) => territory.id);

  for (const ref of duplicateValues(fighterRefs)) issues.push(`Duplicate fighter ref: ${ref}.`);
  for (const ref of duplicateValues(carrierRefs)) issues.push(`Duplicate carrier ref: ${ref}.`);
  for (const id of duplicateValues(seaZoneIds)) issues.push(`Duplicate sea-zone id: ${id}.`);
  for (const id of duplicateValues(territoryIds)) issues.push(`Duplicate territory id: ${id}.`);

  const seaZones = new Map(snapshot.seaZones.map((zone) => [zone.id, zone]));
  const territories = new Map(snapshot.territories.map((territory) => [territory.id, territory]));
  const carriers = new Map(snapshot.carriers.map((carrier) => [carrier.ref, carrier]));

  for (const zone of snapshot.seaZones) {
    if (!isExactRef(zone.id)) issues.push('Sea-zone ids must be nonempty, trimmed strings.');
    if (zone.adjacentSeaZones.includes(zone.id)) issues.push(`${zone.id} cannot be adjacent to itself.`);
    for (const duplicate of duplicateValues(zone.adjacentSeaZones)) {
      issues.push(`${zone.id} repeats adjacent sea zone ${duplicate}.`);
    }
    for (const duplicate of duplicateValues(zone.adjacentTerritories)) {
      issues.push(`${zone.id} repeats adjacent territory ${duplicate}.`);
    }
    for (const adjacent of zone.adjacentSeaZones) {
      if (!seaZones.has(adjacent)) issues.push(`${zone.id} references unknown adjacent sea zone ${adjacent}.`);
    }
    for (const adjacent of zone.adjacentTerritories) {
      if (!territories.has(adjacent)) issues.push(`${zone.id} references unknown adjacent territory ${adjacent}.`);
    }
    for (const side of zone.hostileTo ?? []) {
      if (side !== 'axis' && side !== 'allies') issues.push(`${zone.id} has an invalid hostile coalition.`);
    }
  }

  for (const territory of snapshot.territories) {
    if (!isExactRef(territory.id)) issues.push('Territory ids must be nonempty, trimmed strings.');
    if (territory.controller !== null
      && territory.controller !== 'china'
      && !powerKeys.has(territory.controller)) {
      issues.push(`${territory.id} has an invalid controller.`);
    }
    for (const side of territory.hostileTo ?? []) {
      if (side !== 'axis' && side !== 'allies') issues.push(`${territory.id} has an invalid hostile coalition.`);
    }
  }

  for (const carrier of snapshot.carriers) {
    if (!isExactRef(carrier.ref)) issues.push('Carrier refs must be nonempty, trimmed strings.');
    if (!powerKeys.has(carrier.power)) issues.push(`${carrier.ref} has an invalid carrier power.`);
    if (!seaZones.has(carrier.seaZone)) issues.push(`${carrier.ref} is in unknown sea zone ${carrier.seaZone}.`);
    if (!Number.isInteger(carrier.occupied)
      || carrier.occupied < 0
      || carrier.occupied > AXIS_CARRIER_FIGHTER_CAPACITY) {
      issues.push(`${carrier.ref} must have 0-${AXIS_CARRIER_FIGHTER_CAPACITY} occupied deck slots.`);
    }
  }

  const fightersPerHome = new Map<string, number>();
  for (const fighter of snapshot.fighters) {
    if (!isExactRef(fighter.ref)) issues.push('Fighter refs must be nonempty, trimmed strings.');
    const fighterPowerValid = powerKeys.has(fighter.power);
    if (!fighterPowerValid) issues.push(`${fighter.ref} has an invalid fighter power.`);
    if (!seaZones.has(fighter.originSeaZone)) {
      issues.push(`${fighter.ref} originated in unknown sea zone ${fighter.originSeaZone}.`);
    }
    if (!isExactRef(fighter.homeCarrierRef)) {
      issues.push(`${fighter.ref} must retain an exact home-carrier ref.`);
      continue;
    }
    fightersPerHome.set(fighter.homeCarrierRef, (fightersPerHome.get(fighter.homeCarrierRef) ?? 0) + 1);
    const survivingHome = carriers.get(fighter.homeCarrierRef);
    if (survivingHome && survivingHome.seaZone !== fighter.originSeaZone) {
      issues.push(`${fighter.ref}'s surviving home carrier is not in its battle sea zone.`);
    }
    if (survivingHome
      && fighterPowerValid
      && powerKeys.has(survivingHome.power)
      && !sameSide(survivingHome.power, fighter.power)) {
      issues.push(`${fighter.ref}'s home carrier is not friendly.`);
    }
  }
  for (const [carrierRef, count] of fightersPerHome) {
    if (count > AXIS_CARRIER_FIGHTER_CAPACITY) {
      issues.push(`${carrierRef} has ${count} surviving based fighters; one carrier can base only two.`);
    }
  }

  return issues;
}

interface ReplayState {
  readonly occupied: Map<string, number>;
  readonly unresolved: Map<string, AxisDefendingCarrierFighter>;
  readonly resolutions: AxisDefendingCarrierLandingOption[];
}

const initialReplayState = (snapshot: AxisDefendingCarrierLandingSnapshot): ReplayState => ({
  occupied: new Map(snapshot.carriers.map((carrier) => [carrier.ref, carrier.occupied])),
  unresolved: new Map(snapshot.fighters.map((fighter) => [fighter.ref, fighter])),
  resolutions: [],
});

const isHostileTo = (
  hostileTo: readonly Coalition[] | undefined,
  power: PowerKey,
): boolean => (hostileTo ?? []).includes(coalitionOf(power));

function eligibleCarrier(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  carrier: AxisDefendingCarrierDeck,
  fighter: AxisDefendingCarrierFighter,
  occupied: ReadonlyMap<string, number>,
): boolean {
  const zone = snapshot.seaZones.find((candidate) => candidate.id === carrier.seaZone);
  return Boolean(zone)
    && sameSide(carrier.power, fighter.power)
    && !isHostileTo(zone?.hostileTo, fighter.power)
    && (occupied.get(carrier.ref) ?? carrier.occupied) < AXIS_CARRIER_FIGHTER_CAPACITY;
}

function carrierOption(
  fighter: AxisDefendingCarrierFighter,
  carrier: AxisDefendingCarrierDeck,
  distance: 0 | 1,
  ruleStep: Extract<AxisDefendingCarrierLandingRuleStep,
    'home-carrier' | 'same-zone-carrier' | 'one-space'>,
): AxisDefendingCarrierLandingOption {
  return {
    fighterRef: fighter.ref,
    fighterPower: fighter.power,
    kind: 'carrier',
    carrierRef: carrier.ref,
    carrierPower: carrier.power,
    space: carrier.seaZone,
    distance,
    ruleStep,
  };
}

function landingOptionsFor(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  fighter: AxisDefendingCarrierFighter,
  occupied: ReadonlyMap<string, number>,
): AxisDefendingCarrierLandingOption[] {
  const home = snapshot.carriers.find((carrier) => carrier.ref === fighter.homeCarrierRef);
  if (home
    && home.seaZone === fighter.originSeaZone
    && eligibleCarrier(snapshot, home, fighter, occupied)) {
    return [carrierOption(fighter, home, 0, 'home-carrier')];
  }

  const sameZone = snapshot.carriers
    .filter((carrier) => carrier.ref !== fighter.homeCarrierRef)
    .filter((carrier) => carrier.seaZone === fighter.originSeaZone)
    .filter((carrier) => eligibleCarrier(snapshot, carrier, fighter, occupied))
    .sort((a, b) => compareText(a.ref, b.ref))
    .map((carrier) => carrierOption(fighter, carrier, 0, 'same-zone-carrier'));
  if (sameZone.length > 0) return sameZone;

  const origin = snapshot.seaZones.find((zone) => zone.id === fighter.originSeaZone);
  const adjacentTerritories = new Set(origin?.adjacentTerritories ?? []);
  const adjacentSeaZones = new Set(origin?.adjacentSeaZones ?? []);

  const landOptions: AxisDefendingCarrierLandingOption[] = snapshot.territories
    .filter((territory) => adjacentTerritories.has(territory.id))
    .filter((territory): territory is AxisDefendingCarrierTerritory & {
      controller: Exclude<AxisLandingController, null>;
    } => territory.controller !== null)
    .filter((territory) => sameSide(territory.controller, fighter.power))
    .filter((territory) => !isHostileTo(territory.hostileTo, fighter.power))
    .sort((a, b) => compareText(a.id, b.id))
    .map((territory) => ({
      fighterRef: fighter.ref,
      fighterPower: fighter.power,
      kind: 'territory' as const,
      territory: territory.id,
      controller: territory.controller,
      space: territory.id,
      distance: 1 as const,
      ruleStep: 'one-space' as const,
    }));

  const deckOptions = snapshot.carriers
    .filter((carrier) => adjacentSeaZones.has(carrier.seaZone))
    .filter((carrier) => eligibleCarrier(snapshot, carrier, fighter, occupied))
    .sort((a, b) => compareText(a.seaZone, b.seaZone) || compareText(a.ref, b.ref))
    .map((carrier) => carrierOption(fighter, carrier, 1, 'one-space'));

  const oneSpace = [...landOptions, ...deckOptions].sort((a, b) => {
    const bySpace = compareText(a.space ?? '', b.space ?? '');
    if (bySpace !== 0) return bySpace;
    const aRef = a.kind === 'carrier' ? a.carrierRef : '';
    const bRef = b.kind === 'carrier' ? b.carrierRef : '';
    return compareText(a.kind, b.kind) || compareText(aRef, bRef);
  });
  if (oneSpace.length > 0) return oneSpace;

  return [{
    fighterRef: fighter.ref,
    fighterPower: fighter.power,
    kind: 'destroy',
    space: null,
    distance: null,
    ruleStep: 'no-landing',
  }];
}

const ruleStepRank = (step: AxisDefendingCarrierLandingRuleStep): number => {
  switch (step) {
    case 'home-carrier': return 0;
    case 'same-zone-carrier': return 1;
    case 'one-space': return 2;
    case 'no-landing': return 3;
  }
};

function nextDecision(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  state: ReplayState,
): AxisDefendingCarrierLandingDecision | null {
  const candidates = [...state.unresolved.values()].map((fighter) => {
    const options = landingOptionsFor(snapshot, fighter, state.occupied);
    return { fighter, options, ruleStep: options[0].ruleStep };
  });
  candidates.sort((a, b) =>
    ruleStepRank(a.ruleStep) - ruleStepRank(b.ruleStep)
    || compareText(a.fighter.originSeaZone, b.fighter.originSeaZone)
    || compareText(a.fighter.ref, b.fighter.ref));
  const next = candidates[0];
  return next ? {
    fighter: { ...next.fighter },
    owner: next.fighter.power,
    ruleStep: next.ruleStep,
    options: next.options,
  } : null;
}

function choiceMatchesOption(
  choice: AxisDefendingCarrierLandingChoice,
  option: AxisDefendingCarrierLandingOption,
): boolean {
  if (choice.fighterRef !== option.fighterRef || choice.kind !== option.kind) return false;
  if (choice.kind === 'carrier' && option.kind === 'carrier') {
    return choice.carrierRef === option.carrierRef;
  }
  if (choice.kind === 'territory' && option.kind === 'territory') {
    return choice.territory === option.territory;
  }
  return choice.kind === 'destroy' && option.kind === 'destroy';
}

function parseChoice(value: unknown): AxisDefendingCarrierLandingChoice | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!isExactRef(row.fighterRef)) return null;
  if (row.kind === 'carrier' && isExactRef(row.carrierRef)) {
    return { fighterRef: row.fighterRef, kind: 'carrier', carrierRef: row.carrierRef };
  }
  if (row.kind === 'territory' && isExactRef(row.territory)) {
    return { fighterRef: row.fighterRef, kind: 'territory', territory: row.territory };
  }
  if (row.kind === 'destroy') return { fighterRef: row.fighterRef, kind: 'destroy' };
  return null;
}

function applyOption(state: ReplayState, option: AxisDefendingCarrierLandingOption): void {
  state.resolutions.push(option);
  state.unresolved.delete(option.fighterRef);
  if (option.kind === 'carrier') {
    state.occupied.set(option.carrierRef, (state.occupied.get(option.carrierRef) ?? 0) + 1);
  }
}

function replayChoices(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  choices: readonly AxisDefendingCarrierLandingChoice[],
): { state: ReplayState; error?: string } {
  const state = initialReplayState(snapshot);
  for (let index = 0; index < choices.length; index++) {
    const choice = parseChoice(choices[index]);
    if (!choice) return { state, error: `Landing resolution ${index + 1} is malformed.` };
    const decision = nextDecision(snapshot, state);
    if (!decision) return { state, error: `Landing resolution ${index + 1} is stale; the queue is complete.` };
    if (choice.fighterRef !== decision.fighter.ref) {
      return {
        state,
        error: `Landing resolution ${index + 1} names ${choice.fighterRef}; exact fighter ${decision.fighter.ref} is next.`,
      };
    }
    const option = decision.options.find((candidate) => choiceMatchesOption(choice, candidate));
    if (!option) {
      return { state, error: `Landing resolution ${index + 1} is not a current legal option for ${choice.fighterRef}.` };
    }
    applyOption(state, option);
  }
  return { state };
}

function deckProgress(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  occupied: ReadonlyMap<string, number>,
): AxisDefendingCarrierDeckProgress[] {
  return snapshot.carriers
    .map((carrier) => {
      const count = occupied.get(carrier.ref) ?? carrier.occupied;
      return {
        carrierRef: carrier.ref,
        carrierPower: carrier.power,
        seaZone: carrier.seaZone,
        occupied: count,
        open: Math.max(0, AXIS_CARRIER_FIGHTER_CAPACITY - count),
      };
    })
    .sort((a, b) => compareText(a.seaZone, b.seaZone) || compareText(a.carrierRef, b.carrierRef));
}

function invalidProgress(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  state: ReplayState,
  error: string,
): AxisDefendingCarrierLandingProgress {
  return {
    ok: false,
    status: 'invalid',
    error,
    decision: null,
    resolutions: state.resolutions,
    remainingFighterRefs: [...state.unresolved.keys()].sort(compareText),
    decks: deckProgress(snapshot, state.occupied),
  };
}

/**
 * Recompute the authoritative queue from its immutable snapshot and exact
 * choice ledger. A reconnect therefore sees the same fighter, destinations,
 * and occupied deck slots as every other client.
 */
export function deriveAxisDefendingCarrierLandingProgress(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  choices: readonly AxisDefendingCarrierLandingChoice[] = [],
): AxisDefendingCarrierLandingProgress {
  const issues = validateAxisDefendingCarrierLandingSnapshot(snapshot);
  const initial = initialReplayState(snapshot);
  if (issues.length > 0) return invalidProgress(snapshot, initial, issues.join(' '));

  const replay = replayChoices(snapshot, choices);
  if (replay.error) return invalidProgress(snapshot, replay.state, replay.error);
  const base: AxisDefendingCarrierLandingProgressBase = {
    resolutions: replay.state.resolutions,
    remainingFighterRefs: [...replay.state.unresolved.keys()].sort(compareText),
    decks: deckProgress(snapshot, replay.state.occupied),
  };

  if (!snapshot.timing.allCombatsResolved) {
    return { ok: true, status: 'waiting-for-combat', decision: null, ...base };
  }
  if (snapshot.timing.ordinaryNoncombatStarted && replay.state.unresolved.size > 0) {
    return invalidProgress(
      snapshot,
      replay.state,
      'Resolve every defending carrier fighter before ordinary noncombat movement begins.',
    );
  }
  const decision = nextDecision(snapshot, replay.state);
  return decision
    ? { ok: true, status: 'decision', decision, ...base }
    : { ok: true, status: 'complete', decision: null, ...base };
}

/** Validate and append one exact destination without mutating the ledger. */
export function applyAxisDefendingCarrierLandingChoice(
  snapshot: AxisDefendingCarrierLandingSnapshot,
  choices: readonly AxisDefendingCarrierLandingChoice[],
  requested: unknown,
): AxisApplyDefendingCarrierLandingChoiceResult {
  const progress = deriveAxisDefendingCarrierLandingProgress(snapshot, choices);
  const parsed = parseChoice(requested);
  if (!parsed) return { ok: false, error: 'Choose an exact fighter landing destination.', choices: [...choices], progress };
  if (!progress.ok) return { ok: false, error: progress.error, choices: [...choices], progress };
  if (progress.status === 'waiting-for-combat') {
    return { ok: false, error: 'Defending carrier fighters land only after every combat is resolved.', choices: [...choices], progress };
  }
  if (progress.status === 'complete' || !progress.decision) {
    return { ok: false, error: 'The defending carrier landing queue is already complete.', choices: [...choices], progress };
  }
  if (parsed.fighterRef !== progress.decision.fighter.ref) {
    return {
      ok: false,
      error: `Resolve exact fighter ${progress.decision.fighter.ref} next.`,
      choices: [...choices],
      progress,
    };
  }
  const option = progress.decision.options.find((candidate) => choiceMatchesOption(parsed, candidate));
  if (!option) {
    return {
      ok: false,
      error: 'That destination is not legal for the current fighter and deck snapshot.',
      choices: [...choices],
      progress,
    };
  }
  const nextChoices = [...choices, parsed];
  return {
    ok: true,
    choices: nextChoices,
    applied: option,
    progress: deriveAxisDefendingCarrierLandingProgress(snapshot, nextChoices),
  };
}
