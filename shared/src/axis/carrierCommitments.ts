/**
 * Pure accounting primitives for Anniversary fighter-to-new-carrier promises.
 *
 * This module deliberately does not know about Axis state, actions, maps, or
 * physical unit ordinals. Integrators supply stable fighter references and the
 * already-computed physical/factory snapshots that are legal for the action.
 */

export type AxisCarrierFighterRef = string;

export interface AxisCarrierTaggedFighter {
  readonly ref: AxisCarrierFighterRef;
  readonly power: string;
  readonly seaZone: string;
}

/** One canonical row exists per power and promised sea zone. */
export interface AxisCarrierObligationRow {
  readonly power: string;
  readonly seaZone: string;
  readonly fighterRefs: readonly AxisCarrierFighterRef[];
  /** One entry per staged carrier and reserved production slot. */
  readonly carrierFactories: readonly string[];
}

export interface AxisCarrierLiveFighterCount {
  readonly power: string;
  readonly seaZone: string;
  readonly fighterRefs: readonly AxisCarrierFighterRef[];
  readonly count: number;
}

/**
 * Slots and occupants before adding promised new carriers. Occupancy excludes
 * the tagged fighters being evaluated. It includes every other friendly
 * fighter that must use a deck; allied guests are separate so callers cannot
 * accidentally overlook them.
 */
export interface AxisCarrierPhysicalDeckSnapshot {
  readonly ownCarrierSlots: number;
  readonly alliedCarrierSlots: number;
  readonly occupiedByOwnFighters: number;
  readonly occupiedByAlliedGuests: number;
}

export interface AxisCarrierZoneDeckSnapshot extends AxisCarrierPhysicalDeckSnapshot {
  readonly power: string;
  readonly seaZone: string;
}

export interface AxisCarrierDeckRequirement {
  readonly taggedFighters: number;
  readonly physicalSlots: number;
  readonly occupiedPhysicalSlots: number;
  readonly openPhysicalSlots: number;
  readonly taggedFightersWithoutPhysicalDeck: number;
  readonly additionalDeckSlotsNeeded: number;
  readonly newCarriersNeeded: number;
}

export interface AxisCarrierZoneRequirementSnapshot {
  readonly power: string;
  readonly seaZone: string;
  readonly requiredNewCarriers: number;
}

export interface AxisCarrierStagedAvailability {
  readonly power: string;
  /** Staged carriers still available after unrelated placements. */
  readonly availableCarriers: number;
}

export interface AxisCarrierFactoryAvailability {
  readonly power: string;
  readonly factory: string;
  /** Production slots still available after unrelated placements. */
  readonly availableCapacity: number;
  /** Sea zones for which this factory is currently legal. */
  readonly eligibleSeaZones: readonly string[];
}

export type AxisCarrierReservationIssueCode =
  | 'carrier-reservation-shortfall'
  | 'carrier-reservation-surplus'
  | 'staged-carrier-exhausted'
  | 'unknown-factory'
  | 'ineligible-factory'
  | 'factory-capacity-exhausted';

export interface AxisCarrierReservationIssue {
  readonly code: AxisCarrierReservationIssueCode;
  readonly power: string;
  readonly seaZone?: string;
  readonly factory?: string;
  readonly required: number;
  readonly actual: number;
  readonly message: string;
}

export interface AxisCarrierReservationValidation {
  readonly ok: boolean;
  readonly obligations: readonly AxisCarrierObligationRow[];
  readonly issues: readonly AxisCarrierReservationIssue[];
  readonly reservedByPower: readonly {
    readonly power: string;
    readonly reserved: number;
    readonly available: number;
  }[];
  readonly reservedByFactory: readonly {
    readonly power: string;
    readonly factory: string;
    readonly reserved: number;
    readonly available: number;
  }[];
}

export interface AxisCarrierReleasedFighter {
  readonly ref: AxisCarrierFighterRef;
  readonly power: string;
  readonly seaZone: string;
}

export interface AxisCarrierFactoryReservationRef {
  readonly power: string;
  readonly seaZone: string;
  readonly factory: string;
}

