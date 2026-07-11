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
            const el = b.eligible;
            if (el.length) picks.push(el[Math.floor(rng() * el.length)]);
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
  if (s.status !== 'ongoing') {
    ok(s.queue.length === 0, 'terminal battle has no casualty queue');
    ok(s.pendingOnAttacker.length === 0 && s.pendingOnDefender.length === 0, 'terminal battle has no pending hits');
    ok(s.decision === null, 'terminal battle has no decision');
  }
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
  ok(dice.every((d) => d.uid === s.defender.find((unit) => unit.key === 'aaGun')?.uid), 'AA dice identify the physical gun for the cinematic volley');
  ok(dice.map((die) => s.attacker.find((unit) => unit.uid === die.targetUid)?.key).join(',') === 'fighter,fighter,bomber', 'each AA die identifies its exact aircraft in stable order');
  resolveRoll(s, [1, 1, 6]); // two aircraft down
  ok(s.decision === null, 'targeted AA casualties resolve automatically without a redirect choice');
  const aaEvent = s.log.find((event) => event.kind === 'aa_fire');
  ok(aaEvent?.rolls.map((roll) => roll.targetUid).join(',') === dice.map((die) => die.targetUid).join(','), 'AA event preserves exact targets for cinematic presentation');
  const shot = s.log.filter((e) => e.kind === 'casualties').flatMap((e) => e.casualties);
  ok(shot.length === 2 && shot.every((c) => c.key === 'fighter'), 'AA kills the two aircraft assigned to the successful dice');
  ok(s.attacker.find((unit) => unit.key === 'bomber')?.hp === 1, 'the bomber assigned to the miss survives');
  // round 2 must not have AA
  autoplay(s, 42);
  ok(!s.log.some((e) => e.kind === 'aa_fire' && e.round > 1), 'AA never fires after round 1');
}

// Unassignable hits do not consume the next bucket's explicit casualty pick.
{
  const s = createBattle(
    side({ fighter: 1, tank: 1 }),
    side({ infantry: 1 }),
    { amphibious: false, seaCombat: false },
  );
  const fighter = s.attacker.find((unit) => unit.key === 'fighter')!;
  const tank = s.attacker.find((unit) => unit.key === 'tank')!;
  const buckets = [
    { source: 'aa' as const, hits: 2 },
    { source: 'other' as const, hits: 1 },
  ];
  s.queue = [{ side: 'attacker', buckets }];
  s.decision = {
    type: 'casualties', side: 'attacker', picks: 3,
    buckets: [
      { ...buckets[0], eligible: [fighter.uid] },
      { ...buckets[1], eligible: [tank.uid] },
    ],
  };
  applyCasualtyPicks(s, [fighter.uid, tank.uid]);
  ok(fighter.hp === 0 && tank.hp === 0, 'compact picks remain aligned after an exhausted eligibility bucket');
}

// A restored or adversarial casualty command cannot redirect a targeted AA
// hit to a different aircraft UID.
{
  const s = createBattle(
    side({ fighter: 1, bomber: 1 }),
    side({ infantry: 1 }),
    { amphibious: false, seaCombat: false },
  );
  const fighter = s.attacker.find((unit) => unit.key === 'fighter')!;
  const bomber = s.attacker.find((unit) => unit.key === 'bomber')!;
  const bucket = { source: 'aa' as const, hits: 1, eligibleUids: [bomber.uid] };
  s.queue = [{ side: 'attacker', buckets: [bucket] }];
  s.decision = {
    type: 'casualties', side: 'attacker', picks: 1,
    buckets: [{ ...bucket, eligible: [bomber.uid] }],
  };
  applyCasualtyPicks(s, [fighter.uid]);
  ok(fighter.hp === 1 && bomber.hp === 0, 'wrong UID falls back to the aircraft targeted by the AA die');
}

// Legacy side-level Radar remains valid for battles restored without per-unit
// technology metadata.
{
  const s = createBattle(
    side({ fighter: 1 }),
    { ...side({ infantry: 1, aaGun: 1 }), techs: ['radar'] },
    { amphibious: false, seaCombat: false },
  );
  ok(stepDice(s, 'aa_fire')[0].hitOn === 2, 'legacy side-level Radar AA hits on 2');
}

