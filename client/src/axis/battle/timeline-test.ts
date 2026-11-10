import assert from 'node:assert/strict';
import {
  applyCasualtyPicks, applyRetreat, applySubmerge, createBattle, resolveRoll, stepDice, currentStep,
  type BattleState,
} from '../../../../shared/src/axis/battle.js';
import { lastVolley, volleyOf, hitLabel, volleyResultLine } from './dice';
import { pendingHits, planBeats, snapshotOf, stageStatus, terrainOf, type Beat } from './timeline';
import type { Combat } from './model';

function combatOf(battle: BattleState, id = 1, visualSeq = 0, extra: Partial<Combat> = {}): Combat {
  return {
    id, visualSeq, kind: 'battle', space: 'ukraine', attacker: 'germany', from: [], retreatRulesVersion: 1,
    amphibious: false, battle: JSON.parse(JSON.stringify(battle)), attackerCommitted: [], retreatPolicy: null, dice: null,
    ...extra,
  } as unknown as Combat;
}
const roll = (b: BattleState, value: number | number[]) => {
  const kind = currentStep(b)!;
  const n = stepDice(b, kind).length;
  resolveRoll(b, Array.isArray(value) ? value : Array.from({ length: n }, () => value));
};
const types = (beats: Beat[]) => beats.map((b) => b.type);