export interface AxisCarrierTrimResult {
  readonly obligations: readonly AxisCarrierObligationRow[];
  /** Fighters that died, landed safely, or no longer carry this exact tag. */
  readonly releasedFighters: readonly AxisCarrierReleasedFighter[];
  readonly releasedCarrierFactories: readonly AxisCarrierFactoryReservationRef[];
  /** Live tags without an exact matching row. They are reported, never inferred. */
  readonly orphanTags: readonly AxisCarrierTaggedFighter[];
}

export interface AxisCarrierPlacementSnapshot {
  readonly power: string;
  readonly seaZone: string;
  readonly factory: string;
  readonly carriers: number;
}

export interface AxisCarrierPlacementResult {
  readonly obligations: readonly AxisCarrierObligationRow[];
  readonly matchedCarriers: number;
  readonly uncommittedCarriers: number;
  readonly fulfilledCarrierFactories: readonly AxisCarrierFactoryReservationRef[];
  readonly releasedCarrierFactories: readonly AxisCarrierFactoryReservationRef[];
  /** Deterministically selected tags that now fit on physical decks. */
  readonly resolvedFighterRefs: readonly AxisCarrierFighterRef[];
}

export interface AxisCarrierOutstandingSummary {
  readonly power: string;
  readonly seaZone: string;
  readonly fighterRefs: readonly AxisCarrierFighterRef[];
  readonly fighterCount: number;
  readonly requiredNewCarriers: number;
  readonly reservedCarriers: number;
  readonly missingCarrierReservations: number;
  readonly carrierFactories: readonly string[];
}

export interface AxisCarrierOutstandingResult extends AxisCarrierTrimResult {
  readonly hasOutstanding: boolean;
  readonly summaries: readonly AxisCarrierOutstandingSummary[];
  readonly totalRequiredNewCarriers: number;
  readonly totalReservedCarriers: number;
}

type UnknownRecord = Record<string, unknown>;

const EMPTY_DECK: AxisCarrierPhysicalDeckSnapshot = {
  ownCarrierSlots: 0,
  alliedCarrierSlots: 0,
  occupiedByOwnFighters: 0,
  occupiedByAlliedGuests: 0,
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function cleanStringList(value: unknown, preserveDuplicates: boolean): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map(cleanString)
    .filter((entry): entry is string => entry !== null)
    .sort((a, b) => a.localeCompare(b));
  return preserveDuplicates ? cleaned : [...new Set(cleaned)];
}

function wholeNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function comparePowerZone(
  a: Pick<AxisCarrierObligationRow, 'power' | 'seaZone'>,
  b: Pick<AxisCarrierObligationRow, 'power' | 'seaZone'>,
): number {
  return a.power.localeCompare(b.power) || a.seaZone.localeCompare(b.seaZone);
}

function obligationKey(power: string, seaZone: string): string {
  return JSON.stringify([power, seaZone]);
}

/**
 * Canonicalize untrusted save/action data without mutating it. Invalid rows and
 * fields are discarded, duplicate power+zone rows are merged, factory entries
 * retain multiplicity, and a fighter ref can belong to only one row. If bad
 * data assigns one ref more than once, the lexicographically first row wins.
 */
export function normalizeAxisCarrierObligations(input: unknown): AxisCarrierObligationRow[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, {
    power: string;
    seaZone: string;
    fighterRefs: Set<string>;
    carrierFactories: string[];
  }>();

  for (const candidate of input) {
    const record = asRecord(candidate);
    if (!record) continue;
    const power = cleanString(record.power);
    const seaZone = cleanString(record.seaZone);
    if (!power || !seaZone) continue;
    const key = obligationKey(power, seaZone);
    const row = merged.get(key) ?? {
      power,
      seaZone,
      fighterRefs: new Set<string>(),
      carrierFactories: [],
    };
    for (const ref of cleanStringList(record.fighterRefs, false)) row.fighterRefs.add(ref);
    row.carrierFactories.push(...cleanStringList(record.carrierFactories, true));
    merged.set(key, row);
  }

  const claimedFighters = new Set<string>();
  return [...merged.values()]
    .sort(comparePowerZone)
    .map((row): AxisCarrierObligationRow => {
      const fighterRefs = [...row.fighterRefs]
        .sort((a, b) => a.localeCompare(b))
        .filter((ref) => {
          if (claimedFighters.has(ref)) return false;
          claimedFighters.add(ref);
          return true;
        });
      return {
        power: row.power,
        seaZone: row.seaZone,
        fighterRefs,
        carrierFactories: [...row.carrierFactories].sort((a, b) => a.localeCompare(b)),
      };
    })
    .filter((row) => row.fighterRefs.length > 0 || row.carrierFactories.length > 0);
}

