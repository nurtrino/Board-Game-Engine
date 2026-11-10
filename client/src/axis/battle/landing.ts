// Defending carrier fighters whose deck was lost must land somewhere. The engine lists the exact
// options (view.defendingCarrierLanding.progress.decision); this turns each into one card and action.
import { POWERS, type AxisAction, type AxisDefendingCarrierLandingOption, type AxisView, type PowerKey } from '@bge/shared';
import { spaceName } from './model';

export type LandingView = NonNullable<AxisView['defendingCarrierLanding']>;
export type LandingAction = Extract<AxisAction, { type: 'defendingCarrierLanding' }>;

export interface LandingCard {
  key: string;
  owner: PowerKey;
  kind: AxisDefendingCarrierLandingOption['kind'];
  title: string;
  detail: string;
  /** Open deck slots, when the option is a carrier. */
  open: number | null;
  action: LandingAction;
}

/** The power that must choose now, or null when no landing decision is open. */
export function landingOwner(landing: LandingView | null): PowerKey | null {
  const progress = landing?.progress;
  return progress?.ok && progress.status === 'decision' && progress.decision ? progress.decision.owner : null;
}

function actionFor(option: AxisDefendingCarrierLandingOption): LandingAction {
  if (option.kind === 'carrier') {
    return { type: 'defendingCarrierLanding', fighterRef: option.fighterRef, kind: 'carrier', carrierRef: option.carrierRef };
  }
  if (option.kind === 'territory') {
    return { type: 'defendingCarrierLanding', fighterRef: option.fighterRef, kind: 'territory', territory: option.territory };
  }
  return { type: 'defendingCarrierLanding', fighterRef: option.fighterRef, kind: 'destroy' };
}

function ordinal(landing: LandingView, carrierRef: string, power: PowerKey, space: string): number {
  const peers = landing.snapshot.carriers
    .filter((c) => c.power === power && c.seaZone === space)
    .map((c) => c.ref)
    .sort();
  const i = peers.indexOf(carrierRef);
  return i < 0 ? 1 : i + 1;
}

const RULE: Record<AxisDefendingCarrierLandingOption['ruleStep'], string> = {
  'home-carrier': 'Its own carrier survived and has room.',
  'same-zone-carrier': 'Its own carrier is gone. This friendly deck is in the same sea zone.',
  'one-space': 'One space away.',
  'no-landing': 'No deck or friendly territory is in reach. The fighter is lost.',
};

/** One card per exact option. Two carriers in one sea zone stay two cards. */
export function landingCards(landing: LandingView | null): LandingCard[] {
  const progress = landing?.progress;
  if (!landing || !progress?.ok || progress.status !== 'decision' || !progress.decision) return [];
  const { decision } = progress;
  return decision.options.map((option) => {
    if (option.kind === 'carrier') {
      const deck = progress.decks.find((d) => d.carrierRef === option.carrierRef);
      const peers = landing.snapshot.carriers.filter((c) => c.power === option.carrierPower && c.seaZone === option.space).length;
      const n = ordinal(landing, option.carrierRef, option.carrierPower, option.space);
      return {
        key: `carrier:${option.fighterRef}:${option.carrierRef}`,
        owner: decision.owner,
        kind: option.kind,
        title: `${POWERS[option.carrierPower].name} carrier${peers > 1 ? ` ${n}` : ''}, ${spaceName(option.space)}`,
        detail: RULE[option.ruleStep],
        open: deck?.open ?? null,
        action: actionFor(option),
      };
    }
    if (option.kind === 'territory') {
      return {
        key: `territory:${option.fighterRef}:${option.territory}`,
        owner: decision.owner,
        kind: option.kind,
        title: spaceName(option.territory),
        detail: RULE[option.ruleStep],
        open: null,
        action: actionFor(option),
      };
    }
    return {
      key: `destroy:${option.fighterRef}`,
      owner: decision.owner,
      kind: option.kind,
      title: 'Fighter lost',
      detail: RULE[option.ruleStep],
      open: null,
      action: actionFor(option),
    };
  });
}
