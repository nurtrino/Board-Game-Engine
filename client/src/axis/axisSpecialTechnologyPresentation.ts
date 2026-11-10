import {
  POWERS,
  axisPieceSelectionSignature,
  axisRocketTargetOptions,
  enumerateAxisPhysicalPieces,
  type AxisAction,
  type AxisRocketTargetOption,
  type AxisView,
  type MapIndex,
  type PowerKey,
} from '@bge/shared';

export interface AxisRocketLauncherCard {
  readonly source: string;
  /** Available-piece ordinal sent to the reducer. */
  readonly ordinal: number;
  /** Board-order number shown to the player so identical guns stay distinct. */
  readonly physicalOrdinal: number;
  readonly selectionSig: string;
  readonly targets: readonly AxisRocketTargetOption[];
}

export type AxisRocketStrikeAction = Extract<AxisAction, { type: 'rocketStrike' }>;

/** Exact, independently selectable AA launchers that still have a legal target. */
export function axisRocketLauncherCards(args: {
  readonly view: AxisView;
  readonly idx: MapIndex;
  readonly power: PowerKey | 'china';
}): AxisRocketLauncherCard[] {
  const { view, idx, power } = args;
  if (power === 'china'
    || !view.powers[power].techs.includes('rockets')
    || view.rocketLedger.power !== power) return [];

  return Object.entries(view.board).flatMap(([source, stacks]) => {
    if (!idx.territory[source] || view.rocketLedger.launchedFrom.includes(source)) return [];
    const targets = axisRocketTargetOptions({
      snapshot: view,
      idx,
      power,
      source,
      ledger: view.rocketLedger,
    });
    if (targets.length === 0) return [];
    const selectionSig = axisPieceSelectionSignature(stacks, power, 'aaGun');
    return enumerateAxisPhysicalPieces(stacks)
      .filter((piece) => piece.power === power
        && piece.key === 'aaGun'
        && piece.available
        && piece.ordinal != null)
      .map((piece) => ({
        source,
        ordinal: piece.ordinal!,
        physicalOrdinal: piece.physicalOrdinal,
        selectionSig,
        targets,
      }));
  }).sort((a, b) => {
    const sourceNameA = idx.territory[a.source]?.name ?? a.source;
    const sourceNameB = idx.territory[b.source]?.name ?? b.source;
    return sourceNameA.localeCompare(sourceNameB) || a.physicalOrdinal - b.physicalOrdinal;
  });
}

export function buildAxisRocketStrikeAction(
  launcher: Pick<AxisRocketLauncherCard, 'source' | 'ordinal' | 'selectionSig'>,
  target: string,
): AxisRocketStrikeAction {
  return {
    type: 'rocketStrike',
    source: launcher.source,
    target,
    launcher: { ordinal: launcher.ordinal, selectionSig: launcher.selectionSig },
  };
}

/** A factory can receive one SBR per active power turn, independent of Rockets. */
export function axisStrategicRaidTargetAvailable(
  view: Pick<AxisView, 'economicRaidLedger'>,
  power: PowerKey,
  target: string,
): boolean {
  return view.economicRaidLedger.power === power
    && !view.economicRaidLedger.targetedFactories.includes(target);
}

export function axisRocketLauncherLabel(
  launcher: Pick<AxisRocketLauncherCard, 'source' | 'physicalOrdinal'>,
  idx: MapIndex,
  power: PowerKey,
): string {
  const source = idx.territory[launcher.source]?.name ?? launcher.source;
  return `${POWERS[power].short} AA gun ${launcher.physicalOrdinal + 1} · ${source}`;
}
