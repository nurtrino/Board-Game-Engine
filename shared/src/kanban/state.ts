// Kanban EV. State + setup + views, built from the goldens extracted from
// TTS mod 3589049550 (layout.json = the mod's own Lua data tables — the
// conveyor displacement graph, kanban order contents, demands, spots;
// goals.json / board.json = card and tile effects read from the sheets and
// board art, pinned by the reference book legend). The mod is drag-pieces
// automation; this engine enforces the full rules per
// docs/specs/kanban-ev.md. 2-4 players. Sandra is engine-automated. The
// Speed Charger / Garage Bonuses expansions and the four rulebook variants
// are staged as create options but not implemented — options must be off.

import { mulberry32, shuffle } from '../brass/rng.js';
import layoutJson from './layout.json';
import goalsJson from './goals.json';
import boardJson from './board.json';

export type KanbanSeat = 'Orange' | 'Yellow' | 'Purple' | 'Blue';
export const KANBAN_SEATS: KanbanSeat[] = ['Orange', 'Yellow', 'Purple', 'Blue'];

export type Dept = 'RnD' | 'Assembly' | 'Logistics' | 'Design' | 'Admin';
export const DEPTS: Dept[] = ['RnD', 'Assembly', 'Logistics', 'Design', 'Admin']; // Sandra's cycle order, top to bottom

export type CarModel = 'City' | 'SUV' | 'Truck' | 'Sport' | 'Concept';
export const MODELS: CarModel[] = ['City', 'SUV', 'Truck', 'Sport', 'Concept'];
// the mod's Lua indexes cars alphabetically
export const LUA_CAR_ORDER: CarModel[] = ['City', 'Concept', 'Sport', 'SUV', 'Truck'];

export type Part = 'Autopilots' | 'Batteries' | 'Bodies' | 'Drivetrains' | 'Electronics' | 'Motors';
export const PARTS: Part[] = ['Autopilots', 'Batteries', 'Bodies', 'Drivetrains', 'Electronics', 'Motors'];
// warehouses sit in two rows; a kanban order stocks a warehouse only when
// the symbol lands on the warehouse's side of the line (Lua Calculate)
export const TOP_ROW_PARTS: Part[] = ['Autopilots', 'Batteries', 'Motors'];

export const KANBAN_RULES = {
  maxShiftsPerDay: 4,
  shiftBankMax: 10,
  evaluationThreshold: 5, // lose extra PP per banked shift below this
  designSlots: 4, // +1 with Design certification
  partSlots: 5, // +1 with Logistics certification
  speechSlots: 4, // +1 with Admin certification
  bookSlots: 6,
  voucherSlots: 6,
  garages: 5, // 5th unlocks with Assembly certification
  // six printed track spaces, indices 0-5: markers START on space 0, the
  // arrow sits between 2 and 3, the last space is Expert (setup save)
  trainingTrack: 5,
  certifiedAt: 3,
  handGoals: 3,
  handOrders: 2,
  testTrackSpaces: 8,
  stripedSpaces: [0, 4],
  maxBehindPace: 4,
  claimShiftCost: [1, 2, 2, 3], // by queue position behind the pace car
  // exit gates: the three belt-end nodes roll out through their own gate
  // (verified against the printed arrows via the fit overlay)
  conveyorExitPP: { 31: 1, 32: 2, 33: 1 } as Record<number, number>,
  ppStart: 15,
  weekMax: 3,
  cycleMax: 3,
  startingCars: 8, // per model
  startingParts: 10, // per part type
  trainingFinalPP: [5, 3, 1],
} as const;

// ---------- goldens ----------

export interface GoalDef {
  guid: string;
  num: number;
  per: string; // e.g. 'car', 'model:Truck', 'upgradedPart:Batteries', 'certifiedIn:RnD'
  pp: number;
  max: number; // highest multiplier icon (max 3 speakers score max..1)
}
export const PERFORMANCE_GOALS: GoalDef[] = (goalsJson as { performance: GoalDef[] }).performance;
export const GOAL_BY_GUID: Record<string, GoalDef> = Object.fromEntries(PERFORMANCE_GOALS.map((g) => [g.guid, g]));

export interface FinalGoalDef {
  guid: string;
  num: number;
  achievements: { kind: string; n?: number; pp: number; model?: CarModel; part?: Part; depts?: Dept[] }[];
}
export const FINAL_GOALS: FinalGoalDef[] = (goalsJson as unknown as { final: FinalGoalDef[] }).final;

