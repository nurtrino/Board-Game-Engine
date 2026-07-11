import {
  FEAST_BOARD_BY_ID, FEAST_EXPLORATION_NEGATIVES, FEAST_EXPLORATION_POINTS,
  FEAST_GOOD_BY_ID, FEAST_GOOD_IDS, FEAST_SPECIAL_BY_ID,
} from './data.js';
import type {
  FeastAmount, FeastBoardDefinition, FeastBoardState, FeastCell,
  FeastGood, FeastGoodColor, FeastPlacement, FeastPlayer, FeastState,
} from './types.js';

export type FeastPlacementPlayer = Pick<FeastPlayer, 'boards' | 'goods' | 'resources' | 'silver' | 'specials' | 'playedOccupations'>;

const cellKey = (x: number, y: number): string => `${x},${y}`;
const ORTHOGONAL: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ALL_NEIGHBORS: readonly [number, number][] = [
  [-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
];

export function feastRotateMask(mask: readonly string[], rotation: 0 | 90 | 180 | 270): string[] {
  let grid = mask.map((row) => row.split(''));
  const turns = rotation / 90;
  for (let turn = 0; turn < turns; turn++) {
    const h = grid.length;
    const w = Math.max(0, ...grid.map((row) => row.length));
    const next = Array.from({ length: w }, () => Array.from({ length: h }, () => '.'));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      next[x][h - 1 - y] = grid[y]?.[x] ?? '.';
    }
    grid = next;
  }
  return feastTrimMask(grid.map((row) => row.join('')));
}

export function feastTrimMask(mask: readonly string[]): string[] {
  const cells: FeastCell[] = [];
  mask.forEach((row, y) => [...row].forEach((v, x) => { if (v === '#') cells.push({ x, y }); }));
  if (!cells.length) return [];
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxY = Math.max(...cells.map((c) => c.y));
  return Array.from({ length: maxY - minY + 1 }, (_, y) =>
    Array.from({ length: maxX - minX + 1 }, (_, x) =>
      mask[y + minY]?.[x + minX] === '#' ? '#' : '.',
    ).join(''),
  );
}

export function feastMaskCells(mask: readonly string[], x = 0, y = 0): FeastCell[] {
  const out: FeastCell[] = [];
  mask.forEach((row, dy) => [...row].forEach((v, dx) => {
    if (v === '#') out.push({ x: x + dx, y: y + dy });
  }));
  return out;
}

export interface FeastPieceSpec {
  pieceKind: FeastPlacement['pieceKind'];
  pieceId: string;
  color: FeastPlacement['color'];
  mask: string[];
}

/** Resolve a UI piece id (`good:flax`, `flax`, `special:helmet`, `silver`). */
export function feastPieceSpec(pieceId: string): FeastPieceSpec | null {
  const raw = pieceId.startsWith('good:') ? pieceId.slice(5) : pieceId;
  if ((FEAST_GOOD_IDS as string[]).includes(raw)) {
    const id = raw as FeastGood;
    const def = FEAST_GOOD_BY_ID[id];
    return {
      pieceKind: 'good', pieceId: id, color: def.color,
      mask: Array.from({ length: def.height }, () => '#'.repeat(def.width)),
    };
  }
  const specialId = pieceId.startsWith('special:') ? pieceId.slice(8) : pieceId;
  const special = FEAST_SPECIAL_BY_ID[specialId];
  if (special) return { pieceKind: 'special', pieceId: special.id, color: 'blue', mask: [...special.mask] };
  if (pieceId === 'silver') return { pieceKind: 'silver', pieceId, color: 'silver', mask: ['#'] };
  if (pieceId === 'ore') return { pieceKind: 'ore', pieceId, color: 'ore', mask: ['#'] };
  if (pieceId === 'wood') return { pieceKind: 'wood', pieceId, color: 'wood', mask: ['#'] };
  if (pieceId === 'stone') return { pieceKind: 'stone', pieceId, color: 'stone', mask: ['#'] };
  return null;
}

