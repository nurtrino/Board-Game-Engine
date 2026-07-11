import {
  FEAST_ACTION_BY_ID, FEAST_ACTION_SPACES, FEAST_GOOD_BY_ID,
  FEAST_GOOD_IDS, FEAST_OCCUPATION_BY_ID, FEAST_SPECIAL_BY_ID,
} from './data.js';
import {
  feastCanAfford, feastCoveredTableCells, feastFeastPlacementError,
  feastIncomeForBoard, feastMakePlacement, feastPieceSpec,
  feastPlacementError, feastRequiredTableCells, feastUncoveredTableCells,
} from './placement.js';
import {
  feastActionReason, feastActingSeat, feastAdvanceAutomatic, feastBreedPlayer,
  feastActionResourceCost, feastActionSilverCost, feastActionWorkerCost, feastDrawOccupation, feastDrawWeapon, feastErr,
  feastApplySingleBonusReward, feastBonusRewardsForScope, feastEvent, feastFinishGame, feastHasOccupation, feastId, feastOk,
  feastOccupationEventForAction, feastPreActionResourcePlayers, feastQueueFeast, feastRandom, feastResolveBonusScope, feastTakeWeapon,
} from './state.js';
import { feastOccupationDieModifiers } from './occupationRuntime.js';
import {
  feastExecuteOccupationPlan,
  type FeastOccupationDeferredCommand,
} from './occupationExecutor.js';
import {
  feastCreateOccupationDecisionCursor, feastDecodeOccupationDecisionStep,
  feastOccupationDecisionSequence,
  type FeastOccupationDecisionCursor,
} from './occupationDecisions.js';
import {
  feastOccupationContext, feastOccupationEventContinuation,
  feastOccupationPlanForKey,
} from './occupationPipeline.js';
import {
  feastInterpretOccupationDeferred,
  type FeastOccupationDeferredContext, type FeastOccupationDeferredIntent,
} from './occupationDeferred.js';
import type { FeastOccupationEvent } from './occupationRules.js';
import type { FeastOccupationUsageRecord } from './occupationRuntime.js';
import type {
  FeastAction, FeastAmount, FeastBoardState, FeastBuildingResource,
  FeastContinuation, FeastDecisionChoice, FeastGood, FeastLegacyOccupationOperation,
  FeastOccupationContextState, FeastOccupationDeferredState, FeastOccupationSelectionState,
  FeastPendingDecision, FeastPlayer, FeastPrintedEffect, FeastResult,
  FeastShip, FeastShipType, FeastState, FeastWeapon,
} from './types.js';

const BLUE_SWORD_VALUE: Partial<Record<FeastGood, number>> = {
  'rune-stone': 6, silverware: 7, chest: 8, silk: 8,
  spices: 9, jewelry: 10, 'treasure-chest': 11, 'silver-hoard': 15,
};

const activeShips = (p: FeastPlayer, type?: FeastShipType): FeastShip[] =>
  p.ships.filter((x) => !x.emigrated && (!type || x.type === type));

function explorationShips(player: FeastPlayer, requirement: 'any' | 'large' | 'longship'): FeastShip[] {
  const steersman = player.playedOccupations.includes('occupation-147');
  return activeShips(player).filter((ship) => requirement === 'any'
    || (requirement === 'large' && (ship.type === 'knarr' || ship.type === 'longship'))
    || (requirement === 'longship' && (ship.type === 'longship' || (steersman && ship.type === 'knarr'))));
}

interface PlunderShipConfiguration {
  id: string;
  shipIds: string[];
  label: string;
  detail: string;
}

function plunderShipConfigurations(player: FeastPlayer): PlunderShipConfiguration[] {
  const longships = activeShips(player, 'longship');
  const configurations: PlunderShipConfiguration[] = [];
  for (let left = 0; left < longships.length; left++) {
    for (let right = left + 1; right < longships.length; right++) {
      const ships = [longships[left], longships[right]];
      configurations.push({
        id: `plunder:${ships.map((ship) => ship.id).join(',')}`,
        shipIds: ships.map((ship) => ship.id),
        label: 'Use 2 Longships',
        detail: `${ships.map((ship) => `${ship.id} (${ship.ore} ore)`).join(' + ')}`,
      });
    }
  }
  if (player.playedOccupations.includes('occupation-147')) {
    for (const ship of activeShips(player, 'knarr')) configurations.push({
      id: `plunder:${ship.id}`, shipIds: [ship.id],
      label: 'Use Knarr (Steersman)', detail: `${ship.id} substitutes for the Plundering longships`,
    });
  }
  return configurations;
}

function queue(state: FeastState, decision: Omit<FeastPendingDecision, 'id'>): void {
  state.pending.push({ id: feastId(state, 'decision'), ...decision });
}

function persistedOccupationCursor(
  continuation: Extract<FeastContinuation, { kind: 'occupation-event' }>,
  plan: NonNullable<ReturnType<typeof feastOccupationPlanForKey>>,
): FeastOccupationDecisionCursor {
  const base = feastCreateOccupationDecisionCursor(plan);
  return {
    ...base,
    requestIndex: continuation.requestIndex ?? base.requestIndex,
    confirmationResolved: continuation.confirmationResolved ?? base.confirmationResolved,
    selection: continuation.selection ?? base.selection,
  };
}

function continuationWithCursor(
  continuation: Extract<FeastContinuation, { kind: 'occupation-event' }>,
  cursor: FeastOccupationDecisionCursor,
): Extract<FeastContinuation, { kind: 'occupation-event' }> {
  return {
    ...continuation, requestIndex: cursor.requestIndex,
    confirmationResolved: cursor.confirmationResolved,
    selection: structuredClone(cursor.selection) as FeastOccupationSelectionState,
  };
}

function nextOccupationPlan(
  continuation: Extract<FeastContinuation, { kind: 'occupation-event' }>,
): Extract<FeastContinuation, { kind: 'occupation-event' }> {
  const { requestIndex: _requestIndex, confirmationResolved: _confirmationResolved, selection: _selection, ...rest } = continuation;
  return { ...rest, index: continuation.index + 1 };
}

function adjustFollowingGoodContext(
  resume: FeastContinuation, goodId: FeastGood, amount: number,
): FeastContinuation {
  if (resume.kind !== 'occupation-context-chain') return resume;
  const index = resume.contexts.findIndex((context, contextIndex) => contextIndex >= resume.index
    && context.hook === 'good-received' && context.event === 'good-gained' && context.window === 'after'
    && context.fields.goodId === goodId);
  if (index < 0) return resume;
  const contexts = [...resume.contexts];
  contexts[index] = {
    ...contexts[index],
    fields: { ...contexts[index].fields, amount, batchAmount: amount },
  };
  return { ...resume, contexts };
}

function queueExtraFeast(
  state: FeastState, seat: number, continuation: FeastContinuation,
): void {
  const p = state.players[seat];
  queue(state, {
    seat, kind: 'feast', label: 'Occupation Feast',
    prompt: 'Resolve this complete private Feast, then return to the occupation effect.',
    options: [{ id: 'finish', label: 'Finish Feast' }], min: 0, max: 1,
    meta: { extra: true, requiredCells: p.workersTotal },
    continuation, private: false,
  });
}

function startExtraFeast(
  state: FeastState, seat: number, continuation: FeastContinuation,
): string | null {
  state.players[seat].feastNoMeadCommitted = false;
  const eventBase = `phase:${state.round}:private-feast:${seat}:${state.eventSeq}`;
  const contexts = (['during', 'when'] as const).map((window, index) => feastOccupationContext(
    state, seat, 'phase-started', 'feast', window, {
      phase: 'feast', private: true, declaredMeadPlacements: 0,
    }, { eventId: `${eventBase}:${index}` },
  ));
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0,
    resume: { kind: 'queue-extra-feast', seat, resume: continuation },
  });
}

function runBonusRewardChain(
  state: FeastState, initial: Extract<FeastContinuation, { kind: 'bonus-reward-chain' }>,
): string | null {
  let continuation = initial;
  for (let guard = 0; guard < 240; guard++) {
    if (continuation.index >= continuation.rewards.length) {
      feastEvent(state, continuation.seat, continuation.label,
        `${continuation.rewards.length} board bonus reward${continuation.rewards.length === 1 ? '' : 's'} produced`);
      return resume(state, continuation.seat, continuation.resume);
    }
    const bonus = continuation.rewards[continuation.index];
    const eligibleReplacement = bonus.reward.kind === 'good' && bonus.reward.amount === 1
      && bonus.producerGoodCount === 1
      && (bonus.boardKind === 'stone-house' || bonus.boardKind === 'long-house');
    if (!continuation.offered && eligibleReplacement) {
      const context = feastOccupationContext(
        state, bonus.seat, 'bonus-produced', 'bonus-production', 'instead', {
          producer: 'stone-or-long-house', boardId: bonus.boardId,
          goodId: bonus.reward.id, batchAmount: bonus.reward.amount,
          producerGoodCount: bonus.producerGoodCount, private: true,
        }, { eventId: bonus.eventId },
      );
      return runOccupationContextChain(state, {
        kind: 'occupation-context-chain', contexts: [context], index: 0,
        resume: { ...continuation, offered: true },
      });
    }
    const replaced = eligibleReplacement && state.occupationReplacements.some((record) =>
      record.eventId === bonus.eventId && record.cardId === 'occupation-177'
      && record.target === 'bonus-good');
    const next: Extract<FeastContinuation, { kind: 'bonus-reward-chain' }> = {
      ...continuation, index: continuation.index + 1, offered: false,
    };
    if (!replaced) {
      const beforePlayer = structuredClone(state.players[bonus.seat]);
      feastApplySingleBonusReward(state, bonus.seat, bonus.reward);
      const mutationContexts = occupationMutationContexts(state, bonus.seat, beforePlayer, {
        source: 'bonus', eventId: `${bonus.eventId}:reward`,
      });
      if (mutationContexts.length) return runOccupationContextChain(state, {
        kind: 'occupation-context-chain', contexts: mutationContexts, index: 0, resume: next,
      });
    }
    continuation = next;
  }
  return 'Bonus reward chain exceeded its safety bound';
}

function runOccupationDeferred(
  state: FeastState, continuation: Extract<FeastContinuation, { kind: 'occupation-deferred' }>,
): string | null {
  for (let index = continuation.index; index < continuation.commands.length; index++) {
    const command = continuation.commands[index] as unknown as FeastOccupationDeferredCommand;
    const phaseStartKey = `phase-started:${index}`;
    if (command.kind === 'phase' && command.phase !== 'feast'
      && continuation.context?.[phaseStartKey] !== true) {
      const eventId = `occupation-phase:${state.round}:${continuation.seat}:${command.phase}:${index}`;
      return runOccupationContextChain(state, {
        kind: 'occupation-context-chain',
        contexts: [feastOccupationContext(
          state, continuation.seat, 'phase-started', command.phase, 'during', {
            phase: command.phase, private: true,
          }, { eventId: `${eventId}:start` },
        )],
        index: 0,
        resume: {
          ...continuation, index,
          context: { ...(continuation.context ?? {}), [phaseStartKey]: true },
        },
      });
    }
    if (command.kind === 'phase' && command.phase === 'bonus') {
      const eventId = `occupation-phase:${state.round}:${continuation.seat}:${command.phase}:${index}`;
      const next: Extract<FeastContinuation, { kind: 'occupation-deferred' }> = {
        ...continuation, index: index + 1,
      };
      const after: Extract<FeastContinuation, { kind: 'occupation-context-chain' }> = {
        kind: 'occupation-context-chain',
        contexts: [feastOccupationContext(
          state, continuation.seat, 'phase-resolved', command.phase, 'after', {
            phase: command.phase, private: true,
          }, { eventId: `${eventId}:after` },
        )],
        index: 0, resume: next,
      };
      const rewardEventPrefix = feastId(state, 'occupation-bonus');
      return runBonusRewardChain(state, {
        kind: 'bonus-reward-chain', seat: continuation.seat,
        rewards: feastBonusRewardsForScope(
          state, continuation.seat, command.scope, rewardEventPrefix,
        ),
        index: 0, offered: false, label: 'Occupation Bonus resolved', resume: after,
      });
    }
    const beforePlayers = structuredClone(state.players);
    const beforePlayer = beforePlayers[continuation.seat];
    const interpreted = feastInterpretOccupationDeferred(
      state, continuation.seat, command,
      (continuation.context ?? {}) as unknown as FeastOccupationDeferredContext,
    );
    if (!interpreted.ok) return interpreted.error.message;
    Object.assign(state, interpreted.nextState);
    const context = structuredClone(interpreted.context) as unknown as Record<string, import('./types.js').FeastJsonValue>;
    const next: Extract<FeastContinuation, { kind: 'occupation-deferred' }> = {
      ...continuation, index: index + 1, context,
    };
    for (const audit of interpreted.audit) feastEvent(state, continuation.seat, 'Occupation deferred effect', audit.message);
    if (!interpreted.intent) {
      const mutationContexts = occupationMutationContexts(state, continuation.seat, beforePlayer, {
        cardId: continuation.cardId, clauseId: continuation.clauseId,
        actionId: state.players[continuation.seat].turnActionId ?? undefined,
      });
      mutationContexts.push(...crossPlayerPlacementOccupationContexts(
        state, continuation.seat, beforePlayers,
        `occupation-deferred:${state.round}:${continuation.seat}:${continuation.cardId ?? 'card'}:${continuation.clauseId ?? 'effect'}:${index}`,
      ));
      let resumeAfterMutation: FeastContinuation = next;
      if (command.kind === 'phase') {
        const eventId = `occupation-phase:${state.round}:${continuation.seat}:${command.phase}:${index}`;
        resumeAfterMutation = {
          kind: 'occupation-context-chain',
          contexts: [feastOccupationContext(
            state, continuation.seat, 'phase-resolved', command.phase, 'after', {
              phase: command.phase, private: true,
            }, { eventId: `${eventId}:after` },
          )],
          index: 0, resume: next,
        };
      }
      if (mutationContexts.length) return runOccupationContextChain(state, {
        kind: 'occupation-context-chain', contexts: mutationContexts, index: 0, resume: resumeAfterMutation,
      });
      if (resumeAfterMutation.kind === 'occupation-context-chain') {
        return runOccupationContextChain(state, resumeAfterMutation);
      }
      continuation = next; continue;
    }
    const intent = interpreted.intent;
    const enabledIntentOptions = intent.options.filter((option) => !option.disabled);
    if (intent.min > 0 && enabledIntentOptions.length < intent.min) {
      return `${intent.label} no longer has enough legal choices`;
    }
    if (intent.kind === 'feast') return startExtraFeast(state, continuation.seat, next);
    const persistedIntent = structuredClone(intent) as unknown as Record<string, import('./types.js').FeastJsonValue>;
    if (intent.kind === 'grant-action' && intent.action === 'mountain-take') {
      const rawAllowances = intent.resolvedParameters.allowances;
      const allowances = Array.isArray(rawAllowances)
        ? rawAllowances.filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
        : [1];
      const allowedItems = Array.isArray(intent.resolvedParameters.allowedItems)
        ? intent.resolvedParameters.allowedItems.filter((value): value is string => typeof value === 'string')
        : undefined;
      queue(state, {
        seat: continuation.seat, kind: 'mountain', label: intent.label, prompt: intent.prompt,
        options: intent.options.map((option) => ({
          id: option.id, label: option.label, ...(option.detail ? { detail: option.detail } : {}),
          ...(option.disabled ? { disabled: true } : {}), ...(option.reason ? { reason: option.reason } : {}),
        })),
        min: intent.min, max: intent.max,
        meta: {
          mode: 'occupation-deferred', cardId: continuation.cardId ?? '', clauseId: continuation.clauseId ?? '',
          grantAction: intent.action, allowances,
          ...(allowedItems ? { allowedItems } : {}),
          buildingResourcesOnly: intent.resolvedParameters.buildingResourcesOnly === true,
          sameStrip: intent.resolvedParameters.sameStrip === true,
        },
        continuation: { ...next, intent: persistedIntent }, private: intent.targetKind === 'occupation',
      });
      return null;
    }
    queue(state, {
      seat: continuation.seat, kind: 'card-effect', label: intent.label, prompt: intent.prompt,
      options: intent.options.map((option) => ({
        id: option.id, label: option.label, ...(option.detail ? { detail: option.detail } : {}),
        ...(option.disabled ? { disabled: true } : {}), ...(option.reason ? { reason: option.reason } : {}),
      })),
      min: intent.min, max: intent.max,
      meta: {
        mode: 'occupation-deferred', cardId: continuation.cardId ?? '', clauseId: continuation.clauseId ?? '',
        requirement: 'choice', intentKind: intent.kind,
        ...(intent.kind === 'grant-action' ? { grantAction: intent.action } : {}),
      },
      continuation: {
        ...continuation, index, context,
        intent: persistedIntent,
      }, private: intent.targetKind === 'occupation',
    });
    return null;
  }
  return resume(state, continuation.seat, continuation.resume);
}

function advanceOccupationEvent(
  state: FeastState, initial: Extract<FeastContinuation, { kind: 'occupation-event' }>,
): string | null {
  let continuation = initial;
  const seat = Number(continuation.context.fields.seat);
  for (let guard = 0; guard < 240; guard++) {
    if (continuation.index >= continuation.plans.length) return resume(state, seat, continuation.resume);
    const key = continuation.plans[continuation.index];
    const plan = feastOccupationPlanForKey(state, continuation.context, key);
    if (!plan) { continuation = nextOccupationPlan(continuation); continue; }
    let cursor = persistedOccupationCursor(continuation, plan);
    let sequence = feastOccupationDecisionSequence(state, seat, plan, cursor);
    if (!sequence.complete && sequence.decision?.meta.requestKind === 'confirmation' && plan.requirement === 'mandatory') {
      const confirmed = feastDecodeOccupationDecisionStep(state, seat, plan, sequence.cursor, { accepted: true });
      if (!confirmed.ok) return confirmed.error;
      cursor = confirmed.cursor;
      continuation = continuationWithCursor(continuation, cursor);
      sequence = feastOccupationDecisionSequence(state, seat, plan, cursor);
    }
    if (!sequence.complete && sequence.decision) {
      queue(state, {
        seat, ...sequence.decision,
        continuation: continuationWithCursor(continuation, sequence.cursor),
        private: false,
      });
      return null;
    }
    const selection = sequence.selection ?? sequence.cursor.selection;
    const beforePlayer = structuredClone(state.players[seat]);
    const execution = feastExecuteOccupationPlan(state, seat, plan, selection);
    if (!execution.ok) return execution.errors[0]?.message ?? `${plan.cardName} could not resolve`;
    let replacedAppliedGood: { id: FeastGood; remaining: number } | null = null;
    if (execution.accepted && plan.cardId === 'occupation-150'
      && continuation.context.fields.originalApplied === true
      && execution.replacements.some((replacement) => replacement.target === 'reward')) {
      const id = continuation.context.fields.goodId;
      const batchAmount = continuation.context.fields.batchAmount;
      if (typeof id !== 'string' || !(id in FEAST_GOOD_BY_ID) || typeof batchAmount !== 'number' || batchAmount < 1) {
        return 'Meat replacement is missing its applied original reward';
      }
      const goodId = id as FeastGood;
      if (execution.nextState.players[seat].goods[goodId] < 1) return `No ${FEAST_GOOD_BY_ID[goodId].name} remains to replace`;
      execution.nextState.players[seat].goods[goodId]--;
      replacedAppliedGood = { id: goodId, remaining: Math.max(0, batchAmount - 1) };
    }
    Object.assign(state, execution.nextState);
    if (execution.usage) state.occupationUsage.push(structuredClone(execution.usage));
    if (execution.accepted && plan.cardId === 'occupation-160' && plan.clauseId === 'no-mead-feast-silver') {
      state.players[seat].feastNoMeadCommitted = true;
    }
    for (const replacement of execution.replacements) state.occupationReplacements.push({
      cardId: plan.cardId, clauseId: plan.clauseId, target: replacement.target,
      round: state.round,
      ...(continuation.context.actionId ? { actionId: continuation.context.actionId } : {}),
      ...(continuation.context.eventId ? { eventId: continuation.context.eventId } : {}),
      ...(replacement.parameters ? {
        parameters: structuredClone(replacement.parameters) as unknown as Record<string, import('./types.js').FeastJsonValue>,
      } : {}),
    });
    for (const modifier of execution.modifiers) state.occupationActiveModifiers.push({
      seat, cardId: plan.cardId, clauseId: plan.clauseId, round: state.round,
      ...(continuation.context.actionId ? { actionId: continuation.context.actionId } : {}),
      ...(continuation.context.eventId ? { eventId: continuation.context.eventId } : {}),
      modifier: structuredClone(modifier) as unknown as Record<string, import('./types.js').FeastJsonValue>,
    });
    const use = state.players[seat].occupationUses.find((entry) => entry.cardId === plan.cardId);
    if (use) {
      use.round = state.round; use.usesThisRound++;
      const type = FEAST_OCCUPATION_BY_ID[plan.cardId]?.type;
      if (type === 'immediate' || type === 'as-soon-as') use.usedOnce = true;
    }
    feastEvent(state, seat, execution.accepted ? `Resolved ${plan.cardName}` : `Declined ${plan.cardName}`, plan.clauseId);
    let next = nextOccupationPlan(continuation);
    if (replacedAppliedGood) next = {
      ...next,
      resume: adjustFollowingGoodContext(next.resume, replacedAppliedGood.id, replacedAppliedGood.remaining),
    };
    const mutationContexts = execution.accepted ? occupationMutationContexts(state, seat, beforePlayer, {
      cardId: plan.cardId, clauseId: plan.clauseId,
      actionId: continuation.context.actionId, eventId: continuation.context.eventId,
      ...(plan.cardId === 'occupation-105'
        ? { classifiedAsShipBuilding: true, woodPaid: 3 } : {}),
    }) : [];
    let resumeAfterMutations: FeastContinuation = next;
    if (execution.deferred.length) {
      const commands = structuredClone(execution.deferred) as unknown as FeastOccupationDeferredState[];
      resumeAfterMutations = {
        kind: 'occupation-deferred', seat, commands, index: 0, resume: next,
        cardId: plan.cardId, clauseId: plan.clauseId,
        context: {
          eventFields: structuredClone(continuation.context.fields),
        },
      };
    }
    if (mutationContexts.length) {
      return runOccupationContextChain(state, {
        kind: 'occupation-context-chain', contexts: mutationContexts, index: 0,
        resume: resumeAfterMutations,
      });
    }
    if (resumeAfterMutations.kind === 'occupation-deferred') return runOccupationDeferred(state, resumeAfterMutations);
    continuation = next;
  }
  return 'Occupation event chain exceeded its safety bound';
}

