import type { AxisView } from '@bge/shared';

export const AXIS_PHASE_KEYS = ['rnd', 'purchase', 'combatMove', 'noncombat', 'mobilize'] as const;
export type AxisPhaseKey = (typeof AXIS_PHASE_KEYS)[number];
export type AxisPhaseProgress = 'done' | 'current' | 'pending';
export type AxisPhaseRestriction = 'none' | 'skipped' | 'limited';

export type AxisCapitalPresentationView = Pick<
  AxisView,
  'active' | 'phase' | 'capitalOccupied' | 'turnStartedCapitalOccupied' | 'chinaGrant' | 'options'
>;

export interface AxisPhasePresentationNode {
  key: AxisPhaseKey;
  label: string;
  progress: AxisPhaseProgress;
  restriction: AxisPhaseRestriction;
  marker: string;
  reason: string | null;
}

export interface AxisCapitalTurnPresentation {
  affected: boolean;
  occupiedNow: boolean;
  liberatedMidturn: boolean;
  regularMobilizationLocked: boolean;
  incomeAvailable: boolean;
  banner: {
    tone: 'occupied' | 'restored';
    title: string;
    detail: string;
  } | null;
  brief: string | null;
  mobilize: {
    title: string;
    detail: string;
    empty: string;
    endLabel: string;
    endTitle: string;
  } | null;
}

const PHASE_LABEL: Record<AxisPhaseKey, string> = {
  rnd: 'Research',
  purchase: 'Purchase',
  combatMove: 'Attack',
  noncombat: 'Move',
  mobilize: 'Deploy',
};

export function axisAvailablePhaseKeys(rnd: boolean): AxisPhaseKey[] {
  return rnd ? [...AXIS_PHASE_KEYS] : AXIS_PHASE_KEYS.filter((key) => key !== 'rnd');
}

export function axisCapitalTurnPresentation(view: AxisCapitalPresentationView): AxisCapitalTurnPresentation {
  const affected = view.turnStartedCapitalOccupied;
  const occupiedNow = affected && view.capitalOccupied;
  const liberatedMidturn = affected && !view.capitalOccupied;
  const usa = view.active === 'usa';

  if (!affected) {
    return {
      affected: false,
      occupiedNow: false,
      liberatedMidturn: false,
      regularMobilizationLocked: false,
      incomeAvailable: !view.capitalOccupied,
      banner: null,
      brief: null,
      mobilize: null,
    };
  }

  if (occupiedNow) {
    const banner = {
      tone: 'occupied' as const,
      title: 'CAPITAL OCCUPIED',
      detail: usa
        ? 'No U.S. research, buying, repairs, placement, or income · China remains active'
        : 'Research, purchase, deployment, and income skipped · combat remains active',
    };
    const brief = usa
      ? view.phase === 'mobilize'
        ? 'China may deploy its independent infantry grant. Regular U.S. placement and U.S. income remain locked while Washington is occupied.'
        : 'Washington is occupied. The United States cannot research, buy, repair, place regular U.S. units, or collect income. USA and China still complete both operation blocks, and China keeps its independent infantry grant.'
      : 'The capital is occupied. Research, purchase, mobilization, and income are skipped; Combat Move, Conduct Combat, and Noncombat Move remain available.';
    return {
      affected,
      occupiedNow,
      liberatedMidturn,
      regularMobilizationLocked: true,
      incomeAvailable: false,
      banner,
      brief,
      mobilize: {
        title: usa ? 'CHINA DEPLOYMENT ONLY' : 'ECONOMY LOCKED',
        detail: usa
          ? 'China can place its infantry grant. Regular U.S. units, factory repairs, and U.S. income remain unavailable.'
          : 'No regular units deploy and no income is collected while the capital remains occupied.',
        empty: usa
          ? 'No Chinese infantry remain to deploy. End the turn; the United States receives no income.'
          : 'End the turn with no deployment or income.',
        endLabel: usa ? 'End turn · no U.S. income' : 'End turn · no income',
        endTitle: view.chinaGrant > 0
          ? `Place China's ${view.chinaGrant} remaining infantry before ending. No U.S. income will be collected.`
          : usa
            ? 'Hand play to the next power. The United States collects no income.'
            : 'Hand play to the next power without collecting income.',
      },
    };
  }

  const banner = {
    tone: 'restored' as const,
    title: 'CAPITAL LIBERATED',
    detail: 'Earlier economic phases remain skipped · income restored this turn',
  };
  const brief = usa
    ? 'Washington was liberated during this turn. U.S. research, purchase, repairs, and regular placement remain skipped; China can deploy and U.S. income is restored.'
    : 'The capital was liberated during this turn. Research, purchase, and regular deployment remain skipped; end the turn to collect restored income.';
  return {
    affected,
    occupiedNow,
    liberatedMidturn,
    regularMobilizationLocked: true,
    incomeAvailable: true,
    banner,
    brief,
    mobilize: {
      title: usa ? 'CHINA DEPLOYMENT · INCOME RESTORED' : 'INCOME RESTORED',
      detail: usa
        ? 'China can place its grant. Regular U.S. staging stays unavailable because Purchase was skipped; U.S. income returns at turn end.'
        : 'No regular units were purchased this turn. Income returns when the turn ends.',
      empty: usa
        ? 'No Chinese infantry remain to deploy. End the turn to collect restored U.S. income.'
        : 'No units deploy this turn. End the turn to collect restored income.',
      endLabel: 'End turn · collect restored income',
      endTitle: view.chinaGrant > 0
        ? `Place China's ${view.chinaGrant} remaining infantry before collecting restored income.`
        : 'Collect restored income and hand play to the next power.',
    },
  };
}

export function axisPhasePresentation(view: AxisCapitalPresentationView): AxisPhasePresentationNode[] {
  const phases = axisAvailablePhaseKeys(view.options.rnd);
  const railPhase = view.phase === 'battle' ? 'combatMove' : view.phase;
  const current = phases.indexOf(railPhase as AxisPhaseKey);
  const campaignComplete = view.phase === 'gameOver';
  const capital = axisCapitalTurnPresentation(view);

  return phases.map((key, index) => {
    const progress: AxisPhaseProgress = campaignComplete || index < current
      ? 'done'
      : index === current ? 'current' : 'pending';
    let restriction: AxisPhaseRestriction = 'none';
    let label = PHASE_LABEL[key];
    let reason: string | null = null;

    if (!campaignComplete && capital.affected && (key === 'rnd' || key === 'purchase')) {
      restriction = 'skipped';
      reason = key === 'rnd' ? 'Skipped · capital held' : 'Skipped · capital held';
    }

    if (!campaignComplete && capital.affected && key === 'mobilize') {
      if (capital.occupiedNow && view.active !== 'usa') {
        restriction = 'skipped';
        label = 'Deploy / Income';
        reason = 'Both skipped · capital held';
      } else if (capital.occupiedNow) {
        restriction = 'limited';
        label = 'China deploy';
        reason = 'U.S. placement + income skipped';
      } else if (view.active === 'usa') {
        restriction = 'limited';
        label = 'China + income';
        reason = 'U.S. placement skipped · income restored';
      } else {
        restriction = 'limited';
        label = 'Income only';
        reason = 'Deployment skipped · income restored';
      }
    }

    return {
      key,
      label,
      progress,
      restriction,
      marker: restriction === 'skipped' ? '—' : progress === 'done' ? '✓' : String(index + 1),
      reason,
    };
  });
}