export function feastPieceInventoryReason(player: FeastPlacementPlayer, _state: FeastState | null, pieceId: string): string | null {
  const spec = feastPieceSpec(pieceId);
  if (!spec) return 'Unknown tile';
  if (spec.pieceKind === 'good' && player.goods[spec.pieceId as FeastGood] < 1) return `No ${FEAST_GOOD_BY_ID[spec.pieceId as FeastGood].name} available`;
  if (spec.pieceKind === 'special') {
    if (!player.specials.includes(spec.pieceId)) return 'That unique special tile is not in your supply';
    if (player.boards.some((b) => b.placements.some((p) => p.pieceKind === 'special' && p.pieceId === spec.pieceId))) {
      return 'That special tile is already committed to a board';
    }
  }
  if (spec.pieceKind === 'silver' && player.silver < 1) return 'No silver available';
  if (spec.pieceKind === 'ore' && player.resources.ore < 1) return 'No ore available';
  if (spec.pieceKind === 'wood' && player.resources.wood < 1) return 'No wood available';
  if (spec.pieceKind === 'stone' && player.resources.stone < 1) return 'No stone available';
  return null;
}

/** Fallback exploration grid used until/when extractor board goldens are loaded. */
export function feastBoardDefinition(definitionId: string): FeastBoardDefinition | null {
  const fixed = FEAST_BOARD_BY_ID[definitionId];
  if (fixed) return fixed;
  const points = FEAST_EXPLORATION_POINTS[definitionId];
  if (points === undefined) return null;
  const rows = 9;
  const cols = 12;
  const negativeCount = FEAST_EXPLORATION_NEGATIVES[definitionId] ?? 0;
  const negativeCells = Array.from({ length: Math.min(rows * cols, negativeCount) }, (_, i) => ({
    cell: { x: i % cols, y: Math.floor(i / cols) }, value: -1,
  }));
  return {
    id: definitionId, name: definitionId.split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join(' '),
    kind: 'exploration', faceCode: null, rows, cols,
    layout: Array.from({ length: rows }, () => '#'.repeat(cols)),
    points, negativeCells, incomeTracks: [], bonuses: [], designatedResources: [],
  };
}

function boardValid(def: FeastBoardDefinition, x: number, y: number): boolean {
  const c = def.layout[y]?.[x];
  return c === '#';
}

function occupiedKeys(board: FeastBoardState): Set<string> {
  return new Set(board.placements.flatMap((p) => p.covered.map((c) => cellKey(c.x, c.y))));
}

function printedCoveredKeys(def: FeastBoardDefinition): Set<string> {
  return new Set(def.bonuses.map((b) => cellKey(b.cell.x, b.cell.y)));
}

function colorAt(board: FeastBoardState, x: number, y: number): FeastPlacement['color'] | null {
  return board.placements.find((p) => p.covered.some((c) => c.x === x && c.y === y))?.color ?? null;
}

function incomePrerequisiteError(
  def: FeastBoardDefinition, board: FeastBoardState, newCells: readonly FeastCell[],
): string | null {
  const after = occupiedKeys(board);
  for (const c of newCells) after.add(cellKey(c.x, c.y));
  for (const b of def.bonuses) after.add(cellKey(b.cell.x, b.cell.y));
  for (const income of def.incomeTracks.flatMap((track) => track.entries)) {
    const cell = income.cell;
    if (!cell || !newCells.some((c) => c.x === cell.x && c.y === cell.y)) continue;
    for (let y = cell.y; y < def.rows; y++) for (let x = 0; x <= cell.x; x++) {
      if (x === cell.x && y === cell.y) continue;
      if (!boardValid(def, x, y)) continue;
      if (!after.has(cellKey(x, y))) return `Income ${income.value} needs every valid cell to its left and below covered first`;
    }
  }
  return null;
}

/**
 * Pure board-placement legality used by both reducer and client ghost preview.
 * `finalPlacement` plus the player's public played-card list contain every
 * timing/rule fact needed here, so a redacted player view can call this exact
 * helper without duplicating board geometry.
 */