function startOccupationEvent(
  state: FeastState, context: FeastOccupationContextState, resumeAfter: FeastContinuation,
): { handled: boolean; error: string | null } {
  const continuation = feastOccupationEventContinuation(state, context, resumeAfter);
  if (!continuation) return { handled: false, error: null };
  const error = advanceOccupationEvent(state, continuation);
  return { handled: true, error };
}

function automaticOccupationHook(state: FeastState, context: FeastOccupationContextState): boolean {
  const continuation = feastOccupationEventContinuation(state, context, { kind: 'automatic' });
  if (!continuation) return false;
  const bad = advanceOccupationEvent(state, continuation);
  if (bad) feastEvent(state, Number(context.fields.seat), 'Automatic occupation hook failed', bad);
  return true;
}

function runOccupationContextChain(
  state: FeastState, continuation: Extract<FeastContinuation, { kind: 'occupation-context-chain' }>,
): string | null {
  const seat = Number(continuation.contexts[0]?.fields.seat ?? state.turn);
  for (let index = continuation.index; index < continuation.contexts.length; index++) {
    const next: Extract<FeastContinuation, { kind: 'occupation-context-chain' }> = { ...continuation, index: index + 1 };
    const started = startOccupationEvent(state, continuation.contexts[index], next);
    if (started.error) return started.error;
    if (started.handled) return null;
  }
  return resume(state, seat, continuation.resume);
}

function printedSilver(stateEffects: readonly FeastPrintedEffect[], kind: 'gain' | 'pay'): number {
  return stateEffects.reduce((total, effect) => {
    if (effect.kind === kind) return total + effect.items.filter((item) => item.kind === 'silver').reduce((sum, item) => sum + item.amount, 0);
    if (kind === 'gain' && effect.kind === 'weekly-four') return total + 1;
    if (effect.kind === 'choose') return Math.max(total, ...effect.options.map((option) => printedSilver(option.effects, kind)));
    return total;
  }, 0);
}

function printedResource(stateEffects: readonly FeastPrintedEffect[], resource: FeastBuildingResource): number {
  return stateEffects.reduce((total, effect) => {
    if (effect.kind === 'pay') return total + effect.items.filter((item) => item.kind === 'resource' && item.id === resource).reduce((sum, item) => sum + item.amount, 0);
    if (effect.kind === 'choose') return Math.max(total, ...effect.options.map((option) => printedResource(option.effects, resource)));
    return total;
  }, 0);
}

function actionOccupationContexts(
  state: FeastState, seat: number, actionSpaceId: string,
  hook: 'action-proposed' | 'action-started' | 'action-resolved', window: 'before' | 'after' | 'instead',
  extraFields: Record<string, import('./types.js').FeastJsonValue> = {},
): FeastOccupationContextState[] {
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  if (!def) return [];
  const specific = feastOccupationEventForAction(def);
  const provenanceSource = extraFields.source === 'occupation'
    || state.players[seat].turnActionFacts.source === 'occupation'
    ? 'occupation' : 'action-space';
  const events = new Set<string>();
  if ((hook === 'action-proposed' || hook === 'action-resolved')
    && provenanceSource === 'action-space') events.add('viking-action');
  events.add(specific);
  if (def.effects.some((effect) => effect.kind === 'mountain')) events.add('mountain-action');
  if (def.effects.some((effect) => effect.kind === 'upgrade')) events.add('upgrade-action');
  // Choice actions reveal their classification only after the selected branch
  // resolves. Reducer-owned facts expose that branch to occupation hooks
  // without accepting a client-provided action classification.
  if (provenanceSource === 'action-space'
    && Array.isArray(state.players[seat].turnActionFacts.mountainItemsTaken)) events.add('mountain-action');
  if (typeof state.players[seat].turnActionFacts.upgradeCountCapacity === 'number'
    && state.players[seat].turnActionFacts.upgradeCountCapacity > 0) events.add('upgrade-action');
  if (def.effects.some((effect) => effect.kind === 'overseas-trade')) events.add('overseas-trading');
  if (def.effects.some((effect) => effect.kind === 'explore')) events.add('exploration');
  if (def.effects.some((effect) => effect.kind === 'emigrate')) events.add('emigration');
  if (def.effects.some((effect) => effect.kind === 'die')) events.add('dice-action');
  if (hook === 'action-resolved' && ['raiding', 'pillaging', 'plundering', 'exploration', 'emigration'].includes(specific)
    && state.players[seat].turnSelectedShipIds.some((id) => state.players[seat].ships
      .some((ship) => ship.id === id && ship.type === 'longship'))) events.add('longship-used');
  const actionId = state.players[seat].turnActionId ?? `${state.round}:${seat}:${actionSpaceId}:${state.eventSeq}`;
  const fields = {
    action: specific, actionSpaceId, actionSpaceIds: actionSpaceId,
    source: provenanceSource, phase: state.phase,
    column: def.column, workers: feastActionWorkerCost(state, seat, def),
    printedSilverCost: printedSilver(def.effects, 'pay'), printedCost: printedSilver(def.effects, 'pay'),
    printedSilverReward: printedSilver(def.effects, 'gain'), rewardSource: 'action-space',
    woodPaid: printedResource(def.effects, 'wood'), stonePaid: printedResource(def.effects, 'stone'), orePaid: printedResource(def.effects, 'ore'),
    upgradeCountCapacity: Math.max(0, ...def.effects.filter((effect) => effect.kind === 'upgrade').map((effect) => effect.count)),
    upgradeSteps: Math.max(0, ...def.effects.filter((effect) => effect.kind === 'upgrade').map((effect) => effect.steps)),
    selectedShipIds: [...state.players[seat].turnSelectedShipIds], shipId: '', shipType: '',
    ...state.players[seat].turnActionFacts,
    ...extraFields,
  };
  return [...events].map((event, index) => feastOccupationContext(
    state, seat, hook, event as Parameters<typeof feastOccupationContext>[3], window,
    fields, { actionId, eventId: `${actionId}:${hook}:${window}:${index}` },
  ));
}

function acceptedActionReplacements(
  state: FeastState, seat: number, actionSpaceId: string,
): typeof state.occupationReplacements {
  const actionId = state.players[seat].turnActionId;
  if (!actionId) return [];
  return state.occupationReplacements.filter((replacement) => replacement.actionId === actionId
    && (replacement.target === 'action' || replacement.target === 'ship' || replacement.target === 'reward'));
}

function printedEffectSuppressed(
  state: FeastState, seat: number, actionSpaceId: string, effect: FeastPrintedEffect,
): boolean {
  const replacements = acceptedActionReplacements(state, seat, actionSpaceId);
  return replacements.some((replacement) => {
    if (replacement.cardId === 'occupation-102') return effect.kind === 'upgrade';
    if (replacement.cardId === 'occupation-105') return actionSpaceId === 'build-whaling-boat';
    if (replacement.cardId === 'occupation-107') return effect.kind === 'explore';
    if (replacement.cardId === 'occupation-185') return actionSpaceId === 'raid';
    return false;
  });
}

function gainOccupationContexts(
  state: FeastState, seat: number, actionSpaceId: string, before: FeastPlayer,
): FeastOccupationContextState[] {
  const after = state.players[seat];
  const actionId = after.turnActionId ?? `${state.round}:${seat}:${actionSpaceId}:${state.eventSeq}`;
  const contexts: FeastOccupationContextState[] = [];
  const actionDef = FEAST_ACTION_BY_ID[actionSpaceId];
  const provenanceSource = after.turnActionFacts.source === 'occupation' ? 'occupation' : 'action-space';
  const common = {
    actionSpaceId, source: provenanceSource, phase: state.phase,
    action: actionDef ? feastOccupationEventForAction(actionDef) : 'viking-action',
    classifiedAsHouseBuilding: actionDef?.group === 'Build Houses',
    woodPaid: actionDef ? printedResource(actionDef.effects, 'wood') : 0,
    stonePaid: actionDef ? printedResource(actionDef.effects, 'stone') : 0,
    orePaid: actionDef ? printedResource(actionDef.effects, 'ore') : 0,
    ...after.turnActionFacts,
  };
  for (const id of FEAST_GOOD_IDS) {
    if (id === 'sheep' || id === 'pregnant-sheep' || id === 'cattle' || id === 'pregnant-cattle') continue;
    const amount = after.goods[id] - before.goods[id];
    if (amount <= 0) continue;
    contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'instead', {
      ...common, goodId: id, amount, batchAmount: amount, originalApplied: true,
    }, { actionId, eventId: `${actionId}:good:${id}:${state.eventSeq}:instead` }));
    contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'after', {
      ...common, goodId: id, amount, batchAmount: amount,
    }, { actionId, eventId: `${actionId}:good:${id}:${state.eventSeq}` }));
  }
  for (const [normal, pregnant] of [['sheep', 'pregnant-sheep'], ['cattle', 'pregnant-cattle']] as const) {
    let remaining = (after.goods[normal] + after.goods[pregnant]) - (before.goods[normal] + before.goods[pregnant]);
    if (remaining <= 0) continue;
    for (const id of [normal, pregnant] as const) {
      const amount = Math.min(remaining, Math.max(0, after.goods[id] - before.goods[id]));
      if (amount <= 0) continue;
      contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'instead', {
        ...common, goodId: id, amount, batchAmount: amount, originalApplied: true,
      }, { actionId, eventId: `${actionId}:good:${id}:${state.eventSeq}:instead` }));
      contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'after', {
        ...common, goodId: id, amount, batchAmount: amount,
      }, { actionId, eventId: `${actionId}:good:${id}:${state.eventSeq}` }));
      for (let animalIndex = 0; animalIndex < amount; animalIndex++) contexts.push(feastOccupationContext(
        state, seat, 'animal-entered-stable', 'animal-gained', 'after',
        { ...common, animal: id, amount: 1, batchAmount: 1 },
        { actionId, eventId: `${actionId}:animal:${id}:${state.eventSeq}:${animalIndex}` },
      ));
      remaining -= amount;
    }
  }
  for (const id of ['wood', 'stone', 'ore'] as const) {
    const amount = after.resources[id] - before.resources[id];
    if (amount > 0) contexts.push(feastOccupationContext(state, seat, 'resource-received', 'resource-gained', 'after', {
      ...common, resourceId: id, amount, batchAmount: amount,
    }, { actionId, eventId: `${actionId}:resource:${id}:${state.eventSeq}` }));
  }
  for (const ship of after.ships.filter((candidate) => !before.ships.some((old) => old.id === candidate.id))) {
    contexts.push(feastOccupationContext(state, seat, 'ship-acquired', 'ship-gained', 'after', {
      ...common, shipType: ship.type, shipId: ship.id,
      classifiedAsShipBuilding: FEAST_ACTION_BY_ID[actionSpaceId]?.group === 'Build Ships',
    }, { actionId, eventId: `${actionId}:ship:${ship.id}` }));
  }
  for (const board of after.boards.filter((candidate) => candidate.kind === 'building' && !before.boards.some((old) => old.id === candidate.id))) {
    contexts.push(feastOccupationContext(state, seat, 'house-built', 'house-gained', 'after', {
      ...common, houseType: board.definitionId,
    }, { actionId, eventId: `${actionId}:house:${board.id}` }));
  }
  if (contexts.length || after.ships.length !== before.ships.length || after.boards.length !== before.boards.length) {
    contexts.push(feastOccupationContext(state, seat, 'state-changed', 'inventory-threshold', 'when', {
      ...common, income: after.boards.reduce((sum, board) => sum + feastIncomeForBoard(board), 0),
    }, { actionId, eventId: `${actionId}:state:${state.eventSeq}` }));
  }
  return contexts;
}

function placementOccupationContexts(
  state: FeastState, seat: number, board: FeastBoardState | null,
  pieceId: string, destination: 'board' | 'banquet-table', eventId: string,
): FeastOccupationContextState[] {
  const fields = {
    pieceId, destination, phase: destination === 'banquet-table' ? 'feast' : state.phase,
    boardId: board?.id ?? 'banquet-table', boardKind: board?.kind === 'building' ? board.definitionId : board?.kind ?? 'banquet-table',
    matchingPlacementsEarlierThisRound: board?.placements.filter((placement) => placement.pieceId === pieceId).length ?? 0,
  };
  return [
    feastOccupationContext(state, seat, 'tile-placed', 'tile-placement', 'after', fields, { eventId }),
    feastOccupationContext(state, seat, 'state-changed', 'inventory-threshold', 'when', fields, { eventId: `${eventId}:state` }),
  ];
}

function occupationMutationContexts(
  state: FeastState, seat: number, before: FeastPlayer,
  provenance: {
    cardId?: string; clauseId?: string; actionId?: string; eventId?: string;
    source?: string; classifiedAsShipBuilding?: boolean; classifiedAsHouseBuilding?: boolean; woodPaid?: number;
  },
): FeastOccupationContextState[] {
  const after = state.players[seat];
  const actionId = provenance.actionId ?? after.turnActionId ?? `occupation:${state.round}:${seat}:${state.eventSeq}`;
  const eventBase = provenance.eventId ?? `${actionId}:${provenance.cardId ?? 'card'}:${provenance.clauseId ?? 'effect'}:${state.eventSeq}`;
  const common = {
    source: provenance.source ?? 'occupation', phase: state.phase,
    classifiedAsHouseBuilding: provenance.classifiedAsHouseBuilding ?? false,
    ...(provenance.cardId ? { cardId: provenance.cardId } : {}),
    ...(provenance.clauseId ? { clauseId: provenance.clauseId } : {}),
    ...(typeof provenance.woodPaid === 'number' ? { woodPaid: provenance.woodPaid } : {}),
  };
  const contexts: FeastOccupationContextState[] = [];
  for (const id of FEAST_GOOD_IDS) {
    if (id === 'sheep' || id === 'pregnant-sheep' || id === 'cattle' || id === 'pregnant-cattle') continue;
    const amount = after.goods[id] - before.goods[id];
    if (amount <= 0) continue;
    contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'instead', {
      ...common, goodId: id, amount, batchAmount: amount, originalApplied: true,
    }, { actionId, eventId: `${eventBase}:good:${id}:instead` }));
    contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'after', {
      ...common, goodId: id, amount, batchAmount: amount,
    }, { actionId, eventId: `${eventBase}:good:${id}` }));
  }
  for (const [normal, pregnant] of [['sheep', 'pregnant-sheep'], ['cattle', 'pregnant-cattle']] as const) {
    let remaining = (after.goods[normal] + after.goods[pregnant]) - (before.goods[normal] + before.goods[pregnant]);
    if (remaining <= 0) continue;
    for (const id of [normal, pregnant] as const) {
      const amount = Math.min(remaining, Math.max(0, after.goods[id] - before.goods[id]));
      if (amount <= 0) continue;
      contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'instead', {
        ...common, goodId: id, amount, batchAmount: amount, originalApplied: true,
      }, { actionId, eventId: `${eventBase}:good:${id}:instead` }));
      contexts.push(feastOccupationContext(state, seat, 'good-received', 'good-gained', 'after', {
        ...common, goodId: id, amount, batchAmount: amount,
      }, { actionId, eventId: `${eventBase}:good:${id}` }));
      for (let animalIndex = 0; animalIndex < amount; animalIndex++) contexts.push(feastOccupationContext(
        state, seat, 'animal-entered-stable', 'animal-gained', 'after',
        { ...common, animal: id, amount: 1, batchAmount: 1 },
        { actionId, eventId: `${eventBase}:animal:${id}:${animalIndex}` },
      ));
      remaining -= amount;
    }
  }
  for (const id of ['wood', 'stone', 'ore'] as const) {
    const amount = after.resources[id] - before.resources[id];
    if (amount > 0) contexts.push(feastOccupationContext(state, seat, 'resource-received', 'resource-gained', 'after', {
      ...common, resourceId: id, amount, batchAmount: amount,
    }, { actionId, eventId: `${eventBase}:resource:${id}` }));
  }
  for (const ship of after.ships.filter((candidate) => !before.ships.some((old) => old.id === candidate.id))) {
    contexts.push(feastOccupationContext(state, seat, 'ship-acquired', 'ship-gained', 'after', {
      ...common, shipType: ship.type, shipId: ship.id,
      classifiedAsShipBuilding: provenance.classifiedAsShipBuilding ?? false,
    }, { actionId, eventId: `${eventBase}:ship:${ship.id}` }));
  }
  for (const board of after.boards.filter((candidate) => !before.boards.some((old) => old.id === candidate.id))) {
    if (board.kind === 'building') contexts.push(feastOccupationContext(state, seat, 'house-built', 'house-gained', 'after', {
      ...common, houseType: board.definitionId,
    }, { actionId, eventId: `${eventBase}:house:${board.id}` }));
  }
  for (const board of after.boards) {
    const old = before.boards.find((candidate) => candidate.id === board.id);
    const oldPlacementIds = new Set(old?.placements.map((placement) => placement.id) ?? []);
    for (const placement of board.placements.filter((candidate) => !oldPlacementIds.has(candidate.id))) {
      contexts.push(...placementOccupationContexts(
        state, seat, board, placement.pieceId, 'board', `${eventBase}:placement:${placement.id}`,
      ));
    }
  }
  const workersReturned = Math.max(0, after.workersAvailable - before.workersAvailable);
  if (workersReturned > 0) {
    contexts.push(feastOccupationContext(state, seat, 'workers-returned', 'worker-return', 'after', {
      ...common, workersReturned, newCount: after.workersAvailable,
    }, { actionId, eventId: `${eventBase}:workers-returned` }));
    contexts.push(feastOccupationContext(state, seat, 'thing-count-changed', 'thing-count', 'after', {
      ...common, workersReturned, newCount: after.workersAvailable,
    }, { actionId, eventId: `${eventBase}:thing-count` }));
  }
  if (contexts.length || after.specials.length !== before.specials.length
    || after.occupationHand.length !== before.occupationHand.length
    || after.ships.length !== before.ships.length || after.boards.length !== before.boards.length) {
    contexts.push(feastOccupationContext(state, seat, 'state-changed', 'inventory-threshold', 'when', {
      ...common, income: after.boards.reduce((sum, board) => sum + feastIncomeForBoard(board), 0),
    }, { actionId, eventId: `${eventBase}:state` }));
  }
  return contexts;
}

function crossPlayerPlacementOccupationContexts(
  state: FeastState, actorSeat: number, beforePlayers: readonly FeastPlayer[], eventBase: string,
): FeastOccupationContextState[] {
  const contexts: FeastOccupationContextState[] = [];
  for (const owner of state.players) {
    if (owner.seat === actorSeat) continue;
    const beforeOwner = beforePlayers.find((candidate) => candidate.seat === owner.seat);
    for (const board of owner.boards) {
      const oldBoard = beforeOwner?.boards.find((candidate) => candidate.id === board.id);
      const oldPlacementIds = new Set(oldBoard?.placements.map((placement) => placement.id) ?? []);
      for (const placement of board.placements.filter((candidate) => !oldPlacementIds.has(candidate.id))) {
        contexts.push(...placementOccupationContexts(
          state, actorSeat, board, placement.pieceId, 'board',
          `${eventBase}:owner:${owner.seat}:placement:${placement.id}`,
        ));
      }
    }
  }
  return contexts;
}

function queueFinalPlacement(state: FeastState): void {
  const seat = (state.firstPlayer + state.feastCursor) % state.players.length;
  queue(state, {
    seat, kind: 'final-placement', label: 'Final Placement',
    prompt: 'Before scoring, commit any remaining legal goods, silver, ore, and designated shed/stone-house wood or stone. Confirm when finished.',
    options: [{ id: 'confirm', label: 'Confirm Final Placements', detail: 'This permanently locks your boards and proceeds toward scoring.' }],
    min: 1, max: 1, meta: { scoring: true }, continuation: { kind: 'none' }, private: false,
  });
}

function recordBuildingResourcePayments(player: FeastPlayer, items: readonly FeastAmount[]): void {
  const paidNow = items.filter((item) => item.kind === 'resource' && item.id && item.amount > 0)
    .map((item) => item.id as FeastBuildingResource);
  if (!paidNow.length) return;
  const previous = Array.isArray(player.turnActionFacts.buildingResourceTypesPaid)
    ? player.turnActionFacts.buildingResourceTypesPaid.filter((id): id is FeastBuildingResource =>
      typeof id === 'string' && ['wood', 'stone', 'ore'].includes(id))
    : [];
  const types = [...new Set([...previous, ...paidNow])];
  const { selectedPayment: _staleSelectedPayment, ...previousFacts } = player.turnActionFacts;
  player.turnActionFacts = {
    ...previousFacts,
    buildingResourceTypesPaid: types,
    distinctBuildingResourceTypesPaid: types.length,
    ...(types.length === 1 ? { selectedPayment: types[0] } : {}),
  };
}

