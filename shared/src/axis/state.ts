// Axis & Allies Anniversary — game state, setup, and per-seat views.
// Rules per docs/specs/axis-allies-anniversary.md (rulebook digest inside).
// Owner decisions: create options are scenario (1941/1942), RND on/off,
// National Objectives on/off, win condition (13/15/18 VCs); one human may
// control every power (dev seats); combat moves resolve immediately one at
// a time; purchases stage as real pieces; production screen between turns.

import { mulberry32 } from '../brass/rng.js';
import {
  POWERS, TURN_ORDER, STARTING_IPCS, UNITS, WIN_CONDITIONS, RESEARCH_DIE_COST,
  type PowerKey, type Scenario, type UnitKey, type TechKey, type WinCondition,
} from './config.js';
import { indexMap, isSeaZoneId, type AxisMap, type MapIndex } from './map.js';
import type { BattleState } from './battle.js';
import { deriveAxisRetreatPolicy, type AxisRetreatPolicy } from './retreat.js';
import { physicalizeAxisCargoStack, physicalizeAxisCargoStacks } from './physical.js';
import { chinaInfantryGrantFromControl, chinaPlacementSpaces as eligibleChinaPlacementSpaces } from './china.js';
import {
  normalizeAxisCarrierObligations,
  type AxisCarrierObligationRow,
  type AxisCarrierTaggedFighter,
} from './carrierCommitments.js';
import {
  deriveAxisDefendingCarrierLandingProgress,
  type AxisDefendingCarrierFighter,
  type AxisDefendingCarrierLandingChoice,
  type AxisDefendingCarrierLandingProgress,
  type AxisDefendingCarrierLandingSnapshot,
} from './defendingCarrierLandings.js';

export type AxisCombatant = PowerKey | 'china';
export type UsaOperationFirst = 'usa' | 'china';

export interface AxisCreateOptions {
  scenario: Scenario;
  rnd: boolean;
  nationalObjectives: boolean;
  winCondition: WinCondition;
  seed?: number;
}

/** Durable identity for one exact fighter relying on a purchased carrier. */
export interface AxisCarrierLandingTag {
  readonly ref: string;
  readonly seaZone: string;
}

// A stack of identical units belonging to one power in one space.
export interface UnitStack {
  power: PowerKey | 'china';
  key: UnitKey;
  count: number;
  damaged?: number; // battleships currently on 1 hp
  // Transport cargo plus allied fighters riding as guests on a carrier. A
  // carrier owner's own fighters remain independent units in its sea zone.
  cargo?: { power: PowerKey | 'china'; key: UnitKey; count: number }[];
  // combat-move bookkeeping: how many of `count` moved/fought this turn
  moved?: number;
  /** Uniform movement points already spent by this stack's aircraft this turn. */
  movementSpent?: number;
  /** Territory this physical transport has already unloaded into this turn. */
  offloadedTo?: string;
  /** Cargo loaded during Combat Move and therefore committed to an assault. */
  combatLoadedCargo?: { power: PowerKey | 'china'; key: UnitKey; count: number }[];
  /** Cargo loaded during the current power turn (allied three-step guard). */
  loadedThisTurnCargo?: { power: PowerKey | 'china'; key: UnitKey; count: number }[];
  /** A transport that retreated from sea combat cannot offload this turn. */
  offloadBlocked?: boolean;
  /** Present only on an exact, count-one fighter stack. */
  carrierLanding?: AxisCarrierLandingTag;
  /** Durable identity for one exact, count-one aircraft-carrier hull. */
  carrierRef?: string;
  /** Exact home deck for a loose count-one fighter based in a sea zone. */
  carrierBaseRef?: string;
}

export type Phase =
  | 'rnd'
  | 'purchase'
  | 'combatMove'
  | 'battle' // a combat is being resolved (owner: immediately per move)
  | 'noncombat'
  | 'mobilize'
  | 'income'
  | 'gameOver';

export interface PowerState {
  key: PowerKey;
  ipcs: number;
  techs: TechKey[];
  researchTokens: number;
  staging: Partial<Record<UnitKey, number>>; // purchased, awaiting mobilize
  /**
   * Exact provenance for units bought during this power's current Purchase
   * phase. Durable staging may include older carryover and is never itself a
   * refund ledger.
   */
  purchasedThisTurn: Partial<Record<UnitKey, { count: number; paidUnitCost: number }>>;
  factoriesUsed: Record<string, number>; // territoryId -> units mobilized this turn
  capitalHeldBy: PowerKey | null; // null = own side holds it
  lastIncome: number; // for the TV production screen (income change)
}

// A pending decision routed to a seat (defender battle picks, mobilization
// overflow, scrap choices...). Battle decisions are surfaced from the battle
// module; engine-level ones are defined here.
export interface AxisPending {
  id: number;
  power: PowerKey | 'china';
  kind: 'battle-casualties' | 'battle-submerge' | 'battle-retreat' | 'battle-continue';
  data: Record<string, unknown>;
}

export interface StrategicRaidReport {
  /** Maximum damage this complex can hold (twice its printed IPC value). */
  cap: number;
  /** Damage already on the complex when the raid launched. */
  damageBefore: number;
  /** Uncapped sum of surviving bombers' damage dice. */
  rawDamage?: number;
  /** Damage actually added after applying the complex cap. */
  appliedDamage?: number;
}

/** One physical AA launcher resolved through the shared cinematic battle path. */
export interface RocketStrikeReport {
  /** Territory containing the exact AA gun that launched the rocket. */
  source: string;
  /** Deterministic non-neutral route used for the range-three validation. */
  path: string[];
  distance: number;
  /** Available-piece ordinal acknowledged by the launching client. */
  launcherOrdinal: number;
  /** Maximum damage this complex can hold (twice printed IPC value). */
  cap: number;
  /** Damage already on the complex when the rocket launched. */
  damageBefore: number;
  /** Physical d6 result, populated exactly once after the cinematic roll. */
  roll?: number;
  /** Damage actually added after applying the complex cap. */
  appliedDamage?: number;
}

