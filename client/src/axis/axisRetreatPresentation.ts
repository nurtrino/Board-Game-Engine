import type { AxisAction, AxisRetreatPolicy } from '@bge/shared';

export type AxisRetreatSelection = string | null | undefined;

export interface AxisRetreatCombat {
  id: number;
  visualSeq: number;
  space: string;
  retreatPolicy: AxisRetreatPolicy | null;
  retreatTo?: string | null;
  battle: {
    decision: { type: string; terminalStandoff?: true } | null;
  };
}

export interface AxisRetreatCopy {
  title: string;
  body: string;
  remainLabel: string;
  retreatLabel: string;
  routePrompt: string | null;
  noRouteReason: string | null;
  airOnly: boolean;
  mixedBeach: boolean;
  terminalTransportStandoff: boolean;
}

export type AxisRetreatAction = Extract<AxisAction, { type: 'battleRetreat'; retreat: true }>;
export type AxisRemainAction = Extract<AxisAction, { type: 'battleRetreat'; retreat: false }>;

const hasRetreatDecision = (combat: AxisRetreatCombat): boolean =>
  combat.battle.decision?.type === 'retreat';

/**
 * A stable identity for controller-local route state. It changes whenever the
 * battle generation or any authoritative retreat fact changes, so a selection
 * from an older volley can never leak into the next decision.
 */
export function axisRetreatSelectionKey(combat: AxisRetreatCombat): string {
  const policy = combat.retreatPolicy;
  return JSON.stringify([
    combat.id,
    combat.visualSeq,
    combat.battle.decision?.type ?? null,
    combat.battle.decision?.terminalStandoff === true,
    policy?.mode ?? null,
    policy?.canRetreat ?? false,
    policy?.destinationRequired ?? false,
    policy?.destinations ?? [],
    policy?.movingUnitUids ?? [],
    policy?.aircraftUnitUids ?? [],
    policy?.committedBeachUnitUids ?? [],
    policy?.submergedUnitUids ?? [],
  ]);
}

/** Deterministic reconnect default: one exact route may be preselected, but
 * multiple routes always require a fresh choice. null is reserved for the
 * authoritative aircraft-only disengagement action. */
export function initialAxisRetreatSelection(
  policy: AxisRetreatPolicy | null,
): AxisRetreatSelection {
  if (!policy?.canRetreat) return undefined;
  if (!policy.destinationRequired) return null;
  return policy.destinations.length === 1 ? policy.destinations[0] : undefined;
}

/** Hide a stale local choice immediately, before React's reset effect runs. */
export function normalizeAxisRetreatSelection(
  policy: AxisRetreatPolicy | null,
  selection: AxisRetreatSelection,
): AxisRetreatSelection {
  if (!policy?.canRetreat) return undefined;
  if (!policy.destinationRequired) return null;
  if (typeof selection === 'string' && policy.destinations.includes(selection)) return selection;
  return initialAxisRetreatSelection(policy);
}

export function axisRetreatCopy(combat: AxisRetreatCombat): AxisRetreatCopy {
  const policy = combat.retreatPolicy;
  const terminalTransportStandoff = combat.battle.decision?.type === 'retreat'
    && combat.battle.decision.terminalStandoff === true;
  const mixedBeach = policy?.mode === 'partial-amphibious';
  const airOnly = Boolean(policy?.canRetreat && !policy.destinationRequired);
  const noRouteReason = !policy
    ? 'Retreat routes are not available for this battle state.'
    : !policy.canRetreat
      ? policy.destinationRequired
        ? 'No adjacent friendly ingress route is legal for this force. The attack must remain.'
        : 'No surviving attacking unit can withdraw from this battle.'
      : null;
  const routePrompt = policy?.canRetreat && policy.destinationRequired
    ? policy.destinations.length === 1
      ? 'Only legal retreat route - review it, then confirm.'
      : 'Choose one exact destination for every withdrawing land or sea unit.'
    : null;

  if (terminalTransportStandoff) {
    return {
      title: 'Transport standoff',
      body: 'Neither transport group can score a hit. Remain together in the contested sea zone, or retreat every attacking transport to one exact legal sea zone.',
      remainLabel: 'REMAIN',
      retreatLabel: 'RETREAT',
      routePrompt,
      noRouteReason,
      airOnly,
      mixedBeach,
      terminalTransportStandoff,
    };
  }
  if (mixedBeach) {
    return {
      title: 'Withdraw the overland force?',
      body: 'All overland units and aircraft withdraw together. Seaborne troops already committed to the beach remain and must keep fighting.',
      remainLabel: 'KEEP FIGHTING',
      retreatLabel: airOnly ? 'DISENGAGE AIRCRAFT' : 'WITHDRAW OVERLAND + AIR',
      routePrompt,
      noRouteReason,
      airOnly,
      mixedBeach,
      terminalTransportStandoff,
    };
  }
  if (airOnly) {
    return {
      title: 'Disengage the aircraft?',
      body: 'The aircraft leave combat but remain over the battle space. They must complete a legal landing during Noncombat Move.',
      remainLabel: 'PRESS THE ATTACK',
      retreatLabel: 'DISENGAGE AIRCRAFT',
      routePrompt: null,
      noRouteReason,
      airOnly,
      mixedBeach,
      terminalTransportStandoff,
    };
  }
  return {
    title: 'Fight another round?',
    body: 'Pressing the attack starts another volley. A retreat moves every surviving land or sea attacker together to the exact route you confirm; aircraft disengage over the battle space.',
    remainLabel: 'PRESS THE ATTACK',
    retreatLabel: 'RETREAT',
    routePrompt,
    noRouteReason,
    airOnly,
    mixedBeach,
    terminalTransportStandoff,
  };
}

export function buildAxisRetreatAction(
  combat: AxisRetreatCombat,
  selection: AxisRetreatSelection,
  battleVisualReady: boolean,
): AxisRetreatAction | null {
  const policy = combat.retreatPolicy;
  if (!battleVisualReady || !hasRetreatDecision(combat) || !policy?.canRetreat) return null;
  const destination = normalizeAxisRetreatSelection(policy, selection);
  if (policy.destinationRequired) {
    if (typeof destination !== 'string' || !policy.destinations.includes(destination)) return null;
    return {
      type: 'battleRetreat',
      retreat: true,
      destination,
      combatId: combat.id,
      visualSeq: combat.visualSeq,
    };
  }
  if (destination !== null) return null;
  return {
    type: 'battleRetreat',
    retreat: true,
    destination: null,
    combatId: combat.id,
    visualSeq: combat.visualSeq,
  };
}

export function buildAxisRemainAction(
  combat: AxisRetreatCombat,
  battleVisualReady: boolean,
): AxisRemainAction | null {
  if (!battleVisualReady || !hasRetreatDecision(combat)) return null;
  return {
    type: 'battleRetreat',
    retreat: false,
    combatId: combat.id,
    visualSeq: combat.visualSeq,
  };
}

export function axisRetreatOutcomeText(
  attackerName: string,
  retreatTo: string | null | undefined,
  battleSpace: string,
  nameSpace: (space: string) => string,
): string {
  if (typeof retreatTo === 'string') return `${attackerName} retreats to ${nameSpace(retreatTo)}`;
  if (retreatTo === null) return `${attackerName} aircraft disengage over ${nameSpace(battleSpace)}`;
  return `${attackerName} retreats`;
}

