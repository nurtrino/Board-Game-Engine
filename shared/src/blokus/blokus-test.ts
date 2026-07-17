// Blokus engine tests: piece-set sanity, directed rulebook rules, board
// conservation invariants, and full bot playthroughs at 1-4 humans.
// Run: npx tsx shared/src/blokus/blokus-test.ts

import {
  BLOKUS_PIECES, BLOKUS_PIECE_BY_ID, BLOKUS_SEATS, BLOKUS_SIZE, BLOKUS_CORNERS,
  blokusTransform, createBlokus, blokusViewFor, type BlokusSeat, type BlokusState,
} from './state.js';
import { applyBlokusAction, blokusBotAction, blokusCheckPlacement, blokusHasMove } from './actions.js';

let failures = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) console.log(`ok   ${name}`);
  else { failures++; console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ---------- piece set ----------
{
  const total = BLOKUS_PIECES.reduce((sum, p) => sum + p.cells.length, 0);
  check('21 pieces', BLOKUS_PIECES.length === 21);
  check('89 squares per color', total === 89, String(total));
  const sizes = [0, 0, 0, 0, 0, 0];
  for (const p of BLOKUS_PIECES) sizes[p.cells.length]++;
  check('distribution 1/1/2/5/12', sizes[1] === 1 && sizes[2] === 1 && sizes[3] === 2 && sizes[4] === 5 && sizes[5] === 12,
    sizes.join(','));
  // every piece is connected and unique under rotation+reflection
  const canon = new Set<string>();
  for (const p of BLOKUS_PIECES) {
    const set = new Set(p.cells.map(([x, y]) => `${x},${y}`));
    const seen = new Set<string>([p.cells[0].join(',')]);
    const queue = [p.cells[0]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${x + dx},${y + dy}`;
        if (set.has(key) && !seen.has(key)) { seen.add(key); queue.push([x + dx, y + dy]); }
      }
    }
    check(`${p.id} connected`, seen.size === p.cells.length);
    let best = '';
    for (const flip of [false, true]) for (const rot of [0, 1, 2, 3] as const) {
      const k = blokusTransform(p.cells, rot, flip).map(([a, b]) => `${a},${b}`).join(';');
      if (!best || k < best) best = k;
    }
    check(`${p.id} unique shape`, !canon.has(best));
    canon.add(best);
  }
}

// ---------- directed rules ----------
{
  const s = createBlokus([{ name: 'A', color: 'Blue' }], 7);
  // first move must cover the printed corner
  check('first move away from corner rejected',
    !applyBlokusAction(s, 0, { type: 'place', pieceId: 'I5', rot: 0, flip: false, x: 5, y: 5 }).ok);
  const [bx, by] = BLOKUS_CORNERS.Blue;
  check('Blue corner is (19,19)', bx === 19 && by === 19);
  check('first move on corner accepted',
    applyBlokusAction(s, 0, { type: 'place', pieceId: 'I5', rot: 0, flip: false, x: 15, y: 19 }).ok);
  check('turn advanced to Yellow', s.turn === 1);
  check('out-of-turn action rejected',
    !applyBlokusAction(s, 0, { type: 'place', pieceId: 'I1', rot: 0, flip: false, x: 14, y: 18 }).ok);
  // walk the other colors through their first moves
  check('yellow corner move ok', applyBlokusAction(s, 1, { type: 'place', pieceId: 'I1', rot: 0, flip: false, x: 0, y: 19 }).ok);
  check('red corner move ok', applyBlokusAction(s, 2, { type: 'place', pieceId: 'I1', rot: 0, flip: false, x: 0, y: 0 }).ok);
  check('green corner move ok', applyBlokusAction(s, 3, { type: 'place', pieceId: 'I1', rot: 0, flip: false, x: 19, y: 0 }).ok);
  // second Blue move: edge contact with own color is illegal
  check('edge-to-edge with own color rejected',
    !blokusCheckPlacement(s, 0, 'I2', 0, false, 13, 19).ok);
  // corner contact is legal (I5 occupies x15..19,y19 -> diagonal at 14,18)
  const diag = blokusCheckPlacement(s, 0, 'I2', 0, false, 13, 18);
  check('corner-to-corner accepted', diag.ok, diag.why);
  // overlap rejected
  check('overlap rejected', !blokusCheckPlacement(s, 0, 'I1', 0, false, 16, 19).ok);
  // off-board rejected
  check('off-board rejected', !blokusCheckPlacement(s, 0, 'I5', 0, false, 16, 18).ok);
  // no corner requirement violation for other colors: Yellow next to Blue is fine
  const cross = blokusCheckPlacement(s, 1, 'I2', 0, false, 1, 18);
  check('touching another color edge-to-edge is legal', cross.ok, cross.why);
}

// ---------- seat/color mapping ----------
{
  // A lone human on Red keeps room seat 0; play still opens with Blue (a CPU).
  const s = createBlokus([{ name: 'A', color: 'Red' }], 5);
  check('human keeps room seat 0', s.players[0].color === 'Red' && !s.players[0].isCpu);
  check('turn order follows colors', s.players[s.turn].color === 'Blue' && s.players[s.turn].isCpu);
  const order = s.order.map((seat) => s.players[seat].color).join(',');
  check('order is Blue,Yellow,Red,Green', order === 'Blue,Yellow,Red,Green', order);
}

// ---------- transform sanity ----------
{
  const l4 = blokusTransform(BLOKUS_PIECE_BY_ID.L4.cells, 1, false);
  check('rotation preserves size', l4.length === 4);
  const i2flip = blokusTransform(BLOKUS_PIECE_BY_ID.I2.cells, 0, true).map((c) => c.join(',')).join(';');
  check('flip normalizes to origin', i2flip === '0,0;1,0', i2flip);
}

// ---------- scoring ----------
{
  const s = createBlokus([], 3);
  // simulate: Blue placed everything ending with I1; Yellow everything ending
  // elsewhere; Red kept 3 squares; Green kept everything.
  s.players[0].remaining = [];
  s.players[0].lastPieceId = 'I1';
  s.players[1].remaining = [];
  s.players[1].lastPieceId = 'I5';
  s.players[2].remaining = ['I3'];
  s.players[3].passed = true;
  s.players[0].passed = s.players[1].passed = s.players[2].passed = true;
  s.turn = 0;
  applyBlokusAction(s, 0, { type: 'pass' }); // everyone done -> end
  check('game ended', s.phase === 'ended');
  check('perfect + monomino last = 109', s.players[0].score === 109, String(s.players[0].score));
  check('perfect = 104', s.players[1].score === 104, String(s.players[1].score));
  check('remaining I3 = 86', s.players[2].score === 86, String(s.players[2].score));
  check('untouched color = 0', s.players[3].score === 0, String(s.players[3].score));
  check('winner is Blue', s.winners.length === 1 && s.winners[0] === 0, s.winners.join(','));
}

// ---------- playthroughs + invariants ----------
function boardInvariants(s: BlokusState): string | null {
  const placedPerSeat = [0, 0, 0, 0];
  for (const cell of s.board) if (cell !== null) placedPerSeat[cell]++;
  for (const p of s.players) {
    const left = p.remaining.reduce((sum, id) => sum + BLOKUS_PIECE_BY_ID[id].cells.length, 0);
    if (placedPerSeat[p.seat] + left !== 89) {
      return `${p.color} squares ${placedPerSeat[p.seat]}+${left} != 89`;
    }
    if (new Set(p.remaining).size !== p.remaining.length) return `${p.color} duplicate remaining`;
  }
  return null;
}

for (const humans of [0, 1, 2, 4]) {
  const seated = BLOKUS_SEATS.slice(0, humans).map((color) => ({ name: `P${color}`, color: color as BlokusSeat }));
  const s = createBlokus(seated, 42 + humans);
  let steps = 0;
  let bad: string | null = null;
  while (s.phase === 'playing' && steps < 400) {
    const action = blokusBotAction(s, s.turn);
    const result = applyBlokusAction(s, s.turn, action);
    if (!result.ok) { bad = `bot action rejected: ${result.error}`; break; }
    const inv = boardInvariants(s);
    if (inv) { bad = inv; break; }
    steps++;
  }
  check(`playthrough (${humans} humans) finishes clean`, s.phase === 'ended' && !bad, bad ?? `steps ${steps}`);
  if (s.phase === 'ended') {
    check(`playthrough (${humans} humans) scored`, s.players.every((p) => p.score !== null));
    const placed = s.board.filter((c) => c !== null).length;
    check(`playthrough (${humans} humans) board filled meaningfully`, placed > 120, String(placed));
  }
  // hasMove agrees with the terminal state: nobody can still move
  check(`no moves left (${humans} humans)`, s.players.every((p) => !blokusHasMove(s, p.seat)));
}

// ---------- view ----------
{
  const s = createBlokus([{ name: 'A', color: 'Blue' }], 1);
  const v = blokusViewFor(s, 0);
  check('view carries you + squaresLeft', v.you === 0 && v.squaresLeft.every((n) => n === 89));
  check('board size 400', v.board.length === BLOKUS_SIZE * BLOKUS_SIZE);
}

console.log(failures ? `\n${failures} FAILURES` : '\nall green');
process.exit(failures ? 1 : 0);