export interface ActiveCombat {
  id: number;
  /**
   * Monotonic cinematic generation for this engagement. Every authoritative
   * roll/decision that changes the battlefield increments it, allowing the
   * shared display to acknowledge the exact presented state rather than only
   * the last dice volley.
   */
  visualSeq: number;
  /** Ordinary combat or one of the cinematic economic-strike sequences. */
  kind: 'battle' | 'strategicRaid' | 'rocketStrike';
  /** Present only when kind is strategicRaid. */
  raid?: StrategicRaidReport;
  /** Present only when kind is rocketStrike. */
  rocket?: RocketStrikeReport;
  space: string; // territory or sea zone id
  attacker: AxisCombatant;
  /** Legacy/count-only origin summary retained for reports and save migration.
   * Exact retreat legality comes from BattleUnit.ingressFrom. */
  from: { space: string; units: { key: UnitKey; count: number }[] }[];
  /** Exact-retreat schema generation. New engagements always write version 1. */
  retreatRulesVersion: 1;
  /** Undefined until withdrawal; null is an aircraft-only disengagement. */
  retreatTo?: string | null;
  amphibious: boolean;
  offloadFrom?: string; // sea zone the transports offloaded from
  battle: BattleState;
  // snapshot for applying results back to the board
  attackerCommitted: {
    key: UnitKey;
    count: number;
    damaged?: number;
    cargo?: UnitStack['cargo'];
    movementSpent?: number;
    ingressFrom?: string;
    /** Reducer-assigned exact Paratroopers linkage retained in saved combat. */
    pairId?: string;
    role?: 'bomber' | 'infantry';
    aboard?: boolean;
    combatLoadedCargo?: UnitStack['combatLoadedCargo'];
    loadedThisTurnCargo?: UnitStack['loadedThisTurnCargo'];
    offloadBlocked?: boolean;
    carrierLanding?: AxisCarrierLandingTag;
    carrierRef?: string;
  }[];
  /** Per-physical-transport state that survives expansion into battle units. */
  transportLedger?: {
    uid: number;
    combatLoadedCargo?: UnitStack['combatLoadedCargo'];
    loadedThisTurnCargo?: UnitStack['loadedThisTurnCargo'];
    offloadBlocked?: boolean;
  }[];
  // battle over: both commanders confirm the report before play continues
  confirmed?: { attacker: boolean; defender: boolean };
}

export interface AxisDefendingCarrierLandingQueueState {
  /** Immutable post-combat physical snapshot replayed against exact choices. */
  snapshot: AxisDefendingCarrierLandingSnapshot;
  choices: AxisDefendingCarrierLandingChoice[];
  /** Combatant whose ordinary Noncombat Move begins after the queue drains. */
  resumeCombatant: AxisCombatant;
}

export interface AxisState {
  game: 'axis';
  options: AxisCreateOptions;
  seed: number;
  rolls: number; // rng draw counter
  round: number;
  turnIdx: number; // index into TURN_ORDER[scenario]
  phase: Phase;
  /** The active power began this turn while its capital was enemy-held. */
  turnStartedCapitalOccupied: boolean;
  /** Durable naval-retreat snapshot for the active power's current turn. */
  turnStartSea: {
    power: PowerKey;
    /** Zones containing enemy surface forces when this turn began. */
    hostile: string[];
  };
  /** Monotonic allocator for exact fighter promise references. */
  carrierLandingSeq: number;
  /** Monotonic identities for physical carrier hulls and launched defenders. */
  carrierHullSeq: number;
  defendingCarrierFighterSeq: number;
  /** Public, canonical purchased-carrier obligations for the active turn. */
  newCarrierLandingObligations: AxisCarrierObligationRow[];
  /** Surviving launched defenders accumulated while the acting player fights. */
  pendingDefendingCarrierFighters: AxisDefendingCarrierFighter[];
  /** Activated only after every acting-player combat has concluded. */
  defendingCarrierLanding: AxisDefendingCarrierLandingQueueState | null;
  powers: Record<PowerKey, PowerState>;
  // board: spaceId -> stacks (multiple powers may share a space)
  board: Record<string, UnitStack[]>;
  // territory control: territoryId -> power ('china' allowed) or null neutral
  control: Record<string, PowerKey | 'china' | null>;
  // printed original owners (liberation reverts to these)
  originalOwner: Record<string, PowerKey | 'china' | null>;
  // factory damage markers: territoryId -> damage
  factoryDamage: Record<string, number>;
  /** Factories already assigned one aggregated bomber raid this active turn. */
  economicRaidLedger: {
    power: PowerKey;
    targetedFactories: string[];
  };
  /** Independent per-turn source and target limits for the Rockets advance. */
  rocketLedger: {
    power: PowerKey;
    launchedFrom: string[];
    targetedFactories: string[];
  };
  combat: ActiveCombat | null;
  combatSeq: number;
  // after-action report of the most recent battle (TV shows the losses)
  lastBattle: {
    seq: number;
    space: string;
    attacker: AxisCombatant;
    defender: PowerKey | 'china' | null;
    status: string;
    /** Exact land/sea withdrawal destination; null means aircraft only. */
    retreatTo?: string | null;
    atkLost: Partial<Record<UnitKey, number>>;
    defLost: Partial<Record<UnitKey, number>>;
  } | null;
  awaitingChart?: boolean; // RND breakthrough rolled; chart choice pending
  pendings: AxisPending[];
  pendingSeq: number;
  // combat-move legality: spaces that had combat declared (for noncombat bans)
  contested: string[];
  // convenience caches for clients
  vcHolders: Record<string, PowerKey | 'china' | null>; // vc territory -> controller
  winner: 'axis' | 'allies' | null;
  chinaGrant: number; // Chinese infantry the US may still place this turn
  /** Round in which China's Purchase Units grant was snapshotted. */
  chinaGrantPreparedRound: number | null;
  /** Mobilization-start placement snapshot; later placements never shrink it. */
  chinaPlacementSpaces: string[];
  /** Explicit USA/China operating order chosen before the USA combat phase. */
  usaOperationFirst: UsaOperationFirst | null;
  /** Zero-based operation within the chosen order for combat/noncombat. */
  usaOperationIndex: 0 | 1;
  log: { round: number; power: PowerKey | null; text: string; space?: string }[];
}

export const AXIS_SEATS = Object.keys(POWERS) as PowerKey[];

// ---------- rng (playbook: seeded stream, one counter) ----------

export function d6(s: AxisState): number {
  const r = mulberry32(s.seed ^ (s.rolls++ * 0x9e3779b9))();
  return 1 + Math.floor(r * 6);
}

// ---------- setup ----------

export interface SetupData {
  // zone-assigned setup: spaceId -> stacks (built offline from the packup
  // goldens once the map golden exists)
  units: Record<string, { power: PowerKey | 'china'; key: UnitKey; count: number; cargo?: UnitStack['cargo'] }[]>;
  control: Record<string, PowerKey | 'china' | null>;
}