export interface Benefit { pp?: number; bankedShifts?: number; books?: number; vouchers?: number; speech?: number }
interface BoardGolden {
  awards: Record<string, string[]>; // effect key -> tile guids
  garageBonuses: { basic: { effect: Benefit; padlock?: boolean }[]; expert: { effect: Benefit; padlock?: boolean }[] };
  certificationTrack: { sections: Benefit[][] };
  upgradeSpaces: Record<CarModel, (Benefit | null)[]>;
  carValues: Record<CarModel, number>;
  modelColors: Record<CarModel, string>;
}
export const BOARD = boardJson as unknown as BoardGolden;
export const CAR_VALUES = BOARD.carValues;
export const CERT_SECTIONS = BOARD.certificationTrack.sections;
export const UPGRADE_SPACES = BOARD.upgradeSpaces;

// award effects flattened: guid -> benefit
export const AWARD_BY_GUID: Record<string, Benefit> = {};
for (const [key, guids] of Object.entries(BOARD.awards)) {
  const eff: Benefit = key === 'pp2' ? { pp: 2 } : key === 'bankShift1' ? { bankedShifts: 1 }
    : key === 'voucher1' ? { vouchers: 1 } : { books: 1 };
  for (const g of guids) AWARD_BY_GUID[g] = eff;
}

// kanban order cards: 6 symbols each (Lua part indices 1-6)
interface LayoutGolden {
  PARTS: { Cards: { Elements: { Guid: string; Parts: number[] }[] } };
  DEMANDS: { Elements: { Guid: string; Name: string; Speechs: number }[] };
  DESIGNS: { Elements: { Guid: string; Car: number; Part: number }[] };
  CARS: { Zones: { Assembly: { Guid: string; Number: number; Targets: string[] }[]; Stocks: { Guid: string; Assembly: number; Car: number }[] } };
  AWARDS: { Elements: string[] };
  GOALS: { Final: { Basic: string[] } };
}
const layout = layoutJson as unknown as LayoutGolden;

export interface OrderDef { guid: string; parts: Part[] } // 6 symbols in printed order
export const KANBAN_ORDERS: OrderDef[] = layout.PARTS.Cards.Elements.map((c) => ({
  guid: c.Guid,
  parts: c.Parts.map((i) => PARTS[i - 1]),
}));
export const ORDER_BY_GUID: Record<string, OrderDef> = Object.fromEntries(KANBAN_ORDERS.map((o) => [o.guid, o]));

export interface DemandDef { guid: string; model: CarModel; speechs: number }
export const DEMANDS: DemandDef[] = layout.DEMANDS.Elements.map((d) => ({
  guid: d.Guid, model: d.Name as CarModel, speechs: d.Speechs,
}));

// design tiles: 7 per model (one per part + one extra, Part 0)
export interface DesignDef { guid: string; model: CarModel; part: Part | null }
export const DESIGNS: DesignDef[] = layout.DESIGNS.Elements.map((d) => ({
  guid: d.Guid, model: LUA_CAR_ORDER[d.Car - 1], part: d.Part === 0 ? null : PARTS[d.Part - 1],
}));
export const DESIGN_BY_GUID: Record<string, DesignDef> = Object.fromEntries(DESIGNS.map((d) => [d.guid, d]));

// conveyor: node Number (11..33) -> displacement targets; entry node per model
export interface ConveyorNode { num: number; targets: number[] }
const nodeByGuid: Record<string, number> = Object.fromEntries(layout.CARS.Zones.Assembly.map((n) => [n.Guid, n.Number]));
export const CONVEYOR: Record<number, ConveyorNode> = Object.fromEntries(layout.CARS.Zones.Assembly.map((n) => [
  n.Number, { num: n.Number, targets: n.Targets.map((g) => nodeByGuid[g]).filter((x) => x !== undefined) },
]));
export const ENTRY_NODE: Record<CarModel, number> = Object.fromEntries(layout.CARS.Zones.Stocks.map((s) => [
  LUA_CAR_ORDER[s.Car - 1], 10 + s.Assembly, // line i enters at node 1i
])) as Record<CarModel, number>;

// ---------- decisions (pending queue, Dune pattern) ----------

