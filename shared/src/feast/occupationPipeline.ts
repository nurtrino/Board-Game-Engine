import {
  feastOccupationRule,
  type FeastOccupationEvent,
  type FeastOccupationHook,
  type FeastOccupationTrigger,
} from './occupationRules.js';
import {
  feastPlanOccupationClause, feastPlanOccupationEvent,
  type FeastOccupationEventContext, type FeastOccupationPlan,
  type FeastOccupationUsageProvenance, type FeastOccupationUsageRecord,
} from './occupationRuntime.js';
import type {
  FeastContinuation, FeastJsonValue, FeastOccupationContextState,
  FeastOccupationPlanKey, FeastState,
} from './types.js';

/** Structural bridge from persisted JSON provenance to the pure runtime. */
export function feastOccupationUsage(state: FeastState): FeastOccupationUsageProvenance {
  return { records: (state.occupationUsage ?? []) as FeastOccupationUsageRecord[] };
}

export function feastOccupationContext(
  state: FeastState, seat: number, hook: FeastOccupationHook,
  event: FeastOccupationEvent, window: FeastOccupationTrigger['window'],
  fields: Record<string, FeastJsonValue> = {},
  extra: Partial<Omit<FeastOccupationContextState, 'hook' | 'event' | 'window' | 'fields'>> = {},
): FeastOccupationContextState {
  return {
    hook, event, window, round: state.round,
    fields: { seat, round: state.round, ...fields }, ...extra,
  };
}

export function feastRuntimeOccupationContext(context: FeastOccupationContextState): FeastOccupationEventContext {
  return context as unknown as FeastOccupationEventContext;
}

function reducerPlan(plan: FeastOccupationPlan): boolean {
  // Runtime planning retains invalid plans for diagnostics and registry
  // audits. The live reducer must never render those as actionable choices:
  // unavailable optional effects are simply absent, and mandatory effects
  // cannot pause the game on an impossible confirmation.
  if (!plan.valid) return false;
  // Mandatory passive values are consumed by the dedicated action/die/loot/
  // placement/scoring queries. Optional modifiers still need an activation
  // decision before those queries may include them.
  return !(plan.kind === 'modifier' && plan.requirement === 'mandatory');
}

export function feastOccupationPlansForEvent(
  state: FeastState, context: FeastOccupationContextState,
): readonly FeastOccupationPlan[] {
  const plans = feastPlanOccupationEvent(
    state, feastRuntimeOccupationContext(context), feastOccupationUsage(state),
  ).plans.filter(reducerPlan);
  return context.hook === 'anytime' && context.cardId
    ? plans.filter((plan) => plan.cardId === context.cardId)
    : plans;
}

export function feastOccupationPlanKeysForEvent(
  state: FeastState, context: FeastOccupationContextState,
): FeastOccupationPlanKey[] {
  return feastOccupationPlansForEvent(state, context).map((plan) => ({
    cardId: plan.cardId, clauseId: plan.clauseId,
  }));
}

export function feastOccupationPlanForKey(
  state: FeastState, context: FeastOccupationContextState, key: FeastOccupationPlanKey,
): FeastOccupationPlan | null {
  const rule = feastOccupationRule(key.cardId);
  const clause = rule?.clauses.find((candidate) => candidate.id === key.clauseId);
  if (!rule || !clause) return null;
  const plan = feastPlanOccupationClause(
    state, Number(context.fields.seat ?? state.turn), rule, clause,
    feastRuntimeOccupationContext(context), feastOccupationUsage(state),
  );
  return plan && reducerPlan(plan) ? plan : null;
}

export function feastOccupationEventContinuation(
  state: FeastState, context: FeastOccupationContextState, resume: FeastContinuation,
): Extract<FeastContinuation, { kind: 'occupation-event' }> | null {
  const plans = feastOccupationPlanKeysForEvent(state, context);
  return plans.length ? { kind: 'occupation-event', context, plans, index: 0, resume } : null;
}
