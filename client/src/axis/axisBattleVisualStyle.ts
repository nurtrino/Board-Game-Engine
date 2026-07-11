export type AxisBattleVisualStyle = 'cinematic' | 'diorama';

export const AXIS_BATTLE_VISUAL_STYLE_KEY = 'axis:battle-visual-style:v1';

export function parseAxisBattleVisualStyle(value: unknown): AxisBattleVisualStyle {
  return value === 'diorama' ? 'diorama' : 'cinematic';
}

export function loadAxisBattleVisualStyle(
  storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): AxisBattleVisualStyle {
  if (!storage) return 'cinematic';
  try {
    return parseAxisBattleVisualStyle(storage.getItem(AXIS_BATTLE_VISUAL_STYLE_KEY));
  } catch {
    return 'cinematic';
  }
}

export function saveAxisBattleVisualStyle(
  style: AxisBattleVisualStyle,
  storage: Pick<Storage, 'setItem'> | null = typeof window === 'undefined' ? null : window.localStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(AXIS_BATTLE_VISUAL_STYLE_KEY, style);
  } catch {
    // Device-local preference only; storage denial never interrupts combat.
  }
}