export type KanbanDecision =
  | { kind: 'certSpace'; section: number; label: string } // pick an empty space in a cert section
  | { kind: 'orientPick'; label: string } // starting part + design
  | { kind: 'selectWorkstation'; label: string }
  | { kind: 'award'; dept: Dept; options: string[]; label: string } // expert: secretly pick an award tile
  | { kind: 'displace'; node: number; options: number[]; label: string } // conveyor branch choice
  | { kind: 'garage'; model: CarModel; label: string } // park a claimed car
  | { kind: 'seedGoal'; label: string } // after a meeting: place 1 of 2 hand goals
  | { kind: 'upgradeSpace'; model: CarModel; label: string };

export interface KanbanPending { seat: number; decision: KanbanDecision }

// ---------- state ----------

export interface GarageTile { effect: Benefit; padlock?: boolean; flipped: boolean }

export interface KanbanPlayer {
  seat: number;
  color: KanbanSeat;
  name: string;
  isBot?: boolean;
  pp: number;
  // certification marker: section 0..5, space 0..3 (space 3 = leftmost;
  // turn order within a section: higher space index acts EARLIER — index
  // is stored right-to-left so 0 = rightmost = first)
  cert: { section: number; space: number };
  training: Record<Dept, number>; // 0..6
  trainingArrival: Record<Dept, number>; // global counter at last landing (stack order, higher = on top = wins ties)
  bankedShifts: number;
  books: number;
  vouchers: number;
  speechOnBoard: number; // your tokens slotted (usable in meetings / final)
  speechAside: number; // your tokens beside the board
  genericAside: number; // generic tokens waiting for slots
  designs: string[]; // design guids on the desk
  parts: Part[]; // stored car parts
  garages: (CarModel | null)[]; // 5 slots
  garageTiles: GarageTile[]; // aligned with garages
  upgraded: { model: CarModel; part: Part }[]; // upgraded designs owned (tested = has matching car)
  doubleUpgrade: 'locked' | 'ready' | 'used';
  goals: string[]; // performance goal hand
  orders: string[]; // kanban order hand
  // day state
  workstation: { dept: Dept; slot: number } | null; // slot 0 = top (fewer shifts)
  prevDept: Dept | null; // yesterday's department (must change)
  done: boolean; // meeple laid down
  shiftsDealt: boolean; // workstation shifts handed out for today
  shiftsLeft: number;
  bankedSpent: number; // spent today (cap: total worked <= 4)
  adminDept: Dept | null; // Admin: the other department chosen this turn
  orderIssued: boolean; // once per turn
  voucherTaken: boolean; // once per turn
  gains: { bankedShifts: number; books: number; vouchers: number; generic: number }; // unusable until end of turn
  playedGoalThisMeeting: boolean;
  spokenGoals: number[]; // meeting-goal indices this player has a token on
  meetingPassed: boolean;
  claimedThisTurn: number; // pace car advance at end of turn
  awardsTaken: Dept[]; // expert awards already chosen
  factoryGoalsTaken: string[]; // factory goal tile ids taken from
}

export interface FactoryGoalTile {
  id: string; // guid
  kind: 'cars' | 'certifications' | 'upgrades';
  need: number; // requirement count
  speech: number; // generic tokens left on it
}