export function createAxis(
  map: AxisMap,
  setup: SetupData,
  options: AxisCreateOptions,
): AxisState {
  const scenario = options.scenario;
  const powers = {} as Record<PowerKey, PowerState>;
  for (const key of AXIS_SEATS) {
    powers[key] = {
      key,
      ipcs: STARTING_IPCS[scenario][key],
      techs: [],
      researchTokens: 0,
      staging: {},
      purchasedThisTurn: {},
      factoriesUsed: {},
      capitalHeldBy: null,
      lastIncome: STARTING_IPCS[scenario][key],
    };
  }
  const board: AxisState['board'] = {};
  for (const [space, stacks] of Object.entries(setup.units)) {
    board[space] = stacks.map((s) => ({
      ...s,
      ...(s.cargo ? { cargo: s.cargo.map((c) => ({ ...c })) } : {}),
    }));
  }
  const control: AxisState['control'] = { ...setup.control };
  const originalOwner: AxisState['originalOwner'] = {};
  for (const t of map.territories) {
    if (!t.isImpassable) originalOwner[t.id] = (t.originalOwner ?? null) as PowerKey | 'china' | null;
  }
  const idx = indexMap(map);
  const vcHolders: AxisState['vcHolders'] = {};
  for (const t of map.territories) {
    if (t.isVictoryCity) vcHolders[t.id] = control[t.id] ?? t.originalOwner as PowerKey | null;
  }
  const state: AxisState = {
    game: 'axis',
    options,
    seed: options.seed ?? 1,
    rolls: 0,
    round: 1,
    turnIdx: 0,
    phase: options.rnd ? 'rnd' : 'purchase',
    turnStartedCapitalOccupied: false,
    turnStartSea: { power: TURN_ORDER[scenario][0], hostile: [] },
    carrierLandingSeq: 1,
    carrierHullSeq: 1,
    defendingCarrierFighterSeq: 1,
    newCarrierLandingObligations: [],
    pendingDefendingCarrierFighters: [],
    defendingCarrierLanding: null,
    powers,
    board,
    control,
    originalOwner,
    factoryDamage: {},
    economicRaidLedger: { power: TURN_ORDER[scenario][0], targetedFactories: [] },
    rocketLedger: { power: TURN_ORDER[scenario][0], launchedFrom: [], targetedFactories: [] },
    combat: null,
    combatSeq: 1,
    lastBattle: null,
    pendings: [],
    pendingSeq: 1,
    contested: [],
    vcHolders,
    winner: null,
    chinaGrant: 0,
    chinaGrantPreparedRound: null,
    chinaPlacementSpaces: [],
    usaOperationFirst: null,
    usaOperationIndex: 0,
    log: [{ round: 1, power: null, text: `${scenario} scenario begins. ${TURN_ORDER[scenario].map((p) => POWERS[p].name).join(', ')}.` }],
  };
  snapshotAxisTurnStartSea(state, idx);
  return normalizeAxisState(state);
}

// ---------- helpers ----------

/**
 * Upgrade legacy saves/setups that nested a carrier owner's own fighters.
 * Those fighters launch and move independently; allied guest fighters remain
 * cargo so the carrier can transport them during its owner's turn. A fighter
 * that travelled inside an already-moved legacy carrier remains spent for the
 * current phase so migration cannot grant a second move.
 */
function normalizeLegacyRetreatState(s: AxisState): void {
  const combat = s.combat;
  if (!combat || combat.kind !== 'battle' || combat.retreatRulesVersion === 1) return;
  combat.retreatRulesVersion = 1;

  // Old saves never recorded the final adjacent ingress edge. Never infer an
  // original source as a route: it may be two spaces away. An already chosen
  // partial withdrawal without a destination is conservatively undone so it
  // cannot later teleport when the beach battle closes.
  const withdrawn = combat.battle.withdrawnAttacker ?? [];
  const withdrawnLand = withdrawn.some((unit) => unit.hp > 0 && UNITS[unit.key].domain === 'land');
  if (combat.retreatTo === undefined && withdrawn.length > 0) {
    if (withdrawnLand) {
      combat.battle.attacker.push(...withdrawn);
      combat.battle.withdrawnAttacker = [];
      s.log.push({
        round: s.round,
        power: combat.attacker === 'china' ? 'usa' : combat.attacker,
        space: combat.space,
        text: 'A legacy withdrawal lacked an exact adjacent route, so its force was returned to the battle instead of being teleported.',
      });
    } else {
      combat.retreatTo = null;
    }
  }

  if (combat.retreatTo !== undefined || combat.battle.status !== 'retreated') return;
  const seaCombat = isSeaZoneId(combat.space);
  const hasMovingSurvivor = combat.battle.attacker.some((unit) => {
    if (unit.hp <= 0 || unit.submerged) return false;
    const domain = UNITS[unit.key].domain;
    return seaCombat ? domain === 'sea' : domain === 'land' && !unit.amphibious;
  });
  if (!hasMovingSurvivor) {
    combat.retreatTo = null;
    return;
  }

  // A legacy terminal retreat with land/sea survivors cannot be completed
  // safely without inventing a destination. Re-open the settled between-round
  // choice; with no proven ingress, the player may press on but cannot retreat.
  combat.battle.status = 'ongoing';
  combat.battle.decision = { type: 'retreat', side: 'attacker' };
  delete combat.confirmed;
  s.phase = 'battle';
  s.pendings = s.pendings.filter((pending) => !pending.kind.startsWith('battle-'));
  s.pendings.push({
    id: s.pendingSeq++,
    power: combat.attacker,
    kind: 'battle-retreat',
    data: { decision: combat.battle.decision },
  });
}

const isDurableExactRef = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.trim() === value;

/** Carrier hulls need identity even while empty; cargo physicalization alone
 * deliberately leaves empty aggregates intact. */
function physicalizeAxisCarrierHulls(stacks: readonly UnitStack[]): UnitStack[] {
  return physicalizeAxisCargoStacks(stacks).flatMap((stack) => {
    if (stack.key !== 'carrier' || stack.count <= 1) return [stack];
    const moved = Math.min(stack.count, Math.max(0, stack.moved ?? 0));
    return Array.from({ length: stack.count }, (_, index) => ({
      ...stack,
      count: 1,
      ...(index < moved ? { moved: 1 } : { moved: undefined }),
      carrierRef: undefined,
      cargo: undefined,
    }));
  });
}

export function allocateAxisCarrierHullRef(s: AxisState): string {
  const used = new Set([
    ...Object.values(s.board).flatMap((stacks) => stacks
      .filter((stack) => stack.key === 'carrier' && isDurableExactRef(stack.carrierRef))
      .map((stack) => stack.carrierRef!)),
    ...(s.combat ? [
      ...s.combat.battle.attacker,
      ...s.combat.battle.defender,
      ...(s.combat.battle.withdrawnAttacker ?? []),
    ].flatMap((unit) => unit.carrierRef ? [unit.carrierRef] : []) : []),
    ...s.pendingDefendingCarrierFighters.map((fighter) => fighter.homeCarrierRef),
    ...(s.defendingCarrierLanding?.snapshot.carriers.map((carrier) => carrier.ref) ?? []),
    ...(s.defendingCarrierLanding?.snapshot.fighters.map((fighter) => fighter.homeCarrierRef) ?? []),
  ]);
  let ref: string;
  do {
    ref = `carrier-hull:${s.seed}:${s.carrierHullSeq++}`;
  } while (used.has(ref));
  return ref;
}