function spendItems(state: FeastState, player: FeastPlayer, items: readonly FeastAmount[], actionSpaceId: string): string | null {
  const effective = items.map((item) => {
    if (item.kind === 'silver') return { ...item, amount: feastActionSilverCost(player, actionSpaceId, item.amount) };
    if (item.kind === 'resource' && (item.id === 'wood' || item.id === 'stone' || item.id === 'ore')) {
      return { ...item, amount: feastActionResourceCost(player, actionSpaceId, item.id, item.amount) };
    }
    return item;
  });
  const bad = feastCanAfford(player, effective);
  if (bad) return bad;
  recordBuildingResourcePayments(player, effective);
  for (const item of effective) {
    if (item.kind === 'silver') player.silver -= item.amount;
    else if (item.kind === 'resource' && item.id) player.resources[item.id as FeastBuildingResource] -= item.amount;
    else if (item.kind === 'good' && item.id) player.goods[item.id as FeastGood] -= item.amount;
    else if (item.kind === 'weapon' && item.id) {
      const weapon = item.id as FeastWeapon;
      player.weapons[weapon] -= item.amount;
      for (let i = 0; i < item.amount; i++) {
        if (state.weaponSubstitutes[weapon] > 0) state.weaponSubstitutes[weapon]--;
        else state.weaponDiscard.push(weapon);
      }
    }
  }
  return null;
}

function gainItems(state: FeastState, player: FeastPlayer, items: readonly FeastAmount[], actionSpaceId: string): void {
  for (const item of items) {
    let n = item.amount;
    if (actionSpaceId === 'wood-per-player' && item.kind === 'resource' && item.id === 'wood') n = state.players.length;
    if (n <= 0) continue;
    if (item.kind === 'silver') player.silver += n;
    else if (item.kind === 'resource' && item.id) player.resources[item.id as FeastBuildingResource] += n;
    else if (item.kind === 'good' && item.id) player.goods[item.id as FeastGood] += n;
    else if (item.kind === 'weapon' && item.id) player.weapons[item.id as FeastWeapon] += n;
  }
}

function gainShip(state: FeastState, player: FeastPlayer, type: FeastShipType): string | null {
  if (type === 'whaling-boat') {
    if (activeShips(player, type).length >= 3) return 'All three whaling-boat berths are full';
  } else if (activeShips(player, 'knarr').length + activeShips(player, 'longship').length >= 4) {
    return 'All four large-ship berths are full';
  }
  player.ships.push({ id: feastId(state, type), type, ore: 0, emigrated: false, emigratedRound: null });
  return null;
}

function gainBuilding(state: FeastState, player: FeastPlayer, building: 'shed' | 'stone-house' | 'long-house'): string | null {
  if (state.buildingSupply[building] < 1) return `No ${building.replace('-', ' ')} remains`;
  state.buildingSupply[building]--;
  player.boards.push({
    id: feastId(state, building), definitionId: building, kind: 'building',
    owner: player.seat, placements: [],
  });
  return null;
}

function optionError(state: FeastState, player: FeastPlayer, effects: readonly FeastPrintedEffect[], actionSpaceId: string): string | null {
  const pays = effects.filter((x) => x.kind === 'pay').flatMap((x) => x.items).map((item) => {
    if (item.kind === 'silver') return { ...item, amount: feastActionSilverCost(player, actionSpaceId, item.amount) };
    if (item.kind === 'resource' && (item.id === 'wood' || item.id === 'stone' || item.id === 'ore')) {
      return { ...item, amount: feastActionResourceCost(player, actionSpaceId, item.id, item.amount) };
    }
    return item;
  });
  const actionDef = FEAST_ACTION_BY_ID[actionSpaceId];
  const candidates = actionDef ? feastPreActionResourcePlayers(state, player, actionDef) : [player];
  const cost = candidates.every((candidate) => feastCanAfford(candidate, pays) !== null)
    ? feastCanAfford(player, pays) : null;
  if (cost) return cost;
  for (const effect of effects) {
    if (effect.kind === 'build' && state.buildingSupply[effect.building] < 1) return `No ${effect.building.replace('-', ' ')} remains`;
    if (effect.kind === 'mountain' && !state.mountains.some((strip) => strip.items.length > 0)) return 'No mountain items remain';
    if (effect.kind === 'upgrade' && !upgradableGoods(player, effect.steps).length) return 'You have no matching good to upgrade';
    if (effect.kind === 'choose') {
      const legal = effect.options.filter((option) => optionError(state, player, option.effects, actionSpaceId) === null);
      if (legal.length < effect.min) return 'No nested printed choice can currently be resolved';
    }
    if (effect.kind === 'ship') {
      if (effect.ship === 'whaling-boat' && activeShips(player, effect.ship).length >= 3) return 'No small-ship berth';
      if (effect.ship !== 'whaling-boat' && activeShips(player, 'knarr').length + activeShips(player, 'longship').length >= 4) return 'No large-ship berth';
    }
  }
  return null;
}

function upgradableDestination(id: FeastGood, steps: 1 | 2): FeastGood | null {
  let at: FeastGood | null = id;
  for (let i = 0; i < steps; i++) at = at ? FEAST_GOOD_BY_ID[at]?.upgrade ?? null : null;
  return at;
}

function upgradableGoods(player: FeastPlayer, steps: 1 | 2): FeastGood[] {
  return FEAST_GOOD_IDS.filter((id) => player.goods[id] > 0 && upgradableDestination(id, steps) !== null
    && id !== 'pregnant-sheep' && id !== 'pregnant-cattle');
}

function continuationCanProvideEffect(state: FeastState, seat: number, continuation: FeastContinuation): boolean {
  if (continuation.kind !== 'printed') return false;
  const def = FEAST_ACTION_BY_ID[continuation.actionSpaceId];
  if (!def) return false;
  return def.effects.slice(continuation.effectIndex).some((effect) => {
    if (effect.kind === 'upgrade') return upgradableGoods(state.players[seat], effect.steps).length > 0;
    if (effect.kind === 'mountain') return state.mountains.some((x) => x.items.length > 0);
    return true;
  });
}

function queueMountain(
  state: FeastState, seat: number, effect: Extract<FeastPrintedEffect, { kind: 'mountain' }>,
  continuation: FeastContinuation,
): void {
  queue(state, {
    seat, kind: 'mountain', label: 'Take Mountain Items',
    prompt: `Take from the arrow end: ${effect.allowances.join(' + ')} item${effect.allowances.length === 1 && effect.allowances[0] === 1 ? '' : 's'}.`,
    options: state.mountains.map((x) => ({ id: x.id, label: x.id.replace('-', ' '), detail: x.items.join(', '), disabled: !x.items.length, ...(x.items.length ? {} : { reason: 'Empty' }) })),
    min: state.players[seat].turnEffectUsed || continuationCanProvideEffect(state, seat, continuation) ? 0 : 1,
    max: effect.allowances.reduce((n, x) => n + x, 0),
    meta: { allowances: effect.allowances }, continuation, private: false,
  });
}

function queueUpgrade(
  state: FeastState, seat: number, effect: Extract<FeastPrintedEffect, { kind: 'upgrade' }>,
  continuation: FeastContinuation,
): void {
  const player = state.players[seat];
  const ids = upgradableGoods(player, effect.steps);
  queue(state, {
    seat, kind: 'goods', label: effect.steps === 2 ? 'Double-Upgrade Goods' : 'Upgrade Goods',
    prompt: `Upgrade up to ${effect.count} goods ${effect.steps === 2 ? 'two steps' : 'one step'}, preserving shape.`,
    options: ids.map((id) => {
      const dest = upgradableDestination(id, effect.steps)!;
      return { id, label: `${FEAST_GOOD_BY_ID[id].name} -> ${FEAST_GOOD_BY_ID[dest].name}`, detail: `${player.goods[id]} available` };
    }),
    min: player.turnEffectUsed || continuationCanProvideEffect(state, seat, continuation) ? 0 : 1,
    max: effect.count,
    meta: { mode: 'upgrade', steps: effect.steps, count: effect.count }, continuation, private: false,
  });
}

function queueOccupation(
  state: FeastState, seat: number, min: number, max: number,
  continuation: FeastContinuation, payment: ('stone' | 'ore')[] = [],
): void {
  const p = state.players[seat];
  queue(state, {
    seat, kind: 'occupation', label: 'Play Occupations',
    prompt: max === 1 ? 'Choose an occupation to play, or skip if allowed.' : `Choose up to ${max} occupations to play in order.`,
    options: p.occupationHand.map((id) => {
      const card = FEAST_OCCUPATION_BY_ID[id];
      return { id, label: card?.name ?? id, detail: `${card?.points ?? 0} VP - ${card?.type ?? 'card'}` };
    }),
    min, max, meta: { payment }, continuation, private: true,
  });
}

function finishOccupationDraw(
  state: FeastState, continuation: Extract<FeastContinuation, { kind: 'draw-occupation' }>,
): string | null {
  const replaced = state.occupationUsage.some((record) => record.eventId === continuation.eventId && record.cardId === 'occupation-99');
  if (!replaced) feastDrawOccupation(state, continuation.seat);
  if (continuation.markTurnEffect) state.players[continuation.seat].turnEffectUsed = true;
  return resume(state, continuation.seat, continuation.resume);
}

function drawOccupationWithHooks(
  state: FeastState, seat: number, resumeAfter: FeastContinuation, markTurnEffect = true,
): string | null {
  const eventId = feastId(state, 'occupation-draw');
  const context = feastOccupationContext(state, seat, 'occupation-received', 'occupation-gained', 'instead', {
    source: 'action-space', phase: state.phase, amount: 1,
  }, { actionId: state.players[seat].turnActionId ?? undefined, eventId });
  const continuation: Extract<FeastContinuation, { kind: 'draw-occupation' }> = {
    kind: 'draw-occupation', seat, eventId, markTurnEffect, resume: resumeAfter,
  };
  const started = startOccupationEvent(state, context, continuation);
  return started.error ?? (!started.handled ? finishOccupationDraw(state, continuation) : null);
}

function finishActionNow(state: FeastState, seat: number, actionSpaceId: string): void {
  const player = state.players[seat];
  player.fourthOccupationAfter = false;
  player.turnMayEnd = true;
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  feastEvent(state, seat, def?.name ?? 'Action resolved', 'Choose END TURN when ready.', { actionSpaceId });
}

function finishPrinted(state: FeastState, seat: number, actionSpaceId: string): void {
  const player = state.players[seat];
  if (player.fourthOccupationAfter && player.occupationHand.length) {
    player.fourthOccupationAfter = false;
    queueOccupation(state, seat, 0, 1, { kind: 'finish-action', seat, actionSpaceId });
    return;
  }
  player.fourthOccupationAfter = false;
  const contexts = actionOccupationContexts(state, seat, actionSpaceId, 'action-resolved', 'after');
  const bad = runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0,
    resume: { kind: 'finish-action', seat, actionSpaceId },
  });
  if (bad) {
    feastEvent(state, seat, 'Occupation hook could not resolve', bad, { actionSpaceId });
    finishActionNow(state, seat, actionSpaceId);
  }
}

function queueExplorationShip(
  state: FeastState, seat: number, actionSpaceId: string,
  effect: Extract<FeastPrintedEffect, { kind: 'explore' }>, continuation: FeastContinuation,
  replacementOnly = false,
): void {
  const ships = explorationShips(state.players[seat], effect.ship);
  queue(state, {
    seat, kind: 'exploration', label: 'Choose the Exploring Ship',
    prompt: replacementOnly
      ? 'Choose the physical ship used for this replacement exploration.'
      : 'Choose the physical ship used, then choose the destination.',
    options: ships.map((ship) => ({
      id: ship.id,
      label: ship.type === 'whaling-boat' ? 'Whaling Boat'
        : ship.type === 'knarr' ? 'Knarr' : 'Longship',
      detail: `${ship.ore} added ore · ${ship.id}`,
    })),
    min: 1, max: 1,
    meta: {
      stage: 'ship', actionSpaceId, shipRequirement: effect.ship,
      faces: [...effect.faces], replacementOnly,
    },
    continuation, private: false,
  });
}

function queuePlunderShips(
  state: FeastState, seat: number, actionSpaceId: string, continuation: FeastContinuation,
): void {
  const configurations = plunderShipConfigurations(state.players[seat]);
  queue(state, {
    seat, kind: 'ship', label: 'Choose Plundering Ships',
    prompt: 'Choose the physical two-longship pair, or a Steersman knarr configuration.',
    options: configurations.map(({ id, label, detail }) => ({ id, label, detail })),
    min: 1, max: 1, meta: { mode: 'plunder-ships', actionSpaceId },
    continuation, private: false,
  });
}

function queueEffect(
  state: FeastState, seat: number, actionSpaceId: string,
  effect: FeastPrintedEffect, continuation: FeastContinuation,
): string | null {
  const player = state.players[seat];
  switch (effect.kind) {
    case 'choose':
      queue(state, {
        seat, kind: 'goods', label: 'Choose an Effect', prompt: 'Choose the printed option(s) in order.',
        options: effect.options.map((o) => {
          const bad = optionError(state, player, o.effects, actionSpaceId);
          return { id: o.id, label: o.label, ...(bad ? { disabled: true, reason: bad } : {}) };
        }),
        min: effect.min, max: effect.max,
        meta: { mode: 'printed-choice', actionSpaceId }, continuation, private: false,
      });
      return null;
    case 'die':
      return queueDie(state, seat, actionSpaceId, effect, continuation);
    case 'mountain': queueMountain(state, seat, effect, continuation); return null;
    case 'upgrade': queueUpgrade(state, seat, effect, continuation); return null;
    case 'overseas-trade': {
      const ids = FEAST_GOOD_IDS.filter((id) => FEAST_GOOD_BY_ID[id].color === 'green' && player.goods[id] > 0);
      queue(state, {
        seat, kind: 'goods', label: 'Overseas Trading',
        prompt: 'Turn any number of different green goods to their blue reverse.',
        options: ids.map((id) => ({ id, label: `${FEAST_GOOD_BY_ID[id].name} -> ${FEAST_GOOD_BY_ID[FEAST_GOOD_BY_ID[id].upgrade!].name}` })),
        min: 0, max: ids.length, meta: { mode: 'overseas' }, continuation, private: false,
      });
      return null;
    }
    case 'special-sale': {
      const ids = state.specialSupply.filter((id) => id !== 'english-crown');
      queue(state, {
        seat, kind: 'special', label: 'Special Sale', prompt: `Buy up to ${effect.max} available special tiles at printed cost.`,
        options: ids.map((id) => {
          const x = FEAST_SPECIAL_BY_ID[id];
          const printed = x.silverCost ?? 0;
          const canBuyAlone = feastActionSilverCost(player, actionSpaceId, printed) <= player.silver;
          const canBuyInPair = ids.some((other) => other !== id && feastActionSilverCost(player, actionSpaceId, printed + (FEAST_SPECIAL_BY_ID[other]?.silverCost ?? Infinity)) <= player.silver);
          const disabled = !canBuyAlone && !canBuyInPair;
          return { id, label: x.name, detail: `${printed} silver - ${x.area} cells`, value: printed, ...(disabled ? { disabled, reason: 'No affordable one/two-tile purchase includes this tile' } : {}) };
        }),
        min: 1, max: effect.max, meta: { mode: 'sale' }, continuation, private: false,
      });
      return null;
    }
    case 'explore': {
      queueExplorationShip(state, seat, actionSpaceId, effect, continuation);
      return null;
    }
    case 'emigrate': {
      const ships = activeShips(player).filter((x) => x.type === 'knarr' || x.type === 'longship');
      const cost = feastActionSilverCost(player, actionSpaceId, state.round);
      const options = ships.map((x) => ({ id: x.id, label: `Emigrate ${x.type === 'knarr' ? 'Knarr' : 'Longship'}`, detail: `${x.type === 'knarr' ? 18 : 21} VP` }));
      if (effect.exchangeWhaling) {
        for (const boat of activeShips(player, 'whaling-boat')) options.push({ id: `exchange:${boat.id}`, label: 'Exchange Whaling Boat for Knarr, then Emigrate', detail: 'Ore on the whaling boat is lost; emigrated knarr scores 18 VP.' });
      }
      queue(state, {
        seat, kind: 'emigration', label: 'Emigrate', prompt: `Pay ${cost} silver and choose the large ship to emigrate.`,
        options, min: 1, max: 1, meta: { cost, actionSpaceId, exchangeWhaling: !!effect.exchangeWhaling }, continuation, private: false,
      });
      return null;
    }
    case 'occupation': {
      if (effect.mode === 'draw') {
        return drawOccupationWithHooks(state, seat, continuation, true);
      }
      // An occupation-only action must play at least one; the paid first-column
      // space also grants silver and therefore may legally skip the card.
      const min = actionSpaceId === 'play-occupations-2' || actionSpaceId === 'play-occupations-4' ? 1 : effect.min;
      queueOccupation(state, seat, min, Math.min(effect.max, player.occupationHand.length), continuation, effect.payment ?? []);
      return null;
    }
    case 'forge': {
      const ids = state.specialSupply.filter((id) => FEAST_SPECIAL_BY_ID[id]?.forge);
      queue(state, {
        seat, kind: 'special', label: 'Forge', prompt: 'Take Jewelry or one available special tile with forge tongs.',
        options: [{ id: 'jewelry', label: 'Jewelry', detail: 'Standard blue good' }, ...ids.map((id) => ({ id, label: FEAST_SPECIAL_BY_ID[id].name, detail: `${FEAST_SPECIAL_BY_ID[id].area} cells` }))],
        min: 1, max: 1, meta: { mode: 'forge' }, continuation, private: false,
      });
      return null;
    }
    case 'plunder': queuePlunderShips(state, seat, actionSpaceId, continuation); return null;
    default: return `Unsupported queued effect ${(effect as { kind: string }).kind}`;
  }
}

function applySimpleEffect(
  state: FeastState, seat: number, actionSpaceId: string, effect: FeastPrintedEffect,
): { handled: boolean; error: string | null } {
  const player = state.players[seat];
  switch (effect.kind) {
    case 'pay': {
      const error = spendItems(state, player, effect.items, actionSpaceId);
      if (!error && effect.items.some((x) => x.amount > 0)) player.turnEffectUsed = true;
      return { handled: true, error };
    }
    case 'gain': gainItems(state, player, effect.items, actionSpaceId); if (effect.items.some((x) => x.amount > 0)) player.turnEffectUsed = true; return { handled: true, error: null };
    case 'build': { const error = gainBuilding(state, player, effect.building); if (!error) player.turnEffectUsed = true; return { handled: true, error }; }
    case 'ship': { const error = gainShip(state, player, effect.ship); if (!error) player.turnEffectUsed = true; return { handled: true, error }; }
    case 'conditional-production': {
      const count = effect.animal === 'cattle'
        ? player.goods.cattle + player.goods['pregnant-cattle']
        : player.goods.sheep + player.goods['pregnant-sheep'];
      player.goods[effect.good] += Math.min(effect.max, count);
      if (count > 0) player.turnEffectUsed = true;
      return { handled: true, error: count ? null : `Needs at least one ${effect.animal}` };
    }
    case 'weekly-four':
      player.goods.spices++; player.silver++;
      if (player.goods.cattle + player.goods['pregnant-cattle'] > 0) player.goods.milk += 2;
      if (player.goods.sheep + player.goods['pregnant-sheep'] > 0) player.goods.wool++;
      player.turnEffectUsed = true;
      return { handled: true, error: null };
    case 'draw-weapons':
      for (let i = 0; i < effect.amount; i++) {
        const w = feastDrawWeapon(state);
        if (w) player.weapons[w]++;
      }
      if (effect.amount > 0) player.turnEffectUsed = true;
      return { handled: true, error: null };
    default: return { handled: false, error: null };
  }
}

function runPrinted(
  state: FeastState, seat: number, actionSpaceId: string, startIndex: number,
  resumeAfter?: FeastContinuation,
): string | null {
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  if (!def) return 'Unknown action space';
  for (let i = startIndex; i < def.effects.length; i++) {
    const effect = def.effects[i];
    if (printedEffectSuppressed(state, seat, actionSpaceId, effect)) {
      // The Adventurer replaces only the destination reward; the real action
      // still uses one physical ship. Stage that identity after the replacement
      // board is chosen so longship-use cards and replay facts remain exact.
      if (effect.kind === 'explore' && acceptedActionReplacements(state, seat, actionSpaceId)
        .some((replacement) => replacement.cardId === 'occupation-107')) {
        queueExplorationShip(state, seat, actionSpaceId, effect, {
          kind: 'printed', actionSpaceId, effectIndex: i + 1,
          ...(resumeAfter ? { resume: resumeAfter } : {}),
        }, true);
        return null;
      }
      continue;
    }
    const before = structuredClone(state.players[seat]);
    const simple = applySimpleEffect(state, seat, actionSpaceId, effect);
    if (simple.handled) {
      if (simple.error) return simple.error;
      const contexts = gainOccupationContexts(state, seat, actionSpaceId, before);
      if (contexts.length) return runOccupationContextChain(state, {
        kind: 'occupation-context-chain', contexts, index: 0,
        resume: { kind: 'printed', actionSpaceId, effectIndex: i + 1, ...(resumeAfter ? { resume: resumeAfter } : {}) },
      });
      continue;
    }
    const bad = queueEffect(state, seat, actionSpaceId, effect, {
      kind: 'printed', actionSpaceId, effectIndex: i + 1,
      ...(resumeAfter ? { resume: resumeAfter } : {}),
    });
    if (bad) return bad;
    // Occupation draws may complete synchronously when no replacement card is
    // eligible; drawOccupationWithHooks already resumed the continuation in
    // that case, so this stack frame must not execute later effects twice.
    if (state.pending.length || (effect.kind === 'occupation' && effect.mode === 'draw')) return null;
  }
  if (!resumeAfter) {
    finishPrinted(state, seat, actionSpaceId);
    return null;
  }
  const contexts = actionOccupationContexts(state, seat, actionSpaceId, 'action-resolved', 'after');
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: resumeAfter,
  });
}

function runSelectedEffects(
  state: FeastState, seat: number, actionSpaceId: string,
  effects: readonly FeastPrintedEffect[], continuation: FeastContinuation,
): string | null {
  for (const effect of effects) {
    const simple = applySimpleEffect(state, seat, actionSpaceId, effect);
    if (simple.handled) {
      if (simple.error) return simple.error;
      continue;
    }
    const bad = queueEffect(state, seat, actionSpaceId, effect, continuation);
    if (bad) return bad;
    return null;
  }
  return resume(state, seat, continuation);
}

