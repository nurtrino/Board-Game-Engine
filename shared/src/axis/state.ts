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

export interface AxisCreateOptions {
  scenario: Scenario;
  rnd: boolean;
  nationalObjectives: boolean;
  winCondition: WinCondition;
  seed?: number;
}

// A stack of identical units belonging to one power in one space.
export interface UnitStack {
  power: PowerKey | 'china';
  key: UnitKey;
  count: number;
  damaged?: number; // battleships currently on 1 hp
  // transports/carriers: cargo carried (fighters on carriers, land on tps)
  cargo?: { power: PowerKey | 'china'; key: UnitKey; count: number }[];
  // combat-move bookkeeping: how many of `count` moved/fought this turn
  moved?: number;
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
  kind: 'battle-casualties' | 'battle-submerge' | 'battle-retreat';
  data: Record<string, unknown>;
}

export interface ActiveCombat {
  id: number;
  space: string; // territory or sea zone id
  attacker: PowerKey;
  from: { space: string; units: { key: UnitKey; count: number }[] }[]; // for retreat legality
  amphibious: boolean;
  offloadFrom?: string; // sea zone the transports offloaded from
  battle: BattleState;
  // snapshot for applying results back to the board
  attackerCommitted: { key: UnitKey; count: number }[];
}

export interface AxisState {
  game: 'axis';
  options: AxisCreateOptions;
  seed: number;
  rolls: number; // rng draw counter
  round: number;
  turnIdx: number; // index into TURN_ORDER[scenario]
  phase: Phase;
  powers: Record<PowerKey, PowerState>;
  // board: spaceId -> stacks (multiple powers may share a space)
  board: Record<string, UnitStack[]>;
  // territory control: territoryId -> power ('china' allowed) or null neutral
  control: Record<string, PowerKey | 'china' | null>;
  // printed original owners (liberation reverts to these)
  originalOwner: Record<string, PowerKey | 'china' | null>;
  // factory damage markers: territoryId -> damage
  factoryDamage: Record<string, number>;
  combat: ActiveCombat | null;
  combatSeq: number;
  // after-action report of the most recent battle (TV shows the losses)
  lastBattle: {
    seq: number;
    space: string;
    attacker: PowerKey;
    defender: PowerKey | 'china' | null;
    status: string;
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
      factoriesUsed: {},
      capitalHeldBy: null,
      lastIncome: STARTING_IPCS[scenario][key],
    };
  }
  const board: AxisState['board'] = {};
  for (const [space, stacks] of Object.entries(setup.units)) {
    board[space] = stacks.map((s) => ({ ...s }));
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
    powers,
    board,
    control,
    originalOwner,
    factoryDamage: {},
    combat: null,
    combatSeq: 1,
    lastBattle: null,
    pendings: [],
    pendingSeq: 1,
    contested: [],
    vcHolders,
    winner: null,
    chinaGrant: 0,
    log: [{ round: 1, power: null, text: `${scenario} scenario begins. ${TURN_ORDER[scenario].map((p) => POWERS[p].name).join(', ')}.` }],
  };
  void idx;
  return state;
}

// ---------- helpers ----------

export const activePower = (s: AxisState): PowerKey => TURN_ORDER[s.options.scenario][s.turnIdx];
export const coalitionOf = (p: PowerKey | 'china'): 'axis' | 'allies' => (p === 'china' ? 'allies' : POWERS[p].coalition);
export const sameSide = (a: PowerKey | 'china', b: PowerKey | 'china') => coalitionOf(a) === coalitionOf(b);

export function stacksAt(s: AxisState, space: string): UnitStack[] {
  return s.board[space] ?? [];
}

export function addUnits(s: AxisState, space: string, power: PowerKey | 'china', key: UnitKey, count: number, cargo?: UnitStack['cargo']): void {
  if (count <= 0) return;
  const stacks = (s.board[space] ??= []);
  const existing = !cargo && stacks.find((st) => st.power === power && st.key === key && !st.cargo?.length);
  if (existing) existing.count += count;
  else stacks.push({ power, key, count, ...(cargo ? { cargo } : {}) });
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
// dice are public rolls). The view is the state minus internals, plus
// per-seat affordances computed client-side from the same data.
export interface AxisView {
  game: 'axis';
  options: AxisCreateOptions;
  round: number;
  phase: Phase;
  awaitingChart: boolean;
  active: PowerKey;
  turnOrder: PowerKey[];
  powers: Record<PowerKey, Omit<PowerState, 'factoriesUsed'> & { production: number }>;
  board: Record<string, UnitStack[]>;
  control: Record<string, PowerKey | 'china' | null>;
  factoryDamage: Record<string, number>;
  combat: (Omit<ActiveCombat, 'battle'> & {
    battle: Pick<BattleState, 'attacker' | 'defender' | 'round' | 'status' | 'log' | 'decision' | 'ctx'>;
    dice: { kind: string; values: number[] } | null;
  }) | null;
  pendings: AxisPending[];
  lastBattle: AxisState['lastBattle'];
  vc: { axis: number; allies: number; goal: number };
  winner: 'axis' | 'allies' | null;
  chinaGrant: number;
  log: AxisState['log'];
  researchCost: number;
}

export function axisViewFor(s: AxisState, idx: MapIndex): AxisView {
  const powers = {} as AxisView['powers'];
  for (const key of AXIS_SEATS) {
    const { factoriesUsed, ...rest } = s.powers[key];
    void factoriesUsed;
    powers[key] = { ...rest, production: productionOf(s, idx, key) };
  }
  return {
    game: 'axis',
    options: s.options,
    round: s.round,
    phase: s.phase,
    awaitingChart: Boolean(s.awaitingChart),
    active: activePower(s),
    turnOrder: TURN_ORDER[s.options.scenario],
    powers,
    board: s.board,
    control: s.control,
    factoryDamage: s.factoryDamage,
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
          },
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
    log: s.log.slice(-80),
    researchCost: RESEARCH_DIE_COST,
  };
}

export { isSeaZoneId };