export function feastPlacementPreviewError(
  player: FeastPlacementPlayer, boardId: string, pieceId: string,
  x: number, y: number, rotation: 0 | 90 | 180 | 270,
  finalPlacement = false,
): string | null {
  const board = player.boards.find((b) => b.id === boardId);
  if (!board) return 'That board is not yours';
  const def = feastBoardDefinition(board.definitionId);
  if (!def) return 'Unknown board definition';
  const inv = feastPieceInventoryReason(player, null, pieceId);
  if (inv) return inv;
  const spec = feastPieceSpec(pieceId)!;

  if (def.kind === 'home' || def.kind === 'exploration') {
    if (!['green', 'blue', 'silver', 'ore'].includes(spec.color)) {
      return 'Home and exploration boards accept only green, blue, silver, and ore';
    }
  } else {
    if (def.id === 'shed' && spec.color !== 'wood' && spec.color !== 'stone') return 'Sheds accept only wood and stone on their designated spaces';
    if (spec.color === 'ore') return 'Ore cannot be placed in a house';
    if (spec.color === 'wood' || spec.color === 'stone') {
      // Resource cells are used only at their printed locations.
    } else if (!['orange', 'red', 'green', 'blue', 'silver'].includes(spec.color)) {
      return 'That piece cannot be placed in a house';
    }
  }

  const mask = feastRotateMask(spec.mask, rotation);
  const cells = feastMaskCells(mask, x, y);
  if (!cells.length) return 'Tile has no cells';
  // Master Joiner (40): wood placed in a stone/long house is a physical wood
  // token, but follows the ordinary one-cell silver placement rule.  The two
  // resource pastures printed outside a stone house are not house-grid spaces
  // and retain their normal final-placement timing.
  const woodAsHouseSilver = spec.color === 'wood'
    && player.playedOccupations.includes('occupation-40')
    && (def.id === 'stone-house' || def.id === 'long-house')
    && cells.length === 1
    && cells.every((cell) => boardValid(def, cell.x, cell.y));
  const designatedResource = (spec.color === 'wood' || spec.color === 'stone') && cells.length === 1
    ? def.designatedResources.find((r) => r.cell.x === cells[0].x && r.cell.y === cells[0].y && r.resource === spec.color)
    : null;
  if (!designatedResource && cells.some((c) => !boardValid(def, c.x, c.y))) return 'The tile overhangs the board or covers a forbidden cell';
  const occupied = occupiedKeys(board);
  if (cells.some((c) => occupied.has(cellKey(c.x, c.y)))) return 'The tile overlaps a committed piece';

  if (spec.color === 'wood' || spec.color === 'stone') {
    if (woodAsHouseSilver) {
      // The card explicitly makes this wood behave as silver for placement;
      // inventory consumption and scoring still use the physical wood token.
    } else if (!finalPlacement) {
      return 'Wood and stone may fill designated building spaces only in final scoring preparation';
    } else {
      if (def.kind !== 'building') return `${spec.color} can only fill a designated building cell`;
      if (cells.length !== 1) return 'A resource token covers one cell';
      const printed = def.designatedResources.find((r) => r.cell.x === cells[0].x && r.cell.y === cells[0].y);
      if (!printed || printed.resource !== spec.color) return `Use a designated ${spec.color} cell`;
    }
  }

  const forbiddenNeighborColor: FeastGoodColor | null =
    (def.kind === 'home' || def.kind === 'exploration') && spec.color === 'green' ? 'green'
      : def.kind === 'building' && (spec.color === 'orange' || spec.color === 'red') ? spec.color
        : null;
  if (forbiddenNeighborColor) {
    for (const c of cells) for (const [dx, dy] of ORTHOGONAL) {
      if (colorAt(board, c.x + dx, c.y + dy) === forbiddenNeighborColor) {
        return `${forbiddenNeighborColor[0].toUpperCase() + forbiddenNeighborColor.slice(1)} tiles may not touch orthogonally here`;
      }
    }
  }

  return incomePrerequisiteError(def, board, cells);
}

export function feastPlacementError(
  state: FeastState, seat: number, boardId: string, pieceId: string,
  x: number, y: number, rotation: 0 | 90 | 180 | 270,
): string | null {
  const player = state.players[seat];
  if (!player) return 'Unknown player';
  const finalPlacement = state.pending[0]?.kind === 'final-placement' && state.pending[0].seat === seat;
  return feastPlacementPreviewError(player, boardId, pieceId, x, y, rotation, finalPlacement);
}