// In a multinational defense, gun-owner technology controls Radar. Defenders
// may choose their live Radar gun, but an ally's technology is never shared.
{
  const s = createBattle(
    side({ fighter: 1 }),
    { units: [
      { key: 'infantry', power: 'uk', count: 1, techs: [] },
      { key: 'aaGun', power: 'uk', count: 1, techs: [] },
      { key: 'aaGun', power: 'usa', count: 1, techs: ['radar'] },
    ] },
    { amphibious: false, seaCombat: false },
  );
  const die = stepDice(s, 'aa_fire')[0];
  const firingGun = s.defender.find((unit) => unit.uid === die.uid);
  ok(die.hitOn === 2 && firingGun?.power === 'usa', 'multinational defense chooses the live Radar-owned AA gun');
}
{
  const s = createBattle(
    side({ fighter: 1 }),
    {
      units: [{ key: 'aaGun', power: 'uk', count: 1, techs: [] }],
      techs: ['radar'],
    },
    { amphibious: false, seaCombat: false },
  );
  ok(stepDice(s, 'aa_fire')[0].hitOn === 1, 'explicit non-Radar gun ownership overrides side-level legacy Radar');
}
{
  const s = createBattle(
    side({ fighter: 1 }),
    { units: [
      { key: 'aaGun', power: 'uk', count: 1, techs: [] },
      { key: 'aaGun', power: 'usa', count: 1, techs: ['radar'] },
    ] },
    { amphibious: false, seaCombat: false },
  );
  s.defender.find((unit) => unit.power === 'usa')!.hp = 0;
  const die = stepDice(s, 'aa_fire')[0];
  ok(die.hitOn === 1 && s.defender.find((unit) => unit.uid === die.uid)?.power === 'uk', 'destroyed Radar gun cannot lend its bonus to a live allied gun');
}

// A lone AA gun/complex still fires before an otherwise unopposed capture.
{
  const s = createBattle(
    side({ fighter: 1, infantry: 1 }),
    side({ aaGun: 1, factory: 1 }),
    { amphibious: false, seaCombat: false },
  );
  ok(s.status === 'ongoing' && currentStep(s) === 'aa_fire', 'passive infrastructure defers capture until AA fires');
  resolveRoll(s, [6]);
  ok(s.log.some((e) => e.kind === 'aa_fire'), 'lone AA volley is recorded');
  ok(s.status === 'attacker_captured', `land attacker captures after AA misses (${s.status})`);
}
{
  const s = createBattle(
    side({ fighter: 1 }),
    side({ aaGun: 1, factory: 1 }),
    { amphibious: false, seaCombat: false },
  );
  resolveRoll(s, [1]);
  ok(s.attacker[0].hp === 0, 'lone AA can destroy the only attacker');
  ok(s.status === 'defender_won', `surviving infrastructure holds after shooting down all attackers (${s.status})`);
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
  ok(s.decision?.type === 'submerge' && s.decision.side === 'attacker', 'submerge offered before surprise strike');
  applySubmerge(s, []); // decline once, then fire
  ok(s.decision === null, 'declining submerge does not immediately re-prompt');
  ok(currentStep(s) === 'sub_strike', 'surprise strike (no destroyer)');
  resolveRoll(s, [2]); // hit
  const bb = s.defender.find((u) => u.key === 'battleship')!;
  ok(bb.hp === 1, 'battleship damaged, not sunk');
  ok(s.status === 'ongoing', 'battle continues');
}

// Persisted board damage expands into the exact number of 1-HP battleships.
{
  const s = createBattle(
    { units: [{ key: 'battleship', power: 'a', count: 2, damaged: 1 }] },
    { units: [{ key: 'battleship', power: 'd', count: 3, damaged: 2 }] },
    { amphibious: false, seaCombat: true },
  );
  ok(s.attacker.filter((u) => u.key === 'battleship' && u.hp === 1).length === 1, 'one damaged attacker enters at 1 HP');
  ok(s.attacker.filter((u) => u.key === 'battleship' && u.hp === 2).length === 1, 'healthy attacker remains at 2 HP');
  ok(s.defender.filter((u) => u.key === 'battleship' && u.hp === 1).length === 2, 'two damaged defenders enter at 1 HP');
  ok(s.defender.filter((u) => u.key === 'battleship' && u.hp === 2).length === 1, 'healthy defender remains at 2 HP');
}

// choosing to submerge ends the sub's participation but preserves the unit
{
  const s = createBattle(
    side({ submarine: 1 }),
    side({ cruiser: 1 }),
    { amphibious: false, seaCombat: true },
  );
  const uid = s.decision?.type === 'submerge' ? s.decision.subs[0] : -1;
  ok(uid > 0, 'eligible submarine receives a live choice');
  applySubmerge(s, [uid]);
  ok(s.attacker[0].submerged === true && s.attacker[0].hp === 1, 'submerged submarine survives');
  ok(s.status === 'defender_won', 'surface defender holds after attacker submerges');
  ok(s.queue.length === 0 && s.decision === null, 'submerge terminal state is clean');
}

// destroyer cancels surprise strike
{
  const s = createBattle(
    side({ submarine: 1, cruiser: 1 }),
    side({ destroyer: 1 }),
    { amphibious: false, seaCombat: true },
  );
  ok(currentStep(s) !== 'sub_strike', 'no surprise strike vs destroyer');
  ok(s.decision?.type !== 'submerge', 'destroyer suppresses submerge');
  const dice = stepDice(s, 'attacker_fire');
  ok(dice.some((d) => d.key === 'submarine'), 'subs fire in the normal step instead');
}