export interface KanbanState {
  game: 'kanban';
  seed: number;
  rolls: number;
  options: { speedCharger?: boolean; garageBonuses?: boolean; niceSandra?: boolean; planner?: boolean; expertTuning?: boolean; delayedTuning?: boolean };
  phase: 'orientation' | 'select' | 'work' | 'meeting' | 'ended';
  day: number; // 1-based
  week: number; // 0..3
  cycle: number; // 0..3
  turn: number; // seat whose action it is (or being prompted)
  players: KanbanPlayer[];
  order: number[]; // seats in the current phase's acting order
  orderIdx: number;
  pending: KanbanPending[];
  arrivalCounter: number;
  // board
  sandra: { dept: Dept | null; slot: number; desk: boolean }; // desk = Admin paperwork
  sandraDone: boolean; // acted this work phase
  displacing: CarModel | null; // car mid-displacement awaiting a branch choice
  oriented: number[]; // seats that finished orientation stage 2
  pace: number; // test track space 0..7
  meetingTriggered: boolean;
  testTrack: (CarModel | null)[]; // behind the pace car, index 0 = directly behind; holes close at end of turn
  conveyor: Record<number, CarModel | null>; // node -> car
  assemblyParts: Record<CarModel, Part[]>; // parts provided per model (max 6, unique)
  warehouses: Record<Part, number>;
  recycling: Part[]; // exactly 3, all different
  partsSupply: Record<Part, number>;
  carsSupply: Record<CarModel, number>;
  upgrades: Record<CarModel, (Part | null)[]>; // 6 spaces per model
  partValues: Record<Part, number>; // 2..6 on the value track
  partDoubled: Record<Part, boolean>;
  designRow: (string | null)[]; // 8 spots, index 0 = leftmost
  officeTop: string[]; // first-office stack refilling the top row
  officeBottom: string[];
  central: string[];
  demands: { tile: DemandDef; speech: number }[]; // 2 active
  demandStack: DemandDef[];
  kanbanDeck: string[];
  factoryGoals: FactoryGoalTile[];
  awards: Record<Dept, string[]>; // face-down award tiles per training track
  awardSpeech: Record<Dept, number>; // generic token on top of each stack
  meetingGoals: { guid: string; tokens: { seat: number; multIdx: number }[] }[]; // 4 spaces
  performanceDeck: string[];
  performanceDiscard: string[];
  finalGoal: FinalGoalDef;
  winner: KanbanSeat | null;
  finalScores: { seat: number; pp: number }[] | null;
  lastEvent: { seq: number; player: string; color: KanbanSeat; title: string; detail?: string } | null;
  eventSeq: number;
  log: string[];
}

// ---------- rng ----------

export function kbRoll(s: KanbanState): number {
  s.rolls++;
  return mulberry32((s.seed ^ (s.rolls * 0x9e3779b9)) >>> 0)();
}

export function kbShuffle<T>(s: KanbanState, arr: readonly T[]): T[] {
  s.rolls++;
  return shuffle(arr, mulberry32((s.seed ^ (s.rolls * 0x9e3779b9)) >>> 0));
}

// ---------- setup ----------

