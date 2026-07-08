// Connectivity + slot-restriction rules test. Forced hands (and directly
// injected links for exact market scenarios).
// Run: npx tsx shared/src/brass/connectivity-test.ts

import { createBrass, incomeAt } from './state.js';
import { applyAction, planBuild, SQUARE_INDUSTRIES } from './actions.js';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) { pass++; } else { fail++; console.error(`FAIL: ${msg}`); } };
const loc = (name: string) => ({ cell: 0, name, kind: 'location' as const });

const s = createBrass([{ name: 'A', color: 'Orange' }, { name: 'B', color: 'Purple' }], 42);
const seatOf = (color: string) => s.players.findIndex((p) => p.color === color);

// slot restrictions: wrong industry on a printed slot is rejected outright
{
  const cur = seatOf(s.turnOrder[s.current]);
  s.players[cur].hand = [loc('Coalbrookdale')];
  const r = applyAction(s, cur, { type: 'build', card: 0, industry: 'Coal Mine', square: 'Coalbrookdale (W)' });
  ok(!r.ok && /only allows/i.test(r.error ?? ''), `iron-only slot rejects a coal mine (${r.error})`);
  ok(SQUARE_INDUSTRIES['Coalbrookdale (W)'].join() === 'Iron Works', 'slot data loaded');
}

// --- round 1 (1 action each) ---

// current player builds a Coal Mine on Coalbrookdale's coal slot
{
  const cur = seatOf(s.turnOrder[s.current]);
  s.players[cur].hand = [loc('Coalbrookdale')];
  const r = applyAction(s, cur, { type: 'build', card: 0, industry: 'Coal Mine', square: 'Coalbrookdale (E)' });
  ok(r.ok, `mine built on the coal slot: ${r.error ?? 'ok'}`);
  ok(s.board.industries['Coalbrookdale (E)']?.cubes === 2, `Coal Mine I carries 2 cubes (${s.board.industries['Coalbrookdale (E)']?.cubes})`);
  ok(!s.board.industries['Coalbrookdale (E)']?.flipped, 'mine not auto-sold (no market connection)');
}

// next player: a coal-needing industry at an unconnected town must fail;
// an iron-needing one succeeds (market iron needs no route).
{
  const cur = seatOf(s.turnOrder[s.current]);
  s.players[cur].hand = [loc('Leek'), loc('Uttoxeter')];
  let r = applyAction(s, cur, { type: 'build', card: 0, industry: 'Manufacturer', square: 'Leek (West)' });
  ok(!r.ok && /coal/i.test(r.error ?? ''), `unconnected coal build rejected (${r.error})`);
  const ironBefore = s.markets.iron.filter((v) => v === 1).length;
  r = applyAction(s, cur, { type: 'build', card: 1, industry: 'Brewery', square: 'Uttoxeter (West)' });
  ok(r.ok, `brewery at unconnected Uttoxeter ok — market iron needs no route (${r.error ?? 'ok'})`);
  ok(s.markets.iron.filter((v) => v === 1).length === ironBefore - 1, 'one iron bought from the market');
  ok(s.board.industries['Uttoxeter (West)']?.cubes === 1, 'brewery carries 1 beer in the canal era');
}

// --- round 2 (mine owner spent less, goes first, 2 actions) ---