/** Canonicalize live exact fighter tags. A stable ref is globally unique. */
export function normalizeAxisCarrierFighterTags(input: unknown): AxisCarrierTaggedFighter[] {
  if (!Array.isArray(input)) return [];
  const candidates: AxisCarrierTaggedFighter[] = [];
  for (const candidate of input) {
    const record = asRecord(candidate);
    if (!record) continue;
    const ref = cleanString(record.ref);
    const power = cleanString(record.power);
    const seaZone = cleanString(record.seaZone);
    if (ref && power && seaZone) candidates.push({ ref, power, seaZone });
  }
  candidates.sort((a, b) => a.ref.localeCompare(b.ref)
    || a.power.localeCompare(b.power)
    || a.seaZone.localeCompare(b.seaZone));
  const claimed = new Set<string>();
  return candidates
    .filter((tag) => {
      if (claimed.has(tag.ref)) return false;
      claimed.add(tag.ref);
      return true;
    })
    .sort((a, b) => a.power.localeCompare(b.power)
      || a.seaZone.localeCompare(b.seaZone)
      || a.ref.localeCompare(b.ref));
}

/** Count authoritative live tags, grouped canonically by power and zone. */
export function countAxisLiveTaggedFighters(input: unknown): AxisCarrierLiveFighterCount[] {
  const grouped = new Map<string, AxisCarrierTaggedFighter[]>();
  for (const tag of normalizeAxisCarrierFighterTags(input)) {
    const key = obligationKey(tag.power, tag.seaZone);
    const group = grouped.get(key) ?? [];
    group.push(tag);
    grouped.set(key, group);
  }
  return [...grouped.values()]
    .map((group): AxisCarrierLiveFighterCount => ({
      power: group[0]!.power,
      seaZone: group[0]!.seaZone,
      fighterRefs: group.map((tag) => tag.ref),
      count: group.length,
    }))
    .sort(comparePowerZone);
}

export function axisCarrierDeckRequirement(
  liveTaggedFighters: number,
  deck: AxisCarrierPhysicalDeckSnapshot = EMPTY_DECK,
): AxisCarrierDeckRequirement {
  const taggedFighters = wholeNonNegative(liveTaggedFighters);
  const physicalSlots = wholeNonNegative(deck.ownCarrierSlots)
    + wholeNonNegative(deck.alliedCarrierSlots);
  const occupiedPhysicalSlots = wholeNonNegative(deck.occupiedByOwnFighters)
    + wholeNonNegative(deck.occupiedByAlliedGuests);
  const openPhysicalSlots = Math.max(0, physicalSlots - occupiedPhysicalSlots);
  const taggedFightersWithoutPhysicalDeck = Math.max(0, taggedFighters - openPhysicalSlots);
  // Existing overflow also has to fit before a promised fighter is guaranteed.
  const additionalDeckSlotsNeeded = taggedFighters === 0
    ? 0
    : Math.max(0, occupiedPhysicalSlots + taggedFighters - physicalSlots);
  return {
    taggedFighters,
    physicalSlots,
    occupiedPhysicalSlots,
    openPhysicalSlots,
    taggedFightersWithoutPhysicalDeck,
    additionalDeckSlotsNeeded,
    newCarriersNeeded: Math.ceil(additionalDeckSlotsNeeded / 2),
  };
}

export function axisIncrementalNewCarriersNeeded(
  liveTaggedFighters: number,
  deck: AxisCarrierPhysicalDeckSnapshot = EMPTY_DECK,
): number {
  return axisCarrierDeckRequirement(liveTaggedFighters, deck).newCarriersNeeded;
}