export function createKanban(
  seated: { name: string; color?: string; isBot?: boolean }[],
  seed: number,
  options: KanbanState['options'] = {},
): KanbanState {
  if (Object.values(options).some(Boolean)) {
    throw new Error('Kanban EV expansions and variants are staged but not implemented yet — start a base game.');
  }
  if (seated.length < 2 || seated.length > 4) throw new Error('Kanban EV seats 2-4 players.');

  const s = {} as KanbanState;
  s.game = 'kanban';
  s.seed = seed >>> 0;
  s.rolls = 0;
  s.options = options;
  s.day = 0;
  s.week = 0;
  s.cycle = 0;
  s.pending = [];
  s.arrivalCounter = 0;
  s.eventSeq = 0;
  s.lastEvent = null;
  s.log = [];
  s.winner = null;
  s.finalScores = null;
  s.meetingTriggered = false;

  // players
  s.players = seated.map((p, i) => ({
    seat: i,
    color: (p.color as KanbanSeat) ?? KANBAN_SEATS[i],
    name: p.name,
    isBot: p.isBot,
    pp: KANBAN_RULES.ppStart,
    cert: { section: 0, space: -1 },
    training: { RnD: 0, Assembly: 0, Logistics: 0, Design: 0, Admin: 0 },
    trainingArrival: { RnD: 0, Assembly: 0, Logistics: 0, Design: 0, Admin: 0 },
    bankedShifts: 0,
    books: 0,
    vouchers: 1,
    speechOnBoard: 1,
    speechAside: 4,
    genericAside: 0,
    designs: [],
    parts: [],
    garages: [null, null, null, null, null],
    garageTiles: BOARD.garageBonuses.basic.map((t, gi) => ({
      // padlock tile on garage 5; the rest in printed order
      effect: BOARD.garageBonuses.basic[gi < 4 ? gi : 4].effect,
      padlock: gi === 4 || undefined,
      flipped: false,
    })),
    upgraded: [],
    doubleUpgrade: 'locked' as const,
    goals: [],
    orders: [],
    workstation: null,
    prevDept: null,
    done: false,
    shiftsDealt: false,
    shiftsLeft: 0,
    bankedSpent: 0,
    adminDept: null,
    orderIssued: false,
    voucherTaken: false,
    gains: { bankedShifts: 0, books: 0, vouchers: 0, generic: 0 },
    playedGoalThisMeeting: false,
    spokenGoals: [],
    meetingPassed: false,
    claimedThisTurn: 0,
    awardsTaken: [],
    factoryGoalsTaken: [],
  }));

  // board: recycling gets 3 random different part types
  s.partsSupply = { Autopilots: 10, Batteries: 10, Bodies: 10, Drivetrains: 10, Electronics: 10, Motors: 10 };
  s.recycling = kbShuffle(s, PARTS).slice(0, 3);
  for (const p of s.recycling) s.partsSupply[p]--;
  s.warehouses = { Autopilots: 0, Batteries: 0, Bodies: 0, Drivetrains: 0, Electronics: 0, Motors: 0 };

  // cars: rulebook setup 12-13 — one per model on its entry node AND one
  // on the yellow plate ahead of it (row-2 node), confirmed by the setup
  // save (nodes 11-15 and 21-25 all occupied)
  s.carsSupply = { City: 8, SUV: 8, Truck: 8, Sport: 8, Concept: 8 };
  s.conveyor = {};
  for (const n of Object.keys(CONVEYOR)) s.conveyor[+n] = null;
  for (const m of MODELS) {
    s.conveyor[ENTRY_NODE[m]] = m;
    s.conveyor[ENTRY_NODE[m] + 10] = m;
    s.carsSupply[m] -= 2;
  }
  s.assemblyParts = { City: [], SUV: [], Truck: [], Sport: [], Concept: [] };
  s.testTrack = [];
  s.pace = KANBAN_RULES.stripedSpaces[kbRoll(s) < 0.5 ? 0 : 1];

  // upgrades
  s.upgrades = { City: [null, null, null, null, null, null], SUV: [null, null, null, null, null, null], Truck: [null, null, null, null, null, null], Sport: [null, null, null, null, null, null], Concept: [null, null, null, null, null, null] };
  s.partValues = { Autopilots: 2, Batteries: 2, Bodies: 2, Drivetrains: 2, Electronics: 2, Motors: 2 };
  s.partDoubled = { Autopilots: false, Batteries: false, Bodies: false, Drivetrains: false, Electronics: false, Motors: false };

  // designs: shuffle, 8 face up on the row, stacks of 9 (central + 2 office)
  const designDeck = kbShuffle(s, DESIGNS.map((d) => d.guid));
  s.designRow = designDeck.slice(0, 8);
  s.central = designDeck.slice(8, 17);
  s.officeTop = designDeck.slice(17, 26);
  s.officeBottom = designDeck.slice(26, 35);

  // demands
  const demandOrder = kbShuffle(s, DEMANDS);
  s.demands = demandOrder.slice(0, 2).map((tile) => ({ tile, speech: tile.speechs }));
  s.demandStack = demandOrder.slice(2);

  // kanban orders: deal 2 per player, reveal top card to stock warehouses
  let orderDeck = kbShuffle(s, KANBAN_ORDERS.map((o) => o.guid));
  for (const p of s.players) { p.orders = orderDeck.slice(0, 2); orderDeck = orderDeck.slice(2); }
  const starter = ORDER_BY_GUID[orderDeck[0]];
  for (const part of starter.parts) {
    if (s.partsSupply[part] > 0) { s.partsSupply[part]--; s.warehouses[part]++; }
  }
  s.kanbanDeck = [...orderDeck.slice(1), orderDeck[0]];

  // factory goals: 2 random per group; speech tokens by player count
  const goalSpeech = s.players.length === 4 ? [2, 2] : s.players.length === 3 ? [2, 1] : [1, 1];
  s.factoryGoals = [];
  // requirement pairs per group (lower goes on top with more tokens)
  const FACTORY: Record<FactoryGoalTile['kind'], number[]> = { cars: [2, 3, 4, 5], upgrades: [2, 3, 4, 5], certifications: [2, 3, 4, 5] };
  for (const kind of ['cars', 'upgrades', 'certifications'] as const) {
    const pair = kbShuffle(s, FACTORY[kind]).slice(0, 2).sort((a, b) => a - b);
    s.factoryGoals.push({ id: `${kind}-${pair[0]}`, kind, need: pair[0], speech: goalSpeech[0] });
    s.factoryGoals.push({ id: `${kind}-${pair[1]}`, kind, need: pair[1], speech: goalSpeech[1] });
  }

  // awards: 3 random face-down per department (2 at 2-3p), 1 generic token on each stack
  const awardCount = s.players.length === 4 ? 3 : 2;
  let awardPool = kbShuffle(s, layout.AWARDS.Elements);
  s.awards = { RnD: [], Assembly: [], Logistics: [], Design: [], Admin: [] };
  s.awardSpeech = { RnD: 1, Assembly: 1, Logistics: 1, Design: 1, Admin: 1 };
  for (const d of DEPTS) { s.awards[d] = awardPool.slice(0, awardCount); awardPool = awardPool.slice(awardCount); }

  // performance goals: 4 face up, 3 per hand
  let perf = kbShuffle(s, PERFORMANCE_GOALS.map((g) => g.guid));
  s.meetingGoals = perf.slice(0, 4).map((guid) => ({ guid, tokens: [] }));
  perf = perf.slice(4);
  for (const p of s.players) { p.goals = perf.slice(0, 3); perf = perf.slice(3); }
  s.performanceDeck = perf;
  s.performanceDiscard = [];

  // final goal
  s.finalGoal = FINAL_GOALS[Math.floor(kbRoll(s) * FINAL_GOALS.length)];

  // sandra at her desk
  s.sandra = { dept: null, slot: 0, desk: true };
  s.sandraDone = false;
  s.displacing = null;
  s.oriented = [];

  // orientation: random start order; each picks a cert space
  s.order = kbShuffle(s, s.players.map((p) => p.seat));
  s.orderIdx = 0;
  s.phase = 'orientation';
  s.turn = s.order[0];
  s.pending = [{ seat: s.turn, decision: { kind: 'certSpace', section: 0, label: 'Choose your starting spot on the Certification track' } }];
  s.log.push('New employee orientation: place your certification marker.');
  return s;
}