export function allocateAxisDefendingCarrierFighterRef(s: AxisState): string {
  const used = new Set([
    ...s.pendingDefendingCarrierFighters.map((fighter) => fighter.ref),
    ...(s.defendingCarrierLanding?.snapshot.fighters.map((fighter) => fighter.ref) ?? []),
    ...(s.combat?.battle.defender.flatMap((unit) =>
      unit.defendingCarrierFighterRef ? [unit.defendingCarrierFighterRef] : []) ?? []),
  ]);
  let ref: string;
  do {
    ref = `def-carrier-fighter:${s.seed}:${s.defendingCarrierFighterSeq++}`;
  } while (used.has(ref));
  return ref;
}

function cloneDefendingCarrierLandingSnapshot(
  snapshot: AxisDefendingCarrierLandingSnapshot,
): AxisDefendingCarrierLandingSnapshot {
  return {
    timing: { ...snapshot.timing },
    fighters: snapshot.fighters.map((fighter) => ({ ...fighter })),
    carriers: snapshot.carriers.map((carrier) => ({ ...carrier })),
    seaZones: snapshot.seaZones.map((zone) => ({
      ...zone,
      adjacentSeaZones: [...zone.adjacentSeaZones],
      adjacentTerritories: [...zone.adjacentTerritories],
      ...(zone.hostileTo ? { hostileTo: [...zone.hostileTo] } : {}),
    })),
    territories: snapshot.territories.map((territory) => ({
      ...territory,
      ...(territory.hostileTo ? { hostileTo: [...territory.hostileTo] } : {}),
    })),
  };
}

const cloneDefendingCarrierLandingChoice = (
  choice: AxisDefendingCarrierLandingChoice,
): AxisDefendingCarrierLandingChoice => ({ ...choice });