// reciprocal round fire is simultaneous even when the defender is wiped
{
  const s = createBattle(
    side({ infantry: 1 }),
    side({ infantry: 1 }),
    { amphibious: false, seaCombat: false },
  );
  resolveRoll(s, [1]);
  resolveRoll(s, [1]);
  ok(s.status === 'mutual', `simultaneous hits produce mutual destruction (${s.status})`);
  ok(s.attacker[0].hp === 0 && s.defender[0].hp === 0, 'both already-fired hits are applied');
  ok(s.queue.length === 0 && s.pendingOnAttacker.length === 0 && s.pendingOnDefender.length === 0, 'terminal casualty batch fully drains');
}

// air targeting snapshots destroyer support when the volley is rolled
{
  const s = createBattle(
    side({ submarine: 1 }),
    side({ fighter: 1, destroyer: 1 }),
    { amphibious: false, seaCombat: true },
  );
  ok(s.decision === null && currentStep(s) === 'attacker_fire', 'enemy destroyer suppresses surprise strike and submerge');
  resolveRoll(s, [1]); // submarine hits the destroyer
  const defDice = stepDice(s, 'defender_fire');
  ok(defDice[0]?.key === 'fighter' && defDice[1]?.key === 'destroyer', 'defender volley order is stable');
  resolveRoll(s, [1, 6]); // fighter hits while the destroyer is still present
  ok(s.defender.find((u) => u.key === 'destroyer')?.hp === 0, 'destroyer is lost to simultaneous fire');
  ok(s.attacker.find((u) => u.key === 'submarine')?.hp === 0, 'already-rolled air hit still kills the submarine');
  ok(s.status === 'defender_won' && s.queue.length === 0, 'snapshot-enabled volley resolves to a clean terminal result');
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
  resolveRoll(s, [1, 1, 1, 1]);
  const volley = s.log.find((event) => event.kind === 'attacker_fire');
  ok(volley?.hits === 2, 'heavy bombers select one attack die each and can score at most one hit per bomber');
  ok(volley?.rolls.filter((roll) => roll.selected).length === 2 && volley.rolls.filter((roll) => roll.selected === false).length === 2, 'both heavy-bomber dice stay visible with one authoritative selection per bomber');
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

// Amphibious commitment: one bombardier per unloaded land unit, shore ships
// never join ordinary land fire, bombardment never repeats, and the beach
// force cannot retreat between rounds.
{
  const s = createBattle(
    { units: [
      { key: 'infantry', power: 'a', count: 1 }, // overland force is appended first
      { key: 'infantry', power: 'a', count: 1 }, // transported force is appended last
    ] },
    side({ infantry: 1 }),
    { amphibious: true, seaCombat: false, amphibiousLand: { infantry: 1 } },
  );
  ok(!s.attacker[0].amphibious && s.attacker[1].amphibious === true, 'same-type overland and offloaded units keep retreat provenance');
}
{
  const s = createBattle(
    { units: [
      { key: 'infantry', power: 'a', count: 1 }, // overland
      { key: 'fighter', power: 'a', count: 1 }, // air support
      { key: 'infantry', power: 'a', count: 1 }, // offloaded last
    ] },
    side({ infantry: 1 }),
    { amphibious: true, seaCombat: false, amphibiousLand: { infantry: 1 } },
  );
  resolveRoll(s, stepDice(s, 'attacker_fire').map(() => 6));
  resolveRoll(s, stepDice(s, 'defender_fire').map(() => 6));
  ok(s.decision?.type === 'retreat' && s.decision.partial === true, 'mixed amphibious force may withdraw only its overland and air contingent');
  applyRetreat(s, true);
  ok(s.status === 'ongoing' && s.round === 2, 'partial retreat leaves the beach battle running');
  ok(s.attacker.length === 1 && s.attacker[0].amphibious === true, 'only the committed beach unit stays in combat');
  ok((s.withdrawnAttacker ?? []).length === 2 && (s.withdrawnAttacker ?? []).some((u) => u.key === 'fighter'), 'overland infantry and air are preserved outside combat');
  ok(stepDice(s, 'attacker_fire').length === 1, 'withdrawn units cannot fire in later rounds');
}
{
  const s = createBattle(
    side({ infantry: 1, battleship: 2, cruiser: 1 }),
    side({ infantry: 2 }),
    { amphibious: true, seaCombat: false, amphibiousLand: { infantry: 1 } },
  );
  ok(s.attacker.filter((u) => u.amphibious).length === 1, 'only the offloaded land unit is committed to the beach');
  const bombard = stepDice(s, 'bombardment');
  ok(bombard.length === 1, `bombardment capped at one ship for one unloaded unit (${bombard.length})`);
  resolveRoll(s, [6]); // bombardment misses
  const firstRoundAttack = stepDice(s, 'attacker_fire');
  ok(firstRoundAttack.length === 1 && firstRoundAttack[0].key === 'infantry', 'offshore ships never fire as ordinary land attackers');
  resolveRoll(s, [6]); // attacker misses
  resolveRoll(s, stepDice(s, 'defender_fire').map(() => 6)); // defender misses
  ok(s.status === 'ongoing' && s.decision === null, 'surviving amphibious land force is not offered retreat');
  ok(s.round === 2 && currentStep(s) === 'attacker_fire', `amphibious combat advances directly to round 2 (${s.round})`);
  const secondRoundAttack = stepDice(s, 'attacker_fire');
  ok(secondRoundAttack.length === 1 && secondRoundAttack[0].key === 'infantry', 'round 2 has neither repeated bombardment nor normal ship fire');
  ok(s.log.some((e) => e.title === 'Amphibious assault continues'), 'battle log explains why retreat is unavailable');
}

// Defensive hydration guard: a retreat decision saved by an older engine
// cannot withdraw a still-living amphibious land unit.
{
  const s = createBattle(
    side({ infantry: 1 }),
    side({ infantry: 1 }),
    { amphibious: true, seaCombat: false, amphibiousLand: { infantry: 1 } },
  );
  s.decision = { type: 'retreat', side: 'attacker' };
  applyRetreat(s, true);
  ok(s.status === 'ongoing' && s.round === 2, 'stale retreat choice continues the amphibious battle instead of withdrawing');
}

// Strategic raids reuse the cinematic battle engine but have a strict
// AA-then-face-value-damage sequence and never enter ordinary land combat.
{
  const s = createBattle(
    side({ bomber: 2 }, 'germany', ['heavyBombers']),
    { units: [
      { key: 'aaGun', power: 'ussr', count: 1, techs: [] },
      { key: 'aaGun', power: 'uk', count: 1, techs: ['radar'] },
      { key: 'factory', power: 'ussr', count: 1 },
    ] },
    { amphibious: false, seaCombat: false, strategicRaid: true },
  );
  ok(s.status === 'ongoing' && currentStep(s) === 'aa_fire', 'strategic raid opens on AA without initial capture evaluation');
  const aaDice = stepDice(s, 'aa_fire');
  ok(aaDice.length === 2 && aaDice[0].hitOn === 2, 'Radar-owned AA rolls once per strategic raider');
  ok(aaDice.every((die) => s.defender.find((unit) => unit.uid === die.uid)?.power === 'uk'), 'strategic raid chooses the multinational Radar gun');
  ok(new Set(aaDice.map((die) => die.targetUid)).size === 2, 'strategic AA dice bind to the two exact bombers');
  resolveRoll(s, [1, 6]);
  ok(s.status === 'ongoing' && currentStep(s) === 'raid_damage', 'a surviving raider advances from AA to damage instead of terminalizing');
  ok(s.attacker.filter((unit) => unit.hp > 0).length === 1, 'AA casualty is removed before bombing damage');
  ok(stepDice(s, 'raid_damage').length === 2, 'heavy bomber rolls two strategic damage dice');
  resolveRoll(s, [5, 6]);
  ok(s.status === 'raid_resolved' && s.raidDamage === 6, 'heavy bomber selects its highest strategic damage die and terminates the raid');
  const damageEvent = s.log.find((event) => event.kind === 'raid_damage');
  ok(damageEvent?.metric === 'damage' && damageEvent.rolls.every((roll) => !roll.hit), 'damage volley is not mislabeled as threshold hits');
  ok(damageEvent?.rolls.filter((roll) => roll.selected).map((roll) => roll.value).join(',') === '6', 'SBR report identifies the selected high die while retaining both rolls');
}
{
  const s = createBattle(
    side({ bomber: 1 }, 'germany'),
    side({ aaGun: 1, factory: 1 }, 'ussr'),
    { amphibious: false, seaCombat: false, strategicRaid: true },
  );
  resolveRoll(s, [1]);
  ok(s.status === 'raid_resolved' && s.raidDamage === 0, 'all raiders shot down resolve with zero damage');
  ok(!s.log.some((event) => event.kind === 'raid_damage'), 'no phantom damage volley is created when AA destroys every bomber');
}
{
  const s = createBattle(
    side({ bomber: 1 }, 'germany'),
    side({ factory: 1 }, 'ussr'),
    { amphibious: false, seaCombat: false, strategicRaid: true },
  );
  ok(s.status === 'ongoing' && currentStep(s) === 'raid_damage', 'a raid without AA begins directly at the damage volley');
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