export function feastMakePlacement(
  id: string, pieceId: string, x: number, y: number,
  rotation: 0 | 90 | 180 | 270,
): FeastPlacement {
  const spec = feastPieceSpec(pieceId);
  if (!spec) throw new Error(`Unknown Feast piece ${pieceId}`);
  const mask = feastRotateMask(spec.mask, rotation);
  return {
    id, pieceKind: spec.pieceKind, pieceId: spec.pieceId, color: spec.color,
    x, y, rotation, mask, covered: feastMaskCells(mask, x, y),
  };
}

export function feastIncomeForBoard(board: FeastBoardState): number {
  const def = feastBoardDefinition(board.definitionId);
  if (!def || !def.incomeTracks.length) return 0;
  const occupied = occupiedKeys(board);
  return def.incomeTracks.reduce((total, track) => {
    const sorted = [...track.entries].sort((a, b) => a.value - b.value);
    for (const entry of sorted) {
      if (!entry.cell || !occupied.has(cellKey(entry.cell.x, entry.cell.y))) return total + entry.value;
    }
    return total + (sorted[sorted.length - 1]?.value ?? 0);
  }, 0);
}

export interface FeastEarnedBonus {
  kind: 'good' | 'resource' | 'special' | 'building';
  id: string;
  amount: number;
  finite: boolean;
}

export function feastBonusesForBoard(board: FeastBoardState): FeastEarnedBonus[] {
  const def = feastBoardDefinition(board.definitionId);
  if (!def) return [];
  const occupied = occupiedKeys(board);
  const printed = printedCoveredKeys(def);
  return def.bonuses.filter((bonus) => {
    const own = cellKey(bonus.cell.x, bonus.cell.y);
    if (occupied.has(own)) return false;
    return ALL_NEIGHBORS.every(([dx, dy]) => {
      const x = bonus.cell.x + dx;
      const y = bonus.cell.y + dy;
      if (!boardValid(def, x, y)) return true; // edge bonuses need fewer cells
      const key = cellKey(x, y);
      return occupied.has(key) || printed.has(key);
    });
  }).flatMap((x) => x.rewards.map((reward) => ({ ...reward, finite: x.finite ?? false })));
}

export function feastUncoveredNegative(board: FeastBoardState): number {
  const def = feastBoardDefinition(board.definitionId);
  if (!def) return 0;
  const occupied = occupiedKeys(board);
  const grid = def.negativeCells.reduce((sum, x) => sum + (occupied.has(cellKey(x.cell.x, x.cell.y)) ? 0 : Math.abs(x.value)), 0);
  const external = def.designatedResources.reduce((sum, x) => sum + (x.negativeValue && !occupied.has(cellKey(x.cell.x, x.cell.y)) ? x.negativeValue : 0), 0);
  return grid + external;
}

export function feastCanAfford(player: FeastPlayer, items: readonly FeastAmount[]): string | null {
  const needSilver = items.filter((x) => x.kind === 'silver').reduce((n, x) => n + x.amount, 0);
  if (player.silver < needSilver) return `Needs ${needSilver} silver (you have ${player.silver})`;
  for (const item of items) {
    if (item.amount <= 0 || !item.id) continue;
    if (item.kind === 'resource') {
      const have = player.resources[item.id as keyof typeof player.resources] ?? 0;
      if (have < item.amount) return `Needs ${item.amount} ${item.id} (you have ${have})`;
    } else if (item.kind === 'good') {
      const have = player.goods[item.id as FeastGood] ?? 0;
      if (have < item.amount) return `Needs ${item.amount} ${FEAST_GOOD_BY_ID[item.id as FeastGood]?.name ?? item.id} (you have ${have})`;
    } else if (item.kind === 'weapon') {
      const have = player.weapons[item.id as keyof typeof player.weapons] ?? 0;
      if (have < item.amount) return `Needs ${item.amount} ${item.id} (you have ${have})`;
    }
  }
  return null;
}

export function feastRequiredTableCells(player: FeastPlayer): number {
  // The banquet track has twelve cells. Numbered cells still holding Vikings
  // are closed; the number open each round equals the Vikings gained so far.
  return Math.min(12, player.workersTotal);
}

export function feastEmigrationCells(player: FeastPlayer): number {
  return player.ships.filter((x) => x.emigrated).length;
}