export function normalizeAxisState(s: AxisState): AxisState {
  // Battles saved before cinematic generations existed must restart from a
  // well-defined generation. Readiness itself is socket-local, so restoring at
  // zero cannot carry an acknowledgement across a server restart.
  if (s.combat && !Number.isSafeInteger(s.combat.visualSeq)) s.combat.visualSeq = 0;
  if (s.combat && (!Number.isSafeInteger(s.combat.battle.paratrooperDropSeq)
    || s.combat.battle.paratrooperDropSeq < 0)) {
    s.combat.battle.paratrooperDropSeq = 0;
  }
  const placementSnapshotMissing = s.chinaPlacementSpaces === undefined;
  const operationStateMissing = s.usaOperationFirst === undefined;
  const capitalTurnSnapshotMissing = s.turnStartedCapitalOccupied === undefined;
  s.chinaPlacementSpaces ??= [];
  s.usaOperationFirst ??= null;
  if (s.usaOperationIndex !== 0 && s.usaOperationIndex !== 1) s.usaOperationIndex = 0;
  const currentPower = TURN_ORDER[s.options.scenario][s.turnIdx];
  if (!Number.isSafeInteger(s.carrierHullSeq) || s.carrierHullSeq < 1) s.carrierHullSeq = 1;
  if (!Number.isSafeInteger(s.defendingCarrierFighterSeq) || s.defendingCarrierFighterSeq < 1) {
    s.defendingCarrierFighterSeq = 1;
  }
  const savedPendingFighters = s.pendingDefendingCarrierFighters as AxisDefendingCarrierFighter[] | undefined;
  s.pendingDefendingCarrierFighters = Array.isArray(savedPendingFighters)
    ? savedPendingFighters.filter((fighter) => fighter
      && isDurableExactRef(fighter.ref)
      && isDurableExactRef(fighter.originSeaZone)
      && isDurableExactRef(fighter.homeCarrierRef)
      && AXIS_SEATS.includes(fighter.power)).map((fighter) => ({ ...fighter }))
    : [];
  const savedDefendingQueue = s.defendingCarrierLanding as AxisDefendingCarrierLandingQueueState | undefined | null;
  const validSavedQueue = savedDefendingQueue
    && savedDefendingQueue.snapshot
    && Array.isArray(savedDefendingQueue.snapshot.fighters)
    && Array.isArray(savedDefendingQueue.snapshot.carriers)
    && Array.isArray(savedDefendingQueue.snapshot.seaZones)
    && Array.isArray(savedDefendingQueue.snapshot.territories)
    && Array.isArray(savedDefendingQueue.choices);
  s.defendingCarrierLanding = validSavedQueue ? {
    snapshot: cloneDefendingCarrierLandingSnapshot(savedDefendingQueue.snapshot),
    choices: savedDefendingQueue.choices.map(cloneDefendingCarrierLandingChoice),
    resumeCombatant: currentPower === 'usa'
      && (s.usaOperationFirst === 'usa' || s.usaOperationFirst === 'china')
      ? s.usaOperationFirst
      : savedDefendingQueue.resumeCombatant === 'china'
        || AXIS_SEATS.includes(savedDefendingQueue.resumeCombatant as PowerKey)
        ? savedDefendingQueue.resumeCombatant
        : currentPower,
  } : null;
  const normalizeSpaces = (value: unknown): string[] => Array.isArray(value)
    ? [...new Set(value.filter((space): space is string => typeof space === 'string' && space.length > 0))]
    : [];
  const savedEconomicLedger = s.economicRaidLedger as AxisState['economicRaidLedger'] | undefined;
  s.economicRaidLedger = {
    power: currentPower,
    targetedFactories: savedEconomicLedger?.power === currentPower
      ? normalizeSpaces(savedEconomicLedger.targetedFactories)
      : [],
  };
  const savedRocketLedger = s.rocketLedger as AxisState['rocketLedger'] | undefined;
  s.rocketLedger = {
    power: currentPower,
    launchedFrom: savedRocketLedger?.power === currentPower
      ? normalizeSpaces(savedRocketLedger.launchedFrom)
      : [],
    targetedFactories: savedRocketLedger?.power === currentPower
      ? normalizeSpaces(savedRocketLedger.targetedFactories)
      : [],
  };
  // A legacy save may have been captured after an economic strike opened but
  // before these durable ledgers existed. Preserve the visible engagement as
  // consumed so reconnecting cannot launch a second strike at the same complex.
  if (s.combat?.attacker === currentPower && s.combat.kind === 'strategicRaid'
    && !s.economicRaidLedger.targetedFactories.includes(s.combat.space)) {
    s.economicRaidLedger.targetedFactories.push(s.combat.space);
  }
  if (s.combat?.attacker === currentPower && s.combat.kind === 'rocketStrike') {
    if (s.combat.rocket?.source
      && !s.rocketLedger.launchedFrom.includes(s.combat.rocket.source)) {
      s.rocketLedger.launchedFrom.push(s.combat.rocket.source);
    }
    if (!s.rocketLedger.targetedFactories.includes(s.combat.space)) {
      s.rocketLedger.targetedFactories.push(s.combat.space);
    }
  }
  const savedTurnStartSea = s.turnStartSea as AxisState['turnStartSea'] | undefined;
  if (!savedTurnStartSea
    || savedTurnStartSea.power !== currentPower
    || !Array.isArray(savedTurnStartSea.hostile)) {
    // Conservative legacy hydration: a zone already fought over this turn may
    // have contained a surface fleet at turn start even when it is clear now.
    const hostile = new Set((s.contested ?? []).filter(isSeaZoneId));
    for (const space of Object.keys(s.board)) {
      if (isSeaZoneId(space) && seaZoneHostile(s, space, currentPower)) hostile.add(space);
    }
    s.turnStartSea = { power: currentPower, hostile: [...hostile] };
  } else {
    s.turnStartSea = {
      power: currentPower,
      hostile: [...new Set(savedTurnStartSea.hostile.filter((space): space is string => typeof space === 'string' && isSeaZoneId(space)))],
    };
  }
  // Old saves did not retain whether the economic phases were unavailable at
  // the beginning of this turn. The live capital marker is the only safe
  // migration signal; once hydrated, the snapshot remains durable even if the
  // capital is liberated during Combat Move.
  s.turnStartedCapitalOccupied ??= s.powers[currentPower].capitalHeldBy != null;
  if (capitalTurnSnapshotMissing
    && s.turnStartedCapitalOccupied
    && (s.phase === 'rnd' || s.phase === 'purchase')) {
    s.awaitingChart = false;
    s.phase = 'combatMove';
  }
  if (operationStateMissing && currentPower === 'usa') {
    if (s.phase === 'battle' && s.combat) {
      s.usaOperationFirst = s.combat.attacker === 'china' ? 'china' : 'usa';
      s.usaOperationIndex = 0;
    } else if (s.phase === 'noncombat') {
      s.usaOperationFirst = 'usa';
      s.usaOperationIndex = 0;
    }
  }
  if (placementSnapshotMissing && currentPower === 'usa' && s.phase === 'mobilize') {
    const territories = Object.entries(s.originalOwner).map(([id, owner]) => ({ id, isChinese: owner === 'china' }));
    s.chinaPlacementSpaces = eligibleChinaPlacementSpaces(territories, s.control, s.board);
  }
  if (s.chinaGrantPreparedRound === undefined) {
    if (currentPower === 'usa') {
      if (s.phase === 'rnd'
        || s.phase === 'purchase'
        || (s.turnStartedCapitalOccupied && s.phase === 'combatMove' && !s.usaOperationFirst)) {
        const territories = Object.entries(s.originalOwner).map(([id, owner]) => ({ id, isChinese: owner === 'china' }));
        s.chinaGrant = chinaInfantryGrantFromControl(territories, s.control);
      }
      s.chinaGrantPreparedRound = s.round;
    } else {
      s.chinaGrantPreparedRound = null;
    }
  }
  if (s.combat && !s.combat.kind) s.combat.kind = 'battle';
  normalizeLegacyRetreatState(s);
  if (!Number.isSafeInteger(s.carrierLandingSeq) || s.carrierLandingSeq < 1) {
    s.carrierLandingSeq = 1;
  }
  s.newCarrierLandingObligations = normalizeAxisCarrierObligations(
    s.newCarrierLandingObligations,
  ).filter((row) => row.power === currentPower && isSeaZoneId(row.seaZone));
  for (const ref of s.newCarrierLandingObligations.flatMap((row) => row.fighterRefs)) {
    const match = new RegExp(`^carrier:${s.seed}:(\\d+)$`).exec(ref);
    if (match) s.carrierLandingSeq = Math.max(s.carrierLandingSeq, Number(match[1]) + 1);
  }
  const obligationByRef = new Map<string, AxisCarrierObligationRow>();
  for (const row of s.newCarrierLandingObligations) {
    for (const ref of row.fighterRefs) obligationByRef.set(ref, row);
  }
  const liveRefs = new Set<string>();
  const validTag = (
    power: AxisCombatant,
    key: UnitKey,
    tag: AxisCarrierLandingTag | undefined,
    claim: boolean,
  ): tag is AxisCarrierLandingTag => {
    if (key !== 'fighter' || !tag || typeof tag.ref !== 'string' || !tag.ref
      || typeof tag.seaZone !== 'string' || !tag.seaZone) return false;
    const row = obligationByRef.get(tag.ref);
    if (!row || row.power !== power || row.seaZone !== tag.seaZone) return false;
    if (claim && liveRefs.has(tag.ref)) return false;
    if (claim) liveRefs.add(tag.ref);
    return true;
  };
  for (const power of AXIS_SEATS) {
    // Legacy saves predate per-factory mobilization accounting. Hydrate the
    // durable map once so views and placement validation never fall back to a
    // controller-local counter after reconnecting.
    s.powers[power].factoriesUsed ??= {};
    const rawPurchases = power === currentPower
      && s.phase === 'purchase'
      && !s.turnStartedCapitalOccupied
      ? s.powers[power].purchasedThisTurn as PowerState['purchasedThisTurn'] | undefined
      : undefined;
    const purchasedThisTurn: PowerState['purchasedThisTurn'] = {};
    if (rawPurchases && typeof rawPurchases === 'object') {
      for (const [key, raw] of Object.entries(rawPurchases)) {
        if (!(key in UNITS) || !raw || typeof raw !== 'object') continue;
        const count = Number((raw as { count?: unknown }).count);
        const paidUnitCost = Number((raw as { paidUnitCost?: unknown }).paidUnitCost);
        if (!Number.isSafeInteger(count) || count <= 0
          || !Number.isSafeInteger(paidUnitCost) || paidUnitCost <= 0) continue;
        const staged = Math.max(0, Math.floor(s.powers[power].staging[key as UnitKey] ?? 0));
        const retained = Math.min(count, staged);
        if (retained > 0) purchasedThisTurn[key as UnitKey] = { count: retained, paidUnitCost };
      }
    }
    // Legacy saves have no trustworthy way to distinguish current purchases
    // from paid carryover. Conservatively treating them all as carryover
    // prevents a reconnect from minting an IPC refund.
    s.powers[power].purchasedThisTurn = purchasedThisTurn;
  }
  for (const [space, stacks] of Object.entries(s.board)) {
    const extracted: UnitStack[] = [];
    for (const carrier of stacks) {
      if (carrier.key !== 'carrier' || !carrier.cargo?.length) continue;
      const remaining = carrier.cargo.filter((cargo) => cargo.key !== 'fighter' || cargo.power !== carrier.power);
      for (const cargo of carrier.cargo) {
        if (cargo.key !== 'fighter' || cargo.power !== carrier.power || cargo.count <= 0) continue;
        const moved = (carrier.moved ?? 0) > 0 ? cargo.count : 0;
        const existing = [...stacks, ...extracted].find((stack) =>
          stack.power === cargo.power
          && stack.key === 'fighter'
          && !stack.cargo?.length
          && !stack.carrierLanding
          && (stack.moved ?? 0) === moved,
        );
        if (existing) existing.count += cargo.count;
        else extracted.push({
          power: cargo.power,
          key: 'fighter',
          count: cargo.count,
          ...(moved > 0 ? { moved } : {}),
        });
      }
      if (remaining.length > 0) carrier.cargo = remaining;
      else delete carrier.cargo;
    }
    stacks.push(...extracted);
    // A promise names one physical fighter. Defensively split malformed old
    // aggregates instead of cloning one ref onto every sculpt.
    const exactTagged: UnitStack[] = [];
    for (const stack of stacks) {
      const tag = stack.carrierLanding;
      if (!validTag(stack.power, stack.key, tag, true)) {
        delete stack.carrierLanding;
        continue;
      }
      if (stack.count > 1) {
        const taggedMoved = (stack.moved ?? 0) > 0;
        stack.count -= 1;
        if (taggedMoved) {
          stack.moved = Math.max(0, (stack.moved ?? 0) - 1);
          if (stack.moved === 0) delete stack.moved;
        }
        delete stack.carrierLanding;
        exactTagged.push({
          ...stack,
          count: 1,
          ...(taggedMoved ? { moved: 1 } : {}),
          carrierLanding: { ...tag },
        });
      } else {
        stack.carrierLanding = { ...tag };
      }
    }
    stacks.push(...exactTagged);
    // Older saves could attach aggregate cargo to several indistinguishable
    // hulls. Split those into deterministic one-hull stacks once so a rendered
    // transport/carrier ordinal always names one durable cargo manifest.
    s.board[space] = physicalizeAxisCarrierHulls(stacks);
  }
  // Positional board ordinals are not durable through combat/restoration.
  // Give every physical carrier hull a persistent ref and reject duplicate
  // legacy refs by assigning a fresh identity to the later hull.
  const carrierRefs = new Set<string>();
  for (const stacks of Object.values(s.board)) {
    for (const stack of stacks) {
      if (stack.key !== 'carrier' || stack.count !== 1) continue;
      let ref = isDurableExactRef(stack.carrierRef) && !carrierRefs.has(stack.carrierRef)
        ? stack.carrierRef
        : undefined;
      if (!ref) ref = allocateAxisCarrierHullRef(s);
      stack.carrierRef = ref;
      carrierRefs.add(ref);
      const match = new RegExp(`^carrier-hull:${s.seed}:(\\d+)$`).exec(ref);
      if (match) s.carrierHullSeq = Math.max(s.carrierHullSeq, Number(match[1]) + 1);
    }
  }
  // A legacy setup/save can begin during a fighter owner's turn with that
  // fighter still nested on a friendly allied carrier. Current saves normally
  // release these guests in beginTurn(), but hydration must provide the same
  // independently selectable representation for the initial turn and for old
  // reconnects. Keep every other power's guests bound to their exact host.
  for (const [space, stacks] of Object.entries(s.board)) {
    if (!isSeaZoneId(space)) continue;
    const released: UnitStack[] = [];
    for (const carrier of stacks) {
      if (carrier.key !== 'carrier'
        || carrier.count !== 1
        || !carrier.carrierRef
        || carrier.power === currentPower
        || !sameSide(carrier.power, currentPower)
        || !carrier.cargo?.length) continue;
      const remaining: NonNullable<UnitStack['cargo']> = [];
      for (const cargo of carrier.cargo) {
        if (cargo.key !== 'fighter' || cargo.power !== currentPower || cargo.count <= 0) {
          if (cargo.count > 0) remaining.push({ ...cargo });
          continue;
        }
        for (let physical = 0; physical < cargo.count; physical++) {
          released.push({
            power: currentPower,
            key: 'fighter',
            count: 1,
            carrierBaseRef: carrier.carrierRef,
          });
        }
      }
      if (remaining.length > 0) carrier.cargo = remaining;
      else delete carrier.cargo;
    }
    stacks.push(...released);
  }
  for (const [space, stacks] of Object.entries(s.board)) {
    for (const stack of stacks) {
      if (stack.key !== 'fighter' || stack.count !== 1 || !isDurableExactRef(stack.carrierBaseRef)) {
        delete stack.carrierBaseRef;
        continue;
      }
      const home = stacks.find((candidate) => candidate.key === 'carrier'
        && candidate.carrierRef === stack.carrierBaseRef
        && sameSide(candidate.power, stack.power));
      if (!home || !isSeaZoneId(space)) delete stack.carrierBaseRef;
    }
    // Canonical property order keeps JSON save normalization idempotent even
    // when cargo cloning reconstructs an exact carrier object.
    s.board[space] = stacks.map((stack) => {
      if (stack.key !== 'carrier' || !stack.carrierRef) return stack;
      const { cargo, carrierRef, ...rest } = stack;
      return {
        ...rest,
        ...(cargo?.length ? { cargo: cargo.map((item) => ({ ...item })) } : {}),
        carrierRef,
      };
    });
  }
  const liveTags: AxisCarrierTaggedFighter[] = [];
  for (const stacks of Object.values(s.board)) {
    for (const stack of stacks) {
      if (stack.carrierLanding) {
        liveTags.push({
          ref: stack.carrierLanding.ref,
          power: stack.power,
          seaZone: stack.carrierLanding.seaZone,
        });
      }
    }
  }
  if (s.combat) {
    const liveBattleUnits = [
      ...s.combat.battle.attacker.filter((unit) => unit.hp > 0),
      ...(s.combat.battle.withdrawnAttacker ?? []).filter((unit) => unit.hp > 0),
    ];
    for (const unit of liveBattleUnits) {
      if (!validTag(unit.power as AxisCombatant, unit.key, unit.carrierLanding, true)) {
        delete unit.carrierLanding;
        continue;
      }
      unit.carrierLanding = { ...unit.carrierLanding };
      liveTags.push({
        ref: unit.carrierLanding.ref,
        power: unit.power,
        seaZone: unit.carrierLanding.seaZone,
      });
    }
    for (const unit of s.combat.attackerCommitted) {
      if (!validTag(s.combat.attacker, unit.key, unit.carrierLanding, false)) {
        delete unit.carrierLanding;
      } else {
        unit.carrierLanding = { ...unit.carrierLanding };
      }
    }
  }
  const liveByRef = new Map(liveTags.map((tag) => [tag.ref, tag] as const));
  // Save hydration has no action/map context. Remove dead refs, but preserve
  // every factory reservation until the action reducer can recompute physical
  // and allied deck occupancy; trimming to ceil(fighters/2) here would lose a
  // legitimate extra carrier reserved around allied guests.
  s.newCarrierLandingObligations = s.newCarrierLandingObligations.flatMap((row) => {
    const fighterRefs = row.fighterRefs.filter((ref) => {
      const tag = liveByRef.get(ref);
      return tag?.power === row.power && tag.seaZone === row.seaZone;
    });
    return fighterRefs.length > 0 ? [{
      ...row,
      fighterRefs,
      carrierFactories: [...row.carrierFactories],
    }] : [];
  });
  const retainedRefs = new Set(
    s.newCarrierLandingObligations.flatMap((row) => row.fighterRefs),
  );
  if (s.combat) {
    for (const unit of [
      ...s.combat.battle.attacker,
      ...s.combat.battle.defender,
      ...(s.combat.battle.withdrawnAttacker ?? []),
      ...s.combat.attackerCommitted,
    ]) {
      if (unit.carrierLanding && !retainedRefs.has(unit.carrierLanding.ref)) {
        delete unit.carrierLanding;
      }
    }
  }
  return s;
}

