import {
  feastOccupationPromptModel,
  type FeastOccupationPromptDependency,
  type FeastOccupationPromptModel,
  type FeastOccupationPromptOption,
  type FeastOccupationPromptRequest,
} from './occupationExecutor.js';
import {
  feastValidateOccupationSelection,
  type FeastOccupationPlan,
  type FeastOccupationSelection,
} from './occupationRuntime.js';
import type {
  FeastDecisionChoice,
  FeastDecisionOption,
  FeastPendingDecision,
  FeastState,
} from './types.js';

/**
 * Projects the executor's canonical prompt requests into flat `card-effect`
 * decisions and decodes them back into a server-owned occupation selection.
 *
 * Option ids use this stable, opaque wire format:
 *
 *   `occ:v1:<role>:<percent-encoded request key>:<percent-encoded value>`
 *
 * `role` is `choice` or `target`. The request key is the exact executor key
 * (`path`, `path.items[n]`, `path.from[n]`, etc.). A client must only echo ids
 * present in the current decision. It never sends inventory deltas, operation
 * descriptions, target paths, or card metadata.
 *
 * A plan can require several flat UI decisions. Use the cursor API to persist
 * the accumulated FeastOccupationSelection in the reducer continuation:
 *
 * 1. `feastCreateOccupationDecisionCursor(plan)`
 * 2. `feastOccupationDecisionSequence(state, seat, plan, cursor)`
 * 3. render `sequence.decision`
 * 4. `feastDecodeOccupationDecisionStep(...)`
 * 5. repeat until `sequence.complete`, then execute `sequence.selection`
 *
 * Nested requests are skipped unless their declared choice dependencies are
 * active. Repeat-dependent item requests are skipped when the repeat is zero.
 */

export const FEAST_OCCUPATION_OPTION_ID_VERSION = 'occ:v1' as const;
export const FEAST_OCCUPATION_CURSOR_VERSION = 1 as const;

export type FeastOccupationDecisionMode =
  | 'automatic-confirm'
  | 'confirm'
  | 'choice'
  | 'repeat'
  | 'item'
  | 'target';

export interface FeastOccupationDecisionSpec {
  kind: 'card-effect';
  label: string;
  prompt: string;
  options: FeastDecisionOption[];
  min: number;
  max: number;
  meta: Record<string, string | number | boolean | null | string[] | number[]>;
}

/** Fully serializable continuation state. Never accept a cursor from a client. */
export interface FeastOccupationDecisionCursor {
  version: typeof FEAST_OCCUPATION_CURSOR_VERSION;
  planKey: string;
  cardId: string;
  clauseId: string;
  /** Index into FeastOccupationPromptModel.requests. */
  requestIndex: number;
  confirmationResolved: boolean;
  selection: FeastOccupationSelection;
}

export interface FeastOccupationDecisionSequence {
  cursor: FeastOccupationDecisionCursor;
  requestId: string | null;
  decision: FeastOccupationDecisionSpec | null;
  complete: boolean;
  /** Present only when complete. */
  selection?: FeastOccupationSelection;
}

export type FeastOccupationDecisionStepResult =
  | { ok: true; cursor: FeastOccupationDecisionCursor }
  | { ok: false; error: string };

export type FeastOccupationDecisionDecodeResult =
  | { ok: true; selection: FeastOccupationSelection }
  | { ok: false; error: string };

type EncodedRole = 'choice' | 'target';

interface RequestOptionBinding {
  encodedId: string;
  value: string;
  option: FeastOccupationPromptOption;
  cap: number;
}

const cloneStringArrays = (
  source: Readonly<Record<string, readonly string[]>> | undefined,
): Record<string, string[]> | undefined => source
  ? Object.fromEntries(Object.entries(source).map(([key, values]) => [key, [...values]]))
  : undefined;

function cloneSelection(selection: FeastOccupationSelection): FeastOccupationSelection {
  return {
    accepted: selection.accepted,
    ...(selection.optionIds ? { optionIds: [...selection.optionIds] } : {}),
    ...(selection.choices ? { choices: cloneStringArrays(selection.choices) } : {}),
    ...(selection.repeats ? { repeats: { ...selection.repeats } } : {}),
    ...(selection.targets ? {
      targets: Object.fromEntries(Object.entries(selection.targets).map(([key, value]) => [
        key, Array.isArray(value) ? [...value] : value,
      ])),
    } : {}),
  };
}