function resume(state: FeastState, seat: number, continuation: FeastContinuation): string | null {
  if (continuation.kind === 'printed') return runPrinted(
    state, seat, continuation.actionSpaceId, continuation.effectIndex, continuation.resume,
  );
  if (continuation.kind === 'selected-effects') return runSelectedEffects(
    state, continuation.seat, continuation.actionSpaceId,
    continuation.effects, continuation.resume,
  );
  if (continuation.kind === 'occupation-play' && continuation.resumeActionSpaceId !== undefined) {
    return runPrinted(state, seat, continuation.resumeActionSpaceId, continuation.resumeEffectIndex ?? 0);
  }
  if (continuation.kind === 'none') {
    state.players[seat].turnMayEnd = true;
    return null;
  }
  if (continuation.kind === 'occupation-card-chain') return playOccupationCardChain(state, seat, continuation);
  if (continuation.kind === 'occupation-context-chain') return runOccupationContextChain(state, continuation);
  if (continuation.kind === 'finish-action') { finishActionNow(state, continuation.seat, continuation.actionSpaceId); return null; }
  if (continuation.kind === 'finish-printed') { finishPrinted(state, continuation.seat, continuation.actionSpaceId); return null; }
  if (continuation.kind === 'queue-loot') {
    queueLoot(state, continuation.seat, continuation.actionSpaceId, continuation.result, continuation.resume);
    return null;
  }
  if (continuation.kind === 'commit-workers') return commitWorkers(state, continuation.seat, continuation.actionSpaceId, continuation.imitate);
  if (continuation.kind === 'after-worker-placement') return afterWorkerPlacement(state, continuation.seat, continuation.actionSpaceId);
  if (continuation.kind === 'start-action') return startPrintedAction(state, continuation.seat, continuation.actionSpaceId);
  if (continuation.kind === 'finish-actions-phase') {
    state.phase = 'start_player';
    feastAdvanceAutomatic(state, automaticOccupationHook);
    return null;
  }
  if (continuation.kind === 'restore-decision') { state.pending.unshift(continuation.decision); return null; }
  if (continuation.kind === 'restore-action-id') {
    const player = state.players[continuation.seat];
    player.turnActionId = continuation.actionId;
    player.turnSelectedShipIds = [...continuation.selectedShipIds];
    player.turnActionFacts = structuredClone(continuation.actionFacts);
    return resume(state, continuation.seat, continuation.resume);
  }
  if (continuation.kind === 'after-feast') return afterFeast(state, continuation);
  if (continuation.kind === 'queue-extra-feast') {
    queueExtraFeast(state, continuation.seat, continuation.resume); return null;
  }
  if (continuation.kind === 'draw-occupation') return finishOccupationDraw(state, continuation);
  if (continuation.kind === 'bonus-reward-chain') return runBonusRewardChain(state, continuation);
  if (continuation.kind === 'occupation-event') return advanceOccupationEvent(state, continuation);
  if (continuation.kind === 'occupation-deferred') return runOccupationDeferred(state, continuation);
  if (continuation.kind === 'automatic') { feastAdvanceAutomatic(state, automaticOccupationHook); return null; }
  if (continuation.kind === 'occupation-complete') return null;
  return null;
}

// ---------------------------------------------------------------------------
// Dice actions
// ---------------------------------------------------------------------------

function dieRule(actionSpaceId: string): Extract<FeastPrintedEffect, { kind: 'die' }>['rule'] | null {
  const effect = FEAST_ACTION_BY_ID[actionSpaceId]?.effects.find((x) => x.kind === 'die');
  return effect?.kind === 'die' ? effect.rule : null;
}

function occupationDieAction(kind: NonNullable<ReturnType<typeof dieRule>>['kind']): FeastOccupationEvent {
  return kind === 'hunt' ? 'hunting-game'
    : kind === 'snare' ? 'laying-snare'
      : kind === 'whale' ? 'whaling'
        : kind === 'raid' ? 'raiding' : 'pillaging';
}

function occupationUsage(state: FeastState): { records: readonly FeastOccupationUsageRecord[] } {
  return { records: (state.occupationUsage ?? []) as FeastOccupationUsageRecord[] };
}

function dieModifierContexts(
  state: FeastState, seat: number, actionSpaceId: string,
  hook: 'action-started' | 'die-rolled', window: 'before' | 'when', payments: Readonly<Record<string, number>> = {},
) {
  const rule = dieRule(actionSpaceId)!;
  const action = occupationDieAction(rule.kind);
  const fields = { seat, round: state.round, action, actionSpaceId, ...state.players[seat].turnActionFacts };
  const actionId = state.players[seat].turnActionId
    ?? `${state.round}:${seat}:${actionSpaceId}:${state.lastEvent?.seq ?? state.eventSeq}`;
  const eventId = `${actionId}:${hook}:${state.rngCounter}`;
  const events: FeastOccupationEvent[] = hook === 'die-rolled' ? ['dice-action', action] : ['dice-action', action];
  return events.map((event) => feastOccupationDieModifiers(state, seat, {
    hook, event, window, fields, actionId, eventId, payments,
  }, occupationUsage(state)));
}

function activeActionDieDelta(state: FeastState, seat: number, actionSpaceId: string): number {
  const actionId = state.players[seat].turnActionId;
  const action = occupationDieAction(dieRule(actionSpaceId)!.kind);
  if (!actionId) return 0;
  return state.occupationActiveModifiers.filter((record) => record.seat === seat && record.actionId === actionId)
    .reduce((sum, record) => {
      const modifier = record.modifier;
      if (modifier.kind !== 'modify-die' || typeof modifier.delta !== 'number') return sum;
      if (!Array.isArray(modifier.actions) || !modifier.actions.includes(action)) return sum;
      return sum + modifier.delta;
    }, 0);
}

function occupationAcceptedForCurrentAction(state: FeastState, seat: number, cardId: string): boolean {
  const actionId = state.players[seat].turnActionId;
  return !!actionId && state.occupationUsage.some((record) => record.cardId === cardId && record.actionId === actionId);
}

function dieResolvedOccupationContexts(
  state: FeastState, seat: number, actionSpaceId: string, success: boolean,
  fields: Record<string, string | number | boolean> = {},
): FeastOccupationContextState[] {
  const rule = dieRule(actionSpaceId)!;
  const action = occupationDieAction(rule.kind);
  const actionId = state.players[seat].turnActionId ?? `${state.round}:${seat}:${actionSpaceId}:${state.eventSeq}`;
  const player = state.players[seat];
  const actionDef = FEAST_ACTION_BY_ID[actionSpaceId];
  const workers = state.actionSpaces.find((space) => space.id === actionSpaceId)?.occupants
    .find((occupant) => occupant.seat === seat)?.workers ?? 0;
  return [...new Set(['dice-action', action])].map((event, index) => feastOccupationContext(
    state, seat, 'die-resolved', event as Parameters<typeof feastOccupationContext>[3], 'after',
    {
      action, actionSpaceId, phase: state.phase, success,
      source: workers > 0 ? 'action-space' : 'occupation', workers,
      column: actionDef?.column ?? 0,
      selectedShipIds: [...player.turnSelectedShipIds], ...player.turnActionFacts,
      ...fields,
    },
    { actionId, eventId: `${actionId}:die-resolved:${index}:${state.eventSeq}` },
  ));
}

function queueDie(
  state: FeastState, seat: number, actionSpaceId: string,
  effect: Extract<FeastPrintedEffect, { kind: 'die' }>, resumeAfter: FeastContinuation,
): string | null {
  const rule = effect.rule;
  const rollLimit = dieModifierContexts(state, seat, actionSpaceId, 'action-started', 'before')
    .reduce((maximum, modifiers) => Math.max(maximum, modifiers.rollLimit ?? rule.maxRolls), rule.maxRolls);
  const player = state.players[seat];
  const ships = rule.kind === 'whale' ? activeShips(player, 'whaling-boat')
    : rule.kind === 'raid' || rule.kind === 'pillage'
      ? player.ships.filter((ship) => !ship.emigrated && (ship.type === 'longship'
        || (ship.type === 'knarr' && player.playedOccupations.includes('occupation-147'))))
      : [];
  const selectShips = rule.kind === 'whale' || rule.kind === 'raid' || rule.kind === 'pillage';
  const shipMinimum = rule.kind === 'whale' ? rule.boatsMin ?? 1 : 1;
  const shipMaximum = rule.kind === 'whale' ? rule.boatsMax ?? 3 : 1;
  queue(state, {
    seat, kind: 'die', label: dieLabel(rule.kind),
    prompt: selectShips
      ? rule.kind === 'whale'
        ? `Choose ${shipMinimum}-${shipMaximum} whaling boat${shipMaximum === 1 ? '' : 's'}.`
        : `Choose the ${rule.kind === 'raid' ? 'raiding' : 'pillaging'} ship for this attempt.`
      : `Roll the d${rule.sides}; you may roll up to ${rollLimit} times.`,
    options: selectShips
      ? ships.map((ship) => ({
        id: ship.id,
        label: ship.type === 'whaling-boat' ? 'Whaling Boat'
          : ship.type === 'knarr' ? 'Knarr (Steersman)' : 'Longship',
        detail: ship.type === 'whaling-boat' ? `${ship.ore + 1} roll reduction (includes printed ore)`
          : ship.type === 'longship' ? `${ship.ore} added ore` : 'Substitutes for a longship; cannot hold ore',
      }))
      : [{ id: 'roll', label: `Roll d${rule.sides}` }],
    min: selectShips ? shipMinimum : 1, max: selectShips ? shipMaximum : 1,
    meta: { stage: selectShips ? 'boats' : 'roll', sides: rule.sides, direction: rule.direction, rollsRemaining: rollLimit, rollLimit },
    continuation: {
      kind: 'die', actionSpaceId, stage: 'roll', rolls: [], result: null,
      selectedShips: [], resume: resumeAfter,
      returnWorkersOnFailure: resumeAfter.kind === 'printed' && resumeAfter.resume === undefined,
    },
    private: false,
  });
  if (selectShips) return null;
  const decision = state.pending.pop()!;
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain',
    contexts: actionOccupationContexts(state, seat, actionSpaceId, 'action-started', 'before', {
      action: occupationDieAction(rule.kind),
      source: player.turnActionFacts.source === 'occupation' ? 'occupation' : 'action-space',
    }),
    index: 0, resume: { kind: 'restore-decision', decision },
  });
}

function dieLabel(kind: string): string {
  return ({ raid: 'Raiding', pillage: 'Pillaging', hunt: 'Hunting Game', snare: 'Laying a Snare', whale: 'Whaling' } as Record<string, string>)[kind] ?? 'Die Action';
}

function returnVikingsFromAction(state: FeastState, seat: number, actionSpaceId: string, amount: number): number {
  if (amount <= 0) return 0;
  const space = state.actionSpaces.find((x) => x.id === actionSpaceId);
  const occupant = space?.occupants.find((x) => x.seat === seat);
  if (!space || !occupant) return 0;
  const returned = Math.min(amount, occupant.workers);
  occupant.workers -= returned;
  state.players[seat].workersAvailable += returned;
  if (occupant.workers === 0) space.occupants = space.occupants.filter((x) => x !== occupant);
  return returned;
}

function awardSearchedWeapon(state: FeastState, player: FeastPlayer, weapon: FeastWeapon): void {
  if (!feastTakeWeapon(state, weapon)) state.weaponSubstitutes[weapon]++;
  player.weapons[weapon]++;
}

function dieFailure(
  state: FeastState, seat: number, actionSpaceId: string,
  resumeAfter: FeastContinuation, rollsUsed = 0, returnWorkers = true,
): string | null {
  const rule = dieRule(actionSpaceId);
  if (!rule) return 'Missing die rule';
  const p = state.players[seat];
  const beforePlayer = structuredClone(p);
  p.turnEffectUsed = true;
  if (rule.kind === 'raid' || rule.kind === 'pillage') {
    p.resources.stone++;
    awardSearchedWeapon(state, p, 'long-sword');
  } else {
    p.resources.wood++;
    const weapon: FeastWeapon = rule.kind === 'hunt' ? 'bow' : rule.kind === 'snare' ? 'snare' : 'spear';
    awardSearchedWeapon(state, p, weapon);
  }
  const workersReturned = returnWorkers
    ? returnVikingsFromAction(state, seat, actionSpaceId, rule.returnedVikingsOnFailure) : 0;
  feastEvent(state, seat, `${dieLabel(rule.kind)} failed`, 'Consolation received; returned Vikings may be used again.', { actionSpaceId });
  const actionId = p.turnActionId ?? `${state.round}:${seat}:${actionSpaceId}:${state.eventSeq}`;
  const mutationContexts = occupationMutationContexts(state, seat, beforePlayer, {
    source: returnWorkers ? 'action-space' : 'occupation', actionId,
    eventId: `${actionId}:failure-consolation:${state.eventSeq}`,
  });
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain',
    // The before/after mutation diff above is the single authority for both
    // consolation receipts and the physical worker-return batch. Emitting a
    // second hand-built worker pair here would fire cards 151/168 twice.
    contexts: [...mutationContexts,
      ...dieResolvedOccupationContexts(state, seat, actionSpaceId, false, { declaredFailure: true, rollsUsed, workersReturned })],
    index: 0, resume: resumeAfter,
  });
}

function spendAllocation(choice: FeastDecisionChoice, id: string): number {
  return choice.allocations?.filter((x) => x.id === id).reduce((n, x) => n + x.amount, 0) ?? 0;
}

function queueLoot(
  state: FeastState, seat: number, actionSpaceId: string, result: number,
  resumeAfter: FeastContinuation,
): void {
  const player = state.players[seat];
  const split = occupationAcceptedForCurrentAction(state, seat, 'occupation-136') ? 2 : 1;
  const greenInstead = occupationAcceptedForCurrentAction(state, seat, 'occupation-138');
  const options: FeastPendingDecision['options'] = greenInstead
    ? FEAST_GOOD_IDS.filter((id) => FEAST_GOOD_BY_ID[id].color === 'green')
      .flatMap((id) => {
        const blue = FEAST_GOOD_BY_ID[id].upgrade;
        const sword = blue ? (BLUE_SWORD_VALUE[blue] ?? Infinity) - 1 : Infinity;
        return sword <= result ? [{
          id: `good:${id}`, label: FEAST_GOOD_BY_ID[id].name,
          detail: `Green tile · sword ${sword} (blue back minus 1)`, value: sword,
        }] : [];
      })
    : Object.entries(BLUE_SWORD_VALUE)
      .filter(([, sword]) => (sword ?? 99) <= result)
      .map(([id, sword]) => ({
        id: `good:${id}`, label: FEAST_GOOD_BY_ID[id as FeastGood].name,
        detail: `Sword ${sword}`, value: sword,
      }));
  const highestSpecial = Math.max(0, ...state.specialSupply.map((id) => FEAST_SPECIAL_BY_ID[id]?.swordValue ?? 0));
  const reduceTopSpecial = player.playedOccupations.includes('occupation-139');
  for (const id of state.specialSupply) {
    const x = FEAST_SPECIAL_BY_ID[id];
    const sword = x ? x.swordValue - (reduceTopSpecial && x.swordValue === highestSpecial ? 1 : 0) : Infinity;
    if (x && sword <= result) options.push({
      id: `special:${id}`, label: x.name,
      detail: `Sword ${sword}${sword !== x.swordValue ? ` (${x.swordValue} reduced by Loot Hunter)` : ''}`,
      value: sword,
    });
  }
  queue(state, {
    seat, kind: 'die-spend', label: 'Choose Loot',
    prompt: split === 2
      ? `Take one tile, or split battle result ${result} across two tiles whose combined sword value is at most ${result}.`
      : `Take one ${greenInstead ? 'green' : 'blue'} or special tile with sword value at most ${result}.`,
    options, min: 1, max: split,
    meta: { stage: 'loot', result, actionSpaceId, lootSplit: split, greenInstead },
    continuation: {
      kind: 'die', actionSpaceId, stage: 'loot', rolls: [], result,
      resume: resumeAfter, returnWorkersOnFailure: false,
    }, private: false,
  });
}

function resolveDieDecision(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const cont = decision.continuation;
  if (cont.kind !== 'die') return 'Broken die continuation';
  const rule = dieRule(cont.actionSpaceId);
  if (!rule) return 'Missing die rule';
  const p = state.players[decision.seat];
  const ids = choice.optionIds ?? [];
  const stage = String(decision.meta?.stage ?? 'roll');

  if (stage === 'boats') {
    const unique = [...new Set(ids)];
    const minimum = rule.kind === 'whale' ? rule.boatsMin ?? 1 : 1;
    const maximum = rule.kind === 'whale' ? rule.boatsMax ?? 3 : 1;
    if (unique.length < minimum || unique.length > maximum) return `Choose ${minimum}-${maximum} ship${maximum === 1 ? '' : 's'}`;
    const eligible = rule.kind === 'whale' ? activeShips(p, 'whaling-boat')
      : p.ships.filter((ship) => !ship.emigrated && (ship.type === 'longship'
        || (ship.type === 'knarr' && p.playedOccupations.includes('occupation-147'))));
    if (unique.some((id) => !eligible.some((ship) => ship.id === id))) return 'Choose eligible owned active ships';
    decision.continuation = { ...cont, selectedShips: unique };
    decision.options = [{ id: 'roll', label: `Roll d${rule.sides}` }];
    decision.min = 1; decision.max = 1;
    const rollLimit = Number(decision.meta?.rollLimit ?? rule.maxRolls);
    decision.prompt = rule.kind === 'whale'
      ? `Roll the d${rule.sides} up to ${rollLimit} times; chosen boats reduce the result by printed and added ore.`
      : `Roll the d${rule.sides} up to ${rollLimit} times with the selected ship.`;
    decision.meta = { stage: 'roll', sides: rule.sides, direction: rule.direction, rollsRemaining: rollLimit, rollLimit };
    p.turnSelectedShipIds = unique;
    const selected = unique.map((id) => p.ships.find((ship) => ship.id === id)).filter((ship): ship is FeastShip => !!ship);
    p.turnActionFacts = {
      ...p.turnActionFacts,
      shipId: unique[0] ?? '', shipType: selected[0]?.type ?? '',
      whalingBoatsUsed: rule.kind === 'whale' ? selected.length : 0,
      longshipsUsed: selected.filter((ship) => ship.type === 'longship').length,
      shipOre: selected[0]?.ore ?? 0,
    };
    const restored = structuredClone(decision);
    state.pending.shift();
    return runOccupationContextChain(state, {
      kind: 'occupation-context-chain',
      contexts: actionOccupationContexts(state, decision.seat, cont.actionSpaceId, 'action-started', 'before', {
        action: occupationDieAction(rule.kind), source: 'action-space', ...p.turnActionFacts,
      }),
      index: 0, resume: { kind: 'restore-decision', decision: restored },
    });
  }

  const command = ids[0];
  if (stage === 'roll' || command === 'reroll') {
    if (command !== 'roll' && command !== 'reroll') return 'Choose Roll';
    const rollLimit = Number(decision.meta?.rollLimit ?? rule.maxRolls);
    if (cont.rolls.length >= rollLimit) return 'No rolls remain';
    const physicalRoll = 1 + Math.floor(feastRandom(state) * rule.sides);
    const modifierDelta = dieModifierContexts(state, decision.seat, cont.actionSpaceId, 'die-rolled', 'when')
      .reduce((sum, modifiers) => sum + modifiers.delta, 0)
      + activeActionDieDelta(state, decision.seat, cont.actionSpaceId);
    const rolled = Math.max(0, physicalRoll + modifierDelta);
    const rolls = [...cont.rolls, rolled];
    let result = rolled;
    if (rule.kind === 'whale') {
      const boats = (cont.selectedShips ?? []).map((id) => p.ships.find((x) => x.id === id)).filter((x): x is FeastShip => !!x);
      result = Math.max(0, rolled - boats.reduce((n, x) => n + x.ore + 1, 0));
    } else if (rule.kind === 'pillage') {
      const ship = (cont.selectedShips ?? []).map((id) => p.ships.find((candidate) => candidate.id === id)).find(Boolean);
      result += ship?.type === 'longship' ? ship.ore : 0;
    }
    decision.continuation = { ...cont, stage: 'spend', rolls, result };
    decision.options = [
      ...(rolls.length < rollLimit && !(rule.direction === 'low' && result === 0) ? [{ id: 'reroll', label: `Re-roll (${rollLimit - rolls.length} left)` }] : []),
      { id: 'resolve', label: rule.direction === 'low' ? `Pay ${result} and Succeed` : `Resolve Battle Result ${result}` },
      { id: 'fail', label: 'Declare Failure', ...(rule.direction === 'low' && result === 0 ? { disabled: true, reason: 'A result of 0 must succeed' } : {}) },
    ];
    decision.prompt = modifierDelta
      ? `${dieLabel(rule.kind)} rolled ${physicalRoll}; occupations changed the roll to ${rolled}, current result ${result}.`
      : `${dieLabel(rule.kind)} rolled ${rolled}; current result ${result}.`;
    decision.meta = {
      stage: 'spend', sides: rule.sides, result, rolled,
      rollsRemaining: rollLimit - rolls.length, rollLimit,
      wood: p.resources.wood, stone: p.resources.stone,
      weapon: rule.kind === 'hunt' ? p.weapons.bow : rule.kind === 'snare' ? p.weapons.snare : rule.kind === 'whale' ? p.weapons.spear : p.weapons['long-sword'],
      weaponValue: rule.kind === 'whale' && p.playedOccupations.includes('occupation-11') ? 2 : 1,
      stoneValue: (rule.kind === 'raid' || rule.kind === 'pillage') && p.playedOccupations.includes('occupation-89') ? 2 : 1,
      spearSubstitution: (rule.kind === 'raid' || rule.kind === 'pillage')
        && occupationAcceptedForCurrentAction(state, decision.seat, 'occupation-137'),
      spears: p.weapons.spear,
    };
    feastEvent(state, decision.seat, `Rolled d${rule.sides}`, `${physicalRoll}${modifierDelta ? ` ${modifierDelta > 0 ? '+' : ''}${modifierDelta} = ${rolled}` : ''} -> result ${result}`, { actionSpaceId: cont.actionSpaceId, die: { sides: rule.sides, result, roll: rolls.length } });
    return null;
  }

  const current = decision.continuation;
  if (current.kind !== 'die' || current.result === null) return 'Roll first';
  if (command === 'fail') {
    if (rule.direction === 'low' && current.result === 0) return 'A result of 0 must succeed';
    state.pending.shift();
    return dieFailure(
      state, decision.seat, cont.actionSpaceId, current.resume,
      current.rolls.length, current.returnWorkersOnFailure,
    );
  }
  if (command !== 'resolve') return 'Choose re-roll, resolve, or fail';

  if (rule.direction === 'low') {
    const weaponId: FeastWeapon = rule.kind === 'hunt' ? 'bow' : rule.kind === 'snare' ? 'snare' : 'spear';
    const wood = spendAllocation(choice, 'wood');
    const weapons = spendAllocation(choice, weaponId);
    const weaponValue = rule.kind === 'whale' && p.playedOccupations.includes('occupation-11') ? 2 : 1;
    if (wood < 0 || weapons < 0 || wood + weapons * weaponValue !== current.result) {
      return `Pay exactly ${current.result} using wood and ${weaponId}${weaponValue === 1 ? '' : ` worth ${weaponValue} each`}`;
    }
    if (p.resources.wood < wood || p.weapons[weaponId] < weapons) return 'You do not have that payment';
    p.resources.wood -= wood;
    p.weapons[weaponId] -= weapons;
    for (let i = 0; i < weapons; i++) {
      if (state.weaponSubstitutes[weaponId] > 0) state.weaponSubstitutes[weaponId]--;
      else state.weaponDiscard.push(weaponId);
    }
    if (rule.kind === 'hunt') { p.goods.hide++; p.goods['game-meat']++; }
    else if (rule.kind === 'snare') { p.goods.fur++; awardSearchedWeapon(state, p, 'snare'); }
    else { p.goods.oil++; p.goods['skin-and-bones']++; p.goods['whale-meat']++; }
    state.pending.shift();
    p.turnEffectUsed = true;
    feastEvent(state, decision.seat, `${dieLabel(rule.kind)} succeeded`, `Paid ${wood} wood and ${weapons} ${weaponId}`, { actionSpaceId: cont.actionSpaceId });
    return runOccupationContextChain(state, {
      kind: 'occupation-context-chain',
      contexts: dieResolvedOccupationContexts(state, decision.seat, cont.actionSpaceId, true, {
        rollsUsed: current.rolls.length, woodPaid: wood, woodSpent: wood,
        spearsSpent: weaponId === 'spear' ? weapons : 0,
        whalingBoatsUsed: rule.kind === 'whale' ? (current.selectedShips ?? []).length : 0,
      }),
      index: 0, resume: current.resume,
    });
  }

  const stone = spendAllocation(choice, 'stone');
  const swords = spendAllocation(choice, 'long-sword');
  const spears = spendAllocation(choice, 'spear');
  const spearSubstitution = occupationAcceptedForCurrentAction(state, decision.seat, 'occupation-137');
  if (stone < 0 || swords < 0 || spears < 0 || p.resources.stone < stone
    || p.weapons['long-sword'] < swords || p.weapons.spear < spears
    || (spears > 0 && !spearSubstitution)) return 'Invalid battle payment';
  const stoneValue = p.playedOccupations.includes('occupation-89') ? 2 : 1;
  const result = current.result + stone * stoneValue + swords + spears;
  if (result <= 5) return 'A battle result of 5 or less must fail';
  p.resources.stone -= stone;
  p.weapons['long-sword'] -= swords;
  p.weapons.spear -= spears;
  for (let i = 0; i < swords; i++) {
    if (state.weaponSubstitutes['long-sword'] > 0) state.weaponSubstitutes['long-sword']--;
    else state.weaponDiscard.push('long-sword');
  }
  for (let i = 0; i < spears; i++) {
    if (state.weaponSubstitutes.spear > 0) state.weaponSubstitutes.spear--;
    else state.weaponDiscard.push('spear');
  }
  state.pending.shift();
  p.turnEffectUsed = true;
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain',
      contexts: dieResolvedOccupationContexts(state, decision.seat, cont.actionSpaceId, true, {
        rollsUsed: current.rolls.length, longSwordsSpent: swords, spearsSpent: spears,
        stoneSpent: stone, stoneValue, result,
      }),
      index: 0, resume: {
        kind: 'queue-loot', seat: decision.seat, actionSpaceId: cont.actionSpaceId,
        result, resume: current.resume,
      },
  });
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