export const activePower = (s: AxisState): PowerKey => TURN_ORDER[s.options.scenario][s.turnIdx];
export function operatingPower(s: AxisState): AxisCombatant | null {
  const active = activePower(s);
  if (active !== 'usa') return active;
  if (s.phase === 'battle' && s.combat) return s.combat.attacker;
  if (s.phase !== 'combatMove' && s.phase !== 'noncombat') return active;
  const first = s.usaOperationFirst;
  if (!first) return null;
  if (s.usaOperationIndex === 0) return first;
  return first === 'usa' ? 'china' : 'usa';
}
export const coalitionOf = (p: PowerKey | 'china'): 'axis' | 'allies' => (p === 'china' ? 'allies' : POWERS[p].coalition);
export const sameSide = (a: PowerKey | 'china', b: PowerKey | 'china') => coalitionOf(a) === coalitionOf(b);

export function stacksAt(s: AxisState, space: string): UnitStack[] {
  return s.board[space] ?? [];
}

export function addUnits(
  s: AxisState,
  space: string,
  power: PowerKey | 'china',
  key: UnitKey,
  count: number,
  cargo?: UnitStack['cargo'],
  damaged = 0,
): void {
  if (count <= 0) return;
  const damagedCount = key === 'battleship' ? Math.min(count, Math.max(0, damaged)) : 0;
  const stacks = (s.board[space] ??= []);
  if (key === 'carrier') {
    const hulls = physicalizeAxisCarrierHulls([{
      power,
      key,
      count,
      ...(cargo ? { cargo: cargo.map((item) => ({ ...item })) } : {}),
    }]);
    for (const hull of hulls) hull.carrierRef = allocateAxisCarrierHullRef(s);
    stacks.push(...hulls);
    return;
  }
  if (key === 'transport' || cargo?.length) {
    // Cargo identity belongs to a physical hull. Never create an aggregate
    // transport (even while empty) that the renderer and reducer cannot
    // address independently.
    stacks.push(...physicalizeAxisCargoStack({ power, key, count, cargo, ...(damagedCount > 0 ? { damaged: damagedCount } : {}) }));
    return;
  }
  const existing = !cargo && stacks.find((st) => st.power === power
    && st.key === key
    && !st.cargo?.length
    && !st.carrierLanding
    && !st.carrierBaseRef
    && (st.movementSpent ?? 0) === 0);
  if (existing) {
    existing.count += count;
    if (damagedCount > 0) existing.damaged = (existing.damaged ?? 0) + damagedCount;
  } else {
    stacks.push({
      power,
      key,
      count,
      ...(cargo ? { cargo: cargo.map((c) => ({ ...c })) } : {}),
      ...(damagedCount > 0 ? { damaged: damagedCount } : {}),
    });
  }
}

