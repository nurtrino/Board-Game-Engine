import {
  airUnitRange,
  axisParatrooperTargetOptions,
  axisPieceSelectionSignature,
  enumerateAxisPhysicalPieces,
  validateAirAttackLanding,
  type AxisAction,
  type AxisParatrooperGroupOrder,
  type AxisParatrooperTargetOption,
  type AxisView,
  type MapIndex,
  type PowerKey,
} from '@bge/shared';

export interface AxisParatrooperPairCard {
  readonly key: string;
  readonly from: string;
  readonly pairNumber: number;
  readonly bomber: {
    readonly ordinal: number;
    readonly physicalOrdinal: number;
    readonly selectionSig: string;
    readonly movementSpent: number;
  };
  readonly infantry: {
    readonly ordinal: number;
    readonly physicalOrdinal: number;
    readonly selectionSig: string;
  };
  /** Exact routes that also leave this bomber a legal post-combat landing. */
  readonly targets: readonly AxisParatrooperTargetOption[];
}

/**
 * Build deterministic exact bomber/infantry pair cards without selecting any
 * of them. One button therefore means one physical bomber and one physical
 * infantry sculpt; identical units never become a pooled count.
 */
export function axisParatrooperPairCards(args: {
  readonly view: AxisView;
  readonly idx: MapIndex;
  readonly power: PowerKey | 'china';
}): AxisParatrooperPairCard[] {
  const { view, idx, power } = args;
  if (power === 'china' || !view.powers[power].techs.includes('paratroopers')) return [];
  const techs = view.powers[power].techs;

  return Object.entries(view.board).flatMap(([from, stacks]) => {
    if (!idx.territory[from]) return [];
    const pieces = enumerateAxisPhysicalPieces(stacks);
    const bombers = pieces.filter((piece) => piece.available
      && piece.power === power && piece.key === 'bomber' && piece.ordinal != null);
    const infantry = pieces.filter((piece) => piece.available
      && piece.power === power && piece.key === 'infantry' && piece.ordinal != null);
    if (bombers.length === 0 || infantry.length === 0) return [];
    const bomberSig = axisPieceSelectionSignature(stacks, power, 'bomber');
    const infantrySig = axisPieceSelectionSignature(stacks, power, 'infantry');

    return bombers.flatMap((bomber, bomberIndex) => infantry.map((foot, infantryIndex): AxisParatrooperPairCard => {
      const priorMovement = Math.max(0, bomber.movementSpent ?? 0);
      const maxMovement = Math.max(0, airUnitRange('bomber', techs) - priorMovement);
      const targets = axisParatrooperTargetOptions({
        snapshot: view,
        idx,
        power,
        origin: from,
        maxMovement,
      }).filter((option) => validateAirAttackLanding({
        snapshot: view,
        idx,
        power,
        techs,
        target: option.target,
        air: [{
          from: option.target,
          key: 'bomber',
          count: 1,
          movementSpent: priorMovement + option.distance,
        }],
      }).ok);
      return {
        key: `${from}:${bomber.ordinal}:${foot.ordinal}`,
        from,
        pairNumber: bomberIndex * infantry.length + infantryIndex + 1,
        bomber: {
          ordinal: bomber.ordinal!,
          physicalOrdinal: bomber.physicalOrdinal,
          selectionSig: bomberSig,
          movementSpent: priorMovement,
        },
        infantry: {
          ordinal: foot.ordinal!,
          physicalOrdinal: foot.physicalOrdinal,
          selectionSig: infantrySig,
        },
        targets,
      };
    }));
  }).sort((a, b) => {
    const nameA = idx.territory[a.from]?.name ?? a.from;
    const nameB = idx.territory[b.from]?.name ?? b.from;
    return nameA.localeCompare(nameB) || a.pairNumber - b.pairNumber;
  });
}

/** Targets and routes shared by every selected physical pair. */
export function axisParatrooperCommonTargets(
  cards: readonly AxisParatrooperPairCard[],
): AxisParatrooperTargetOption[] {
  if (cards.length === 0) return [];
  const shared = new Set(cards[0]!.targets.map((option) => option.target));
  for (const card of cards.slice(1)) {
    const targets = new Set(card.targets.map((option) => option.target));
    for (const target of shared) if (!targets.has(target)) shared.delete(target);
  }
  return cards[0]!.targets.filter((option) => shared.has(option.target));
}

export function buildAxisParatrooperGroups(
  cards: readonly AxisParatrooperPairCard[],
  target: string,
): AxisParatrooperGroupOrder[] {
  const grouped = new Map<string, {
    from: string;
    route: readonly string[];
    pairs: AxisParatrooperGroupOrder['pairs'][number][];
  }>();
  for (const card of cards) {
    const option = card.targets.find((candidate) => candidate.target === target);
    if (!option) continue;
    const key = `${card.from}|${option.route.join('>')}`;
    const group = grouped.get(key) ?? { from: card.from, route: option.route, pairs: [] };
    group.pairs.push({
      bomber: { ordinal: card.bomber.ordinal, selectionSig: card.bomber.selectionSig },
      infantry: { ordinal: card.infantry.ordinal, selectionSig: card.infantry.selectionSig },
    });
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => ({
    from: group.from,
    route: [...group.route],
    pairs: group.pairs.map((pair) => ({
      bomber: { ...pair.bomber },
      infantry: { ...pair.infantry },
    })),
  }));
}

export function buildAxisParatrooperAttack(
  target: string,
  cards: readonly AxisParatrooperPairCard[],
): Extract<AxisAction, { type: 'attack' }> {
  return {
    type: 'attack',
    target,
    forces: [],
    paratroopers: buildAxisParatrooperGroups(cards, target),
  };
}