function titleCase(value: string): string {
  return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function optionId(role: EncodedRole, key: string, value: string): string {
  return `${FEAST_OCCUPATION_OPTION_ID_VERSION}:${role}:${encodeURIComponent(key)}:${encodeURIComponent(value)}`;
}

function requestRole(request: FeastOccupationPromptRequest): EncodedRole | null {
  if (request.kind === 'choice') return 'choice';
  if (request.kind === 'target') return 'target';
  return null;
}

function optionCapacity(option: FeastOccupationPromptOption, request: FeastOccupationPromptRequest): number {
  if (request.kind !== 'target') return 1;
  const detailCount = option.detail?.match(/(?:^|\D)(\d+)\s+(?:owned|active|available|Viking)/i)?.[1];
  const parsed = detailCount ? Number(detailCount) : 0;
  // The executor remains authoritative. This cap prevents obviously forged
  // allocations before execution and is intentionally never above request.max.
  return Math.max(1, Math.min(request.max, Number.isSafeInteger(parsed) && parsed > 0 ? parsed : request.max));
}

function bindingsFor(request: FeastOccupationPromptRequest): RequestOptionBinding[] {
  const role = requestRole(request);
  if (!role || !('options' in request)) return [];
  return request.options.map((option) => ({
    encodedId: optionId(role, request.key, option.id),
    value: option.id,
    option,
    cap: optionCapacity(option, request),
  }));
}

function dependenciesMet(
  dependencies: readonly FeastOccupationPromptDependency[], selection: FeastOccupationSelection,
): boolean {
  return dependencies.every((dependency) => {
    const chosen = selection.choices?.[dependency.choicePath]
      ?? (selection.optionIds && Object.keys(selection.choices ?? {}).length === 0 ? selection.optionIds : undefined)
      ?? [];
    return chosen.includes(dependency.optionId);
  });
}

function targetRequiredCount(request: Extract<FeastOccupationPromptRequest, { kind: 'target' }>, selection: FeastOccupationSelection): number | null {
  if (request.perRepeat === undefined) return null;
  const repeats = selection.repeats?.[request.key];
  return repeats === undefined ? null : repeats * request.perRepeat;
}

function requestActive(request: FeastOccupationPromptRequest, selection: FeastOccupationSelection): boolean {
  if (!dependenciesMet(request.dependencies, selection)) return false;
  if (request.kind === 'target') {
    const required = targetRequiredCount(request, selection);
    if (required === 0) return false;
  }
  return true;
}

function requestId(model: FeastOccupationPromptModel, request: FeastOccupationPromptRequest, index: number): string {
  return `${model.planKey}:request:${index}:${request.kind}:${encodeURIComponent(request.key)}`;
}

function decisionMode(request: FeastOccupationPromptRequest): FeastOccupationDecisionMode {
  if (request.kind === 'confirmation') return 'confirm';
  if (request.kind === 'choice') return 'choice';
  if (request.kind === 'repeat') return 'repeat';
  return ['good', 'resource', 'weapon', 'ship', 'special', 'exploration', 'occupation'].includes(request.targetKind)
    ? 'item' : 'target';
}

function requestPrompt(
  model: FeastOccupationPromptModel, request: FeastOccupationPromptRequest,
  requiredCount: number | null,
): string {
  const optional = model.requirement === 'optional' ? ' You may decline this optional effect.' : '';
  if (request.kind === 'confirmation') return `${request.label}.${optional}`;
  if (request.kind === 'repeat') return `${request.label} from 0 to ${request.max}.${optional}`;
  if (request.kind === 'choice') return `${request.label}. Choose ${request.min}-${request.max}.${optional}`;
  if (requiredCount !== null) {
    return requiredCount === 1
      ? `${request.label}. Choose one option for this repetition.${optional}`
      : `${request.label}. Choose one type for all ${requiredCount}, or allocate exactly ${requiredCount} individual items.${optional}`;
  }
  return `${request.label}. Choose ${request.min}-${request.max}.${optional}`;
}

function decisionForRequest(
  model: FeastOccupationPromptModel, request: FeastOccupationPromptRequest, index: number,
  selection: FeastOccupationSelection,
): FeastOccupationDecisionSpec {
  const mode = decisionMode(request);
  const requiredCount = request.kind === 'target' ? targetRequiredCount(request, selection) : null;
  const bindings = bindingsFor(request);
  const options: FeastDecisionOption[] = bindings.map((binding) => ({
    id: binding.encodedId,
    label: binding.option.label.toUpperCase(),
    ...(binding.option.detail ? { detail: binding.option.detail } : {}),
    ...(binding.option.disabled ? { disabled: true } : {}),
    ...(binding.option.reason ? { reason: binding.option.reason } : {}),
    ...(request.kind === 'target' && request.max > 1 ? { value: binding.cap } : {}),
  }));
  const repeatMax = request.kind === 'repeat' ? request.max : 0;
  const minimum = request.kind === 'choice' || request.kind === 'target' ? request.min : 0;
  const maximum = request.kind === 'choice' || request.kind === 'target' ? request.max : 0;
  const encodedRequestId = requestId(model, request, index);
  return {
    kind: 'card-effect',
    label: `${model.cardName}: ${request.label}`,
    prompt: requestPrompt(model, request, requiredCount),
    options,
    min: minimum,
    max: maximum,
    meta: {
      cardId: model.cardId,
      cardNumber: model.cardNumber,
      clauseId: model.clauseId,
      requirement: model.requirement,
      mode,
      repeatMax,
      requestId: encodedRequestId,
      requestIndex: index,
      requestKey: request.key,
      requestKind: request.kind,
      targetKind: request.kind === 'target' ? request.targetKind : '',
      requiredCount: requiredCount ?? 0,
      allocationOptionIds: request.kind === 'target' && request.max > 1
        ? bindings.map((binding) => binding.encodedId) : [],
    },
  };
}

function automaticConfirmSpec(plan: FeastOccupationPlan): FeastOccupationDecisionSpec {
  return {
    kind: 'card-effect',
    label: `${plan.cardName}: ${titleCase(plan.clauseId)}`,
    prompt: `Confirm the mandatory automatic effect from ${plan.cardName}.`,
    options: [], min: 0, max: 0,
    meta: {
      cardId: plan.cardId,
      cardNumber: plan.cardNumber,
      clauseId: plan.clauseId,
      requirement: plan.requirement,
      mode: 'automatic-confirm',
      repeatMax: 0,
      requestId: `${plan.usage.key}:automatic-confirm`,
      requestIndex: 0,
      requestKey: 'accepted',
      requestKind: 'confirmation',
      targetKind: '',
      requiredCount: 0,
      allocationOptionIds: [],
    },
  };
}

function validCursor(plan: FeastOccupationPlan, cursor: FeastOccupationDecisionCursor): string | null {
  if (cursor.version !== FEAST_OCCUPATION_CURSOR_VERSION) return 'Unsupported occupation decision cursor version';
  if (cursor.planKey !== plan.usage.key || cursor.cardId !== plan.cardId || cursor.clauseId !== plan.clauseId) {
    return 'Occupation decision cursor does not match this plan';
  }
  if (!Number.isSafeInteger(cursor.requestIndex) || cursor.requestIndex < 0) return 'Invalid occupation decision cursor index';
  return null;
}

export function feastCreateOccupationDecisionCursor(plan: FeastOccupationPlan): FeastOccupationDecisionCursor {
  return {
    version: FEAST_OCCUPATION_CURSOR_VERSION,
    planKey: plan.usage.key,
    cardId: plan.cardId,
    clauseId: plan.clauseId,
    requestIndex: 0,
    confirmationResolved: false,
    selection: { accepted: plan.requirement === 'mandatory' },
  };
}

/**
 * Returns the next active request and an advanced cursor. The returned cursor
 * may skip requests from unselected branches, so reducers should persist it
 * before enqueueing `decision`.
 */
export function feastOccupationDecisionSequence(
  state: FeastState, seat: number, plan: FeastOccupationPlan,
  cursor: FeastOccupationDecisionCursor = feastCreateOccupationDecisionCursor(plan),
): FeastOccupationDecisionSequence {
  const cursorProblem = validCursor(plan, cursor);
  if (cursorProblem) throw new Error(cursorProblem);
  const model = feastOccupationPromptModel(state, seat, plan);
  const next: FeastOccupationDecisionCursor = {
    ...cursor,
    selection: cloneSelection(cursor.selection),
  };
  while (next.requestIndex < model.requests.length) {
    const request = model.requests[next.requestIndex];
    if (request.kind === 'confirmation' && next.confirmationResolved) {
      next.requestIndex++;
      continue;
    }
    if (!requestActive(request, next.selection)) {
      next.requestIndex++;
      continue;
    }
    return {
      cursor: next,
      requestId: requestId(model, request, next.requestIndex),
      decision: decisionForRequest(model, request, next.requestIndex, next.selection),
      complete: false,
    };
  }
  return {
    cursor: next,
    requestId: null,
    decision: null,
    complete: true,
    selection: cloneSelection(next.selection),
  };
}

function failure(error: string): FeastOccupationDecisionStepResult {
  return { ok: false, error };
}

function decodedCounts(
  request: FeastOccupationPromptRequest, choice: FeastDecisionChoice,
): { bindings: RequestOptionBinding[]; counts: Map<string, number>; error: string | null } {
  const bindings = bindingsFor(request);
  const byId = new Map(bindings.map((binding) => [binding.encodedId, binding]));
  const ids = choice.optionIds ?? [];
  const allocations = choice.allocations ?? [];
  if (new Set(ids).size !== ids.length) return { bindings, counts: new Map(), error: 'Choose each occupation option at most once' };
  if (new Set(allocations.map((entry) => entry.id)).size !== allocations.length) {
    return { bindings, counts: new Map(), error: 'Allocate each occupation option at most once' };
  }
  if (allocations.some((entry) => !Number.isSafeInteger(entry.amount) || entry.amount <= 0)) {
    return { bindings, counts: new Map(), error: 'Occupation allocations must be positive integers' };
  }
  const selected = new Set(ids);
  if (allocations.some((entry) => selected.has(entry.id))) {
    return { bindings, counts: new Map(), error: 'Do not submit an option as both a selection and an allocation' };
  }
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, 1);
  for (const entry of allocations) counts.set(entry.id, entry.amount);
  for (const [id, count] of counts) {
    const binding = byId.get(id);
    if (!binding) return { bindings, counts, error: `Unknown occupation option ${id}` };
    if (binding.option.disabled) return { bindings, counts, error: binding.option.reason ?? 'That occupation option is disabled' };
    if (request.kind !== 'target' && count !== 1) return { bindings, counts, error: 'Only target requests accept allocations' };
    if (count > binding.cap) return { bindings, counts, error: `Only ${binding.cap} ${binding.option.label} available` };
  }
  return { bindings, counts, error: null };
}