/** Restore one already-identified carrier without pooling it into a stack. */
export function addAxisCarrierHull(
  s: AxisState,
  space: string,
  power: PowerKey | 'china',
  carrierRef: string,
  cargo?: UnitStack['cargo'],
  moved = 0,
): void {
  if (!isDurableExactRef(carrierRef)) throw new Error('An exact carrier hull needs a durable ref.');
  (s.board[space] ??= []).push({
    power,
    key: 'carrier',
    count: 1,
    carrierRef,
    ...(cargo?.length ? { cargo: cargo.map((item) => ({ ...item })) } : {}),
    ...(moved > 0 ? { moved: 1 } : {}),
  });
}

export function removeUnits(s: AxisState, space: string, power: PowerKey | 'china', key: UnitKey, count: number): boolean {
  const stacks = s.board[space] ?? [];
  let left = count;
  for (const st of stacks) {
    if (st.power !== power || st.key !== key) continue;
    const take = Math.min(st.count, left);
    st.count -= take;
    left -= take;
    if (left === 0) break;
  }
  s.board[space] = stacks.filter((st) => st.count > 0);
  return left === 0;
}

export function unitCount(s: AxisState, space: string, power: PowerKey | 'china' | null, key?: UnitKey): number {
  return stacksAt(s, space).reduce((n, st) => {
    if (power && st.power !== power) return n;
    if (key && st.key !== key) return n;
    return n + st.count;
  }, 0);
}

export function enemyUnitsAt(s: AxisState, space: string, mine: PowerKey | 'china'): UnitStack[] {
  return stacksAt(s, space).filter((st) => !sameSide(st.power, mine));
}

/** A sea zone is hostile for movement when enemy units other than lone
 * subs/transports are present. */
export function seaZoneHostile(s: AxisState, zone: string, mine: PowerKey | 'china'): boolean {
  return enemyUnitsAt(s, zone, mine).some((st) => st.key !== 'submarine' && st.key !== 'transport');
}

/** Snapshot the zones that cannot later become naval retreat destinations
 * merely because an earlier combat during this same turn cleared them. */
export function snapshotAxisTurnStartSea(s: AxisState, idx: MapIndex): void {
  const power = activePower(s);
  s.turnStartSea = {
    power,
    hostile: idx.map.seaZones
      .map((zone) => zone.id)
      .filter((zone) => seaZoneHostile(s, zone, power)),
  };
}

// ---------- income ----------

export function productionOf(s: AxisState, idx: MapIndex, power: PowerKey): number {
  let sum = 0;
  for (const t of idx.map.territories) {
    if (s.control[t.id] === power) sum += t.ipc;
  }
  return sum;
}

/** Victory-city count per side; winner check runs at the end of a full round
 * (after the last power's turn — rulebook: after the US turn). */
export function vcCount(s: AxisState, idx: MapIndex, side: 'axis' | 'allies'): number {
  let n = 0;
  for (const t of idx.map.territories) {
    if (!t.isVictoryCity) continue;
    const holder = s.control[t.id];
    if (holder && coalitionOf(holder) === side) n++;
  }
  return n;
}

export function checkVictory(s: AxisState, idx: MapIndex): void {
  const goal = WIN_CONDITIONS[s.options.winCondition].cities;
  for (const side of ['axis', 'allies'] as const) {
    if (vcCount(s, idx, side) >= goal) {
      s.winner = side;
      s.phase = 'gameOver';
      s.log.push({ round: s.round, power: null, text: `${side === 'axis' ? 'The Axis' : 'The Allies'} control ${goal} victory cities and win the game.` });
      return;
    }
  }
}

