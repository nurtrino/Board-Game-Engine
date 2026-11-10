// Shared types and small pure helpers for the battle stage. Nothing here touches the DOM or three.
import { AXIS_INDEX, POWERS, UNITS, type AxisPending, type AxisView, type PowerKey, type UnitKey } from '@bge/shared';

export type Combat = NonNullable<AxisView['combat']>;
export type Battle = Combat['battle'];
export type BattleUnit = Battle['attacker'][number];
export type BattleEvent = Battle['log'][number];
export type RollDetail = BattleEvent['rolls'][number];
export type Decision = NonNullable<Battle['decision']>;
export type CasualtyDecision = Extract<Decision, { type: 'casualties' }>;
export type Side = 'attacker' | 'defender';
export type Combatant = PowerKey | 'china';
export type LastBattle = NonNullable<AxisView['lastBattle']>;

export const CHINA_HEX = '#8fbf6f';
export const other = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');

export const isPower = (p: string | null | undefined): p is PowerKey =>
  p != null && Object.prototype.hasOwnProperty.call(POWERS, p);

/** The United States commands every Chinese unit. */
export function controllerOf(power: string | null | undefined): PowerKey | null {
  if (power == null) return null;
  if (power === 'china') return 'usa';
  return isPower(power) ? power : null;
}

export function combatantName(power: string | null | undefined): string {
  if (power === 'china') return 'China';
  return isPower(power) ? POWERS[power].name : 'No defender';
}

/** The printed piece colour. Used for the models and flags on the battlefield. */
export function combatantHex(power: string | null | undefined): string {
  if (power === 'china') return CHINA_HEX;
  return isPower(power) ? POWERS[power].color : '#8a8a8a';
}

// What a nation's vehicles and uniforms are painted on the battlefield: the box colours, pushed
// far enough apart that two armies never read as one.
const PAINT: Record<string, string> = {
  germany: '#737a84', ussr: '#86423a', japan: '#c58a3c', uk: '#b5a06c', italy: '#86684a', usa: '#5c7c42', china: '#9ab86e',
};
export const combatantPaint = (power: string | null | undefined): string => (power && PAINT[power]) || '#8a8a8a';

// Piece colours are too dark to read as a hairline on black, so outlines use a lighter companion.
const INK: Record<string, string> = {
  germany: '#c3c6c4', ussr: '#e27777', japan: '#efa858', uk: '#dfbd83', italy: '#d09a67', usa: '#74c879', china: '#f0c86f',
};
/** Outline colour for a nation in the interface. Only ever an outline, never a fill or a dot. */
export const combatantInk = (power: string | null | undefined): string => (power && INK[power]) || '#b4bab4';

export function spaceName(id: string | null | undefined): string {
  if (!id) return '';
  const t = AXIS_INDEX.territory[id];
  if (t) return t.name;
  const z = AXIS_INDEX.seaZone[id];
  if (z) return `Sea zone ${z.n}`;
  return id;
}

export const unitName = (key: string): string => (UNITS as Record<string, { name: string } | undefined>)[key]?.name ?? key;

export function plural(key: string, n: number): string {
  const name = unitName(key);
  if (n === 1) return name;
  if (name === 'Infantry' || name === 'Artillery') return name;
  return `${name}s`;
}

export const unitDomain = (key: string) => (UNITS as Record<string, { domain: string } | undefined>)[key]?.domain ?? 'land';

/** Fixed display order: the line first, support behind, air last. */
export const UNIT_ORDER: UnitKey[] = [
  'infantry', 'artillery', 'tank', 'aaGun', 'factory',
  'destroyer', 'cruiser', 'battleship', 'carrier', 'submarine', 'transport',
  'fighter', 'bomber',
];
export const orderOf = (key: string) => {
  const i = UNIT_ORDER.indexOf(key as UnitKey);
  return i < 0 ? 99 : i;
};

export function defenderOf(battle: Battle): Combatant | null {
  const alive = battle.defender.find((u) => u.hp > 0) ?? battle.defender[0];
  return (alive?.power as Combatant | undefined) ?? null;
}

export interface ForceRow {
  key: UnitKey;
  alive: number;
  lost: number;
  damaged: number;
  submerged: number;
}

/** One row per unit type on a side: standing, lost, damaged and submerged counts. */
export function forceRows(units: readonly BattleUnit[]): ForceRow[] {
  const rows = new Map<UnitKey, ForceRow>();
  for (const u of units) {
    const row = rows.get(u.key) ?? { key: u.key, alive: 0, lost: 0, damaged: 0, submerged: 0 };
    if (u.hp > 0) {
      row.alive += 1;
      if (u.hp < u.maxHp) row.damaged += 1;
      if (u.submerged) row.submerged += 1;
    } else row.lost += 1;
    rows.set(u.key, row);
  }
  return [...rows.values()].sort((a, b) => orderOf(a.key) - orderOf(b.key));
}

// ---------- who decides ----------

const liveDecision = (pendings: readonly AxisPending[]) =>
  pendings.find((p) => p.kind.startsWith('battle-') && p.kind !== 'battle-continue');

type AuthorityView = Pick<AxisView, 'pendings' | 'combat' | 'active'>;

/** Rolls belong to the power whose turn it is (it is always the attacker's controller). */
export function rollAuthority(view: AuthorityView): PowerKey | null {
  return view.active ?? controllerOf(view.combat?.attacker);
}

/** The power that must answer the open casualty, submerge or retreat decision. */
export function decisionAuthority(view: AuthorityView): PowerKey | null {
  const combat = view.combat;
  const decision = combat?.battle.decision;
  if (!combat || !decision) return null;
  const pending = liveDecision(view.pendings);
  if (pending) return controllerOf(pending.power);
  if (decision.type === 'retreat' || decision.side === 'attacker') return controllerOf(combat.attacker);
  return controllerOf(defenderOf(combat.battle));
}

/** The power that still has to press continue for one side of a finished battle. */
export function continueAuthority(view: AuthorityView, side: Side): PowerKey | null {
  const pending = view.pendings.find((p) => p.kind === 'battle-continue' && p.data.side === side);
  if (pending) return controllerOf(pending.power);
  const combat = view.combat;
  if (!combat) return null;
  return side === 'attacker' ? controllerOf(combat.attacker) : controllerOf(defenderOf(combat.battle));
}

export const controls = (controlled: readonly PowerKey[], power: PowerKey | null | undefined): power is PowerKey =>
  power != null && controlled.includes(power);

// ---------- outcome copy ----------

export function outcomeLine(status: string, attacker: string, space: string, retreatTo?: string | null): string {
  const where = spaceName(space);
  const who = combatantName(attacker);
  switch (status) {
    case 'attacker_captured': return `${who} takes ${where}`;
    case 'attacker_cleared': return `${who} clears ${where}`;
    case 'defender_won': return `${where} holds`;
    case 'mutual': return 'Both forces destroyed';
    case 'standoff': return 'Standoff';
    case 'retreated':
      if (typeof retreatTo === 'string') return `${who} retreats to ${spaceName(retreatTo)}`;
      if (retreatTo === null) return `${who} aircraft break off`;
      return `${who} retreats`;
    case 'raid_resolved': return `Bombing raid on ${where}`;
    case 'rocket_resolved': return `Rocket strike on ${where}`;
    default: return where;
  }
}
