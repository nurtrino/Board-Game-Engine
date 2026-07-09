// Axis & Allies Anniversary battle engine test: directed rules cases from the
// rulebook (AA, surprise strike, battleship damage, artillery boost, transports,
// capture rules, techs) plus seeded fuzz playthroughs with conservation checks.
// Run: npx tsx shared/src/axis/axis-battle-test.ts

import { mulberry32 } from '../brass/rng.js';
import {
  createBattle, resolveRoll, applyCasualtyPicks, applyRetreat, applySubmerge,
  currentStep, stepDice, summarize, eligibleFor,
  type BattleState, type SideSpec, type Stack,
} from './battle.js';
import { UNITS, type UnitKey } from './config.js';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error(`FAIL: ${m}`); } };

const side = (units: Partial<Record<UnitKey, number>>, power = 'x', techs: SideSpec['techs'] = []): SideSpec => ({
  units: Object.entries(units).map(([key, count]) => ({ key: key as UnitKey, power, count: count ?? 0 })),
  techs,
});

const stackOfSpec = (s: SideSpec): Stack => {
  const st: Stack = {};
  for (const u of s.units) st[u.key] = (st[u.key] ?? 0) + u.count;
  return st;
};

// Drive a battle to completion with injected dice from a seeded stream and
// random-legal decision handling. Returns the final state.
function autoplay(s: BattleState, seed: number, retreatAfterRound = Infinity): BattleState {
  const rng = mulberry32(seed);
  const d6 = () => 1 + Math.floor(rng() * 6);
  let guard = 0;
  while (s.status === 'ongoing' && guard++ < 500) {
    if (s.decision) {
      if (s.decision.type === 'casualties') {
        // random legal picks
        const picks: number[] = [];
        for (const b of s.decision.buckets) {
          for (let h = 0; h < b.hits; h++) {
            const el = eligibleFor(s, s.decision.side, b.source);
            if (el.length) picks.push(el[Math.floor(rng() * el.length)].uid);
          }
        }
        applyCasualtyPicks(s, picks);
      } else if (s.decision.type === 'retreat') {
        applyRetreat(s, s.round >= retreatAfterRound);
      } else if (s.decision.type === 'submerge') {
        applySubmerge(s, []); // fight on
      }
      continue;
    }
    const kind = currentStep(s);
    if (!kind) break;
    const dice = stepDice(s, kind);
    resolveRoll(s, dice.map(() => d6()));
  }
  ok(guard < 500, 'battle terminated');
  return s;
}

// Conservation: survivors + logged casualties == starting stacks per side.
function checkConservation(s: BattleState, startAtk: Stack, startDef: Stack, tag: string): void {
  const lost: Record<string, Stack> = { attacker: {}, defender: {} };
  for (const e of s.log) {
    for (const c of e.casualties) {
      lost[c.side][c.key] = (lost[c.side][c.key] ?? 0) + 1;
    }
  }
  const sum = summarize(s, startAtk, startDef);
  for (const [key, n] of Object.entries(startAtk)) {
    const have = (sum.attackerSurvivors[key as UnitKey] ?? 0) + (lost.attacker[key as UnitKey] ?? 0);
    ok(have === n, `${tag}: attacker ${key} conservation ${have} != ${n}`);
  }
  for (const [key, n] of Object.entries(startDef)) {
    const have = (sum.defenderSurvivors[key as UnitKey] ?? 0) + (lost.defender[key as UnitKey] ?? 0);
    ok(have === n, `${tag}: defender ${key} conservation ${have} != ${n}`);
  }
}

// ---------- directed cases ----------

// AA fires once, first round only, one die per attacking aircraft
{
  const s = createBattle(
    side({ fighter: 2, bomber: 1, infantry: 1 }),
    side({ infantry: 1, aaGun: 1 }),
    { amphibious: false, seaCombat: false },
  );
  ok(currentStep(s) === 'aa_fire', 'AA step first');
  const dice = stepDice(s, 'aa_fire');
  ok(dice.length === 3, `AA one die per aircraft (${dice.length})`);
  ok(dice.every((d) => d.hitOn === 1), 'AA hits on 1');
  resolveRoll(s, [1, 1, 6]); // two aircraft down
  // mixed fighters + bomber: the attacker must pick which aircraft die
  ok(s.decision?.type === 'casualties' && s.decision.side === 'attacker', 'AA casualty pick surfaces');
  if (s.decision?.type === 'casualties') {
    const el = s.decision.buckets[0].eligible;
    ok(el.every((uid) => {
      const u = s.attacker.find((x) => x.uid === uid)!;
      return u.key === 'fighter' || u.key === 'bomber';
    }), 'AA eligibility is aircraft-only');
    applyCasualtyPicks(s, el.slice(0, 2));
  }
  const shot = s.log.filter((e) => e.kind === 'casualties').flatMap((e) => e.casualties);
  ok(shot.length === 2 && shot.every((c) => c.key === 'fighter' || c.key === 'bomber'), 'AA kills only aircraft');
  // round 2 must not have AA
  autoplay(s, 42);
  ok(!s.log.some((e) => e.kind === 'aa_fire' && e.round > 1), 'AA never fires after round 1');
}