function targetSelection(
  request: Extract<FeastOccupationPromptRequest, { kind: 'target' }>,
  choice: FeastDecisionChoice, current: FeastOccupationSelection,
): { value?: string | readonly string[]; error: string | null } {
  const decoded = decodedCounts(request, choice);
  if (decoded.error) return { error: decoded.error };
  const byId = new Map(decoded.bindings.map((binding) => [binding.encodedId, binding]));
  const values: string[] = [];
  for (const [id, count] of decoded.counts) {
    const value = byId.get(id)!.value;
    for (let index = 0; index < count; index++) values.push(value);
  }
  const required = targetRequiredCount(request, current);
  if (required !== null) {
    if (required === 0 && values.length) return { error: 'A zero-repeat effect cannot include target selections' };
    // One id is a scalar declaration that the executor repeats for every unit.
    if (required > 0 && values.length !== 1 && values.length !== required) {
      return { error: `Choose one type for all units, or allocate exactly ${required} individual items` };
    }
  } else if (values.length < request.min || values.length > request.max) {
    return { error: `${request.label}: choose ${request.min}-${request.max}` };
  }
  return {
    ...(values.length ? { value: values.length === 1 ? values[0] : values } : {}),
    error: null,
  };
}

/** Decodes exactly the currently active flat decision and advances one step. */
export function feastDecodeOccupationDecisionStep(
  state: FeastState, seat: number, plan: FeastOccupationPlan,
  cursor: FeastOccupationDecisionCursor, choice: FeastDecisionChoice,
): FeastOccupationDecisionStepResult {
  const cursorProblem = validCursor(plan, cursor);
  if (cursorProblem) return failure(cursorProblem);
  const sequence = feastOccupationDecisionSequence(state, seat, plan, cursor);
  if (sequence.complete || !sequence.decision) return failure('This occupation decision sequence is already complete');
  const model = feastOccupationPromptModel(state, seat, plan);
  const request = model.requests[sequence.cursor.requestIndex];
  if (!request) return failure('Occupation request is no longer available');
  const next: FeastOccupationDecisionCursor = {
    ...sequence.cursor,
    requestIndex: sequence.cursor.requestIndex + 1,
    selection: cloneSelection(sequence.cursor.selection),
  };

  if (request.kind === 'confirmation') {
    const accepted = choice.accepted !== false;
    if (request.mandatory && !accepted) return failure('This occupation effect is mandatory');
    if ((choice.optionIds?.length ?? 0) || (choice.allocations?.length ?? 0) || (choice.amount ?? 0) !== 0) {
      return failure('A confirmation cannot include item selections');
    }
    next.confirmationResolved = true;
    next.selection = { ...next.selection, accepted };
    if (!accepted) next.requestIndex = model.requests.length;
    return { ok: true, cursor: next };
  }

  if (choice.accepted === false) return failure('Decline the occupation effect at its confirmation step');
  next.selection = { ...next.selection, accepted: true };

  if (request.kind === 'repeat') {
    const amount = choice.amount;
    if (!Number.isSafeInteger(amount) || amount! < request.min || amount! > request.max) {
      return failure(`Choose ${request.min}-${request.max} repetitions`);
    }
    next.selection = {
      ...next.selection,
      repeats: { ...next.selection.repeats, [request.key]: amount! },
    };
    return { ok: true, cursor: next };
  }

  if (request.kind === 'choice') {
    const decoded = decodedCounts(request, choice);
    if (decoded.error) return failure(decoded.error);
    const byId = new Map(decoded.bindings.map((binding) => [binding.encodedId, binding]));
    const values = [...decoded.counts.keys()].map((id) => byId.get(id)!.value);
    if (values.length < request.min || values.length > request.max) {
      return failure(`${request.label}: choose ${request.min}-${request.max}`);
    }
    next.selection = {
      ...next.selection,
      choices: { ...next.selection.choices, [request.key]: values },
    };
    return { ok: true, cursor: next };
  }

  const target = targetSelection(request, choice, next.selection);
  if (target.error) return failure(target.error);
  if (target.value !== undefined) {
    next.selection = {
      ...next.selection,
      targets: { ...next.selection.targets, [request.key]: target.value },
    };
  }
  return { ok: true, cursor: next };
}

