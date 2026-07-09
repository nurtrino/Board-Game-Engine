// Room-level adapter: seats, create, view, apply — the shape the server
// registry expects. Seats are the six powers; a player may hold any subset
// (the dev_view mechanism lets one human drive every seat, per the owner's
// "let me control all players" decision).
//
// MAP DATA: map-data.json is the transcribed board golden
// (games/axis-allies/golden/map.json, copied here so the engine can import
// it). Until the transcription lands this file carries a STUB flag; the
// lobby hides the game while map.stub is true.

import mapJson from './map-data.json';
import setupJson from './setup-data.json';
import {
  createAxis, axisViewFor, AXIS_SEATS,
  type AxisState, type AxisCreateOptions, type SetupData, type AxisView,
} from './state.js';
import { applyAxisAction, type AxisAction, type ActionResult } from './actions.js';
import { indexMap, type AxisMap, type MapIndex } from './map.js';
import { TURN_ORDER, type PowerKey, type Scenario, type WinCondition } from './config.js';

export type AxisSeat = PowerKey;
export { AXIS_SEATS };
export type { AxisAction, AxisView, AxisState };

interface MapDataFile extends AxisMap { stub?: boolean }
export const AXIS_MAP: AxisMap = mapJson as unknown as MapDataFile;
export const AXIS_MAP_STUB = Boolean((mapJson as unknown as MapDataFile).stub);
export const AXIS_INDEX: MapIndex = indexMap(AXIS_MAP);

interface SetupDataFile { '1941': SetupData; '1942': SetupData }
const SETUPS = setupJson as unknown as SetupDataFile;

export interface AxisRoomOptions {
  scenario?: Scenario;
  rnd?: boolean;
  nationalObjectives?: boolean;
  winCondition?: WinCondition;
}

export function createAxisGame(
  seated: { name: string; color: PowerKey }[],
  seed: number,
  options: AxisRoomOptions = {},
): AxisState {
  void seated; // every power exists regardless of who is seated
  const opts: AxisCreateOptions = {
    scenario: options.scenario ?? '1941',
    rnd: options.rnd ?? false,
    nationalObjectives: options.nationalObjectives ?? true,
    winCondition: options.winCondition ?? 'standard',
    seed,
  };
  return createAxis(AXIS_MAP, SETUPS[opts.scenario], opts);
}

export function axisGameViewFor(state: AxisState, viewer: number | null | 'dev'): AxisView {
  void viewer; // A&A is public information; per-seat affordances are client-side
  return axisViewFor(state, AXIS_INDEX);
}

/** seat index -> power: seats claim powers in the fixed pick order. */
export function axisPowerOfSeat(state: AxisState, seat: number): PowerKey {
  const order = TURN_ORDER[state.options.scenario];
  return order[seat % order.length];
}

export function applyAxisGameAction(state: AxisState, seat: number, action: AxisAction & { asPower?: PowerKey }): ActionResult {
  // The client names the power it acts for (multi-power players / dev seat);
  // default: the seat's own power.
  const power = action.asPower ?? axisPowerOfSeat(state, seat);
  const { asPower, ...rest } = action;
  void asPower;
  return applyAxisAction(state, AXIS_INDEX, power, rest as AxisAction);
}