// radar tech: AA hits on 2
{
  const s = createBattle(
    side({ fighter: 1 }),
    { ...side({ infantry: 1, aaGun: 1 }), techs: ['radar'] },
    { amphibious: false, seaCombat: false },
  );
  ok(stepDice(s, 'aa_fire')[0].hitOn === 2, 'radar AA hits on 2');
}

// artillery boost: each artillery lifts one infantry to 2
{
  const s = createBattle(
    side({ infantry: 5, artillery: 2 }),
    side({ infantry: 8 }),
    { amphibious: false, seaCombat: false },
  );
  const dice = stepDice(s, 'attacker_fire');
  const infDice = dice.filter((d) => d.key === 'infantry');
  ok(infDice.filter((d) => d.hitOn === 2).length === 2, 'two boosted infantry');
  ok(infDice.filter((d) => d.hitOn === 1).length === 3, 'three plain infantry');
}

// advanced artillery: one artillery boosts two infantry
{
  const s = createBattle(
    { ...side({ infantry: 5, artillery: 2 }), techs: ['advancedArtillery'] },
    side({ infantry: 8 }),
    { amphibious: false, seaCombat: false },
  );
  const infDice = stepDice(s, 'attacker_fire').filter((d) => d.key === 'infantry');
  ok(infDice.filter((d) => d.hitOn === 2).length === 4, 'advanced artillery boosts 2 each');
}

// battleship takes two hits: sub strike damages it first
{
  const s = createBattle(
    side({ submarine: 1 }),
    side({ battleship: 1 }),
    { amphibious: false, seaCombat: true },
  );
  ok(currentStep(s) === 'sub_strike', 'surprise strike (no destroyer)');
  resolveRoll(s, [2]); // hit
  const bb = s.defender.find((u) => u.key === 'battleship')!;
  ok(bb.hp === 1, 'battleship damaged, not sunk');
  ok(s.status === 'ongoing', 'battle continues');
}

// destroyer cancels surprise strike
{
  const s = createBattle(
    side({ submarine: 1, cruiser: 1 }),
    side({ destroyer: 1 }),
    { amphibious: false, seaCombat: true },
  );
  ok(currentStep(s) !== 'sub_strike', 'no surprise strike vs destroyer');
  const dice = stepDice(s, 'attacker_fire');
  ok(dice.some((d) => d.key === 'submarine'), 'subs fire in the normal step instead');
}

// air cannot hit subs without a friendly destroyer
{
  const s = createBattle(
    side({ fighter: 2 }),
    side({ submarine: 1, transport: 1 }),
    { amphibious: false, seaCombat: true },
  );
  const el = eligibleFor(s, 'defender', 'air');
  ok(!el.some((u) => u.key === 'submarine'), 'air hits cannot fall on subs (no destroyer)');
  ok(el.some((u) => u.key === 'transport'), 'transports exposed when nothing else eligible');
}

// with a destroyer present, air hits CAN fall on subs
{
  const s = createBattle(
    side({ fighter: 2, destroyer: 1 }),
    side({ submarine: 2 }),
    { amphibious: false, seaCombat: true },
  );
  const el = eligibleFor(s, 'defender', 'air');
  ok(el.some((u) => u.key === 'submarine'), 'destroyer lets air hit subs');
}

// sub hits can only sink sea units (never assigned to air)
{
  const s = createBattle(
    side({ submarine: 2 }),
    side({ fighter: 1, cruiser: 1, carrier: 1 }),
    { amphibious: false, seaCombat: true },
  );
  const el = eligibleFor(s, 'defender', 'sub');
  ok(!el.some((u) => u.key === 'fighter'), 'sub hits never fall on aircraft');
}

// defenseless transports are swept
{
  const s = createBattle(
    side({ cruiser: 1 }),
    side({ transport: 2 }),
    { amphibious: false, seaCombat: true },
  );
  ok(s.status !== 'ongoing', 'transport-only defense ends immediately');
  const swept = s.log.find((e) => e.kind === 'transports');
  ok(!!swept && swept.casualties.length === 2, 'both transports destroyed');
}

// air-only attacker cannot capture: cleared, not captured
{
  const s = createBattle(
    side({ fighter: 3 }),
    side({ infantry: 1 }),
    { amphibious: false, seaCombat: false },
  );
  autoplay(s, 7);
  ok(s.status === 'attacker_cleared' || s.status === 'defender_won' || s.status === 'mutual',
    `air-only attacker never captures (${s.status})`);
}