function chosenIds(decision: FeastPendingDecision, choice: FeastDecisionChoice): { ids: string[]; error: string | null } {
  const ids = choice.optionIds ?? [];
  if (new Set(ids).size !== ids.length) return { ids, error: 'Choose each option at most once' };
  if (ids.length < (decision.min ?? 0) || ids.length > (decision.max ?? ids.length)) return { ids, error: `Choose ${decision.min ?? 0}-${decision.max ?? ids.length} options` };
  for (const id of ids) {
    const option = decision.options.find((x) => x.id === id);
    if (!option) return { ids, error: `Unknown option ${id}` };
    if (option.disabled) return { ids, error: option.reason ?? 'That option is disabled' };
  }
  return { ids, error: null };
}

function resolvePrintedChoice(state: FeastState, decision: FeastPendingDecision, ids: string[]): string | null {
  const cont = decision.continuation;
  if (cont.kind !== 'printed') return 'Broken printed choice';
  const effect = FEAST_ACTION_BY_ID[cont.actionSpaceId]?.effects[cont.effectIndex - 1];
  if (!effect || effect.kind !== 'choose') return 'Missing printed choice';
  if (cont.actionSpaceId === 'craft-chest' && ids.length === 1) {
    const option = effect.options.find((candidate) => candidate.id === ids[0]);
    if (!option) return 'Unknown printed option';
    const payments = option.effects.filter((candidate) => candidate.kind === 'pay')
      .flatMap((candidate) => candidate.items);
    recordBuildingResourcePayments(state.players[decision.seat], payments);
    state.pending.shift();
    const contexts = actionOccupationContexts(
      state, decision.seat, cont.actionSpaceId, 'action-started', 'before',
      state.players[decision.seat].turnActionFacts,
    );
    return runOccupationContextChain(state, {
      kind: 'occupation-context-chain', contexts, index: 0,
      resume: {
        kind: 'selected-effects', seat: decision.seat, actionSpaceId: cont.actionSpaceId,
        effects: [...option.effects], resume: cont,
      },
    });
  }
  state.pending.shift();
  for (const id of ids) {
    const option = effect.options.find((x) => x.id === id);
    if (!option) return 'Unknown printed option';
    const bad = runSelectedEffects(state, decision.seat, cont.actionSpaceId, option.effects, cont);
    if (bad) return bad;
    if (state.pending.length) return null;
  }
  return ids.length ? null : resume(state, decision.seat, cont);
}

function resolveMountain(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const allowances = (decision.meta?.allowances as number[] | undefined) ?? [];
  const allocations = choice.allocations ?? [];
  if (allocations.some((x) => !Number.isInteger(x.amount) || x.amount < 0)) return 'Mountain amounts must be non-negative integers';
  const used = allocations.filter((x) => x.amount > 0);
  const total = used.reduce((n, x) => n + x.amount, 0);
  if (total < (decision.min ?? 0) || total > (decision.max ?? total)) return `Take ${decision.min ?? 0}-${decision.max ?? total} mountain items`;
  if (new Set(used.map((x) => x.id)).size !== used.length) return 'Use each strip at most once';
  if (used.length > allowances.length) return `Use at most ${allowances.length} strips`;
  for (let i = 0; i < used.length; i++) {
    if (used[i].amount > allowances[i]) return `Strip ${i + 1} allows at most ${allowances[i]} items`;
    const offered = decision.options.find((option) => option.id === used[i].id);
    if (!offered) return 'Choose an offered mountain strip';
    if (offered.disabled) return offered.reason ?? 'That mountain strip is unavailable';
    const strip = state.mountains.find((x) => x.id === used[i].id);
    if (!strip || strip.items.length < used[i].amount) return 'That strip does not have enough items';
    const allowedItems = Array.isArray(decision.meta?.allowedItems)
      ? (decision.meta.allowedItems as string[]) : null;
    const selectedItems = strip.items.slice(0, used[i].amount);
    // Appendix: the printed 2-silver mountain token counts as one legal item
    // even on occupation actions labelled "Take 1 Building Resource".
    if (allowedItems && selectedItems.some((item) => !allowedItems.includes(item))) {
      return 'That strip would include an item this occupation cannot take';
    }
  }
  const p = state.players[decision.seat];
  const beforePlayer = structuredClone(p);
  const occupationContexts: FeastOccupationContextState[] = [];
  const mountainItemsTaken: string[] = [];
  const actionId = p.turnActionId ?? `${state.round}:${decision.seat}:mountain:${state.eventSeq}`;
  for (const allocation of used) {
    const strip = state.mountains.find((x) => x.id === allocation.id)!;
    for (let i = 0; i < allocation.amount; i++) {
      const item = strip.items.shift()!;
      mountainItemsTaken.push(item === 'silver-2' ? 'silver' : item);
      if (item === 'silver-2') p.silver += 2;
      else p.resources[item]++;
      occupationContexts.push(feastOccupationContext(state, decision.seat, 'mountain-item-taken', 'mountain-take', 'when', {
        item, stripId: strip.id, wasLastStripSpace: strip.items.length === 0, amount: item === 'silver-2' ? 2 : 1,
      }, { actionId, eventId: `${actionId}:mountain:${strip.id}:${i}:${state.eventSeq}` }));
      occupationContexts.push(feastOccupationContext(state, decision.seat, 'mountain-item-taken', 'mountain-take', 'after', {
        item, stripId: strip.id, wasLastStripSpace: strip.items.length === 0, amount: item === 'silver-2' ? 2 : 1,
      }, { actionId, eventId: `${actionId}:mountain-after:${strip.id}:${i}:${state.eventSeq}` }));
    }
  }
  const mountainItemTypes = [...new Set(mountainItemsTaken)];
  // A private, pre-action mountain grant is not part of the printed parent
  // action space and must not reclassify that parent for cards such as 122.
  if (decision.continuation.kind === 'printed') p.turnActionFacts = {
    ...p.turnActionFacts,
    mountainItemsTaken,
    mountainItemTypes,
    distinctMountainItemTypes: mountainItemTypes.length,
  };
  if (total > 0) p.turnEffectUsed = true;
  state.mountains = state.mountains.filter((x) => x.items.length);
  const cont = decision.continuation;
  if (total > 0) occupationContexts.push(...(cont.kind === 'printed'
    ? gainOccupationContexts(state, decision.seat, cont.actionSpaceId, beforePlayer)
    : occupationMutationContexts(state, decision.seat, beforePlayer, {
      source: 'occupation', actionId: p.turnActionId ?? undefined,
    })));
  state.pending.shift();
  return occupationContexts.length ? runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts: occupationContexts, index: 0, resume: cont,
  }) : resume(state, decision.seat, cont);
}

function resolveGoods(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const mode = String(decision.meta?.mode ?? '');
  const p = state.players[decision.seat];
  const beforePlayer = structuredClone(p);
  let exchanged: string[] = [];
  if (mode === 'printed-choice') {
    const { ids, error } = chosenIds(decision, choice);
    return error ?? resolvePrintedChoice(state, decision, ids);
  }
  if (mode === 'upgrade') {
    const steps = Number(decision.meta?.steps) as 1 | 2;
    const capacity = Number(decision.meta?.count ?? decision.max ?? 0);
    const allocations = choice.allocations ?? (choice.optionIds ?? []).map((id) => ({ id, amount: 1 }));
    const total = allocations.reduce((n, x) => n + x.amount, 0);
    if (allocations.some((x) => !Number.isInteger(x.amount) || x.amount < 0)
      || new Set(allocations.map((x) => x.id)).size !== allocations.length
      || allocations.some((x) => !decision.options.some((o) => o.id === x.id))) return 'Invalid upgrade allocation';
    if (total < (decision.min ?? 0) || total > Number(decision.meta?.count ?? decision.max ?? 0)) return `Upgrade ${decision.min ?? 0}-${decision.max ?? 0} goods`;
    for (const a of allocations) {
      const source = a.id as FeastGood;
      const dest = upgradableDestination(source, steps);
      if (!dest || p.goods[source] < a.amount) return `Cannot upgrade ${a.id} that many times`;
    }
    for (const a of allocations) {
      const source = a.id as FeastGood;
      const dest = upgradableDestination(source, steps)!;
      p.goods[source] -= a.amount; p.goods[dest] += a.amount;
    }
    exchanged = allocations.flatMap((allocation) => Array.from({ length: allocation.amount }, () => allocation.id));
    const upgradedGoods = allocations.flatMap((allocation) => {
      const destination = upgradableDestination(allocation.id as FeastGood, steps)!;
      return Array.from({ length: allocation.amount }, () => destination);
    });
    p.turnActionFacts = {
      ...p.turnActionFacts, goodsExchanged: exchanged,
      upgradedGoods, upgradeCount: total, upgradeCountCapacity: capacity, upgradeSteps: steps,
    };
    if (total > 0) p.turnEffectUsed = true;
  } else if (mode === 'overseas') {
    const { ids, error } = chosenIds(decision, choice);
    if (error) return error;
    for (const raw of ids) {
      const id = raw as FeastGood;
      const dest = FEAST_GOOD_BY_ID[id]?.upgrade;
      if (FEAST_GOOD_BY_ID[id]?.color !== 'green' || !dest || p.goods[id] < 1) return `Cannot trade ${raw}`;
      p.goods[id]--; p.goods[dest]++;
    }
    exchanged = ids;
    p.turnActionFacts = { ...p.turnActionFacts, goodsExchanged: ids };
  } else return 'Unknown goods decision';
  const cont = decision.continuation;
  state.pending.shift();
  const contexts = occupationMutationContexts(state, decision.seat, beforePlayer, {
    source: 'action-space', actionId: p.turnActionId ?? undefined,
    eventId: `${p.turnActionId ?? 'goods'}:${mode}:${state.eventSeq}`,
  });
  return contexts.length ? runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: cont,
  }) : resume(state, decision.seat, cont);
}

function playOccupationCardChain(
  state: FeastState, seat: number,
  continuation: Extract<FeastContinuation, { kind: 'occupation-card-chain' }>,
): string | null {
  if (continuation.index >= continuation.cardIds.length) {
    if (!continuation.cardIds.length) return resume(state, seat, continuation.resume);
    const actionId = state.players[seat].turnActionId
      ?? `occupation-play:${state.round}:${seat}:${continuation.cardIds.join(',')}:${state.eventSeq}`;
    const context = feastOccupationContext(
      state, seat, 'occupation-played-in-action', 'occupation-played', 'after', {
        occupationsPlayed: continuation.cardIds.length, cardIds: continuation.cardIds,
        source: continuation.printedEffect ? 'action-space' : 'occupation',
      }, { actionId, eventId: `${actionId}:occupations-played` },
    );
    const started = startOccupationEvent(state, context, continuation.resume);
    return started.error ?? (!started.handled ? resume(state, seat, continuation.resume) : null);
  }
  const id = continuation.cardIds[continuation.index];
  const p = state.players[seat];
  if (!p.occupationHand.includes(id)) return 'The next occupation is no longer in your hand';
  p.occupationHand.splice(p.occupationHand.indexOf(id), 1);
  p.playedOccupations.push(id);
  p.occupationUses.push({ cardId: id, round: state.round, usesThisRound: 0, usedOnce: false });
  feastEvent(state, seat, `Played ${FEAST_OCCUPATION_BY_ID[id]?.name ?? id}`, FEAST_OCCUPATION_BY_ID[id]?.type ?? 'occupation');
  const next: Extract<FeastContinuation, { kind: 'occupation-card-chain' }> = { ...continuation, index: continuation.index + 1 };
  const afterPlay: FeastContinuation = {
    kind: 'occupation-context-chain',
    contexts: [feastOccupationContext(
      state, seat, 'state-changed', 'inventory-threshold', 'when', {
        source: 'occupation-play', cardId: id,
        income: p.boards.reduce((sum, board) => sum + feastIncomeForBoard(board), 0),
      }, { cardId: id, eventId: feastId(state, 'occupation-threshold') },
    )],
    index: 0, resume: next,
  };
  const specialTileLocation = (specialId: string): 'board' | 'owner-supply' | 'general-supply' => {
    if (state.players.some((owner) => owner.boards.some((board) =>
      board.placements.some((placement) => placement.pieceId === specialId)))) return 'board';
    if (state.players.some((owner) => owner.specials.includes(specialId))) return 'owner-supply';
    return 'general-supply';
  };
  const context = feastOccupationContext(
    state, seat, 'card-played', 'play', 'when',
    {
      cardId: id, occupationsPlayed: continuation.cardIds.length,
      cloakpinLocation: specialTileLocation('cloakpin'),
      drinkingHornLocation: specialTileLocation('drinking-horn'),
    },
    { cardId: id, eventId: feastId(state, 'occupation-event') },
  );
  const started = startOccupationEvent(state, context, afterPlay);
  return started.error ?? (!started.handled ? runOccupationContextChain(state, afterPlay) : null);
}

function playCards(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const { ids, error } = chosenIds(decision, choice);
  if (error) return error;
  const p = state.players[decision.seat];
  if (ids.some((id) => !p.occupationHand.includes(id))) return 'Choose occupations from your hand';
  const payments = (decision.meta?.payment as string[] | undefined) ?? [];
  if (ids.length && payments.length) {
    const stone = spendAllocation(choice, 'stone');
    const ore = spendAllocation(choice, 'ore');
    if (stone + ore !== 1 || (stone && !payments.includes('stone')) || (ore && !payments.includes('ore'))) return `Pay 1 ${payments.join(' or ')}`;
    if (p.resources.stone < stone || p.resources.ore < ore) return 'You do not have that payment';
    p.resources.stone -= stone; p.resources.ore -= ore;
  }
  // Playing cards is a printed effect only on brown occupation spaces. A
  // third/fourth-column bonus is separate and cannot satisfy the rulebook's
  // requirement to use at least one effect of the occupied action space.
  if (ids.length > 0 && decision.continuation.kind === 'printed') p.turnEffectUsed = true;
  const cont = decision.continuation;
  state.pending.shift();
  return playOccupationCardChain(state, decision.seat, {
    kind: 'occupation-card-chain', cardIds: ids, index: 0,
    printedEffect: decision.continuation.kind === 'printed', resume: cont,
  });
}

function resolveSpecial(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const { ids, error } = chosenIds(decision, choice);
  if (error) return error;
  const mode = String(decision.meta?.mode ?? '');
  const p = state.players[decision.seat];
  const beforePlayer = structuredClone(p);
  if (mode === 'forge') {
    const id = ids[0];
    if (id === 'jewelry') p.goods.jewelry++;
    else {
      if (!state.specialSupply.includes(id) || !FEAST_SPECIAL_BY_ID[id]?.forge) return 'That tile cannot be forged';
      state.specialSupply.splice(state.specialSupply.indexOf(id), 1); p.specials.push(id);
    }
  } else if (mode === 'sale') {
    const printedTotal = ids.reduce((n, id) => n + (FEAST_SPECIAL_BY_ID[id]?.silverCost ?? 999), 0);
    const total = feastActionSilverCost(p, 'special-sale', printedTotal);
    if (p.silver < total) return `Those tiles cost ${total} silver`;
    if (ids.some((id) => id === 'english-crown' || !state.specialSupply.includes(id))) return 'That special tile is unavailable';
    p.silver -= total;
    for (const id of ids) { state.specialSupply.splice(state.specialSupply.indexOf(id), 1); p.specials.push(id); }
  } else return 'Unknown special-tile decision';
  if (ids.length > 0) p.turnEffectUsed = true;
  const cont = decision.continuation;
  state.pending.shift();
  const contexts = occupationMutationContexts(state, decision.seat, beforePlayer, {
    source: 'action-space', actionId: p.turnActionId ?? undefined,
    eventId: `${p.turnActionId ?? 'special'}:${mode}:${state.eventSeq}`,
  });
  return contexts.length ? runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: cont,
  }) : resume(state, decision.seat, cont);
}