{
  const cur = seatOf(s.turnOrder[s.current]);
  ok(s.board.industries['Coalbrookdale (E)'].color === s.players[cur].color, 'mine owner goes first (spent less)');
  s.players[cur].hand = [loc('Wolverhampton'), loc('Wolverhampton')];
  s.players[cur].money = 25;

  // action 1: canal to the mine's town, then a Manufacturer whose 1 coal
  // comes from that mine, free.
  let r = applyAction(s, cur, { type: 'network', card: 0, link: 'Coalbrookdale - Wolverhampton' });
  ok(r.ok, `canal built: ${r.error ?? 'ok'}`);

  const plan = planBuild(s.board, s.markets, s.merchants, s.players[cur].tiles, s.era, 'Manufacturer', 'Wolverhampton (W)');
  ok(!('error' in plan) && plan.coalFromMines.length === 1 && plan.coalFromMarket === 0,
    `plan sources coal from the connected mine (${JSON.stringify('error' in plan ? plan : { mines: plan.coalFromMines, market: plan.coalFromMarket })})`);
  r = applyAction(s, cur, { type: 'build', card: 0, industry: 'Manufacturer', square: 'Wolverhampton (W)' });
  ok(r.ok, `manufacturer built with mine coal: ${r.error ?? 'ok'}`);
  ok(s.board.industries['Coalbrookdale (E)'].cubes === 1, `mine cube consumed (${s.board.industries['Coalbrookdale (E)'].cubes} left)`);
}

// next turn (same round): iron works auto-sells to the market on build, and
// taking the mine's LAST cube flips it, paying the owner in track steps.
{
  const cur = seatOf(s.turnOrder[s.current]);
  s.board.links['Walsall - Wolverhampton'] = s.players[cur].color; // chain to the mine
  s.players[cur].hand = [loc('Walsall'), loc('Walsall')];
  s.players[cur].money = 25;
  const mineOwner = s.players.find((p) => p.color === s.board.industries['Coalbrookdale (E)'].color)!;
  const offsetBefore = mineOwner.incomeOffset;
  const ironGain = (() => {
    let gain = 0, filled = 0;
    s.markets.iron.forEach((v, i) => { if (v === 0 && filled < 4) { gain += Math.floor(i / 2) + 1; filled++; } });
    return { gain, filled };
  })();
  const before = s.players[cur].money;
  const r = applyAction(s, cur, { type: 'build', card: 0, industry: 'Iron Works', square: 'Walsall (West)' });
  ok(r.ok, `iron works built: ${r.error ?? 'ok'}`);
  ok(s.board.industries['Coalbrookdale (E)'].flipped, 'mine flipped on its last cube');
  ok(mineOwner.incomeOffset === Math.min(99, offsetBefore + 4),
    `mine owner advanced 4 track steps (${offsetBefore} -> ${mineOwner.incomeOffset}, income £${incomeAt(mineOwner.incomeOffset)})`);
  ok(s.players[cur].money === before - 5 + ironGain.gain,
    `works £5 offset by £${ironGain.gain} iron auto-sale (${before} -> ${s.players[cur].money})`);
  ok(s.board.industries['Walsall (West)'].cubes === 4 - ironGain.filled,
    `works keeps ${4 - ironGain.filled} cubes (${s.board.industries['Walsall (West)'].cubes})`);
}

// market-connected coal mine auto-sells its cubes on build
{
  const cur = seatOf(s.turnOrder[s.current]);
  s.board.links['Gloucester - Redditch'] = s.players[cur].color;
  s.players[cur].hand = [loc('Redditch'), loc('Redditch')];
  s.players[cur].money = 25;
  const before = s.players[cur].money;
  const coalGain = (() => {
    let gain = 0, filled = 0;
    s.markets.coal.forEach((v, i) => { if (v === 0 && filled < 2) { gain += Math.floor(i / 2) + 1; filled++; } });
    return { gain, filled };
  })();
  const r = applyAction(s, cur, { type: 'build', card: 0, industry: 'Coal Mine', square: 'Redditch (West)' });
  ok(r.ok, `market-connected mine built: ${r.error ?? 'ok'}`);
  const b = s.board.industries['Redditch (West)'];
  ok(b.cubes === 2 - coalGain.filled, `auto-sold ${coalGain.filled} coal (${b.cubes} left on the mine)`);
  ok(s.players[cur].money === before - 5 + coalGain.gain, `£5 cost offset by £${coalGain.gain} coal sale (${before} -> ${s.players[cur].money})`);
}

console.log(`${pass}/${pass + fail} connectivity checks passed`);
process.exit(fail ? 1 : 0);
