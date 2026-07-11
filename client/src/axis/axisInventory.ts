import type { AxisView, PowerKey, UnitKey } from '@bge/shared';

/** Public, fielded pieces for a power. Transport cargo remains part of its force. */
export function axisForceInventory(
  board: AxisView['board'],
  power: PowerKey,
): Partial<Record<UnitKey, number>> {
  const result: Partial<Record<UnitKey, number>> = {};
  const add = (key: UnitKey, count: number) => {
    if (count > 0) result[key] = (result[key] ?? 0) + count;
  };
  for (const stacks of Object.values(board)) {
    for (const stack of stacks) {
      if (stack.power === power) add(stack.key, stack.count);
      if (stack.key !== 'transport') continue;
      for (const cargo of stack.cargo ?? []) {
        if (cargo.power === power) add(cargo.key, cargo.count);
      }
    }
  }
  return result;
}