// ---------- views ----------

// A&A has almost no hidden information (IPCs and board are public; research
// dice are public rolls). The reducer view is state minus internals; the room
// server adds ephemeral recipient authority and display-readiness fields.
export interface AxisView {
  game: 'axis';
  /** Ephemeral server overlay: a connected TV has loaded this battle's visuals. */
  battleVisualReady: boolean;
  /**
   * Ephemeral recipient authority supplied by the room server. A normal
   * player controls their selected power; the host also covers powers that
   * nobody seated. Watchers and reducer-only views default to no authority.
   */
  controlledPowers: PowerKey[];
  options: AxisCreateOptions;
  round: number;
  phase: Phase;
  awaitingChart: boolean;
  active: PowerKey;
  /** Whether the active power's capital is held right now. */
  capitalOccupied: boolean;
  /** Whether it was held when this power's current turn began. */
  turnStartedCapitalOccupied: boolean;
  /** Required purchased-carrier landings survive save/reconnect. */
  newCarrierLandingObligations: AxisCarrierObligationRow[];
  /** Exact emergency landing queue, hidden until all combats have resolved. */
  defendingCarrierLanding: (AxisDefendingCarrierLandingQueueState & {
    progress: AxisDefendingCarrierLandingProgress;
  }) | null;
  /** Units currently receiving movement/combat orders; China still routes to USA. */
  operatingPower: AxisCombatant | null;
  usaOperationFirst: UsaOperationFirst | null;
  usaOperationIndex: 0 | 1;
  turnOrder: PowerKey[];
  // Mobilization usage is authoritative room state. Exposing it keeps every
  // reconnecting controller on the same remaining-capacity calculation.
  powers: Record<PowerKey, PowerState & { production: number }>;
  board: Record<string, UnitStack[]>;
  control: Record<string, PowerKey | 'china' | null>;
  /** Territories fought over this turn; aircraft may not land there yet. */
  contested: string[];
  factoryDamage: Record<string, number>;
  economicRaidLedger: AxisState['economicRaidLedger'];
  rocketLedger: AxisState['rocketLedger'];
  combat: (Omit<ActiveCombat, 'battle'> & {
    battle: Pick<BattleState, 'attacker' | 'defender' | 'round' | 'status' | 'log' | 'decision' | 'ctx' | 'steps' | 'stepIndex' | 'paratrooperDropSeq'>;
    /** Authoritative choices derived from persisted ingress and turn snapshot. */
    retreatPolicy: AxisRetreatPolicy | null;
    dice: { kind: string; values: number[] } | null;
  }) | null;
  pendings: AxisPending[];
  lastBattle: AxisState['lastBattle'];
  vc: { axis: number; allies: number; goal: number };
  winner: 'axis' | 'allies' | null;
  chinaGrant: number;
  chinaPlacementSpaces: string[];
  log: AxisState['log'];
  researchCost: number;
}

export function axisViewFor(s: AxisState, idx: MapIndex): AxisView {
  const powers = {} as AxisView['powers'];
  for (const key of AXIS_SEATS) {
    powers[key] = {
      ...s.powers[key],
      purchasedThisTurn: Object.fromEntries(Object.entries(s.powers[key].purchasedThisTurn ?? {})
        .map(([unit, entry]) => [unit, entry ? { ...entry } : entry])) as PowerState['purchasedThisTurn'],
      factoriesUsed: { ...(s.powers[key].factoriesUsed ?? {}) },
      production: productionOf(s, idx, key),
    };
  }
  return {
    game: 'axis',
    // The shared reducer cannot know about connected displays. The room server
    // overlays these per recipient without ever persisting them into AxisState.
    battleVisualReady: false,
    controlledPowers: [],
    options: s.options,
    round: s.round,
    phase: s.phase,
    awaitingChart: Boolean(s.awaitingChart),
    active: activePower(s),
    capitalOccupied: s.powers[activePower(s)].capitalHeldBy != null,
    turnStartedCapitalOccupied: s.turnStartedCapitalOccupied,
    newCarrierLandingObligations: s.newCarrierLandingObligations.map((row) => ({
      ...row,
      fighterRefs: [...row.fighterRefs],
      carrierFactories: [...row.carrierFactories],
    })),
    defendingCarrierLanding: s.defendingCarrierLanding
      ? {
          snapshot: cloneDefendingCarrierLandingSnapshot(s.defendingCarrierLanding.snapshot),
          choices: s.defendingCarrierLanding.choices.map(cloneDefendingCarrierLandingChoice),
          resumeCombatant: s.defendingCarrierLanding.resumeCombatant,
          progress: deriveAxisDefendingCarrierLandingProgress(
            s.defendingCarrierLanding.snapshot,
            s.defendingCarrierLanding.choices,
          ),
        }
      : null,
    operatingPower: operatingPower(s),
    usaOperationFirst: s.usaOperationFirst,
    usaOperationIndex: s.usaOperationIndex,
    turnOrder: TURN_ORDER[s.options.scenario],
    powers,
    board: s.board,
    control: s.control,
    contested: [...s.contested],
    factoryDamage: s.factoryDamage,
    economicRaidLedger: {
      power: s.economicRaidLedger.power,
      targetedFactories: [...s.economicRaidLedger.targetedFactories],
    },
    rocketLedger: {
      power: s.rocketLedger.power,
      launchedFrom: [...s.rocketLedger.launchedFrom],
      targetedFactories: [...s.rocketLedger.targetedFactories],
    },
    combat: s.combat
      ? {
          ...s.combat,
          battle: {
            attacker: s.combat.battle.attacker,
            defender: s.combat.battle.defender,
            round: s.combat.battle.round,
            status: s.combat.battle.status,
            log: s.combat.battle.log,
            decision: s.combat.battle.decision,
            ctx: s.combat.battle.ctx,
            steps: s.combat.battle.steps,
            stepIndex: s.combat.battle.stepIndex,
            paratrooperDropSeq: s.combat.battle.paratrooperDropSeq,
          },
          retreatPolicy: s.combat.kind === 'battle'
            ? deriveAxisRetreatPolicy({
                battle: s.combat.battle,
                battleSpace: s.combat.space,
                attacker: s.combat.attacker,
                board: s.board,
                control: s.control,
                index: idx,
                turnStartHostileSeaZones: s.turnStartSea.hostile,
              })
            : null,
          dice: null,
        }
      : null,
    pendings: s.pendings,
    lastBattle: s.lastBattle,
    vc: {
      axis: vcCount(s, idx, 'axis'),
      allies: vcCount(s, idx, 'allies'),
      goal: WIN_CONDITIONS[s.options.winCondition].cities,
    },
    winner: s.winner,
    chinaGrant: s.chinaGrant,
    chinaPlacementSpaces: [...s.chinaPlacementSpaces],
    log: s.log.slice(-80),
    researchCost: RESEARCH_DIE_COST,
  };
}

export { isSeaZoneId };