// certification-track turn order: within/among sections, further right and
// further along acts first. space index 0 = rightmost of its section.
export function certOrder(s: KanbanState): number[] {
  return s.players
    .map((p) => p.seat)
    .sort((a, b) => {
      const pa = s.players[a].cert, pb = s.players[b].cert;
      if (pa.section !== pb.section) return pb.section - pa.section;
      return pa.space - pb.space;
    });
}

export function isCertified(p: KanbanPlayer, d: Dept): boolean {
  return p.training[d] >= KANBAN_RULES.certifiedAt;
}
export function certCount(p: KanbanPlayer): number {
  return DEPTS.filter((d) => isCertified(p, d)).length;
}
export function designCapacity(p: KanbanPlayer): number {
  return KANBAN_RULES.designSlots + (isCertified(p, 'Design') ? 1 : 0);
}
export function partCapacity(p: KanbanPlayer): number {
  return KANBAN_RULES.partSlots + (isCertified(p, 'Logistics') ? 1 : 0);
}
export function speechCapacity(p: KanbanPlayer): number {
  return KANBAN_RULES.speechSlots + (isCertified(p, 'Admin') ? 1 : 0);
}
/** tested designs: upgraded designs whose model matches a garaged car */
export function testedDesigns(p: KanbanPlayer): { model: CarModel; part: Part }[] {
  return p.upgraded.filter((u) => p.garages.includes(u.model));
}

// ---------- views ----------

export interface KanbanPlayerView {
  seat: number;
  color: KanbanSeat;
  name: string;
  pp: number;
  cert: { section: number; space: number };
  training: Record<Dept, number>;
  bankedShifts: number;
  books: number;
  vouchers: number;
  speechOnBoard: number;
  speechAside: number;
  genericAside: number;
  designs: string[]; // public — the desk is open information
  parts: Part[];
  garages: (CarModel | null)[];
  garageTiles: GarageTile[];
  upgraded: { model: CarModel; part: Part }[];
  tested: { model: CarModel; part: Part }[];
  doubleUpgrade: KanbanPlayer['doubleUpgrade'];
  workstation: KanbanPlayer['workstation'];
  done: boolean;
  shiftsLeft: number;
  adminDept: Dept | null;
  orderIssued: boolean;
  voucherTaken: boolean;
  gains: KanbanPlayer['gains'];
  playedGoalThisMeeting: boolean;
  meetingPassed: boolean;
  goalCount: number;
  orderCount: number;
  // private
  goals?: string[];
  orders?: string[];
}