export function feastCoveredTableCells(player: FeastPlayer): Set<number> {
  const required = feastRequiredTableCells(player);
  const covered = new Set<number>();
  for (let x = 0; x < Math.min(required, feastEmigrationCells(player)); x++) covered.add(x);
  for (const placement of player.feastPlacements) {
    for (const cell of placement.covered) if (cell.y === 0 && cell.x >= 0 && cell.x < required) covered.add(cell.x);
  }
  return covered;
}

export function feastUncoveredTableCells(player: FeastPlayer): number {
  return Math.max(0, feastRequiredTableCells(player) - feastCoveredTableCells(player).size);
}

export function feastFeastPlacementError(
  state: FeastState, seat: number, pieceId: string,
  x: number, y: number, rotation: 0 | 90 | 180 | 270,
): string | null {
  const player = state.players[seat];
  if (!player) return 'Unknown player';
  const head = state.pending[0];
  const activeFeast = head?.kind === 'feast' && head.seat === seat;
  const stablePreplacement = !head && state.phase === 'actions';
  if (!activeFeast && !stablePreplacement) {
    return state.phase === 'feast' ? 'It is not your feast'
      : 'Banquet food may be pre-placed only at a stable Actions window';
  }
  const inv = feastPieceInventoryReason(player, state, pieceId);
  if (inv) return inv;
  const spec = feastPieceSpec(pieceId)!;
  if (spec.pieceKind !== 'good' && spec.pieceKind !== 'silver') return 'The banquet accepts orange/red food and 1-silver coins only';
  if (spec.pieceKind === 'good' && spec.color !== 'orange' && spec.color !== 'red') return 'Only orange and red food can be served';
  if (pieceId === 'mead' && player.feastNoMeadCommitted) {
    return 'Sober Man granted 1 silver for committing to serve no Mead at this Feast';
  }

  const mask = feastRotateMask(spec.mask, rotation);
  const cells = feastMaskCells(mask, x, y);
  if (!cells.length) return 'Tile has no cells';
  if (cells.some((c) => c.x < 0 || c.x >= 12 || c.y < 0 || c.y >= 4)) return 'The food tile overhangs the Banquet Table';
  const required = feastRequiredTableCells(player);
  if (!cells.some((c) => c.y === 0 && c.x < required)) return 'Every food tile must cover at least one open feast cell';
  if (cells.some((c) => c.y === 0 && c.x >= required)) return 'Food cannot cover a Banquet Table position that still holds a Viking';

  const emigrated = feastEmigrationCells(player);
  if (cells.some((c) => c.y === 0 && c.x < emigrated)) return 'An emigrated ship permanently covers that feast position';
  const occupied = new Set(player.feastPlacements.flatMap((p) => p.covered.map((c) => cellKey(c.x, c.y))));
  if (cells.some((c) => occupied.has(cellKey(c.x, c.y)))) return 'The food tile overlaps another feast piece';

  if (spec.pieceKind === 'good') {
    const id = spec.pieceId as FeastGood;
    const feastType: FeastGood = id === 'pregnant-sheep' ? 'sheep' : id === 'pregnant-cattle' ? 'cattle' : id;
    const w = Math.max(0, ...mask.map((r) => r.length));
    const h = mask.length;
    const source = FEAST_GOOD_BY_ID[id];
    const nonSquare = source.width !== source.height;
    const horizontal = w > h;
    const horizontalLimit = feastType === 'peas' && player.playedOccupations.includes('occupation-186') ? 2 : 1;
    const horizontalCount = player.feastHorizontalTypes.filter((placedType) => placedType === feastType).length;
    if (nonSquare && horizontal && horizontalCount >= horizontalLimit) {
      return `Only ${horizontalLimit === 1 ? 'one' : horizontalLimit} ${source.name} tile${horizontalLimit === 1 ? '' : 's'} may be horizontal at this feast`;
    }
    for (const c of cells) for (const [dx, dy] of ORTHOGONAL) {
      const neighbor = player.feastPlacements.find((p) => p.covered.some((q) => q.x === c.x + dx && q.y === c.y + dy));
      if (neighbor?.color === spec.color) return `${spec.color === 'orange' ? 'Orange' : 'Red'} food tiles may not touch orthogonally`;
    }
  }
  return null;
}
