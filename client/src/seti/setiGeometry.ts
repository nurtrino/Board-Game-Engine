export interface SetiCellCoordinate {
  ring: number;
  sector: number;
}

const CELL_PATTERNS = [
  /(?:ring|r)[-_ ]?(\d+).*?(?:sector|s)[-_ ]?(\d+)/i,
  /^(\d+)[-_:/.](\d+)$/,
  /(?:inner|middle|outer)[-_ ]?(\d+)/i,
];

/** Read every cell spelling used by the extractor, engine, and older saves. */
export function parseSetiCell(cell: unknown): SetiCellCoordinate | null {
  if (cell && typeof cell === 'object') {
    const value = cell as Record<string, unknown>;
    const ring = Number(value.ring ?? value.layer ?? value.radius);
    const sector = Number(value.sector ?? value.slice ?? value.index);
    if (Number.isFinite(ring) && Number.isFinite(sector)) {
      return { ring: clampRing(ring), sector: wrapSector(sector) };
    }
  }
  if (typeof cell !== 'string') return null;
  const text = cell.trim();
  for (const pattern of CELL_PATTERNS.slice(0, 2)) {
    const match = pattern.exec(text);
    if (match) return { ring: clampRing(Number(match[1])), sector: wrapSector(Number(match[2])) };
  }
  const named = CELL_PATTERNS[2].exec(text);
  if (named) {
    const ring = /^inner/i.test(text) ? 0 : /^middle/i.test(text) ? 1 : 2;
    return { ring, sector: wrapSector(Number(named[1])) };
  }
  const numbers = text.match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length >= 2) return { ring: clampRing(numbers[0]), sector: wrapSector(numbers[1]) };
  if (numbers.length === 1 && numbers[0] < 24) {
    return { ring: Math.floor(numbers[0] / 8), sector: numbers[0] % 8 };
  }
  return null;
}

function clampRing(value: number) {
  return Math.max(0, Math.min(2, Math.round(value)));
}

export function wrapSector(value: number) {
  return ((Math.round(value) % 8) + 8) % 8;
}

export function setiCellId(ring: number, sector: number) {
  return `r${clampRing(ring)}s${wrapSector(sector)}`;
}

/** Percent coordinates within the circular solar-system art. */
export function setiCellPoint(cell: unknown, radialOffset = 0): { x: number; y: number; angle: number; radius: number } {
  const parsed = parseSetiCell(cell) ?? { ring: 1, sector: 0 };
  const radius = [19.5, 31.5, 43][parsed.ring] + radialOffset;
  // Sector 1 is the authentic disc-1 Earth wedge at lower-right. DOM y grows
  // downward, so clockwise sector steps use positive screen angles.
  const angle = parsed.sector * 45;
  const radians = angle * Math.PI / 180;
  return {
    x: 50 + Math.cos(radians) * radius,
    y: 50 + Math.sin(radians) * radius,
    angle,
    radius,
  };
}

export function orientationDegrees(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.abs(numeric) <= 7 ? numeric * 45 : numeric;
}

/**
 * Nested transforms preserve the physical carry relationship. The returned
 * relative angles produce the requested absolute orientation at every layer.
 */
export function nestedDiscAngles(orientations: unknown[], degreesPerStep = 45): [number, number, number] {
  const angle = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && Math.abs(numeric) <= 7 ? numeric * degreesPerStep : orientationDegrees(value);
  };
  const one = angle(orientations[0]);
  const two = angle(orientations[1]);
  const three = angle(orientations[2]);
  return [one - two, two - three, three];
}

/** Continue across sector zero without taking the seven-sector long way. */
export function unwrapSector(previous: number, next: number): number {
  let candidate = wrapSector(next);
  while (candidate - previous > 4) candidate -= 8;
  while (candidate - previous < -4) candidate += 8;
  return candidate;
}

export function boardWorldToPercent(
  matrix: number[][] | undefined,
  point: [number, number],
): { x: number; y: number } | null {
  if (!matrix || matrix.length < 2 || matrix[0].length < 3 || matrix[1].length < 3) return null;
  const [a, b, c] = matrix[0];
  const [d, e, f] = matrix[1];
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-8) return null;
  const wx = point[0] - c;
  const wz = point[1] - f;
  const u = (wx * e - b * wz) / det;
  const v = (a * wz - wx * d) / det;
  return { x: u * 100, y: v * 100 };
}