export interface KanbanView {
  game: 'kanban';
  you: number | null;
  phase: KanbanState['phase'];
  options: KanbanState['options'];
  day: number;
  week: number;
  cycle: number;
  turn: number;
  order: number[];
  players: KanbanPlayerView[];
  sandra: KanbanState['sandra'];
  pace: number;
  meetingTriggered: boolean;
  testTrack: (CarModel | null)[];
  conveyor: Record<number, CarModel | null>;
  assemblyParts: Record<CarModel, Part[]>;
  warehouses: Record<Part, number>;
  recycling: Part[];
  partsSupply: Record<Part, number>;
  carsSupply: Record<CarModel, number>;
  upgrades: Record<CarModel, (Part | null)[]>;
  partValues: Record<Part, number>;
  partDoubled: Record<Part, boolean>;
  designRow: (string | null)[];
  centralTop: string | null;
  officeTopTop: string | null;
  officeBottomTop: string | null;
  centralCount: number;
  demands: { model: CarModel; speech: number }[];
  factoryGoals: FactoryGoalTile[];
  awardSpeech: Record<Dept, number>;
  awardsLeft: Record<Dept, number>;
  meetingGoals: { guid: string; tokens: { seat: number; multIdx: number }[] }[];
  finalGoal: FinalGoalDef;
  pending: KanbanPending | null;
  winner: KanbanSeat | null;
  finalScores: KanbanState['finalScores'];
  lastEvent: KanbanState['lastEvent'];
  log: string[];
}

export function kanbanViewFor(s: KanbanState, seat: number | null | 'dev'): KanbanView {
  const me = typeof seat === 'number' ? seat : null;
  const dev = seat === 'dev';
  return {
    game: 'kanban',
    you: me,
    phase: s.phase,
    options: s.options,
    day: s.day,
    week: s.week,
    cycle: s.cycle,
    turn: s.turn,
    order: s.order,
    players: s.players.map((p) => {
      const v: KanbanPlayerView = {
        seat: p.seat, color: p.color, name: p.name,
        pp: p.pp, cert: p.cert, training: p.training,
        bankedShifts: p.bankedShifts, books: p.books, vouchers: p.vouchers,
        speechOnBoard: p.speechOnBoard, speechAside: p.speechAside, genericAside: p.genericAside,
        designs: p.designs, parts: p.parts,
        garages: p.garages, garageTiles: p.garageTiles,
        upgraded: p.upgraded, tested: testedDesigns(p),
        doubleUpgrade: p.doubleUpgrade,
        workstation: p.workstation, done: p.done, shiftsLeft: p.shiftsLeft,
        adminDept: p.adminDept, orderIssued: p.orderIssued, voucherTaken: p.voucherTaken,
        gains: p.gains,
        playedGoalThisMeeting: p.playedGoalThisMeeting, meetingPassed: p.meetingPassed,
        goalCount: p.goals.length, orderCount: p.orders.length,
      };
      if (dev || p.seat === me) { v.goals = p.goals; v.orders = p.orders; }
      return v;
    }),
    sandra: s.sandra,
    pace: s.pace,
    meetingTriggered: s.meetingTriggered,
    testTrack: s.testTrack,
    conveyor: s.conveyor,
    assemblyParts: s.assemblyParts,
    warehouses: s.warehouses,
    recycling: s.recycling,
    partsSupply: s.partsSupply,
    carsSupply: s.carsSupply,
    upgrades: s.upgrades,
    partValues: s.partValues,
    partDoubled: s.partDoubled,
    designRow: s.designRow,
    centralTop: s.central[0] ?? null,
    officeTopTop: s.officeTop[0] ?? null,
    officeBottomTop: s.officeBottom[0] ?? null,
    centralCount: s.central.length,
    demands: s.demands.map((d) => ({ model: d.tile.model, speech: d.speech })),
    factoryGoals: s.factoryGoals,
    awardSpeech: s.awardSpeech,
    awardsLeft: { RnD: s.awards.RnD.length, Assembly: s.awards.Assembly.length, Logistics: s.awards.Logistics.length, Design: s.awards.Design.length, Admin: s.awards.Admin.length },
    meetingGoals: s.meetingGoals,
    finalGoal: s.finalGoal,
    pending: s.pending[0] ?? null,
    winner: s.winner,
    finalScores: s.finalScores,
    lastEvent: s.lastEvent,
    log: s.log.slice(-40),
  };
}
