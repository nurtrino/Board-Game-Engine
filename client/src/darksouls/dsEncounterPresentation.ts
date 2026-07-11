export interface DsBoardPoint {
  x: number;
  z: number;
}

/**
 * Board-piece ids are deliberately separate from reducer option keys. The
 * screen can therefore distinguish two enemies sharing one node without
 * changing the authoritative Dark Souls action protocol.
 */
export function dsPieceIdForOption(optionKey: string): string | null {
  if (optionKey.startsWith('uid:')) return `enemy:${optionKey.slice(4)}`;
  if (optionKey.startsWith('enemy:')) return optionKey;
  if (optionKey.startsWith('unit:')) return `boss:${optionKey.slice(5)}`;
  if (optionKey.startsWith('seat:')) return `character:${optionKey.slice(5)}`;
  if (optionKey.startsWith('char:')) return `character:${optionKey.slice(5)}`;
  return null;
}

/** Only unsuffixed node options can resolve with one board tap. */
export function dsNodeIdForOption(optionKey: string): string | null {
  if (!optionKey.startsWith('node:')) return null;
  const nodeId = optionKey.slice(5);
  return nodeId.includes(':') ? null : nodeId;
}

/**
 * Three.js models are normalized to look down local +Z. This turns a board
 * vector into the world yaw that points the miniature at its opponent.
 */
export function dsYawToward(from: DsBoardPoint, to: DsBoardPoint, forwardCorrection = 0): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return forwardCorrection;
  return Math.atan2(dx, dz) + forwardCorrection;
}

export function dsNearestPoint(from: DsBoardPoint, targets: DsBoardPoint[]): DsBoardPoint | null {
  let best: DsBoardPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

