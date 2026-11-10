import assert from 'node:assert/strict';
import { createBattle } from '../../../../../shared/src/axis/battle.js';
import { climateOf, heightAt, layoutField, scatterFoliage, SHORE_X, SIDE_FIGURE_BUDGET, DIMS } from './layout';

// climate from the territory
assert.equal(climateOf('libya'), 'desert');
assert.equal(climateOf('trans-jordan'), 'desert');
assert.equal(climateOf('karelia'), 'snow');
assert.equal(climateOf('norway'), 'snow');
assert.equal(climateOf('philippine-islands'), 'jungle');
assert.equal(climateOf('okinawa'), 'jungle');
assert.equal(climateOf('france'), 'temperate');
assert.equal(climateOf('eastern-united-states'), 'temperate');
assert.equal(climateOf('nowhere'), 'temperate');

// ground: the arena is nearly level, hills rise at the rim, a shore dips under water
{
  let lo = Infinity, hi = -Infinity;
  for (let x = -55; x <= 55; x += 5) for (let z = -35; z <= 35; z += 5) {
    const h = heightAt(x, z, 'land');
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  assert.ok(lo > 0 && hi - lo < 3.2, `arena is level enough to stand ranks on (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  assert.ok(heightAt(230, 0, 'land') > 5, 'hills rise at the rim');
  assert.ok(heightAt(SHORE_X - 30, 0, 'shore') < -2, 'the sea covers the attacker side of a shore');
  assert.ok(heightAt(SHORE_X + 16, 0, 'shore') > 0.2, 'the beach is dry');
  assert.ok(heightAt(20, 0, 'shore') > 0.2);
  assert.equal(heightAt(3, 4, 'land'), heightAt(3, 4, 'land'), 'deterministic');
}

// a large land battle: capped, ranked, facing, never overlapping
{
  const b = createBattle(
    { units: [{ key: 'infantry', power: 'germany', count: 40 }, { key: 'tank', power: 'germany', count: 12 }, { key: 'artillery', power: 'germany', count: 6 }, { key: 'fighter', power: 'germany', count: 4 }, { key: 'bomber', power: 'germany', count: 2 }] },
    { units: [{ key: 'infantry', power: 'ussr', count: 22 }, { key: 'tank', power: 'ussr', count: 3 }, { key: 'aaGun', power: 'ussr', count: 1 }, { key: 'fighter', power: 'uk', count: 2 }, { key: 'factory', power: 'ussr', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  const units = [...b.attacker, ...b.defender];
  const field = layoutField(units, 'land');
  const again = layoutField(units, 'land');
  assert.deepEqual(field, again, 'layout is deterministic');
  for (const side of ['attacker', 'defender'] as const) {
    const figs = field.groups.filter((g) => g.side === side).flatMap((g) => g.figures);
    assert.ok(figs.length <= SIDE_FIGURE_BUDGET, `${side} stays inside the figure budget (${figs.length})`);
    const sign = side === 'attacker' ? -1 : 1;
    for (const f of figs) assert.ok(Math.sign(f.x) === sign, `${f.id} stands on its own side`);
    const ground = figs.filter((f) => !f.air);
    for (let i = 0; i < ground.length; i++) for (let j = i + 1; j < ground.length; j++) {
      const d = Math.hypot(ground[i].x - ground[j].x, ground[i].z - ground[j].z);
      const need = Math.min(DIMS[ground[i].key].size, DIMS[ground[j].key].size) * 0.55;
      assert.ok(d > need, `${ground[i].id} and ${ground[j].id} do not overlap (${d.toFixed(2)} < ${need.toFixed(2)})`);
    }
  }
  const inf = field.groups.find((g) => g.id === 'attacker:infantry:germany')!;
  assert.equal(inf.uids.length, 40, 'every unit belongs to its group even when not drawn');
  assert.ok(inf.figures.length < 40 && inf.figures.length >= 8);
  const tanks = field.groups.find((g) => g.id === 'attacker:tank:germany')!;
  const frontInf = Math.max(...inf.figures.map((f) => f.x));
  const frontTank = Math.max(...tanks.figures.map((f) => f.x));
  assert.ok(frontInf > frontTank, 'infantry stand in front of the armour');
  assert.ok(inf.figures.every((f) => Math.abs(f.yaw - Math.PI / 2) < 0.2), 'attackers face the defender');
  assert.ok(field.groups.find((g) => g.key === 'fighter' && g.side === 'attacker')!.figures.every((f) => f.air));
  assert.ok(field.extentX >= Math.abs(Math.min(...inf.figures.map((f) => f.x))));
}

// sea: only ships and aircraft; subs and all
{
  const b = createBattle(
    { units: [{ key: 'battleship', power: 'japan', count: 2 }, { key: 'carrier', power: 'japan', count: 2 }, { key: 'destroyer', power: 'japan', count: 3 }, { key: 'fighter', power: 'japan', count: 4 }, { key: 'submarine', power: 'japan', count: 2 }] },
    { units: [{ key: 'battleship', power: 'usa', count: 1 }, { key: 'cruiser', power: 'usa', count: 2 }, { key: 'transport', power: 'usa', count: 2 }] },
    { amphibious: false, seaCombat: true },
  );
  const field = layoutField([...b.attacker, ...b.defender], 'sea');
  const figs = field.groups.flatMap((g) => g.figures);
  assert.equal(figs.filter((f) => !f.air).length, 2 + 2 + 3 + 2 + 1 + 2 + 2);
  const ships = figs.filter((f) => !f.air);
  for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
    const d = Math.hypot(ships[i].x - ships[j].x, ships[i].z - ships[j].z);
    assert.ok(d > 11, `${ships[i].id} and ${ships[j].id} keep sea room (${d.toFixed(1)})`);
  }
  assert.deepEqual(scatterFoliage('temperate', 'sea', 60, 40), []);
}

// shore: beach force between the surf and the defenders, bombarding ships in the water
{
  const b = createBattle(
    { units: [{ key: 'infantry', power: 'usa', count: 10 }, { key: 'tank', power: 'usa', count: 4 }, { key: 'battleship', power: 'usa', count: 1 }, { key: 'cruiser', power: 'usa', count: 1 }] },
    { units: [{ key: 'infantry', power: 'germany', count: 6 }] },
    { amphibious: true, seaCombat: false },
  );
  const field = layoutField([...b.attacker, ...b.defender], 'shore');
  const beach = field.groups.filter((g) => g.side === 'attacker').flatMap((g) => g.figures).filter((f) => !f.offshore);
  for (const f of beach) {
    assert.ok(f.x > SHORE_X + 1, `${f.id} is on dry sand (${f.x.toFixed(1)})`);
    assert.ok(heightAt(f.x, f.z, 'shore') > 0, `${f.id} stands above the water`);
  }
  const ships = field.groups.flatMap((g) => g.figures).filter((f) => f.offshore);
  assert.equal(ships.length, 2);
  for (const f of ships) assert.ok(heightAt(f.x, f.z, 'shore') < -1.5, `${f.id} floats in open water`);
}

// scenery stays out of the fight and out of the water
{
  const trees = scatterFoliage('jungle', 'shore', 60, 34);
  assert.ok(trees.length > 40);
  for (const t of trees) {
    assert.ok(Math.abs(t.x) >= 67 || Math.abs(t.z) >= 40, 'nothing grows in the arena');
    assert.ok(heightAt(t.x, t.z, 'shore') >= 0.6);
  }
  assert.equal(scatterFoliage('desert', 'land', 60, 34).filter((s) => s.kind !== 'bush').length, 0);
}

console.log('battle layout: ok');
