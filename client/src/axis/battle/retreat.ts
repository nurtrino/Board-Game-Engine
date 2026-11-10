// Retreat choices. The engine derives the legal withdrawal (view.combat.retreatPolicy); this module
// only turns it into copy, a remembered selection and the exact action to send.
import type { AxisAction, AxisRetreatPolicy } from '@bge/shared';
import { spaceName } from './model';

export type RetreatSelection = string | null | undefined;

export interface RetreatCombat {
  id: number;
  visualSeq: number;
  space: string;
  retreatPolicy: AxisRetreatPolicy | null;
  battle: { decision: { type: string; terminalStandoff?: true } | null };
}

export type RetreatAction = Extract<AxisAction, { type: 'battleRetreat'; retreat: true }>;
export type RemainAction = Extract<AxisAction, { type: 'battleRetreat'; retreat: false }>;

const deciding = (combat: RetreatCombat) => combat.battle.decision?.type === 'retreat';

/** Changes whenever the decision or any fact behind it changes, so an old choice never leaks forward. */
export function retreatKey(combat: RetreatCombat): string {
  const p = combat.retreatPolicy;
  return JSON.stringify([
    combat.id, combat.visualSeq, combat.battle.decision?.type ?? null,
    combat.battle.decision?.terminalStandoff === true,
    p?.mode ?? null, p?.canRetreat ?? false, p?.destinationRequired ?? false, p?.destinations ?? [],
  ]);
}

/** A single legal route is preselected. Several routes always need a fresh choice. null = aircraft only. */
export function initialRetreatSelection(policy: AxisRetreatPolicy | null): RetreatSelection {
  if (!policy?.canRetreat) return undefined;
  if (!policy.destinationRequired) return null;
  return policy.destinations.length === 1 ? policy.destinations[0] : undefined;
}

export function normalizeRetreatSelection(policy: AxisRetreatPolicy | null, selection: RetreatSelection): RetreatSelection {
  if (!policy?.canRetreat) return undefined;
  if (!policy.destinationRequired) return null;
  if (typeof selection === 'string' && policy.destinations.includes(selection)) return selection;
  return initialRetreatSelection(policy);
}

export interface RetreatCopy {
  title: string;
  body: string;
  stay: string;
  leave: string;
  /** Shown above the route list when a destination must be chosen. */
  routePrompt: string | null;
  /** Why retreat is not possible, or null. */
  blocked: string | null;
  airOnly: boolean;
}

export function retreatCopy(combat: RetreatCombat): RetreatCopy {
  const p = combat.retreatPolicy;
  const standoff = deciding(combat) && combat.battle.decision?.terminalStandoff === true;
  const partial = p?.mode === 'partial-amphibious';
  const airOnly = Boolean(p?.canRetreat && !p.destinationRequired);
  const blocked = !p
    ? 'No retreat route is known for this battle.'
    : !p.canRetreat
      ? p.destinationRequired
        ? 'No friendly space this force came from is open. It has to stay.'
        : 'No surviving attacker can withdraw.'
      : null;
  const routePrompt = p?.canRetreat && p.destinationRequired
    ? (p.destinations.length === 1 ? 'One route is open.' : 'Choose where the force retreats to.')
    : null;
  if (standoff) {
    return {
      title: 'Transport standoff',
      body: 'Neither transport group can score a hit. Stay in the sea zone or withdraw every transport to one sea zone.',
      stay: 'Stay', leave: 'Retreat', routePrompt, blocked, airOnly,
    };
  }
  if (partial) {
    return {
      title: 'Withdraw the overland force?',
      body: 'Overland units and aircraft withdraw together. Troops landed from transports stay and keep fighting.',
      stay: 'Keep fighting', leave: airOnly ? 'Break off aircraft' : 'Withdraw overland force', routePrompt, blocked, airOnly,
    };
  }
  if (airOnly) {
    return {
      title: 'Break off the aircraft?',
      body: 'The aircraft leave the fight and stay over this space. They land during noncombat movement.',
      stay: 'Press the attack', leave: 'Break off aircraft', routePrompt: null, blocked, airOnly,
    };
  }
  return {
    title: 'Fight another round?',
    body: 'Pressing the attack starts another round. A retreat moves every surviving land or sea unit to one space together. Aircraft break off and land later.',
    stay: 'Press the attack', leave: 'Retreat', routePrompt, blocked, airOnly,
  };
}

export function retreatLabel(combat: RetreatCombat, selection: RetreatSelection): string {
  const copy = retreatCopy(combat);
  const p = combat.retreatPolicy;
  if (!p?.canRetreat) return 'Retreat not possible';
  if (p.destinationRequired && typeof selection !== 'string') return 'Choose a route';
  if (typeof selection === 'string') return `${copy.leave} to ${spaceName(selection)}`;
  return copy.leave;
}

export function buildRetreatAction(combat: RetreatCombat, selection: RetreatSelection): RetreatAction | null {
  const p = combat.retreatPolicy;
  if (!deciding(combat) || !p?.canRetreat) return null;
  const destination = normalizeRetreatSelection(p, selection);
  if (p.destinationRequired) {
    if (typeof destination !== 'string' || !p.destinations.includes(destination)) return null;
    return { type: 'battleRetreat', retreat: true, destination, combatId: combat.id, visualSeq: combat.visualSeq };
  }
  if (destination !== null) return null;
  return { type: 'battleRetreat', retreat: true, destination: null, combatId: combat.id, visualSeq: combat.visualSeq };
}

export function buildRemainAction(combat: RetreatCombat): RemainAction | null {
  if (!deciding(combat)) return null;
  return { type: 'battleRetreat', retreat: false, combatId: combat.id, visualSeq: combat.visualSeq };
}
