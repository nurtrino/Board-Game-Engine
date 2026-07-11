import {
  POWERS,
  type AxisAction,
  type AxisDefendingCarrierLandingOption,
  type AxisView,
  type PowerKey,
} from '@bge/shared';

export type AxisDefendingCarrierLandingView = NonNullable<AxisView['defendingCarrierLanding']>;
export type AxisDefendingCarrierLandingAction = Extract<AxisAction, { type: 'defendingCarrierLanding' }>;

export interface AxisDefendingCarrierLandingCard {
  /** Exact, stable selection key. No two physical decks share one card. */
  readonly key: string;
  readonly fighterRef: string;
  readonly owner: PowerKey;
  readonly kind: AxisDefendingCarrierLandingOption['kind'];
  readonly space: string | null;
  readonly title: string;
  readonly detail: string;
  readonly ruleLabel: string;
  readonly occupied: number | null;
  readonly open: number | null;
  readonly action: AxisDefendingCarrierLandingAction;
}

export function axisDefendingCarrierLandingOwner(
  landing: AxisDefendingCarrierLandingView | null,
): PowerKey | null {
  const progress = landing?.progress;
  return progress?.ok && progress.status === 'decision' && progress.decision
    ? progress.decision.owner
    : null;
}

function exactCarrierOrdinal(
  landing: AxisDefendingCarrierLandingView,
  carrierRef: string,
  power: PowerKey,
  space: string,
): number {
  const peers = landing.snapshot.carriers
    .filter((carrier) => carrier.power === power && carrier.seaZone === space)
    .map((carrier) => carrier.ref)
    .sort();
  const index = peers.indexOf(carrierRef);
  return index < 0 ? 1 : index + 1;
}

function actionFor(option: AxisDefendingCarrierLandingOption): AxisDefendingCarrierLandingAction {
  if (option.kind === 'carrier') {
    return {
      type: 'defendingCarrierLanding',
      fighterRef: option.fighterRef,
      kind: 'carrier',
      carrierRef: option.carrierRef,
    };
  }
  if (option.kind === 'territory') {
    return {
      type: 'defendingCarrierLanding',
      fighterRef: option.fighterRef,
      kind: 'territory',
      territory: option.territory,
    };
  }
  return {
    type: 'defendingCarrierLanding',
    fighterRef: option.fighterRef,
    kind: 'destroy',
  };
}

function ruleCopy(option: AxisDefendingCarrierLandingOption): { label: string; detail: string } {
  switch (option.ruleStep) {
    case 'home-carrier':
      return { label: 'Home deck', detail: 'The original carrier survived and has an open flight-deck slot.' };
    case 'same-zone-carrier':
      return { label: 'Battle zone', detail: 'The home carrier is unavailable; choose one exact friendly deck in this sea zone.' };
    case 'one-space':
      return { label: 'Emergency range', detail: 'Move exactly one space to a legal friendly landing destination.' };
    case 'no-landing':
      return { label: 'No landing', detail: 'No legal deck or friendly territory is reachable. This exact fighter is lost.' };
  }
}

/**
 * Present the authoritative ordered decision as one card per exact option.
 * Multiple carrier hulls in one sea zone intentionally remain separate.
 */
export function axisDefendingCarrierLandingCards(
  landing: AxisDefendingCarrierLandingView | null,
): AxisDefendingCarrierLandingCard[] {
  const progress = landing?.progress;
  if (!landing || !progress?.ok || progress.status !== 'decision' || !progress.decision) return [];
  const { decision } = progress;
  return decision.options.map((option) => {
    const copy = ruleCopy(option);
    if (option.kind === 'carrier') {
      const deck = progress.decks.find((candidate) => candidate.carrierRef === option.carrierRef);
      const ordinal = exactCarrierOrdinal(landing, option.carrierRef, option.carrierPower, option.space);
      return {
        key: `carrier:${option.fighterRef}:${option.carrierRef}`,
        fighterRef: option.fighterRef,
        owner: decision.owner,
        kind: option.kind,
        space: option.space,
        title: `${POWERS[option.carrierPower].name} carrier ${ordinal}`,
        detail: copy.detail,
        ruleLabel: copy.label,
        occupied: deck?.occupied ?? null,
        open: deck?.open ?? null,
        action: actionFor(option),
      };
    }
    if (option.kind === 'territory') {
      return {
        key: `territory:${option.fighterRef}:${option.territory}`,
        fighterRef: option.fighterRef,
        owner: decision.owner,
        kind: option.kind,
        space: option.space,
        title: 'Friendly territory',
        detail: copy.detail,
        ruleLabel: copy.label,
        occupied: null,
        open: null,
        action: actionFor(option),
      };
    }
    return {
      key: `destroy:${option.fighterRef}`,
      fighterRef: option.fighterRef,
      owner: decision.owner,
      kind: option.kind,
      space: null,
      title: 'Fighter lost',
      detail: copy.detail,
      ruleLabel: copy.label,
      occupied: null,
      open: null,
      action: actionFor(option),
    };
  });
}

export function axisDefendingCarrierOptionsAtSpace(
  cards: readonly AxisDefendingCarrierLandingCard[],
  space: string,
): AxisDefendingCarrierLandingCard[] {
  return cards.filter((card) => card.space === space);
}

/** A map region cannot silently choose between multiple exact carrier hulls. */
export function axisUniqueDefendingCarrierOptionAtSpace(
  cards: readonly AxisDefendingCarrierLandingCard[],
  space: string,
): AxisDefendingCarrierLandingCard | null {
  const options = axisDefendingCarrierOptionsAtSpace(cards, space);
  return options.length === 1 ? options[0] : null;
}

