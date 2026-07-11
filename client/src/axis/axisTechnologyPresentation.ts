import {
  SHIPYARD_COSTS,
  TECHS,
  UNITS,
  type TechDef,
  type TechKey,
  type UnitKey,
} from '@bge/shared';

export interface AxisUnitReferenceValues {
  cost: number;
  attack: number;
  defense: number;
  move: number;
  costModified: boolean;
  attackModified: boolean;
  moveModified: boolean;
}

/** Direct, permanent profile changes only. Conditional support, Radar fire,
 * and multi-die abilities remain explained by their development text. */
export function axisCurrentUnitReference(
  key: UnitKey,
  techs: readonly TechKey[],
): AxisUnitReferenceValues {
  const printed = UNITS[key];
  const cost = techs.includes('improvedShipyards')
    ? SHIPYARD_COSTS[key] ?? printed.cost
    : printed.cost;
  const attack = key === 'fighter' && techs.includes('jetFighters')
    ? 4
    : key === 'submarine' && techs.includes('superSubs')
      ? 3
      : printed.attack;
  const move = (key === 'fighter' || key === 'bomber') && techs.includes('longRangeAircraft')
    ? printed.move + 2
    : printed.move;

  return {
    cost,
    attack,
    defense: printed.defense,
    move,
    costModified: cost !== printed.cost,
    attackModified: attack !== printed.attack,
    moveModified: move !== printed.move,
  };
}

export interface AxisFactoryRepairOffer {
  count: 1 | 2;
  cost: 1;
  discounted: boolean;
}

/** Increased Factory Production removes two damage for one IPC whenever two
 * markers remain. A lone final marker still costs one IPC. */
export function axisFactoryRepairOffer(
  damage: number,
  techs: readonly TechKey[],
): AxisFactoryRepairOffer | null {
  const remaining = Number.isSafeInteger(damage) ? Math.max(0, damage) : 0;
  if (remaining === 0) return null;
  const discounted = techs.includes('increasedFactory') && remaining >= 2;
  return { count: discounted ? 2 : 1, cost: 1, discounted };
}

export interface AxisResearchAdvancePresentation extends TechDef {
  developed: boolean;
}

export interface AxisResearchChartPresentation {
  chart: 1 | 2;
  advances: AxisResearchAdvancePresentation[];
  remaining: number;
  complete: boolean;
}

export function axisResearchChartPresentation(
  techs: readonly TechKey[],
): AxisResearchChartPresentation[] {
  const developed = new Set(techs);
  return ([1, 2] as const).map((chart) => {
    const advances = TECHS
      .filter((technology) => technology.chart === chart)
      .map((technology) => ({ ...technology, developed: developed.has(technology.key) }));
    const remaining = advances.filter((technology) => !technology.developed).length;
    return { chart, advances, remaining, complete: remaining === 0 };
  });
}