function resolveExploration(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const { ids, error } = chosenIds(decision, choice);
  if (error) return error;
  const p = state.players[decision.seat];
  const stage = String(decision.meta?.stage ?? 'destination');
  const actionSpaceId = String(decision.meta?.actionSpaceId ?? '');
  const requirement = String(decision.meta?.shipRequirement ?? '') as 'any' | 'large' | 'longship';
  if (!['any', 'large', 'longship'].includes(requirement)) return 'The exploration ship requirement is missing';

  if (stage === 'ship') {
    const ship = explorationShips(p, requirement).find((candidate) => candidate.id === ids[0]);
    if (!ship) return 'Choose an eligible owned active exploration ship';
    p.turnSelectedShipIds = [ship.id];
    p.turnActionFacts = {
      ...p.turnActionFacts,
      shipId: ship.id, shipType: ship.type, shipOre: ship.ore,
      shipTypes: [ship.type], longshipsUsed: ship.type === 'longship' ? 1 : 0,
    };
    if (decision.meta?.replacementOnly === true) {
      p.turnEffectUsed = true;
      const cont = decision.continuation;
      state.pending.shift();
      return resume(state, decision.seat, cont);
    }
    const faces = Array.isArray(decision.meta?.faces)
      ? (decision.meta.faces as string[]) : [];
    const destinations = state.explorations.filter((candidate) => candidate.claimedBy === null
      && faces.includes(candidate.face));
    if (!destinations.length) return 'No eligible exploration destination remains';
    decision.label = 'Choose an Exploration';
    decision.prompt = 'Claim one available named face and its accumulated silver.';
    decision.options = destinations.map((candidate) => ({
      id: candidate.boardId,
      label: candidate.face.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
      detail: candidate.silver ? `Includes ${candidate.silver} silver` : 'No accumulated silver',
    }));
    decision.meta = {
      ...decision.meta, stage: 'destination', selectedShipId: ship.id,
    };
    return null;
  }

  if (stage !== 'destination') return 'Unknown exploration decision stage';
  const selectedShipId = String(decision.meta?.selectedShipId ?? '');
  const selectedShip = explorationShips(p, requirement).find((candidate) => candidate.id === selectedShipId);
  if (!selectedShip || !p.turnSelectedShipIds.includes(selectedShip.id)) {
    return 'The selected exploration ship is no longer eligible';
  }
  const faces = Array.isArray(decision.meta?.faces) ? (decision.meta.faces as string[]) : [];
  const target = state.explorations.find((candidate) => candidate.boardId === ids[0]
    && candidate.claimedBy === null && faces.includes(candidate.face));
  if (!target) return 'That exploration board is unavailable';
  const beforePlayer = structuredClone(p);
  target.claimedBy = decision.seat;
  const accumulatedSilver = target.silver;
  p.silver += target.silver; target.silver = 0;
  p.boards.push({ id: target.boardId, definitionId: target.face, kind: 'exploration', owner: decision.seat, placements: [] });
  p.turnActionFacts = {
    ...p.turnActionFacts, explorationBoardId: target.boardId,
    explorationFace: target.face, explorationSilver: accumulatedSilver,
  };
  p.turnEffectUsed = true;
  const cont = decision.continuation;
  state.pending.shift();
  feastEvent(state, decision.seat, `Explored ${target.face}`, `Claimed ${target.boardId}`);
  const contexts = occupationMutationContexts(state, decision.seat, beforePlayer, {
    source: 'action-space', actionId: p.turnActionId ?? undefined,
    eventId: `${p.turnActionId ?? 'explore'}:${target.boardId}:${state.eventSeq}`,
  });
  return contexts.length ? runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: cont,
  }) : resume(state, decision.seat, cont);
}

function resolveShipDecision(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const { ids, error } = chosenIds(decision, choice);
  if (error) return error;
  if (decision.meta?.mode !== 'plunder-ships') return 'Unknown ship decision';
  const p = state.players[decision.seat];
  const configuration = plunderShipConfigurations(p).find((candidate) => candidate.id === ids[0]);
  if (!configuration) return 'That Plundering ship configuration is no longer eligible';
  const ships = configuration.shipIds.map((id) => p.ships.find((ship) => ship.id === id && !ship.emigrated));
  if (ships.some((ship) => !ship)) return 'Every selected Plundering ship must still be active and owned';
  const physicalShips = ships as FeastShip[];
  const beforePlayer = structuredClone(p);
  p.turnSelectedShipIds = [...configuration.shipIds];
  p.turnActionFacts = {
    ...p.turnActionFacts,
    shipId: configuration.shipIds[0] ?? '',
    shipType: physicalShips[0]?.type ?? '',
    shipTypes: physicalShips.map((ship) => ship.type),
    shipOre: physicalShips.reduce((sum, ship) => sum + ship.ore, 0),
    shipOreById: Object.fromEntries(physicalShips.map((ship) => [ship.id, ship.ore])),
    longshipsUsed: physicalShips.filter((ship) => ship.type === 'longship').length,
  };
  p.goods['silver-hoard']++;
  p.turnEffectUsed = true;
  const cont = decision.continuation;
  state.pending.shift();
  const contexts = occupationMutationContexts(state, decision.seat, beforePlayer, {
    source: 'action-space', actionId: p.turnActionId ?? undefined,
    eventId: `${p.turnActionId ?? 'plunder'}:loot:${state.eventSeq}`,
  });
  return contexts.length ? runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: cont,
  }) : resume(state, decision.seat, cont);
}

function resolveEmigration(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const { ids, error } = chosenIds(decision, choice);
  if (error) return error;
  const p = state.players[decision.seat];
  const emigrationCost = feastActionSilverCost(p, String(decision.meta?.actionSpaceId ?? 'emigrate-2'), state.round);
  if (p.silver < emigrationCost) return `Emigration costs ${emigrationCost} silver`;
  const id = ids[0];
  let ship: FeastShip | undefined;
  if (id.startsWith('exchange:')) {
    const boatId = id.slice('exchange:'.length);
    const boat = p.ships.find((x) => x.id === boatId && !x.emigrated && x.type === 'whaling-boat');
    if (!boat) return 'Choose an active whaling boat';
    if (activeShips(p, 'knarr').length + activeShips(p, 'longship').length >= 4) return 'A large-ship berth is required for the exchange';
    p.ships.splice(p.ships.indexOf(boat), 1);
    ship = { id: feastId(state, 'knarr'), type: 'knarr', ore: 0, emigrated: false, emigratedRound: null };
    p.ships.push(ship);
  } else ship = p.ships.find((x) => x.id === id && !x.emigrated && (x.type === 'knarr' || x.type === 'longship'));
  if (!ship) return 'Choose an active knarr or longship';
  const shipOre = ship.ore;
  p.silver -= emigrationCost;
  ship.ore = 0; ship.emigrated = true; ship.emigratedRound = state.round;
  p.turnSelectedShipIds = [ship.id];
  p.turnActionFacts = {
    ...p.turnActionFacts, shipId: ship.id, shipType: ship.type, shipOre,
    shipTypes: [ship.type],
    longshipsUsed: ship.type === 'longship' ? 1 : 0,
  };
  p.turnEffectUsed = true;
  const cont = decision.continuation;
  state.pending.shift();
  feastEvent(state, decision.seat, `Emigrated a ${ship.type}`, `Paid ${emigrationCost} silver`);
  return resume(state, decision.seat, cont);
}

function resolveLoot(state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice): string | null {
  const split = Number(decision.meta?.lootSplit ?? 1);
  const allocations = choice.allocations?.length
    ? choice.allocations.filter((allocation) => allocation.amount > 0)
    : (choice.optionIds ?? []).map((id) => ({ id, amount: 1 }));
  if (allocations.some((allocation) => !Number.isSafeInteger(allocation.amount) || allocation.amount < 1)
    || new Set(allocations.map((allocation) => allocation.id)).size !== allocations.length) return 'Invalid loot allocation';
  const count = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (count < 1 || count > split) return `Choose 1-${split} loot tiles`;
  let swordTotal = 0;
  for (const allocation of allocations) {
    const option = decision.options.find((candidate) => candidate.id === allocation.id);
    if (!option || option.disabled) return option?.reason ?? `Unknown loot ${allocation.id}`;
    if (allocation.id.startsWith('special:') && allocation.amount !== 1) return 'Each unique special tile can be taken only once';
    swordTotal += Number(option.value ?? Infinity) * allocation.amount;
  }
  if (swordTotal > Number(decision.meta?.result ?? 0)) return 'Split loot exceeds the battle result';
  const p = state.players[decision.seat];
  const beforePlayer = structuredClone(p);
  for (const allocation of allocations) {
    const id = allocation.id;
    if (id.startsWith('good:')) p.goods[id.slice(5) as FeastGood] += allocation.amount;
    else if (id.startsWith('special:')) {
      const special = id.slice(8);
      if (!state.specialSupply.includes(special)) return 'That special tile is no longer available';
      state.specialSupply.splice(state.specialSupply.indexOf(special), 1); p.specials.push(special);
    } else return 'Unknown loot';
  }
  p.turnEffectUsed = true;
  const actionSpaceId = String(decision.meta?.actionSpaceId ?? (decision.continuation.kind === 'die' ? decision.continuation.actionSpaceId : ''));
  const resumeAfter = decision.continuation.kind === 'die'
    ? decision.continuation.resume
    : { kind: 'finish-printed', seat: decision.seat, actionSpaceId } as FeastContinuation;
  state.pending.shift();
  const contexts = occupationMutationContexts(state, decision.seat, beforePlayer, {
    source: 'battle-loot', actionId: p.turnActionId ?? undefined,
    eventId: `${p.turnActionId ?? 'battle'}:loot:${state.eventSeq}`,
  });
  return contexts.length ? runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: resumeAfter,
  }) : resume(state, decision.seat, resumeAfter);
}

type OccupationDeferredContinuation = Extract<FeastContinuation, { kind: 'occupation-deferred' }>;
type OccupationGrantIntent = Extract<FeastOccupationDeferredIntent, { kind: 'grant-action' }>;

function readDeferredIntent(continuation: OccupationDeferredContinuation): FeastOccupationDeferredIntent | null {
  const raw = continuation.intent as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = (raw as { kind?: unknown }).kind;
  return kind === 'grant-action' || kind === 'placement' || kind === 'feast'
    ? raw as FeastOccupationDeferredIntent : null;
}

function nextDeferredCommand(continuation: OccupationDeferredContinuation): OccupationDeferredContinuation {
  const { intent: _intent, ...rest } = continuation;
  return { ...rest, index: continuation.index + 1 };
}

function resumeGrantedAction(
  state: FeastState, seat: number, actionSpaceId: string,
  resumeAfter: FeastContinuation,
): string | null {
  const player = state.players[seat];
  const previousActionId = player.turnActionId;
  const previousSelectedShipIds = [...player.turnSelectedShipIds];
  const previousActionFacts = structuredClone(player.turnActionFacts);
  player.turnActionId = feastId(state, 'occupation-action');
  player.turnSelectedShipIds = [];
  player.turnActionFacts = { source: 'occupation', workers: 0, occupationGranted: true };
  const restore: FeastContinuation = {
    kind: 'restore-action-id', seat, actionId: previousActionId,
    selectedShipIds: previousSelectedShipIds, actionFacts: previousActionFacts,
    resume: resumeAfter,
  };
  const contexts = [
    ...actionOccupationContexts(state, seat, actionSpaceId, 'action-proposed', 'instead'),
    ...actionOccupationContexts(state, seat, actionSpaceId, 'action-proposed', 'before'),
    ...(FEAST_ACTION_BY_ID[actionSpaceId]?.effects.some((effect) => effect.kind === 'die')
      ? [] : actionOccupationContexts(state, seat, actionSpaceId, 'action-started', 'before')),
  ];
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0,
    resume: { kind: 'printed', actionSpaceId, effectIndex: 0, resume: restore },
  });
}

function deferredUpgradeAllocations(
  decision: FeastPendingDecision, choice: FeastDecisionChoice,
): { allocations: { id: string; amount: number }[]; error: string | null } {
  const allocations = choice.allocations?.length
    ? choice.allocations.filter((allocation) => allocation.amount !== 0)
    : (choice.optionIds ?? []).map((id) => ({ id, amount: 1 }));
  if (allocations.some((allocation) => !Number.isSafeInteger(allocation.amount) || allocation.amount < 0)) {
    return { allocations, error: 'Upgrade amounts must be non-negative integers' };
  }
  if (new Set(allocations.map((allocation) => allocation.id)).size !== allocations.length) {
    return { allocations, error: 'Choose each upgrade route at most once' };
  }
  for (const allocation of allocations) {
    const option = decision.options.find((candidate) => candidate.id === allocation.id);
    if (!option) return { allocations, error: `Unknown option ${allocation.id}` };
    if (option.disabled) return { allocations, error: option.reason ?? 'That option is disabled' };
  }
  const total = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  if (total < (decision.min ?? 0) || total > (decision.max ?? total)) {
    return { allocations, error: `Choose ${decision.min ?? 0}-${decision.max ?? total} upgrades` };
  }
  return { allocations, error: null };
}

function spendOccupationShipDiscount(
  state: FeastState, seat: number, intent: OccupationGrantIntent,
  choice: FeastDecisionChoice,
): { cost: number; error: string | null } {
  const player = state.players[seat];
  const base = typeof intent.resolvedParameters.silverCost === 'number'
    ? intent.resolvedParameters.silverCost
    : typeof intent.resolvedParameters.baseSilverCost === 'number'
      ? intent.resolvedParameters.baseSilverCost : 0;
  const rawDiscount = intent.resolvedParameters.discount;
  if (!rawDiscount || typeof rawDiscount !== 'object' || Array.isArray(rawDiscount)) {
    return { cost: Math.max(0, Math.floor(base)), error: null };
  }
  const discount = rawDiscount as Record<string, import('./occupationRules.js').FeastRuleValue>;
  const weaponKeys: readonly { choice: string; parameter: string; weapon: FeastWeapon }[] = [
    { choice: 'long-sword', parameter: 'longSword', weapon: 'long-sword' },
    { choice: 'bow', parameter: 'bow', weapon: 'bow' },
    { choice: 'spear', parameter: 'spear', weapon: 'spear' },
    { choice: 'snare', parameter: 'snare', weapon: 'snare' },
  ];
  if ((choice.allocations ?? []).some((allocation) => allocation.amount !== 0)) {
    return { cost: base, error: 'Quarter-master weapons are counted, not spent' };
  }
  let reduction = 0;
  for (const key of weaponKeys) {
    const rate = discount[key.parameter];
    if (typeof rate === 'number' && rate >= 0) reduction += rate * player.weapons[key.weapon];
  }
  const raw = Math.max(0, base - reduction);
  const cost = intent.resolvedParameters.roundFinalCost === 'up' ? Math.ceil(raw) : Math.floor(raw);
  if (player.silver < cost) return { cost, error: `Buying this ship costs ${cost} silver` };
  return { cost, error: null };
}

function resolveOccupationGrantIntent(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice,
  continuation: OccupationDeferredContinuation, intent: OccupationGrantIntent,
): string | null {
  const seat = decision.seat;
  const player = state.players[seat];
  const beforePlayer = structuredClone(player);
  const next = nextDeferredCommand(continuation);
  const grantActionId = `${player.turnActionId ?? `occupation:${state.round}:${seat}`}:grant:${intent.order}`;
  const finishMutation = (extraContexts: FeastOccupationContextState[] = []): string | null => {
    state.pending.shift();
    const contexts = [
      ...occupationMutationContexts(state, seat, beforePlayer, {
        cardId: continuation.cardId, clauseId: continuation.clauseId,
        actionId: grantActionId, source: 'occupation',
      }),
      ...extraContexts,
    ];
    return contexts.length ? runOccupationContextChain(state, {
      kind: 'occupation-context-chain', contexts, index: 0, resume: next,
    }) : resume(state, seat, next);
  };

  if (intent.action === 'upgrade-good') {
    const decoded = deferredUpgradeAllocations(decision, choice);
    if (decoded.error) return decoded.error;
    const routes = decoded.allocations.map((allocation) => {
      const match = /^([a-z-]+)->([a-z-]+)$/.exec(allocation.id);
      return { allocation, source: match?.[1] as FeastGood | undefined, destination: match?.[2] as FeastGood | undefined };
    });
    if (routes.some((route) => !route.source || !route.destination
      || !FEAST_GOOD_BY_ID[route.source] || !FEAST_GOOD_BY_ID[route.destination])) return 'Malformed upgrade route';
    const upgradeType = (source: FeastGood | undefined): string => intent.resolvedParameters.pregnancyStatesSameType === true
      ? source === 'pregnant-sheep' ? 'sheep'
        : source === 'pregnant-cattle' ? 'cattle' : source ?? ''
      : source ?? '';
    if (intent.resolvedParameters.allSameType === true
      && new Set(routes.map((route) => upgradeType(route.source))).size > 1) return 'All upgraded goods must be the same type';
    for (const route of routes) {
      if (player.goods[route.source!] < route.allocation.amount) return `Not enough ${route.source}`;
    }
    const total = decoded.allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const silverEach = typeof intent.resolvedParameters.silverCostEach === 'number'
      ? Math.max(0, intent.resolvedParameters.silverCostEach) : 0;
    if (player.silver < total * silverEach) return `These upgrades cost ${total * silverEach} silver`;
    player.silver -= total * silverEach;
    for (const route of routes) {
      player.goods[route.source!] -= route.allocation.amount;
      player.goods[route.destination!] += route.allocation.amount;
    }
    feastEvent(state, seat, 'Occupation upgrades resolved', `${total} good${total === 1 ? '' : 's'} upgraded`);
    return finishMutation([
      feastOccupationContext(state, seat, 'action-resolved', 'upgrade-action', 'after', {
        action: 'upgrade-good', source: 'occupation', upgradeCount: total,
        upgradeCountCapacity: intent.resolvedParameters.classifiedAsUpgrade === false ? 0
          : typeof intent.resolvedParameters.count === 'number' ? intent.resolvedParameters.count
            : typeof intent.resolvedParameters.max === 'number' ? intent.resolvedParameters.max : total,
        upgradeSteps: Math.max(0, ...routes.map((route) => {
          const option = intent.options.find((candidate) => candidate.id === route.allocation.id);
          return typeof option?.meta?.steps === 'number' ? option.meta.steps : 1;
        })),
        goodsExchanged: routes.flatMap((route) => Array.from(
          { length: route.allocation.amount }, () => route.source!,
        )),
        upgradedGoods: routes.flatMap((route) => Array.from(
          { length: route.allocation.amount }, () => route.destination!,
        )),
      }, { actionId: grantActionId, eventId: `${grantActionId}:resolved` }),
    ]);
  }

  const selected = chosenIds(decision, choice);
  if (selected.error) return selected.error;
  const ids = selected.ids;
  if (!ids.length) {
    state.pending.shift();
    return resume(state, seat, next);
  }

  if (intent.action === 'play-occupation') {
    if (ids.some((id) => !player.occupationHand.includes(id))) return 'Choose occupations from your current hand';
    state.pending.shift();
    return playOccupationCardChain(state, seat, {
      kind: 'occupation-card-chain', cardIds: ids, index: 0,
      printedEffect: false, resume: next,
    });
  }

  if (intent.action === 'action-space') {
    const actionSpaceId = ids[0];
    if (!FEAST_ACTION_BY_ID[actionSpaceId]) return 'That action space no longer exists';
    state.pending.shift();
    return resumeGrantedAction(state, seat, actionSpaceId, next);
  }

  if (intent.action === 'buy-ship') {
    const type = ids[0] as FeastShipType;
    if (!['whaling-boat', 'knarr', 'longship'].includes(type)) return 'Choose an offered ship';
    const payment = spendOccupationShipDiscount(state, seat, intent, choice);
    if (payment.error) return payment.error;
    if (player.silver < payment.cost) return `Buying this ship costs ${payment.cost} silver`;
    const problem = gainShip(state, player, type);
    if (problem) return problem;
    player.silver -= payment.cost;
    feastEvent(state, seat, `Occupation bought a ${type}`, `Paid ${payment.cost} silver`);
    return finishMutation();
  }

  if (intent.action === 'build-house') {
    const building = ids[0] as 'shed' | 'stone-house' | 'long-house';
    if (!['shed', 'stone-house', 'long-house'].includes(building)) return 'Choose an offered building';
    const problem = gainBuilding(state, player, building);
    if (problem) return problem;
    feastEvent(state, seat, `Occupation built a ${building}`, 'Building supply reduced');
    return finishMutation();
  }

  if (intent.action === 'emigration') {
    const option = intent.options.find((candidate) => candidate.id === ids[0]);
    const cost = typeof option?.meta?.silverCost === 'number' ? option.meta.silverCost : state.round;
    const ship = player.ships.find((candidate) => candidate.id === ids[0]
      && !candidate.emigrated && (candidate.type === 'knarr' || candidate.type === 'longship'));
    if (!ship) return 'Choose an active large ship';
    if (player.silver < cost) return `Emigration costs ${cost} silver`;
    const shipOre = ship.ore;
    player.silver -= cost; ship.ore = 0; ship.emigrated = true; ship.emigratedRound = state.round;
    feastEvent(state, seat, `Occupation emigrated a ${ship.type}`, `Paid ${cost} silver`);
    const facts = {
      action: 'emigration', source: 'occupation', shipId: ship.id, shipType: ship.type,
      shipOre, shipTypes: [ship.type], selectedShipIds: [ship.id],
      longshipsUsed: ship.type === 'longship' ? 1 : 0,
    };
    return finishMutation([
      feastOccupationContext(state, seat, 'action-resolved', 'emigration', 'after', {
        ...facts,
      }, { actionId: grantActionId, eventId: `${grantActionId}:resolved` }),
      ...(ship.type === 'longship' ? [feastOccupationContext(
        state, seat, 'action-resolved', 'longship-used', 'after', facts,
        { actionId: grantActionId, eventId: `${grantActionId}:longship-used` },
      )] : []),
    ]);
  }

  if (intent.action === 'hunting-game' || intent.action === 'laying-snare') {
    const actionSpaceId = intent.action === 'hunting-game' ? 'hunt-game-1' : 'lay-snare';
    const effect = FEAST_ACTION_BY_ID[actionSpaceId]?.effects.find((candidate) => candidate.kind === 'die');
    if (!effect || effect.kind !== 'die') return 'Missing granted die action';
    state.pending.shift();
    return queueDie(state, seat, actionSpaceId, effect, next);
  }

  if (intent.action === 'harvest') {
    state.pending.shift();
    feastEvent(state, seat, 'Occupation Harvest action resolved', intent.resolvedParameters.rewardsAlreadyApplied === true
      ? 'Printed rewards were already applied' : 'Private Harvest confirmed');
    const eventBase = `${grantActionId}:harvest`;
    return runOccupationContextChain(state, {
      kind: 'occupation-context-chain',
      contexts: [
        feastOccupationContext(state, seat, 'phase-started', 'harvest', 'during', {
          phase: 'harvest', harvest: true, source: 'occupation', private: true,
        }, { actionId: grantActionId, eventId: `${eventBase}:during` }),
        feastOccupationContext(state, seat, 'phase-resolved', 'harvest', 'after', {
          phase: 'harvest', harvest: true, source: 'occupation', private: true,
        }, { actionId: grantActionId, eventId: `${eventBase}:after` }),
      ],
      index: 0, resume: next,
    });
  }

  if (intent.action === 'overseas-trading') {
    for (const raw of ids) {
      const source = raw as FeastGood;
      const destination = FEAST_GOOD_BY_ID[source]?.upgrade;
      if (FEAST_GOOD_BY_ID[source]?.color !== 'green' || !destination || player.goods[source] < 1) return `Cannot trade ${raw}`;
      player.goods[source]--; player.goods[destination]++;
    }
    return finishMutation([
      feastOccupationContext(state, seat, 'action-resolved', 'overseas-trading', 'after', {
        action: 'overseas-trading', source: 'occupation', goodsExchanged: ids,
      }, { actionId: grantActionId, eventId: `${grantActionId}:resolved` }),
    ]);
  }

  if (intent.action === 'exploration') {
    const target = state.explorations.find((candidate) => candidate.boardId === ids[0] && candidate.claimedBy === null);
    if (!target) return 'That exploration board is unavailable';
    target.claimedBy = seat; player.silver += target.silver; target.silver = 0;
    player.boards.push({ id: target.boardId, definitionId: target.face, kind: 'exploration', owner: seat, placements: [] });
    return finishMutation([
      feastOccupationContext(state, seat, 'action-resolved', 'exploration', 'after', {
        action: 'exploration', source: 'occupation', boardId: target.boardId,
      }, { actionId: grantActionId, eventId: `${grantActionId}:resolved` }),
    ]);
  }

  if (intent.action === 'breeding') {
    feastBreedPlayer(player);
    return finishMutation();
  }

  if (intent.action === 'bonus') {
    feastResolveBonusScope(state, seat, 'self');
    return finishMutation();
  }

  if (intent.action === 'feast') {
    state.pending.shift(); return startExtraFeast(state, seat, next);
  }

  const printedActionByGrant: Partial<Record<OccupationGrantIntent['action'], string>> = {
    whaling: 'whaling-major', raiding: 'raid', pillaging: 'pillage-2',
    plundering: 'plunder',
  };
  const actionSpaceId = printedActionByGrant[intent.action];
  if (actionSpaceId) {
    state.pending.shift();
    return resumeGrantedAction(state, seat, actionSpaceId, next);
  }
  return `Unsupported occupation-granted action ${intent.action}`;
}