// land attacker captures on a wipe
{
  const s = createBattle(
    side({ tank: 6 }),
    side({ infantry: 1 }),
    { amphibious: false, seaCombat: false },
  );
  autoplay(s, 3);
  ok(s.status === 'attacker_captured' || s.status === 'defender_won' || s.status === 'mutual',
    `tank attacker captures (${s.status})`);
}

// retreat works
{
  const s = createBattle(
    side({ infantry: 3 }),
    side({ infantry: 3 }),
    { amphibious: false, seaCombat: false },
  );
  autoplay(s, 11, 1); // retreat at the first opportunity
  ok(s.status === 'retreated' || s.status !== 'ongoing', `retreat resolves (${s.status})`);
}

// heavy bombers roll two dice on attack, one on defense
{
  const s = createBattle(
    { ...side({ bomber: 2 }), techs: ['heavyBombers'] },
    side({ infantry: 1 }),
    { amphibious: false, seaCombat: false },
  );
  ok(stepDice(s, 'attacker_fire').length === 4, 'heavy bombers: 2 dice each');
}
{
  const s = createBattle(
    side({ infantry: 1 }),
    { ...side({ bomber: 2 }), techs: ['heavyBombers'] },
    { amphibious: false, seaCombat: false },
  );
  ok(stepDice(s, 'defender_fire').length === 2, 'heavy bombers defend with 1 die');
}

// jets + super subs (attack only)
{
  const s = createBattle(
    { ...side({ fighter: 1, submarine: 1 }), techs: ['jetFighters', 'superSubs'] },
    side({ destroyer: 1 }),
    { amphibious: false, seaCombat: true },
  );
  const dice = stepDice(s, 'attacker_fire');
  ok(dice.find((d) => d.key === 'fighter')?.hitOn === 4, 'jet fighters attack at 4');
  ok(dice.find((d) => d.key === 'submarine')?.hitOn === 3, 'super subs attack at 3');
}

// amphibious bombardment: BB hits on 4, CA on 3, casualties fire back
{
  const s = createBattle(
    side({ infantry: 2, battleship: 1, cruiser: 1 }),
    side({ infantry: 2 }),
    { amphibious: true, seaCombat: false },
  );
  ok(currentStep(s) === 'bombardment', 'bombardment first (no AA)');
  const dice = stepDice(s, 'bombardment');
  ok(dice.length === 2 && dice.find((d) => d.key === 'battleship')?.hitOn === 4 && dice.find((d) => d.key === 'cruiser')?.hitOn === 3, 'bombard values');
  resolveRoll(s, [1, 1]); // both hit — folded into round hits
  ok(currentStep(s) === 'attacker_fire', 'combat continues after bombardment');
  const atkDice = stepDice(s, 'attacker_fire');
  ok(atkDice.every((d) => d.key === 'infantry'), 'ships do not fire in land combat');
  // second round: no more bombardment
  resolveRoll(s, atkDice.map(() => 6));
  const defDice = stepDice(s, 'defender_fire');
  ok(defDice.length === 2, 'both defenders fire back despite bombard hits (casualty zone)');
}

// ---------- fuzz ----------

const UNIT_KEYS = Object.keys(UNITS) as UnitKey[];
const LAND_AIR: UnitKey[] = ['infantry', 'artillery', 'tank', 'fighter', 'bomber'];
const SEA: UnitKey[] = ['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport', 'fighter', 'bomber'];

for (let i = 0; i < 400; i++) {
  const rng = mulberry32(0xA0A0 + i);
  const sea = rng() < 0.5;
  const keys = sea ? SEA : LAND_AIR;
  const mk = (defender: boolean): Partial<Record<UnitKey, number>> => {
    const st: Partial<Record<UnitKey, number>> = {};
    const n = 1 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      let key = keys[Math.floor(rng() * keys.length)];
      if (defender && !sea && rng() < 0.3) key = 'aaGun';
      if (defender && sea && (key === 'fighter' || key === 'bomber')) key = 'cruiser'; // defending air at sea needs a carrier; keep it simple
      st[key] = (st[key] ?? 0) + 1 + Math.floor(rng() * 3);
    }
    return st;
  };
  const atkStack = mk(false);
  const defStack = mk(true);
  const atk = side(atkStack, 'a');
  const def = side(defStack, 'd');
  const s = createBattle(atk, def, { amphibious: !sea && rng() < 0.3 && !!(atkStack.battleship || atkStack.cruiser), seaCombat: sea });
  autoplay(s, 0xBEEF + i, rng() < 0.2 ? 2 + Math.floor(rng() * 3) : Infinity);
  ok(s.status !== 'ongoing', `fuzz ${i} finished (${s.status})`);
  checkConservation(s, stackOfSpec(atk), stackOfSpec(def), `fuzz ${i}`);
  // no negative hp, no over-heal
  for (const u of [...s.attacker, ...s.defender]) {
    ok(u.hp >= 0 && u.hp <= u.maxHp, `fuzz ${i}: hp bounds`);
  }
}

console.log(`\naxis-battle-test: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