// ---------- a land battle, snapshot by snapshot ----------
{
  const b = createBattle(
    { units: [{ key: 'infantry', power: 'germany', count: 2 }, { key: 'tank', power: 'germany', count: 2 }] },
    { units: [{ key: 'infantry', power: 'ussr', count: 2 }, { key: 'artillery', power: 'ussr', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  const c0 = combatOf(b);
  const first = planBeats(null, c0);
  assert.deepEqual(types(first.beats), ['open']);
  assert.equal(first.snap, true, 'the first snapshot always builds the stage from state');
  assert.equal(first.reason, 'first');
  assert.equal(terrainOf(c0), 'land');
  assert.equal(stageStatus(c0, 'germany').waitingOn, 'germany');
  assert.match(stageStatus(c0, 'germany').line, /Germany to roll the attack/);

  let prev = snapshotOf(c0);
  assert.deepEqual(planBeats(prev, c0).beats, [], 'an unchanged snapshot produces no beats');

  // attacker fires: infantry need 1, tanks need 3. Dice 1,6,3,4 -> two hits.
  roll(b, [1, 6, 3, 4]);
  const c1 = combatOf(b, 1, 1);
  const p1 = planBeats(prev, c1);
  assert.deepEqual(types(p1.beats), ['volley']);
  const v = p1.beats[0] as Extract<Beat, { type: 'volley' }>;
  assert.equal(v.firingSide, 'attacker');
  assert.equal(v.firing.length, 4, 'every rolling unit is named');
  assert.equal(v.volley.total, 2);
  assert.deepEqual(v.volley.groups.map((g) => [g.key, g.hitOn, g.dice.map((d) => d.value), g.hits]), [
    ['infantry', 1, [1, 6], 1],
    ['tank', 3, [3, 4], 1],
  ]);
  assert.equal(v.volley.groups[1].label, 'Tanks hit on 3 or less');
  assert.equal(v.volley.groups[0].label, 'Infantry hit on 1');
  assert.deepEqual(pendingHits(c1.battle), [{ side: 'defender', hits: 2, choosing: false }], 'rolled hits wait for the casualty step');
  prev = snapshotOf(c1);

  // defender fires and misses everything; the defender must now choose 2 of 3 mixed units.
  roll(b, 6);
  const c2 = combatOf(b, 1, 2);
  assert.equal(b.decision?.type, 'casualties');
  const p2 = planBeats(prev, c2);
  assert.deepEqual(types(p2.beats), ['volley']);
  assert.equal((p2.beats[0] as Extract<Beat, { type: 'volley' }>).firingSide, 'defender');
  assert.deepEqual(pendingHits(c2.battle), [{ side: 'defender', hits: 2, choosing: true }]);
  const st = stageStatus(c2, 'germany');
  assert.equal(st.waitingOn, 'ussr');
  assert.match(st.line, /Soviet Union is choosing 2 casualties/);
  prev = snapshotOf(c2);

  // the defender gives up the artillery and one infantry
  const art = b.defender.find((u) => u.key === 'artillery')!.uid;
  const inf = b.defender.find((u) => u.key === 'infantry')!.uid;
  applyCasualtyPicks(b, [art, inf]);
  const c3 = combatOf(b, 1, 3);
  const p3 = planBeats(prev, c3);
  assert.deepEqual(types(p3.beats), ['casualties']);
  const cas = p3.beats[0] as Extract<Beat, { type: 'casualties' }>;
  assert.equal(cas.side, 'defender');
  assert.deepEqual([...cas.destroyed].sort(), [art, inf].sort(), 'the exact chosen units fall, not the cheapest');
  assert.match(cas.text, /Soviet Union loses/);
  assert.deepEqual(pendingHits(c3.battle), []);
  assert.equal(b.decision?.type, 'retreat');
  assert.match(stageStatus(c3, 'germany').line, /Germany decides whether to press the attack/);
  prev = snapshotOf(c3);

  // retreat: every surviving attacker leaves and the result follows
  applyRetreat(b, true);
  const c4 = combatOf(b, 1, 4);
  const p4 = planBeats(prev, c4);
  assert.deepEqual(types(p4.beats), ['retreat', 'result']);
  assert.equal((p4.beats[0] as Extract<Beat, { type: 'retreat' }>).uids.length, 4);
  assert.equal((p4.beats[1] as Extract<Beat, { type: 'result' }>).status, 'retreated');

  // a late or reordered snapshot never replays: it snaps
  const rewind = planBeats(snapshotOf(c4), c2);
  assert.equal(rewind.snap, true);
  assert.equal(rewind.reason, 'rewind');
  assert.deepEqual(rewind.beats, []);

  // a new combat id always reopens
  assert.equal(planBeats(snapshotOf(c4), combatOf(b, 2, 0)).reason, 'new-combat');
}

// ---------- skipped snapshots collapse into ordered beats ----------
{
  const b = createBattle(
    { units: [{ key: 'tank', power: 'germany', count: 3 }] },
    { units: [{ key: 'infantry', power: 'ussr', count: 2 }] },
    { amphibious: false, seaCombat: false },
  );
  const prev = snapshotOf(combatOf(b));
  roll(b, 1); // 3 hits
  roll(b, 1); // 2 hits back, then both sides lose units automatically
  const c = combatOf(b, 1, 2);
  const plan = planBeats(prev, c);
  assert.equal(plan.snap, false);
  assert.deepEqual(types(plan.beats), ['volley', 'volley', 'casualties', 'casualties', 'result']);
  const [, , d, a] = plan.beats as Extract<Beat, { type: 'casualties' }>[];
  assert.equal(d.side, 'defender');
  assert.equal(d.destroyed.length, 2);
  assert.equal(a.side, 'attacker');
  assert.equal(a.destroyed.length, 2);
  assert.equal((plan.beats[4] as Extract<Beat, { type: 'result' }>).status, b.status);

  // with a tiny budget the same gap snaps and keeps only the latest roll and the result
  const tight = planBeats(prev, c, { maxBeats: 2 });
  assert.equal(tight.snap, true);
  assert.equal(tight.reason, 'overflow');
  assert.deepEqual(types(tight.beats), ['volley', 'result']);
  assert.equal((tight.beats[0] as Extract<Beat, { type: 'volley' }>).firingSide, 'defender');
}

// ---------- battleship damage has no log entry but still makes a beat ----------
{
  const b = createBattle(
    { units: [{ key: 'destroyer', power: 'japan', count: 2 }] },
    { units: [{ key: 'battleship', power: 'usa', count: 1 }] },
    { amphibious: false, seaCombat: true },
  );
  const prev = snapshotOf(combatOf(b, 3, 0, { space: 'sz-53' }));
  roll(b, [1, 6]); // one hit on the battleship
  roll(b, 6); // battleship misses
  const c = combatOf(b, 3, 2, { space: 'sz-53' });
  assert.equal(terrainOf(c), 'sea');
  const plan = planBeats(prev, c);
  assert.deepEqual(types(plan.beats), ['volley', 'volley', 'casualties']);
  const hit = plan.beats[2] as Extract<Beat, { type: 'casualties' }>;
  assert.deepEqual(hit.destroyed, []);
  assert.deepEqual(hit.damaged, [b.defender[0].uid]);
  assert.equal(hit.text, 'Battleship damaged');
}

// ---------- antiaircraft fire names its targets; submarines submerge ----------
{
  const b = createBattle(
    { units: [{ key: 'fighter', power: 'uk', count: 2 }, { key: 'infantry', power: 'uk', count: 1 }] },
    { units: [{ key: 'aaGun', power: 'germany', count: 1 }, { key: 'infantry', power: 'germany', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  assert.equal(currentStep(b), 'aa_fire');
  const prev = snapshotOf(combatOf(b));
  roll(b, [1, 5]);
  const c = combatOf(b, 1, 1);
  const plan = planBeats(prev, c);
  assert.deepEqual(types(plan.beats), ['volley', 'casualties']);
  const v = plan.beats[0] as Extract<Beat, { type: 'volley' }>;
  assert.equal(v.firingSide, 'defender');
  assert.deepEqual(v.targets, [b.attacker[0].uid]);
  assert.equal(v.volley.groups[0].label, 'Antiaircraft Gun hits on 1');
  assert.deepEqual((plan.beats[1] as Extract<Beat, { type: 'casualties' }>).destroyed, [b.attacker[0].uid]);
}
{
  const b = createBattle(
    { units: [{ key: 'submarine', power: 'germany', count: 2 }] },
    { units: [{ key: 'cruiser', power: 'uk', count: 1 }] },
    { amphibious: false, seaCombat: true },
  );
  assert.equal(b.decision?.type, 'submerge');
  const c0 = combatOf(b, 1, 0, { space: 'sz-7' });
  assert.match(stageStatus(c0, 'germany').line, /Germany decides whether to submerge/);
  const prev = snapshotOf(c0);
  applySubmerge(b, [b.attacker[0].uid]);
  const plan = planBeats(prev, combatOf(b, 1, 1, { space: 'sz-7' }));
  assert.equal(plan.beats[0].type, 'submerge');
  assert.deepEqual((plan.beats[0] as Extract<Beat, { type: 'submerge' }>).uids, [b.attacker[0].uid]);
}

// ---------- strategic raid: damage dice and the heavy bomber discard ----------
{
  const b = createBattle(
    { units: [{ key: 'bomber', power: 'usa', count: 1 }], techs: ['heavyBombers'] },
    { units: [{ key: 'factory', power: 'germany', count: 1 }] },
    { amphibious: false, seaCombat: false, strategicRaid: true },
  );
  const prev = snapshotOf(combatOf(b, 9, 0, { kind: 'strategicRaid' }));
  roll(b, [2, 5]);
  const c = combatOf(b, 9, 1, { kind: 'strategicRaid' });
  const plan = planBeats(prev, c);
  assert.deepEqual(types(plan.beats), ['volley', 'result']);
  const v = (plan.beats[0] as Extract<Beat, { type: 'volley' }>).volley;
  assert.equal(v.metric, 'damage');
  assert.equal(v.total, 5, 'only the kept die counts');
  assert.deepEqual(v.groups[0].dice.map((d) => d.discarded), [true, false]);
  assert.equal(volleyResultLine(v), '5 damage');
  assert.equal(lastVolley(c.battle.log, [...c.battle.attacker, ...c.battle.defender])?.logIndex, v.logIndex);
}

// ---------- labels ----------
assert.equal(hitLabel('fighter', 2, 4, 'hits'), 'Fighters hit on 4 or less');
assert.equal(hitLabel('submarine', 1, 2, 'hits'), 'Submarine hits on 2 or less');
assert.equal(hitLabel('bomber', 2, 0, 'damage'), 'Bombers, damage is the number rolled');
{
  const event = { round: 1, kind: 'attacker_fire' as const, side: 'attacker' as const, title: 't', text: '', hits: 0, casualties: [], rolls: [{ key: 'tank' as const, value: 9, hitOn: 3, hit: false, uid: 1 }] };
  assert.equal(volleyOf(event, 0, []).groups[0].dice[0].value, 6, 'a malformed die value is clamped to a real face');
}

console.log('battle timeline: ok');
