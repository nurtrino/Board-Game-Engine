import {
  AXIS_INDEX,
  strandedAircraftForPower,
  type AxisView,
  type PowerKey,
  type StrandedAircraftGroup,
} from '@bge/shared';

export type { StrandedAircraftGroup };

/** Mirrors the engine's end-of-noncombat aircraft loss check for a warning UI. */
export function strandedAircraft(
  view: Pick<AxisView, 'board' | 'control'> & Partial<Pick<AxisView, 'contested'>>,
  power: PowerKey,
): StrandedAircraftGroup[] {
  return strandedAircraftForPower(view, AXIS_INDEX, power);
}