/**
 * Convenience projection for simple callers. For a multi-request plan this is
 * the first active decision; reducers should use the cursor API above.
 * Automatic plans return a confirmation-shaped spec for tutorial/preview UI,
 * even though normal reducer integration may execute them immediately.
 */
export function feastOccupationDecisionSpec(
  state: FeastState, seat: number, plan: FeastOccupationPlan,
): FeastOccupationDecisionSpec {
  const sequence = feastOccupationDecisionSequence(state, seat, plan);
  return sequence.decision ?? automaticConfirmSpec(plan);
}

/**
 * Convenience one-shot decoder. It deliberately rejects plans that need more
 * than one flat response so a caller cannot accidentally drop accumulated
 * selection fields; use feastDecodeOccupationDecisionStep for those plans.
 */
export function feastDecodeOccupationDecisionChoice(
  state: FeastState, seat: number, plan: FeastOccupationPlan, choice: FeastDecisionChoice,
): FeastOccupationDecisionDecodeResult {
  let sequence = feastOccupationDecisionSequence(state, seat, plan);
  if (sequence.complete) {
    if (choice.accepted === false && plan.requirement === 'mandatory') return { ok: false, error: 'This occupation effect is mandatory' };
    const selection: FeastOccupationSelection = { accepted: choice.accepted !== false };
    const error = feastValidateOccupationSelection(state, seat, plan, selection);
    return error ? { ok: false, error } : { ok: true, selection };
  }
  const stepped = feastDecodeOccupationDecisionStep(state, seat, plan, sequence.cursor, choice);
  if (!stepped.ok) return stepped;
  sequence = feastOccupationDecisionSequence(state, seat, plan, stepped.cursor);
  if (!sequence.complete || !sequence.selection) {
    return { ok: false, error: 'This occupation effect requires sequential decisions' };
  }
  const error = feastValidateOccupationSelection(state, seat, plan, sequence.selection);
  return error ? { ok: false, error } : { ok: true, selection: sequence.selection };
}

/** Convenience type guard for reducer integration. */
export function feastIsOccupationDecision(decision: Pick<FeastPendingDecision, 'kind' | 'meta'>): boolean {
  return decision.kind === 'card-effect'
    && typeof decision.meta?.cardId === 'string'
    && typeof decision.meta?.clauseId === 'string'
    && typeof decision.meta?.requestId === 'string';
}

