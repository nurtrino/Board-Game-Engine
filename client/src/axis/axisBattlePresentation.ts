export interface AxisBattlePresentationLoad {
  cinematic: boolean;
  dice: boolean;
  failed: boolean;
}

/**
 * Identifies one mounted pair of battlefield + dice renderers. The epoch is
 * advanced for retries, style changes, combat changes, and visibility loss so
 * callbacks retained by an abandoned async renderer cannot unlock its
 * replacement.
 */
export interface BattlePresentationSession {
  combatId: number;
  sessionEpoch: number;
}

/** One exact authoritative state painted within a renderer session. */
export interface BattlePresentationGeneration extends BattlePresentationSession {
  visualSeq: number;
}

export function battlePresentationSessionAccepts(
  expected: BattlePresentationSession,
  current: BattlePresentationSession,
  pageVisible: boolean,
): boolean {
  return pageVisible
    && expected.combatId === current.combatId
    && expected.sessionEpoch === current.sessionEpoch;
}

export function battlePresentationGenerationAccepts(
  expected: BattlePresentationGeneration,
  current: BattlePresentationGeneration,
  pageVisible: boolean,
): boolean {
  return battlePresentationSessionAccepts(expected, current, pageVisible)
    && expected.visualSeq === current.visualSeq;
}

export interface BattlePresentationUnitSnapshot {
  uid: number;
  key: string;
  side: 'attacker' | 'defender';
  hp: number;
  submerged: boolean;
}

export interface BattlePresentationSnapshot {
  units: BattlePresentationUnitSnapshot[];
  status: string;
}

export interface BattleVisualTransition {
  destroyedIds: string[];
  damagedIds: string[];
  submergedIds: string[];
  retreatingIds: string[];
  durationMs: number;
}

/** The server may unlock a volley only when both original renderers are live. */
export function battlePresentationReady(load: AxisBattlePresentationLoad): boolean {
  return load.cinematic && load.dice && !load.failed;
}

/**
 * Diff two authoritative battle snapshots into the visual beat the shared
 * battlefield must finish before another action can advance combat.
 */
export function planBattleVisualTransition(
  previous: BattlePresentationSnapshot,
  current: BattlePresentationSnapshot,
  domain: 'land' | 'sea',
): BattleVisualTransition {
  const before = new Map(previous.units.map((unit) => [unit.uid, unit]));
  const after = new Map(current.units.map((unit) => [unit.uid, unit]));
  const destroyedIds: string[] = [];
  const damagedIds: string[] = [];
  const submergedIds: string[] = [];
  const retreatingIds: string[] = [];

  for (const unit of current.units) {
    const prior = before.get(unit.uid);
    if (!prior) continue;
    if (prior.hp > 0 && unit.hp <= 0) destroyedIds.push(String(unit.uid));
    else if (unit.hp > 0 && unit.hp < prior.hp) damagedIds.push(String(unit.uid));
    if (!prior.submerged && unit.submerged) submergedIds.push(String(unit.uid));
  }

  // Partial amphibious withdrawal moves units out of the active attacker list.
  // Keep those previous models around for one beat so they can visibly leave.
  for (const unit of previous.units) {
    if (unit.hp > 0 && !after.has(unit.uid)) retreatingIds.push(String(unit.uid));
  }
  // A full retreat leaves survivors in BattleState until the report is closed.
  if (previous.status !== 'retreated' && current.status === 'retreated') {
    for (const unit of current.units) {
      if (unit.side === 'attacker' && unit.hp > 0) retreatingIds.push(String(unit.uid));
    }
  }

  const unique = (values: string[]) => [...new Set(values)];
  const destroyed = unique(destroyedIds);
  const damaged = unique(damagedIds);
  const submerged = unique(submergedIds);
  const retreating = unique(retreatingIds);
  const durationMs = Math.max(
    destroyed.length > 0 ? (domain === 'sea' ? 6_100 : 2_200) : 0,
    damaged.length > 0 ? 900 : 0,
    submerged.length > 0 ? 1_800 : 0,
    retreating.length > 0 ? 1_800 : 0,
  );

  return {
    destroyedIds: destroyed,
    damagedIds: damaged,
    submergedIds: submerged,
    retreatingIds: retreating,
    durationMs,
  };
}

/** Dice Box notation that preserves the authoritative engine values exactly. */
export function diceNotation(values: readonly number[]): string | null {
  if (values.length === 0) return null;
  return `${values.length}d6@${values.join(',')}`;
}

/**
 * The predetermined-outcome DiceBox returns one ordered roll collection. Keep
 * its untyped package boundary here so a malformed or changed renderer result
 * can never acknowledge an authoritative battle salvo.
 */
export function physicalDiceResultValues(result: unknown): number[] | null {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return null;
  const sets = (result as { sets?: unknown }).sets;
  if (!Array.isArray(sets) || sets.length === 0) return null;

  const values: number[] = [];
  for (const set of sets) {
    if (set === null || typeof set !== 'object' || Array.isArray(set)) return null;
    const rolls = (set as { rolls?: unknown }).rolls;
    if (!Array.isArray(rolls)) return null;
    for (const roll of rolls) {
      if (roll === null || typeof roll !== 'object' || Array.isArray(roll)) return null;
      const value = (roll as { value?: unknown }).value;
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 6) return null;
      values.push(value);
    }
  }
  return values.length > 0 ? values : null;
}

/** Only exact, ordered physical faces may settle the current dice salvo. */
export function physicalDiceResultMatches(
  expected: readonly number[],
  result: unknown,
): boolean {
  const actual = physicalDiceResultValues(result);
  return actual !== null
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}