function deckForZone(
  decks: readonly AxisCarrierZoneDeckSnapshot[],
  power: string,
  seaZone: string,
): AxisCarrierPhysicalDeckSnapshot {
  const matches = decks.filter((deck) => cleanString(deck.power) === power
    && cleanString(deck.seaZone) === seaZone);
  if (matches.length === 0) return EMPTY_DECK;
  // Duplicate snapshots are malformed. Merge conservatively so bad data never
  // creates extra capacity: minimum slots, maximum occupancy.
  return {
    ownCarrierSlots: Math.min(...matches.map((deck) => wholeNonNegative(deck.ownCarrierSlots))),
    alliedCarrierSlots: Math.min(...matches.map((deck) => wholeNonNegative(deck.alliedCarrierSlots))),
    occupiedByOwnFighters: Math.max(
      ...matches.map((deck) => wholeNonNegative(deck.occupiedByOwnFighters)),
    ),
    occupiedByAlliedGuests: Math.max(
      ...matches.map((deck) => wholeNonNegative(deck.occupiedByAlliedGuests)),
    ),
  };
}

function normalizeZoneRequirements(
  requirements: readonly AxisCarrierZoneRequirementSnapshot[],
): Map<string, AxisCarrierZoneRequirementSnapshot> {
  const normalized = new Map<string, AxisCarrierZoneRequirementSnapshot>();
  for (const requirement of requirements) {
    const power = cleanString(requirement.power);
    const seaZone = cleanString(requirement.seaZone);
    if (!power || !seaZone) continue;
    const key = obligationKey(power, seaZone);
    const requiredNewCarriers = wholeNonNegative(requirement.requiredNewCarriers);
    const previous = normalized.get(key);
    normalized.set(key, {
      power,
      seaZone,
      requiredNewCarriers: Math.max(previous?.requiredNewCarriers ?? 0, requiredNewCarriers),
    });
  }
  return normalized;
}

function normalizeStagedAvailability(
  availability: readonly AxisCarrierStagedAvailability[],
): Map<string, number> {
  const normalized = new Map<string, number>();
  for (const entry of availability) {
    const power = cleanString(entry.power);
    if (!power) continue;
    const available = wholeNonNegative(entry.availableCarriers);
    normalized.set(power, normalized.has(power)
      ? Math.min(normalized.get(power)!, available)
      : available);
  }
  return normalized;
}

interface NormalizedFactoryAvailability {
  power: string;
  factory: string;
  availableCapacity: number;
  eligibleSeaZones: Set<string>;
}

function normalizeFactoryAvailability(
  availability: readonly AxisCarrierFactoryAvailability[],
): Map<string, NormalizedFactoryAvailability> {
  const normalized = new Map<string, NormalizedFactoryAvailability>();
  for (const entry of availability) {
    const power = cleanString(entry.power);
    const factory = cleanString(entry.factory);
    if (!power || !factory) continue;
    const key = obligationKey(power, factory);
    const zones = new Set(cleanStringList(entry.eligibleSeaZones, false));
    const existing = normalized.get(key);
    if (!existing) {
      normalized.set(key, {
        power,
        factory,
        availableCapacity: wholeNonNegative(entry.availableCapacity),
        eligibleSeaZones: zones,
      });
      continue;
    }
    // Conservative, order-independent treatment of duplicate snapshots.
    existing.availableCapacity = Math.min(
      existing.availableCapacity,
      wholeNonNegative(entry.availableCapacity),
    );
    existing.eligibleSeaZones = new Set(
      [...existing.eligibleSeaZones].filter((zone) => zones.has(zone)),
    );
  }
  return normalized;
}

/**
 * Validate all reservations together. This is what prevents one staged
 * carrier or one factory slot from being promised to multiple sea zones.
 */