function resolveOccupationDeferredDecision(
  state: FeastState, decision: FeastPendingDecision, choice: FeastDecisionChoice,
  continuation: OccupationDeferredContinuation,
): string | null {
  const intent = readDeferredIntent(continuation);
  if (!intent) return 'Broken deferred occupation intent';
  if (intent.kind === 'grant-action') {
    return resolveOccupationGrantIntent(state, decision, choice, continuation, intent);
  }
  if (intent.kind !== 'placement') return 'Unsupported deferred occupation intent';
  const selected = chosenIds(decision, choice);
  if (selected.error) return selected.error;
  let targets = selected.ids;
  if (intent.selectionMode === 'configuration') {
    const option = intent.options.find((candidate) => candidate.id === selected.ids[0]);
    const configured = option?.meta?.targets;
    if (!Array.isArray(configured) || configured.some((target) => typeof target !== 'string')) {
      return 'That placement configuration is malformed';
    }
    targets = configured as string[];
  }
  const commands = structuredClone(continuation.commands);
  const command = commands[continuation.index];
  if (!command || (command.kind !== 'placement' && command.kind !== 'move')) {
    return 'The deferred placement command is no longer available';
  }
  commands[continuation.index] = {
    ...command, target: targets.length === 1 ? targets[0] : targets,
  } as FeastOccupationDeferredState;
  const { intent: _intent, ...rest } = continuation;
  state.pending.shift();
  return runOccupationDeferred(state, { ...rest, commands });
}

function resolveDecision(state: FeastState, seat: number, action: Extract<FeastAction, { type: 'resolve_decision' }>): FeastResult {
  const decision = state.pending[0];
  if (!decision) return feastErr('There is no pending decision');
  if (decision.id !== action.decisionId) return feastErr('That decision is no longer active');
  if (decision.seat !== seat) return feastErr('This is another player’s decision');
  let bad: string | null = null;
  if (decision.kind === 'setup-occupation') {
    const { ids, error } = chosenIds(decision, action.choice);
    bad = error;
    if (!bad) {
      const id = ids[0];
      if (!state.startingOccupationDeck.includes(id)) bad = 'That starting occupation is unavailable';
      else {
        state.startingOccupationDeck.splice(state.startingOccupationDeck.indexOf(id), 1);
        state.players[seat].occupationHand.push(id);
        state.pending.shift();
        feastAdvanceAutomatic(state, automaticOccupationHook);
      }
    }
  } else if (decision.kind === 'occupation-timing') {
    const { ids, error } = chosenIds(decision, action.choice);
    bad = error;
    if (!bad) {
      const timing = ids[0];
      const actionSpaceId = String(decision.meta?.actionSpaceId ?? '');
      state.pending.shift();
      if (timing === 'before') queueOccupation(state, seat, 0, 1, { kind: 'start-action', seat, actionSpaceId });
      else if (timing === 'after') { state.players[seat].fourthOccupationAfter = true; bad = startPrintedAction(state, seat, actionSpaceId); }
      else bad = startPrintedAction(state, seat, actionSpaceId);
    }
  } else if (decision.kind === 'card-effect') {
    const continuation = decision.continuation;
    if (continuation.kind === 'occupation-deferred') {
      bad = resolveOccupationDeferredDecision(state, decision, action.choice, continuation);
    } else if (continuation.kind === 'occupation-event') {
      const key = continuation.plans[continuation.index];
      const plan = key ? feastOccupationPlanForKey(state, continuation.context, key) : null;
      if (!plan) bad = 'That occupation effect is no longer available';
      else {
        const cursor = persistedOccupationCursor(continuation, plan);
        const decoded = feastDecodeOccupationDecisionStep(state, seat, plan, cursor, action.choice);
        if (!decoded.ok) bad = decoded.error;
        else {
          state.pending.shift();
          bad = advanceOccupationEvent(state, continuationWithCursor(continuation, decoded.cursor));
        }
      }
    } else bad = 'Broken occupation-effect continuation';
  } else if (decision.kind === 'occupation') bad = playCards(state, decision, action.choice);
  else if (decision.kind === 'final-placement') {
    const { ids, error } = chosenIds(decision, action.choice);
    bad = error;
    if (!bad && ids[0] !== 'confirm') bad = 'Confirm final placements';
    if (!bad) {
      state.pending.shift();
      state.feastCursor++;
      if (state.feastCursor < state.players.length) queueFinalPlacement(state);
      else feastFinishGame(state);
    }
  }
  else if (decision.kind === 'mountain') bad = resolveMountain(state, decision, action.choice);
  else if (decision.kind === 'goods') bad = resolveGoods(state, decision, action.choice);
  else if (decision.kind === 'special') bad = resolveSpecial(state, decision, action.choice);
  else if (decision.kind === 'exploration') bad = resolveExploration(state, decision, action.choice);
  else if (decision.kind === 'ship') bad = resolveShipDecision(state, decision, action.choice);
  else if (decision.kind === 'emigration') bad = resolveEmigration(state, decision, action.choice);
  else if (decision.kind === 'die') bad = resolveDieDecision(state, decision, action.choice);
  else if (decision.kind === 'die-spend') bad = resolveLoot(state, decision, action.choice);
  else bad = `Unsupported decision ${decision.kind}`;
  return bad ? feastErr(bad) : feastOk();
}

// ---------------------------------------------------------------------------
// Occupation bounded resolver
// ---------------------------------------------------------------------------

function signedLimit(value: number, limit = 12): boolean {
  return Number.isInteger(value) && value !== 0 && Math.abs(value) <= limit;
}

function operationError(state: FeastState, p: FeastPlayer, op: FeastLegacyOccupationOperation): string | null {
  switch (op.kind) {
    case 'acknowledge': return op.detail.trim().length >= 3 && op.detail.length <= 240 ? null : 'Acknowledgement detail must be 3-240 characters';
    case 'resource': {
      if (!signedLimit(op.amount)) return 'Resource adjustment must be a non-zero integer within 12';
      if (op.resource === 'wood' || op.resource === 'stone' || op.resource === 'ore') {
        if (p.resources[op.resource] + op.amount < 0) return `Not enough ${op.resource}`;
      } else if (!(op.resource in p.goods) || p.goods[op.resource as FeastGood] + op.amount < 0) return `Not enough ${op.resource}`;
      return null;
    }
    case 'weapon': return signedLimit(op.amount) && p.weapons[op.weapon] + op.amount >= 0 ? null : 'Invalid weapon adjustment';
    case 'silver': return signedLimit(op.amount, 30) && p.silver + op.amount >= 0 ? null : 'Invalid silver adjustment';
    case 'ship':
      if (op.amount === -1 && !activeShips(p, op.ship).length) return `No active ${op.ship}`;
      if (op.amount === 1 && op.ship === 'whaling-boat' && activeShips(p, op.ship).length >= 3) return 'Small-ship bay is full';
      if (op.amount === 1 && op.ship !== 'whaling-boat' && activeShips(p, 'knarr').length + activeShips(p, 'longship').length >= 4) return 'Large-ship bay is full';
      return null;
    case 'ore': {
      if (!signedLimit(op.amount, 3)) return 'Ore adjustment must be within 3';
      if (op.shipId === null) return p.resources.ore + op.amount >= 0 ? null : 'Not enough ore';
      const ship = p.ships.find((x) => x.id === op.shipId && !x.emigrated);
      if (!ship || ship.type === 'knarr') return 'Choose an owned whaling boat or longship';
      const cap = ship.type === 'whaling-boat' ? 1 : 3;
      return ship.ore + op.amount >= 0 && ship.ore + op.amount <= cap ? null : 'Ship ore exceeds its slots';
    }
    case 'building': return op.amount === 1 ? (state.buildingSupply[op.building] > 0 ? null : 'No building remains') : (p.boards.some((x) => x.kind === 'building' && x.definitionId === op.building) ? null : 'No owned building');
    case 'board': {
      const supply = state.explorations.find((x) => x.boardId === op.boardId);
      if (!supply) return 'Unknown exploration board';
      if (op.mode === 'claim' && supply.claimedBy !== null) return 'Exploration board already claimed';
      if (op.mode === 'return' && supply.claimedBy !== p.seat) return 'That board is not yours';
      return null;
    }
    case 'animal': {
      if (!signedLimit(op.amount)) return 'Animal adjustment must be within 12';
      const id: FeastGood = op.animal === 'sheep' ? (op.pregnant ? 'pregnant-sheep' : 'sheep') : (op.pregnant ? 'pregnant-cattle' : 'cattle');
      return p.goods[id] + op.amount >= 0 ? null : `Not enough ${id}`;
    }
    case 'occupation':
      if (op.mode === 'play' && (!op.cardId || !p.occupationHand.includes(op.cardId))) return 'Choose an occupation in your hand';
      if (op.mode === 'discard' && (!op.cardId || !p.occupationHand.includes(op.cardId))) return 'Choose an occupation in your hand';
      if (op.mode === 'draw' && (!Number.isInteger(op.amount) || (op.amount ?? 0) < 1 || (op.amount ?? 0) > 4)) return 'Draw 1-4 occupations';
      return null;
    case 'placement': {
      const board = p.boards.find((x) => x.id === op.boardId);
      if (!board) return 'Choose an owned board';
      if (op.mode === 'return') return board.placements.some((x) => x.id === op.pieceId) ? null : 'Choose a committed placement';
      if (op.x === undefined || op.y === undefined || op.rotation === undefined) return 'Placement needs x, y, and rotation';
      return feastPlacementError(state, p.seat, op.boardId, op.pieceId, op.x, op.y, op.rotation);
    }
    case 'copy-action': return FEAST_ACTION_BY_ID[op.actionSpaceId] ? null : 'Unknown action space';
    case 'phase': return op.times === 1 ? null : 'A card phase can run exactly once per operation';
    case 'special':
      if (!FEAST_SPECIAL_BY_ID[op.specialId]) return 'Unknown special tile';
      if (op.mode === 'gain' && !state.specialSupply.includes(op.specialId)) return 'Special tile unavailable';
      if (op.mode === 'return' && !p.specials.includes(op.specialId)) return 'Special tile not owned';
      return null;
    case 'score': return signedLimit(op.amount, 30) && op.reason.trim().length >= 2 ? null : 'Score adjustment must be within 30 and explain why';
  }
}

function applyCardPhase(state: FeastState, p: FeastPlayer, phase: Extract<FeastLegacyOccupationOperation, { kind: 'phase' }>['phase']): void {
  if (phase === 'harvest') for (const id of ['peas', 'beans', 'flax'] as FeastGood[]) p.goods[id]++;
  else if (phase === 'income') p.silver += p.boards.reduce((n, b) => n + feastIncomeForBoard(b), 0);
  else if (phase === 'breeding') feastBreedPlayer(p);
  else if (phase === 'bonus') {
    // Bounded card phase intentionally grants no unchecked board edit; normal
    // bonuses are resolved by the shared board helper through the next phase.
  } else if (phase === 'feast') {
    // Queue only this player’s additional feast; it uses the normal placement
    // reducer and Thing Penalties rather than arbitrary card edits.
    queue(state, {
      seat: p.seat, kind: 'feast', label: 'Occupation Feast', prompt: 'Resolve the additional feast granted by your occupation.',
      options: [{ id: 'finish', label: 'Finish Feast' }], min: 0, max: 1,
      meta: { extra: true, requiredCells: p.workersTotal }, continuation: { kind: 'feast' }, private: false,
    });
  }
}

function applyOccupationOperation(state: FeastState, p: FeastPlayer, cardId: string, op: FeastLegacyOccupationOperation): string | null {
  switch (op.kind) {
    case 'acknowledge': return null;
    case 'resource':
      if (op.resource === 'wood' || op.resource === 'stone' || op.resource === 'ore') p.resources[op.resource] += op.amount;
      else p.goods[op.resource as FeastGood] += op.amount;
      return null;
    case 'weapon':
      if (op.amount > 0) for (let i = 0; i < op.amount; i++) awardSearchedWeapon(state, p, op.weapon);
      else {
        p.weapons[op.weapon] += op.amount;
        for (let i = 0; i < -op.amount; i++) {
          if (state.weaponSubstitutes[op.weapon] > 0) state.weaponSubstitutes[op.weapon]--;
          else state.weaponDiscard.push(op.weapon);
        }
      }
      return null;
    case 'silver': p.silver += op.amount; return null;
    case 'ship':
      if (op.amount === 1) return gainShip(state, p, op.ship);
      p.ships.splice(p.ships.indexOf(activeShips(p, op.ship)[0]), 1); return null;
    case 'ore':
      if (op.shipId === null) p.resources.ore += op.amount;
      else p.ships.find((x) => x.id === op.shipId)!.ore += op.amount;
      return null;
    case 'building':
      if (op.amount === 1) return gainBuilding(state, p, op.building);
      else {
        const board = p.boards.find((x) => x.kind === 'building' && x.definitionId === op.building)!;
        p.boards.splice(p.boards.indexOf(board), 1); state.buildingSupply[op.building]++;
      }
      return null;
    case 'board': {
      const supply = state.explorations.find((x) => x.boardId === op.boardId)!;
      if (op.mode === 'claim') {
        supply.claimedBy = p.seat; p.silver += supply.silver; supply.silver = 0;
        p.boards.push({ id: supply.boardId, definitionId: supply.face, kind: 'exploration', owner: p.seat, placements: [] });
      } else {
        supply.claimedBy = null;
        const board = p.boards.find((x) => x.id === op.boardId)!; p.boards.splice(p.boards.indexOf(board), 1);
      }
      return null;
    }
    case 'animal': {
      const id: FeastGood = op.animal === 'sheep' ? (op.pregnant ? 'pregnant-sheep' : 'sheep') : (op.pregnant ? 'pregnant-cattle' : 'cattle');
      p.goods[id] += op.amount; return null;
    }
    case 'occupation':
      if (op.mode === 'draw') for (let i = 0; i < (op.amount ?? 1); i++) feastDrawOccupation(state, p.seat);
      else if (op.mode === 'discard') { p.occupationHand.splice(p.occupationHand.indexOf(op.cardId!), 1); state.occupationDiscard.push(op.cardId!); }
      else { p.occupationHand.splice(p.occupationHand.indexOf(op.cardId!), 1); p.playedOccupations.push(op.cardId!); }
      return null;
    case 'placement': {
      const board = p.boards.find((x) => x.id === op.boardId)!;
      if (op.mode === 'return') {
        const placement = board.placements.find((x) => x.id === op.pieceId)!;
        board.placements.splice(board.placements.indexOf(placement), 1);
        if (placement.pieceKind === 'good') p.goods[placement.pieceId as FeastGood]++;
        else if (placement.pieceKind === 'silver') p.silver++;
        else if (placement.pieceKind === 'ore' || placement.pieceKind === 'wood' || placement.pieceKind === 'stone') p.resources[placement.pieceKind]++;
      } else {
        const placement = feastMakePlacement(feastId(state, 'placement'), op.pieceId, op.x!, op.y!, op.rotation!);
        commitPiece(p, placement.pieceKind, placement.pieceId);
        board.placements.push(placement);
      }
      return null;
    }
    case 'copy-action': return runPrinted(state, p.seat, op.actionSpaceId, 0);
    case 'phase': applyCardPhase(state, p, op.phase); return null;
    case 'special':
      if (op.mode === 'gain') { state.specialSupply.splice(state.specialSupply.indexOf(op.specialId), 1); p.specials.push(op.specialId); }
      else { p.specials.splice(p.specials.indexOf(op.specialId), 1); state.specialSupply.push(op.specialId); }
      return null;
    case 'score': p.scoreAdjustments.push({ cardId, amount: op.amount, reason: op.reason }); return null;
  }
}

function useOccupation(state: FeastState, seat: number, action: Extract<FeastAction, { type: 'use_occupation' }>): FeastResult {
  const p = state.players[seat];
  if (!p.playedOccupations.includes(action.cardId)) return feastErr('You must own and play that occupation first');
  if (action.operations.length < 1 || action.operations.length > 8) return feastErr('An occupation use has 1-8 bounded operations');
  if (action.note.trim().length < 3 || action.note.length > 240) return feastErr('Explain the official card effect precisely');
  const def = FEAST_OCCUPATION_BY_ID[action.cardId];
  if (!def) return feastErr('Unknown occupation card');
  const use = p.occupationUses.find((x) => x.cardId === action.cardId) ?? { cardId: action.cardId, round: state.round, usesThisRound: 0, usedOnce: false };
  if (!p.occupationUses.includes(use)) p.occupationUses.push(use);
  if ((def.type === 'immediate' || def.type === 'as-soon-as') && use.usedOnce) return feastErr('That one-time occupation has already resolved');
  if (use.usesThisRound >= 12) return feastErr('Occupation use safety bound reached for this round');
  for (const op of action.operations) {
    const validation = operationError(state, p, op);
    if (validation) return feastErr(`${def.name}: ${validation}`);
    const bad = applyOccupationOperation(state, p, action.cardId, op);
    if (bad) return feastErr(`${def.name}: ${bad}`);
  }
  use.usesThisRound++; use.round = state.round;
  if (def.type === 'immediate' || def.type === 'as-soon-as') use.usedOnce = true;
  feastEvent(state, seat, `Used ${def.name}`, action.note);
  return feastOk();
}

function activateOccupation(
  state: FeastState, seat: number, action: Extract<FeastAction, { type: 'activate_occupation' }>,
): FeastResult {
  const head = state.pending[0];
  const interruptible = !!head && head.seat === seat
    && (head.kind === 'feast' || head.kind === 'final-placement');
  if (head && !interruptible) return feastErr('Finish the current decision before using an anytime occupation');
  if (!interruptible && state.phase !== 'actions') {
    return feastErr('Anytime occupations may be started between actions, during your Feast, or before final scoring');
  }
  const p = state.players[seat];
  if (!p.playedOccupations.includes(action.cardId)) return feastErr('You must own and play that occupation first');
  const def = FEAST_OCCUPATION_BY_ID[action.cardId];
  if (!def) return feastErr('Unknown occupation card');
  const suspended = interruptible ? state.pending.shift()! : null;
  const logicalPhase = suspended?.kind === 'final-placement' ? 'final-placement'
    : suspended?.kind === 'feast' ? 'feast' : state.phase;
  const context = feastOccupationContext(
    state, seat, 'anytime', 'use-anytime', 'when', { cardId: action.cardId, phase: logicalPhase },
    { cardId: action.cardId, eventId: feastId(state, 'occupation-event') },
  );
  const continuation = feastOccupationEventContinuation(state, context,
    suspended ? { kind: 'restore-decision', decision: suspended } : { kind: 'occupation-complete' });
  if (!continuation) return feastErr(`${def.name} has no currently legal activation`);
  const bad = advanceOccupationEvent(state, continuation);
  return bad ? feastErr(`${def.name}: ${bad}`) : feastOk();
}

// ---------------------------------------------------------------------------
// Core reducer actions
// ---------------------------------------------------------------------------

function startPrintedAction(state: FeastState, seat: number, actionSpaceId: string): string | null {
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  if (!def) return 'Unknown action space';
  if (def?.effects.some((effect) => effect.kind === 'die')) {
    return runPrinted(state, seat, actionSpaceId, 0);
  }
  // Craft Chest cannot know whether wood or ore is exchanged until its
  // printed branch is chosen. Its action-started window is staged by
  // resolvePrintedChoice immediately before that selected payment.
  if (actionSpaceId === 'craft-chest') return runPrinted(state, seat, actionSpaceId, 0);
  recordBuildingResourcePayments(
    state.players[seat],
    def.effects.filter((effect) => effect.kind === 'pay').flatMap((effect) => effect.items),
  );
  const contexts = actionOccupationContexts(state, seat, actionSpaceId, 'action-started', 'before');
  return runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0,
    resume: { kind: 'printed', actionSpaceId, effectIndex: 0 },
  });
}

function afterWorkerPlacement(state: FeastState, seat: number, actionSpaceId: string): string | null {
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  if (!def) return 'Unknown action space';
  const p = state.players[seat];
  if (def.column === 3) return drawOccupationWithHooks(
    state, seat, { kind: 'start-action', seat, actionSpaceId }, false,
  );
  if (def.column === 4 && p.occupationHand.length) {
    queue(state, {
      seat, kind: 'occupation-timing', label: 'Fourth-Column Occupation Bonus',
      prompt: 'Play one occupation before or after the printed action, or skip.',
      options: [
        { id: 'before', label: 'Play Before Action' },
        { id: 'after', label: 'Play After Action' },
        { id: 'skip', label: 'Do Not Play a Card' },
      ], min: 1, max: 1, meta: { actionSpaceId: def.id },
      continuation: { kind: 'start-action', seat, actionSpaceId: def.id }, private: true,
    });
    return null;
  }
  return startPrintedAction(state, seat, actionSpaceId);
}

function commitWorkers(state: FeastState, seat: number, actionSpaceId: string, imitate: boolean): string | null {
  const def = FEAST_ACTION_BY_ID[actionSpaceId];
  if (!def) return 'Unknown action space';
  const p = state.players[seat];
  if (!acceptedActionReplacements(state, seat, actionSpaceId).length) {
    const reason = feastActionReason(state, seat, def, imitate, false);
    if (reason) return reason;
  }
  const workerCost = feastActionWorkerCost(state, seat, def);
  p.workersAvailable -= workerCost;
  p.turnActionTaken = true;
  p.turnMayEnd = false;
  p.turnEffectUsed = false;
  state.lastWorkerSeat = seat;
  state.actionSpaces.find((x) => x.id === def.id)!.occupants.push({
    seat, workers: workerCost, workerColor: p.activeWorkerColor,
    copiedFrom: imitate ? def.id : null,
  });
  state.workerPlacementHistory ??= [];
  state.workerPlacementHistory.push({
    round: state.round, seat, actionSpaceId: def.id, column: def.column,
    workers: workerCost, workerColor: p.activeWorkerColor, imitate,
    activeOccupationIds: [...p.playedOccupations],
  });
  feastEvent(state, seat, imitate ? `Imitated ${def.name}` : `Placed ${workerCost} Viking${workerCost === 1 ? '' : 's'}`, def.name, { actionSpaceId: def.id });
  const context = feastOccupationContext(
    state, seat, 'thing-count-changed', 'thing-count', 'after',
    { actionSpaceId: def.id, workersPlaced: workerCost, newCount: p.workersAvailable },
    { actionId: p.turnActionId ?? undefined, eventId: `${p.turnActionId}:thing-count:placed` },
  );
  const started = startOccupationEvent(state, context, { kind: 'after-worker-placement', seat, actionSpaceId });
  return started.error ?? (!started.handled ? afterWorkerPlacement(state, seat, actionSpaceId) : null);
}

function placeWorkers(state: FeastState, seat: number, action: Extract<FeastAction, { type: 'place_workers' }>): FeastResult {
  const def = FEAST_ACTION_BY_ID[action.spaceId];
  if (!def) return feastErr('Unknown action space');
  const imitate = action.imitateSpaceId !== undefined;
  if (imitate && action.imitateSpaceId !== action.spaceId) return feastErr('The imitation target must match the copied printed space');
  const reason = feastActionReason(state, seat, def, imitate);
  if (reason) return feastErr(reason);
  state.players[seat].turnActionId = feastId(state, 'worker-action');
  state.players[seat].turnSelectedShipIds = [];
  state.players[seat].turnActionFacts = { imitate };
  const workerCost = feastActionWorkerCost(state, seat, def);
  const player = state.players[seat];
  const matchingPlacementsEarlierThisRound = (state.workerPlacementHistory ?? []).filter((record) =>
    record.round === state.round && record.seat === seat
    && record.column === def.column && record.workers === workerCost
    && !record.imitate && record.activeOccupationIds.includes('occupation-166')
    && (state.players.length !== 1 || record.workerColor === player.activeWorkerColor)).length;
  const contexts = [
    // Before-action mountain occupations must resolve before replacement
    // choices and printed payment, so the resource they grant can fund this
    // very action. Once-per-action usage makes the later start hook idempotent.
    ...actionOccupationContexts(state, seat, def.id, 'action-started', 'before'),
    ...actionOccupationContexts(state, seat, def.id, 'action-proposed', 'instead'),
    ...actionOccupationContexts(state, seat, def.id, 'action-proposed', 'before'),
    feastOccupationContext(state, seat, 'workers-placed', 'worker-placement', 'before', {
      action: feastOccupationEventForAction(def), actionSpaceId: def.id,
      column: def.column, count: workerCost, workers: workerCost,
      matchingPlacementsEarlierThisRound, imitate,
    }, { actionId: state.players[seat].turnActionId ?? undefined,
      eventId: `${state.players[seat].turnActionId}:workers-placed` }),
  ];
  const bad = runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0,
    resume: { kind: 'commit-workers', seat, actionSpaceId: def.id, imitate },
  });
  return bad ? feastErr(bad) : feastOk();
}

function pass(state: FeastState, seat: number): FeastResult {
  const p = state.players[seat];
  if (state.phase !== 'actions' || state.turn !== seat) return feastErr('It is not your action turn');
  if (state.pending.length) return feastErr('Finish the current decision first');
  if (p.passed) return feastErr('You already passed');
  if (p.turnActionTaken) return feastErr('End the resolved worker turn before passing');
  p.passed = true; p.turnActionTaken = true; p.turnMayEnd = true;
  feastEvent(state, seat, 'Passed', p.workersAvailable ? `${p.workersAvailable} Vikings remain unused` : 'No Vikings remain');
  return feastOk();
}

function endTurn(state: FeastState, seat: number): FeastResult {
  if (state.phase !== 'actions' || state.turn !== seat) return feastErr('It is not your action turn');
  if (state.pending.length) return feastErr('Finish the current decision first');
  const p = state.players[seat];
  if (!p.turnMayEnd) return feastErr('Place Vikings or pass before ending the turn');
  if (state.players.every((x) => x.passed)) {
    const contexts = state.players.map((_, index) => {
      const player = state.players[(state.firstPlayer + index) % state.players.length];
      return feastOccupationContext(state, player.seat, 'phase-resolved', 'actions', 'after', {
        phase: 'actions', source: 'phase', seat: player.seat,
      }, { eventId: `phase:${state.round}:actions:after:${index}` });
    });
    const bad = runOccupationContextChain(state, {
      kind: 'occupation-context-chain', contexts, index: 0,
      resume: { kind: 'finish-actions-phase' },
    });
    return bad ? feastErr(bad) : feastOk();
  }
  for (let step = 1; step <= state.players.length; step++) {
    const next = (seat + step) % state.players.length;
    if (state.players[next].passed) continue;
    state.turn = next;
    state.players[next].turnActionTaken = false;
    state.players[next].turnMayEnd = false;
    state.players[next].turnEffectUsed = false;
    state.players[next].turnActionId = null;
    state.players[next].turnSelectedShipIds = [];
    state.players[next].turnActionFacts = {};
    feastEvent(state, next, 'Turn began', `${state.players[next].workersAvailable} Vikings available`);
    return feastOk();
  }
  return feastErr('No next player');
}

function commitPiece(player: FeastPlayer, kind: ReturnType<typeof feastPieceSpec> extends infer _T ? string : never, pieceId: string): void {
  if (kind === 'good') player.goods[pieceId as FeastGood]--;
  else if (kind === 'silver') player.silver--;
  else if (kind === 'ore' || kind === 'wood' || kind === 'stone') player.resources[kind]--;
  // Special ownership remains recorded; uniqueness is enforced by committed placement.
}

function placeTile(state: FeastState, seat: number, action: Extract<FeastAction, { type: 'place_tile' }>): FeastResult {
  const head = state.pending[0];
  if (head?.kind === 'final-placement' && head.seat !== seat) return feastErr('Wait for your final-placement window');
  const feastWoodPlacement = head?.kind === 'feast' && head.seat === seat
    && action.pieceId === 'wood' && state.players[seat].playedOccupations.includes('occupation-40');
  if (head && head.kind !== 'final-placement' && !feastWoodPlacement) {
    return feastErr('Finish the current decision before placing a board tile');
  }
  const bad = feastPlacementError(state, seat, action.boardId, action.pieceId, action.x, action.y, action.rotation);
  if (bad) return feastErr(bad);
  const p = state.players[seat];
  const board = p.boards.find((x) => x.id === action.boardId)!;
  const placement = feastMakePlacement(feastId(state, 'placement'), action.pieceId, action.x, action.y, action.rotation);
  commitPiece(p, placement.pieceKind, placement.pieceId);
  board.placements.push(placement);
  feastEvent(state, seat, `Placed ${placement.pieceId}`, board.definitionId, { boardId: board.id });
  const suspendedDecision = state.pending[0]
    && (state.pending[0].kind === 'final-placement' || feastWoodPlacement) ? state.pending.shift()! : null;
  const contexts = placementOccupationContexts(state, seat, board, placement.pieceId, 'board', placement.id);
  const badHook = runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0,
    resume: suspendedDecision ? { kind: 'restore-decision', decision: suspendedDecision } : { kind: 'occupation-complete' },
  });
  if (badHook) return feastErr(badHook);
  return feastOk();
}

function buyShip(state: FeastState, seat: number, type: FeastShipType): FeastResult {
  if (state.phase === 'ended') return feastErr('Game over');
  if (state.pending[0]?.kind === 'final-placement') return feastErr('After the final Feast, only final board placements remain before scoring');
  if (state.pending.length) return feastErr('Finish the current decision before buying a ship');
  const cost = { 'whaling-boat': 3, knarr: 5, longship: 8 }[type];
  const p = state.players[seat];
  const beforePlayer = structuredClone(p);
  if (p.silver < cost) return feastErr(`${type} costs ${cost} silver`);
  const bad = gainShip(state, p, type);
  if (bad) return feastErr(bad);
  p.silver -= cost;
  feastEvent(state, seat, `Bought a ${type}`, `${cost} silver`);
  const contexts = occupationMutationContexts(state, seat, beforePlayer, {
    source: 'ship-purchase', eventId: feastId(state, 'ship-purchase'), classifiedAsShipBuilding: false,
  });
  const badHook = runOccupationContextChain(state, {
    kind: 'occupation-context-chain', contexts, index: 0, resume: { kind: 'occupation-complete' },
  });
  if (badHook) return feastErr(badHook);
  return feastOk();
}

function placeOre(state: FeastState, seat: number, shipId: string, amount = 1): FeastResult {
  if (!Number.isInteger(amount) || amount < 1 || amount > 3) return feastErr('Place 1-3 ore');
  if (state.pending.length) return feastErr('Ore may be placed immediately before, but not during, an action');
  const p = state.players[seat];
  const ship = p.ships.find((x) => x.id === shipId && !x.emigrated);
  if (!ship || ship.type === 'knarr') return feastErr('Choose an active whaling boat or longship');
  const cap = ship.type === 'whaling-boat' ? 1 : 3;
  if (ship.ore + amount > cap) return feastErr(`That ${ship.type} has only ${cap} added-ore slot${cap === 1 ? '' : 's'}`);
  if (p.resources.ore < amount) return feastErr(`Needs ${amount} ore`);
  p.resources.ore -= amount; ship.ore += amount;
  feastEvent(state, seat, `Armed a ${ship.type}`, `${amount} ore`);
  return feastOk();
}

function feastPlace(state: FeastState, seat: number, action: Extract<FeastAction, { type: 'feast_place' }>): FeastResult {
  const bad = feastFeastPlacementError(state, seat, action.pieceId, action.x, action.y, action.rotation);
  if (bad) return feastErr(bad);
  const p = state.players[seat];
  p.feastRewardedPlacementIds ??= [];
  const placement = feastMakePlacement(feastId(state, 'feast'), action.pieceId, action.x, action.y, action.rotation);
  commitPiece(p, placement.pieceKind, placement.pieceId);
  p.feastPlacements.push(placement);
  if (placement.pieceKind === 'good') {
    const id = placement.pieceId as FeastGood;
    const def = FEAST_GOOD_BY_ID[id];
    const feastType: FeastGood = id === 'pregnant-sheep' ? 'sheep' : id === 'pregnant-cattle' ? 'cattle' : id;
    if (def.width !== def.height && Math.max(...placement.mask.map((r) => r.length)) > placement.mask.length) p.feastHorizontalTypes.push(feastType);
  }
  const head = state.pending[0];
  if (head?.kind === 'feast') head.meta = { ...(head.meta ?? {}), covered: feastCoveredTableCells(p).size, uncovered: feastUncoveredTableCells(p) };
  feastEvent(state, seat, `Served ${placement.pieceId}`, `${feastUncoveredTableCells(p)} feast cells remain`);
  if (head?.kind === 'feast') {
    p.feastRewardedPlacementIds.push(placement.id);
    state.pending.shift();
    const contexts = placementOccupationContexts(state, seat, null, placement.pieceId, 'banquet-table', placement.id);
    const badHook = runOccupationContextChain(state, {
      kind: 'occupation-context-chain', contexts, index: 0,
      resume: { kind: 'restore-decision', decision: head },
    });
    if (badHook) return feastErr(badHook);
  }
  return feastOk();
}

function afterFeast(
  state: FeastState, continuation: Extract<FeastContinuation, { kind: 'after-feast' }>,
): string | null {
  const player = state.players[continuation.seat];
  player.feastPlacements = [];
  player.feastRewardedPlacementIds = [];
  player.feastHorizontalTypes = [];
  player.feastNoMeadCommitted = false;
  if (continuation.extra) return resume(state, continuation.seat, continuation.resume);
  state.feastCursor++;
  if (state.feastCursor < state.players.length) feastAdvanceAutomatic(state, automaticOccupationHook);
  else if (state.round >= state.rounds) {
    state.feastCursor = 0;
    queueFinalPlacement(state);
  }
  else {
    state.feastCursor = 0;
    state.phase = 'bonus';
    feastAdvanceAutomatic(state, automaticOccupationHook);
  }
  return null;
}

function finishFeast(state: FeastState, seat: number): FeastResult {
  const head = state.pending[0];
  if (!head || head.kind !== 'feast' || head.seat !== seat) return feastErr('It is not your feast');
  const p = state.players[seat];
  const uncovered = feastUncoveredTableCells(p);
  const mead = p.feastPlacements.filter((placement) => placement.pieceId === 'mead').length;
  const gameMeat = p.feastPlacements.filter((placement) => placement.pieceId === 'game-meat').length;
  const stockfish = p.feastPlacements.filter((placement) => placement.pieceId === 'stockfish').length;
  p.thingPenalties += uncovered;
  state.pending.shift();
  feastEvent(state, seat, 'Feast completed', uncovered ? `${uncovered} Thing Penalt${uncovered === 1 ? 'y' : 'ies'}` : 'Every required cell was covered');
  const context = feastOccupationContext(state, seat, 'phase-resolved', 'feast', 'after', {
    declaredMeadPlacements: mead, gameMeatPlacedThisFeast: gameMeat,
    stockfishPlacedThisFeast: stockfish, selectedAmount: stockfish, uncovered,
  }, { eventId: `phase:${state.round}:feast:after:${seat}:${state.eventSeq}` });
  const continuation: Extract<FeastContinuation, { kind: 'after-feast' }> = {
    kind: 'after-feast', seat, extra: head.meta?.extra === true, resume: head.continuation,
  };
  const started = startOccupationEvent(state, context, continuation);
  const bad = started.error ?? (!started.handled ? afterFeast(state, continuation) : null);
  if (bad) return feastErr(bad);
  return feastOk();
}

function playOccupationAlias(state: FeastState, seat: number, cardId: string): FeastResult {
  const head = state.pending[0];
  if (!head || head.seat !== seat || head.kind !== 'occupation') return feastErr('Occupations can be played only through a printed occupation action or fourth-column bonus');
  return resolveDecision(state, seat, { type: 'resolve_decision', decisionId: head.id, choice: { optionIds: [cardId] } });
}

function applyDraft(state: FeastState, seat: number, action: FeastAction): FeastResult {
  if (!state.players[seat]) return feastErr('Unknown seat');
  if (state.phase === 'ended') return feastErr('Game over');

  // Genuine anytime actions. Automatic income/bonus snapshots are never
  // exposed between reducer calls, so they cannot be retroactively changed.
  if (action.type === 'place_tile') return placeTile(state, seat, action);
  if (action.type === 'buy_ship') return buyShip(state, seat, action.ship);
  if (action.type === 'place_ore') return placeOre(state, seat, action.shipId, action.amount ?? 1);
  if (action.type === 'activate_occupation') return activateOccupation(state, seat, action);
  if (action.type === 'feast_place') return feastPlace(state, seat, action);
  if (action.type === 'use_occupation') return feastErr('Client-authored occupation operations are disabled; choose only a live server card-effect decision');
  if (action.type === 'play_occupation') return playOccupationAlias(state, seat, action.cardId);

  if (state.pending.length) {
    const head = state.pending[0];
    if (head.kind === 'feast') {
      if (head.seat !== seat) return feastErr('Another player is serving their feast');
      if (action.type === 'feast_finish') return finishFeast(state, seat);
      return feastErr('Place feast food or finish the feast');
    }
    if (action.type !== 'resolve_decision') return feastErr(`${state.players[head.seat].name} must finish the current decision`);
    return resolveDecision(state, seat, action);
  }

  if (action.type === 'place_workers') return placeWorkers(state, seat, action);
  if (action.type === 'pass') return pass(state, seat);
  if (action.type === 'end_turn') return endTurn(state, seat);
  if (action.type === 'resolve_decision') return feastErr('There is no pending decision');
  if (action.type === 'feast_finish') return feastErr('It is not the Feast phase');
  return feastErr('Unknown Feast action');
}

/** Apply one action atomically; caller state changes only after full success. */
export function applyFeastAction(state: FeastState, seat: number, action: FeastAction): FeastResult {
  const draft = structuredClone(state) as FeastState;
  const result = applyDraft(draft, seat, action);
  if (result.ok) Object.assign(state, draft);
  return result;
}

/** Test/tool entry point for a real automatic transition with card hooks. */
export function feastAdvanceAutomaticWithOccupations(state: FeastState): void {
  feastAdvanceAutomatic(state, automaticOccupationHook);
}

// ---------------------------------------------------------------------------
// Deterministic bot (same public helpers and reducer contract as humans)
// ---------------------------------------------------------------------------

function botDecision(state: FeastState, decision: FeastPendingDecision): FeastAction {
  const enabled = decision.options.filter((x) => !x.disabled);
  const min = decision.min ?? 0;
  const mode = String(decision.meta?.mode ?? '');
  if (decision.kind === 'mountain') {
    const first = enabled[0];
    return { type: 'resolve_decision', decisionId: decision.id, choice: { allocations: first ? [{ id: first.id, amount: 1 }] : [] } };
  }
  if (decision.kind === 'goods' && mode === 'upgrade') {
    const first = enabled[0];
    return { type: 'resolve_decision', decisionId: decision.id, choice: { allocations: first ? [{ id: first.id, amount: 1 }] : [] } };
  }
  if (decision.kind === 'die') {
    const stage = String(decision.meta?.stage ?? 'roll');
    if (stage === 'boats') return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: enabled.slice(0, Math.max(1, min)).map((x) => x.id) } };
    if (stage === 'roll') return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['roll'] } };
    const result = Number(decision.meta?.result ?? 1);
    const resolve = enabled.find((x) => x.id === 'resolve');
    if (result === 0 && resolve) return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['resolve'], allocations: [] } };
    return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['fail'] } };
  }
  if (decision.kind === 'die-spend') return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: enabled.slice(0, 1).map((x) => x.id) } };
  if (decision.kind === 'occupation-timing') return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: ['skip'] } };
  if (decision.kind === 'card-effect') {
    const requirement = String(decision.meta?.requirement ?? 'mandatory');
    const requestKind = String(decision.meta?.requestKind ?? 'confirmation');
    if (requestKind === 'confirmation') {
      return { type: 'resolve_decision', decisionId: decision.id, choice: { accepted: requirement === 'mandatory' } };
    }
    if (requestKind === 'repeat') {
      return { type: 'resolve_decision', decisionId: decision.id, choice: { accepted: true, amount: requirement === 'mandatory' ? Math.min(1, Number(decision.meta?.repeatMax ?? 1)) : 0 } };
    }
    return { type: 'resolve_decision', decisionId: decision.id, choice: { accepted: true, optionIds: enabled.slice(0, Math.max(1, min)).map((x) => x.id) } };
  }
  const take = enabled.slice(0, min).map((x) => x.id);
  return { type: 'resolve_decision', decisionId: decision.id, choice: { optionIds: take } };
}

export function feastBotAction(state: FeastState, seat: number): FeastAction {
  const acting = feastActingSeat(state);
  if (acting !== seat) return { type: 'pass' };
  const pending = state.pending[0];
  if (pending) {
    if (pending.kind === 'feast') {
      // Silver is a guaranteed legal fallback. Bots intentionally preserve
      // food for placement puzzles and accept a penalty once silver runs out.
      const p = state.players[seat];
      const covered = feastCoveredTableCells(p);
      const required = feastRequiredTableCells(p);
      const x = Array.from({ length: required }, (_, i) => i).find((i) => !covered.has(i));
      if (x !== undefined && p.silver > 0) return { type: 'feast_place', pieceId: 'silver', x, y: 0, rotation: 0 };
      return { type: 'feast_finish' };
    }
    return botDecision(state, pending);
  }
  const p = state.players[seat];
  if (p.turnMayEnd) return { type: 'end_turn' };
  if (p.workersAvailable <= 0) return { type: 'pass' };
  // Prefer simple deterministic production spaces, then any legal direct space.
  const priorities = ['weekly-beans', 'take-stockfish', 'produce-mead', 'wood-per-player'];
  const defs = [...priorities.map((id) => FEAST_ACTION_BY_ID[id]), ...FEAST_ACTION_SPACES]
    .filter((x, i, a) => x && a.findIndex((q) => q?.id === x.id) === i);
  const def = defs.find((x) => feastActionReason(state, seat, x, false) === null);
  if (def) return { type: 'place_workers', spaceId: def.id };
  return { type: 'pass' };
}