export function validateAxisCarrierReservations(args: {
  readonly obligations: unknown;
  readonly requirements: readonly AxisCarrierZoneRequirementSnapshot[];
  readonly staged: readonly AxisCarrierStagedAvailability[];
  readonly factories: readonly AxisCarrierFactoryAvailability[];
}): AxisCarrierReservationValidation {
  const obligations = normalizeAxisCarrierObligations(args.obligations);
  const requirements = normalizeZoneRequirements(args.requirements);
  const staged = normalizeStagedAvailability(args.staged);
  const factories = normalizeFactoryAvailability(args.factories);
  const issues: AxisCarrierReservationIssue[] = [];
  const rowsByKey = new Map(
    obligations.map((row) => [obligationKey(row.power, row.seaZone), row] as const),
  );
  const zoneKeys = [...new Set([...rowsByKey.keys(), ...requirements.keys()])]
    .sort((a, b) => a.localeCompare(b));

  for (const key of zoneKeys) {
    const row = rowsByKey.get(key);
    const requirement = requirements.get(key);
    const power = row?.power ?? requirement!.power;
    const seaZone = row?.seaZone ?? requirement!.seaZone;
    const actual = row?.carrierFactories.length ?? 0;
    const required = requirement?.requiredNewCarriers ?? 0;
    if (actual < required) {
      issues.push({
        code: 'carrier-reservation-shortfall',
        power,
        seaZone,
        required,
        actual,
        message: `${power} needs ${required} reserved carrier(s) for ${seaZone}, but has ${actual}.`,
      });
    } else if (actual > required) {
      issues.push({
        code: 'carrier-reservation-surplus',
        power,
        seaZone,
        required,
        actual,
        message: `${power} reserved ${actual} carrier(s) for ${seaZone}, but needs ${required}.`,
      });
    }
  }

  const reservedByPowerMap = new Map<string, number>();
  const reservedByFactoryMap = new Map<string, number>();
  const factoryZoneUses = new Map<string, {
    power: string;
    factory: string;
    seaZone: string;
    count: number;
  }>();
  for (const row of obligations) {
    reservedByPowerMap.set(
      row.power,
      (reservedByPowerMap.get(row.power) ?? 0) + row.carrierFactories.length,
    );
    for (const factory of row.carrierFactories) {
      const factoryKey = obligationKey(row.power, factory);
      reservedByFactoryMap.set(factoryKey, (reservedByFactoryMap.get(factoryKey) ?? 0) + 1);
      const zoneKey = JSON.stringify([row.power, factory, row.seaZone]);
      const use = factoryZoneUses.get(zoneKey) ?? {
        power: row.power,
        factory,
        seaZone: row.seaZone,
        count: 0,
      };
      use.count += 1;
      factoryZoneUses.set(zoneKey, use);
    }
  }

  const reservedByPower = [...new Set([...staged.keys(), ...reservedByPowerMap.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .map((power) => ({
      power,
      reserved: reservedByPowerMap.get(power) ?? 0,
      available: staged.get(power) ?? 0,
    }));
  for (const total of reservedByPower) {
    if (total.reserved <= total.available) continue;
    issues.push({
      code: 'staged-carrier-exhausted',
      power: total.power,
      required: total.reserved,
      actual: total.available,
      message: `${total.power} reserved ${total.reserved} carrier(s), but only ${total.available} remain staged.`,
    });
  }

  for (const use of [...factoryZoneUses.values()].sort((a, b) =>
    a.power.localeCompare(b.power)
      || a.factory.localeCompare(b.factory)
      || a.seaZone.localeCompare(b.seaZone))) {
    const factory = factories.get(obligationKey(use.power, use.factory));
    if (!factory) {
      issues.push({
        code: 'unknown-factory',
        power: use.power,
        seaZone: use.seaZone,
        factory: use.factory,
        required: use.count,
        actual: 0,
        message: `${use.factory} has no eligible factory snapshot for ${use.power}.`,
      });
    } else if (!factory.eligibleSeaZones.has(use.seaZone)) {
      issues.push({
        code: 'ineligible-factory',
        power: use.power,
        seaZone: use.seaZone,
        factory: use.factory,
        required: use.count,
        actual: 0,
        message: `${use.factory} cannot mobilize a carrier into ${use.seaZone}.`,
      });
    }
  }

  const reservedByFactory = [...new Set([...factories.keys(), ...reservedByFactoryMap.keys()])]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => {
      const factory = factories.get(key);
      if (factory) {
        return {
          power: factory.power,
          factory: factory.factory,
          reserved: reservedByFactoryMap.get(key) ?? 0,
          available: factory.availableCapacity,
        };
      }
      const [power, factoryRef] = JSON.parse(key) as [string, string];
      return { power, factory: factoryRef, reserved: reservedByFactoryMap.get(key) ?? 0, available: 0 };
    });
  for (const total of reservedByFactory) {
    if (total.reserved <= total.available || !factories.has(obligationKey(total.power, total.factory))) {
      continue;
    }
    issues.push({
      code: 'factory-capacity-exhausted',
      power: total.power,
      factory: total.factory,
      required: total.reserved,
      actual: total.available,
      message: `${total.factory} has ${total.available} available slot(s), but ${total.reserved} are reserved.`,
    });
  }

  return {
    ok: issues.length === 0,
    obligations,
    issues,
    reservedByPower,
    reservedByFactory,
  };
}

/**
 * Reconcile rows against authoritative live tags and current physical decks.
 * This never creates a promise for an orphan tag. Excess reservations are
 * released by keeping the lexicographically first factory entries.
 */
export function trimAxisCarrierObligations(args: {
  readonly obligations: unknown;
  readonly liveTags: unknown;
  readonly decks?: readonly AxisCarrierZoneDeckSnapshot[];
}): AxisCarrierTrimResult {
  const obligations = normalizeAxisCarrierObligations(args.obligations);
  const liveTags = normalizeAxisCarrierFighterTags(args.liveTags);
  const decks = args.decks ?? [];
  const liveByRef = new Map(liveTags.map((tag) => [tag.ref, tag] as const));
  const matchedLiveRefs = new Set<string>();
  const trimmed: AxisCarrierObligationRow[] = [];
  const releasedFighters: AxisCarrierReleasedFighter[] = [];
  const releasedCarrierFactories: AxisCarrierFactoryReservationRef[] = [];

  for (const row of obligations) {
    const fighterRefs = row.fighterRefs.filter((ref) => {
      const tag = liveByRef.get(ref);
      const matches = tag?.power === row.power && tag.seaZone === row.seaZone;
      if (matches) {
        matchedLiveRefs.add(ref);
        return true;
      }
      releasedFighters.push({ ref, power: row.power, seaZone: row.seaZone });
      return false;
    });
    const required = axisIncrementalNewCarriersNeeded(
      fighterRefs.length,
      deckForZone(decks, row.power, row.seaZone),
    );
    const keptFactories = row.carrierFactories.slice(0, required);
    for (const factory of row.carrierFactories.slice(required)) {
      releasedCarrierFactories.push({ power: row.power, seaZone: row.seaZone, factory });
    }
    if (fighterRefs.length > 0 || keptFactories.length > 0) {
      trimmed.push({
        power: row.power,
        seaZone: row.seaZone,
        fighterRefs,
        carrierFactories: keptFactories,
      });
    }
  }

  return {
    obligations: trimmed,
    releasedFighters: releasedFighters.sort((a, b) =>
      a.power.localeCompare(b.power)
        || a.seaZone.localeCompare(b.seaZone)
        || a.ref.localeCompare(b.ref)),
    releasedCarrierFactories: releasedCarrierFactories.sort((a, b) =>
      a.power.localeCompare(b.power)
        || a.seaZone.localeCompare(b.seaZone)
        || a.factory.localeCompare(b.factory)),
    orphanTags: liveTags.filter((tag) => !matchedLiveRefs.has(tag.ref)),
  };
}

/**
 * Apply only the portion of a placement matching power, promised zone, and
 * reserved factory. Wrong-zone/factory carriers remain uncommitted and cannot
 * release fighter tags. The supplied deck is the physical state immediately
 * before this placement and excludes these tagged fighters.
 */
export function fulfillAxisCarrierPlacement(args: {
  readonly obligations: unknown;
  readonly placement: AxisCarrierPlacementSnapshot;
  readonly deckBefore?: AxisCarrierPhysicalDeckSnapshot;
}): AxisCarrierPlacementResult {
  const obligations = normalizeAxisCarrierObligations(args.obligations);
  const power = cleanString(args.placement.power);
  const seaZone = cleanString(args.placement.seaZone);
  const factory = cleanString(args.placement.factory);
  const carriers = wholeNonNegative(args.placement.carriers);
  const rowIndex = power && seaZone
    ? obligations.findIndex((row) => row.power === power && row.seaZone === seaZone)
    : -1;
  if (rowIndex < 0 || !factory || carriers === 0) {
    return {
      obligations,
      matchedCarriers: 0,
      uncommittedCarriers: carriers,
      fulfilledCarrierFactories: [],
      releasedCarrierFactories: [],
      resolvedFighterRefs: [],
    };
  }

  const row = obligations[rowIndex]!;
  const reservable = row.carrierFactories.filter((entry) => entry === factory).length;
  const matchedCarriers = Math.min(carriers, reservable);
  if (matchedCarriers === 0) {
    return {
      obligations,
      matchedCarriers: 0,
      uncommittedCarriers: carriers,
      fulfilledCarrierFactories: [],
      releasedCarrierFactories: [],
      resolvedFighterRefs: [],
    };
  }

  let removalsRemaining = matchedCarriers;
  const remainingFactories = row.carrierFactories.filter((entry) => {
    if (entry === factory && removalsRemaining > 0) {
      removalsRemaining -= 1;
      return false;
    }
    return true;
  });
  const before = args.deckBefore ?? EMPTY_DECK;
  const ownCarrierSlots = wholeNonNegative(before.ownCarrierSlots) + matchedCarriers * 2;
  const alliedCarrierSlots = wholeNonNegative(before.alliedCarrierSlots);
  const occupiedByOwnFighters = wholeNonNegative(before.occupiedByOwnFighters);
  const occupiedByAlliedGuests = wholeNonNegative(before.occupiedByAlliedGuests);
  const openAfterPlacement = Math.max(
    0,
    ownCarrierSlots + alliedCarrierSlots - occupiedByOwnFighters - occupiedByAlliedGuests,
  );
  const resolvedCount = Math.min(row.fighterRefs.length, openAfterPlacement);
  const resolvedFighterRefs = row.fighterRefs.slice(0, resolvedCount);
  const remainingFighterRefs = row.fighterRefs.slice(resolvedCount);
  const remainingRequired = axisIncrementalNewCarriersNeeded(remainingFighterRefs.length, {
    ownCarrierSlots,
    alliedCarrierSlots,
    occupiedByOwnFighters: occupiedByOwnFighters + resolvedCount,
    occupiedByAlliedGuests,
  });
  const keptFactories = remainingFactories.slice(0, remainingRequired);
  const releasedCarrierFactories = remainingFactories
    .slice(remainingRequired)
    .map((entry) => ({ power: row.power, seaZone: row.seaZone, factory: entry }));
  const updatedRow: AxisCarrierObligationRow = {
    power: row.power,
    seaZone: row.seaZone,
    fighterRefs: remainingFighterRefs,
    carrierFactories: keptFactories,
  };
  const updated = obligations.flatMap((entry, index) => {
    if (index !== rowIndex) return [entry];
    return updatedRow.fighterRefs.length > 0 || updatedRow.carrierFactories.length > 0
      ? [updatedRow]
      : [];
  });

  return {
    obligations: updated,
    matchedCarriers,
    uncommittedCarriers: carriers - matchedCarriers,
    fulfilledCarrierFactories: Array.from(
      { length: matchedCarriers },
      () => ({ power: row.power, seaZone: row.seaZone, factory }),
    ),
    releasedCarrierFactories,
    resolvedFighterRefs,
  };
}

/** Reconcile and return compact, deterministic data for phase gates and UI. */
export function summarizeAxisCarrierOutstanding(args: {
  readonly obligations: unknown;
  readonly liveTags: unknown;
  readonly decks?: readonly AxisCarrierZoneDeckSnapshot[];
}): AxisCarrierOutstandingResult {
  const trimmed = trimAxisCarrierObligations(args);
  const decks = args.decks ?? [];
  const summaries = trimmed.obligations.map((row): AxisCarrierOutstandingSummary => {
    const requiredNewCarriers = axisIncrementalNewCarriersNeeded(
      row.fighterRefs.length,
      deckForZone(decks, row.power, row.seaZone),
    );
    return {
      power: row.power,
      seaZone: row.seaZone,
      fighterRefs: [...row.fighterRefs],
      fighterCount: row.fighterRefs.length,
      requiredNewCarriers,
      reservedCarriers: row.carrierFactories.length,
      missingCarrierReservations: Math.max(
        0,
        requiredNewCarriers - row.carrierFactories.length,
      ),
      carrierFactories: [...row.carrierFactories],
    };
  });
  return {
    ...trimmed,
    hasOutstanding: summaries.length > 0 || trimmed.orphanTags.length > 0,
    summaries,
    totalRequiredNewCarriers: summaries.reduce(
      (total, summary) => total + summary.requiredNewCarriers,
      0,
    ),
    totalReservedCarriers: summaries.reduce(
      (total, summary) => total + summary.reservedCarriers,
      0,
    ),
  };
}
