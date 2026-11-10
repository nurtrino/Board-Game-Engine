import assert from 'node:assert/strict';
import type { AxisRetreatPolicy } from '@bge/shared';
import {
  applyCasualtyPicks, applySubmerge, createBattle, currentStep, resolveRoll, stepDice, type BattleState,
} from '../../../../shared/src/axis/battle.js';
import { casualtyCards, confirmLabel, legalPrefix, planCasualties, undoCard, undoPick, whyNot } from './casualties';
import {
  buildRemainAction, buildRetreatAction, initialRetreatSelection, normalizeRetreatSelection, retreatCopy, retreatKey, retreatLabel,
  type RetreatCombat,
} from './retreat';
import {
  continueAuthority, controllerOf, controls, decisionAuthority, forceRows, outcomeLine, rollAuthority, spaceName,
  type CasualtyDecision,
} from './model';

const roll = (b: BattleState, value: number | number[]) => {
  const n = stepDice(b, currentStep(b)!).length;
  resolveRoll(b, Array.isArray(value) ? value : Array.from({ length: n }, () => value));
};
const stay = (b: BattleState) => { let guard = 0; while (b.decision?.type === 'submerge' && guard++ < 4) applySubmerge(b, []); };
const casualtyDecision = (b: BattleState): CasualtyDecision => {
  assert.equal(b.decision?.type, 'casualties');
  return b.decision as CasualtyDecision;
};

// ---------- land: any unit may take an ordinary hit; the payload matches the engine ----------
{
  const b = createBattle(
    { units: [{ key: 'tank', power: 'germany', count: 2 }] },
    { units: [{ key: 'infantry', power: 'ussr', count: 3 }, { key: 'tank', power: 'ussr', count: 1 }, { key: 'aaGun', power: 'ussr', count: 1 }] },
    { amphibious: false, seaCombat: false },
  );
  roll(b, 1); // two hits
  roll(b, 6);
  const d = casualtyDecision(b);
  assert.equal(d.side, 'defender');
  const side = b.defender;
  const start = casualtyCards(d, side, [], false);
  assert.equal(start.plan.totalHits, 2);
  assert.equal(start.plan.complete, false);
  assert.deepEqual(start.cards.map((c) => [c.key, c.uids.length, c.nextUid !== null]), [
    ['infantry', 3, true], ['tank', 1, true], ['aaGun', 1, false],
  ], 'identical units share one card');
  assert.equal(start.cards[2].reason, 'Never taken as a casualty');
  assert.equal(confirmLabel(start.plan), 'Choose 2 more');

  const tankCard = start.cards[1];
  const picks = [tankCard.nextUid!];
  const mid = casualtyCards(d, side, picks, false);
  assert.equal(mid.cards[1].picked, 1);
  assert.equal(mid.cards[1].nextUid, null);
  assert.equal(mid.cards[1].reason, 'Already chosen');
  picks.push(mid.cards[0].nextUid!);
  const done = casualtyCards(d, side, picks, false);
  assert.equal(done.plan.complete, true);
  assert.equal(confirmLabel(done.plan), 'Confirm 2 casualties');
  assert.equal(done.cards[0].reason, 'Every hit is assigned');
  assert.deepEqual(undoCard(done.cards[0], picks), [picks[0]]);
  assert.deepEqual(undoPick(picks, picks[0]), [], 'undoing an early pick drops the later ones');

  applyCasualtyPicks(b, done.plan.payload);
  assert.equal(b.defender.find((u) => u.key === 'tank')!.hp, 0, 'the engine removed the tank the player chose');
  assert.equal(b.defender.filter((u) => u.key === 'infantry' && u.hp > 0).length, 2);
  assert.deepEqual(forceRows(b.defender).map((r) => [r.key, r.alive, r.lost]), [['infantry', 2, 1], ['tank', 0, 1], ['aaGun', 1, 0]]);
}

// ---------- sea: source rules, transports last, battleship soaks ----------
{
  const b = createBattle(
    { units: [{ key: 'submarine', power: 'germany', count: 1 }, { key: 'fighter', power: 'germany', count: 2 }, { key: 'cruiser', power: 'germany', count: 1 }] },
    {
      units: [
        { key: 'battleship', power: 'uk', count: 2 }, { key: 'submarine', power: 'uk', count: 1 },
        { key: 'fighter', power: 'uk', count: 1 }, { key: 'transport', power: 'uk', count: 1 },
      ],
    },
    { amphibious: false, seaCombat: true },
  );
  // No destroyers anywhere, so both sides are offered a submerge first. Both stay.
  stay(b);
  assert.equal(currentStep(b), 'sub_strike');
  roll(b, [1, 6]); // attacking sub hits, defending sub misses
  const d = casualtyDecision(b);
  assert.equal(d.buckets[0].source, 'sub');
  const side = b.defender;
  const first = casualtyCards(d, side, [], true);
  const by = (key: string) => first.cards.filter((c) => c.key === key);
  assert.equal(by('fighter')[0].reason, 'Submarine hits only sink ships');
  assert.equal(by('transport')[0].reason, 'Transports are taken last');
  assert.equal(by('battleship')[0].nextUid !== null, true);
  assert.equal(by('battleship')[0].note, 'Takes two hits. The first only damages it.');
  assert.equal(whyNot(side.find((u) => u.key === 'fighter')!, d, first.plan, true, side), 'Submarine hits only sink ships');

  // tapping the battleship card twice damages both hulls before sinking either
  const one = by('battleship')[0].nextUid!;
  const sim = planCasualties({ ...d, picks: 2, buckets: [{ ...d.buckets[0], hits: 2 }] }, side, [one]);
  const cards2 = casualtyCards({ ...d, picks: 2, buckets: [{ ...d.buckets[0], hits: 2 }] }, side, [one], true);
  const two = cards2.cards.find((c) => c.key === 'battleship')!.nextUid!;
  assert.notEqual(two, one, 'the fresh battleship takes the second hit');
  assert.equal(sim.hpLeft.get(one), 1);

  // a stale pick from an older decision is trimmed, never sent
  assert.deepEqual(legalPrefix(d, side, [9999]), []);
  assert.deepEqual(legalPrefix(d, side, [one, 9999]), [one]);
}

// ---------- air hits cannot reach submarines without a destroyer ----------
{
  const b = createBattle(
    { units: [{ key: 'fighter', power: 'japan', count: 2 }, { key: 'cruiser', power: 'japan', count: 1 }] },
    { units: [{ key: 'submarine', power: 'usa', count: 1 }, { key: 'destroyer', power: 'usa', count: 1 }, { key: 'cruiser', power: 'usa', count: 1 }] },
    { amphibious: false, seaCombat: true },
  );
  stay(b);
  if (currentStep(b) === 'sub_strike') roll(b, 6); // the defending submarine misses
  roll(b, [1, 6, 6]); // one fighter hits
  roll(b, 6);
  const d = casualtyDecision(b);
  assert.equal(d.buckets[0].source, 'air');
  const { cards } = casualtyCards(d, b.defender, [], true);
  assert.equal(cards.find((c) => c.key === 'submarine')!.reason, 'Aircraft cannot hit submarines without a destroyer');
  assert.equal(cards.find((c) => c.key === 'destroyer')!.reason, null);
}

// ---------- retreat ----------
{
  const policy = (over: Partial<AxisRetreatPolicy> = {}): AxisRetreatPolicy => ({
    mode: 'full', destinations: ['poland', 'bulgaria-romania'], destinationRequired: true, canRetreat: true,
    movingUnitUids: [1, 2], aircraftUnitUids: [], airDisengages: false, committedBeachUnitUids: [], submergedUnitUids: [], ...over,
  });
  const combat = (p: AxisRetreatPolicy | null, decision: RetreatCombat['battle']['decision'] = { type: 'retreat' }): RetreatCombat =>
    ({ id: 4, visualSeq: 7, space: 'ukraine', retreatPolicy: p, battle: { decision } });

  const two = combat(policy());
  assert.equal(initialRetreatSelection(two.retreatPolicy), undefined, 'two routes need a choice');
  assert.equal(buildRetreatAction(two, undefined), null);
  assert.equal(retreatLabel(two, undefined), 'Choose a route');
  assert.deepEqual(buildRetreatAction(two, 'poland'), { type: 'battleRetreat', retreat: true, destination: 'poland', combatId: 4, visualSeq: 7 });
  assert.equal(retreatLabel(two, 'poland'), 'Retreat to Poland');
  assert.equal(normalizeRetreatSelection(two.retreatPolicy, 'france'), undefined, 'an illegal route is dropped');
  assert.deepEqual(buildRemainAction(two), { type: 'battleRetreat', retreat: false, combatId: 4, visualSeq: 7 });

  const one = combat(policy({ destinations: ['poland'] }));
  assert.equal(initialRetreatSelection(one.retreatPolicy), 'poland', 'a single route is preselected');
  assert.equal(retreatCopy(one).routePrompt, 'One route is open.');

  const air = combat(policy({ destinations: [], destinationRequired: false, movingUnitUids: [], aircraftUnitUids: [5], airDisengages: true }));
  assert.equal(initialRetreatSelection(air.retreatPolicy), null);
  assert.deepEqual(buildRetreatAction(air, undefined), { type: 'battleRetreat', retreat: true, destination: null, combatId: 4, visualSeq: 7 });
  assert.equal(retreatCopy(air).leave, 'Break off aircraft');

  const stuck = combat(policy({ destinations: [], canRetreat: false }));
  assert.equal(buildRetreatAction(stuck, 'poland'), null);
  assert.match(retreatCopy(stuck).blocked ?? '', /has to stay/);
  assert.equal(retreatLabel(stuck, undefined), 'Retreat not possible');

  assert.equal(buildRemainAction(combat(policy(), { type: 'casualties' })), null, 'no retreat action outside a retreat decision');
  assert.notEqual(retreatKey(two), retreatKey({ ...two, visualSeq: 8 }));
  assert.equal(retreatCopy(combat(policy({ mode: 'partial-amphibious' }))).stay, 'Keep fighting');
  assert.equal(retreatCopy(combat(policy(), { type: 'retreat', terminalStandoff: true })).title, 'Transport standoff');
}

// ---------- who decides ----------
{
  const battle = { decision: { type: 'casualties', side: 'defender', picks: 1, buckets: [] }, defender: [{ uid: 9, hp: 1, power: 'china' }] };
  const view = {
    active: 'japan' as const,
    combat: { attacker: 'japan', battle } as never,
    pendings: [{ id: 1, power: 'china' as const, kind: 'battle-casualties' as const, data: {} }],
  };
  assert.equal(rollAuthority(view), 'japan');
  assert.equal(decisionAuthority(view), 'usa', 'the United States answers for China');
  assert.equal(decisionAuthority({ ...view, pendings: [] }), 'usa', 'falls back to the defending unit owner');
  assert.equal(continueAuthority({ ...view, pendings: [{ id: 2, power: 'china', kind: 'battle-continue', data: { side: 'defender' } }] }, 'defender'), 'usa');
  assert.equal(continueAuthority(view, 'attacker'), 'japan');
  assert.equal(controls(['usa', 'uk'], 'usa'), true);
  assert.equal(controls(['uk'], 'usa'), false);
  assert.equal(controls(['uk'], null), false);
  assert.equal(controllerOf('china'), 'usa');
  assert.equal(controllerOf('nobody'), null);
}

// ---------- copy ----------
assert.equal(outcomeLine('attacker_captured', 'germany', 'ukraine'), 'Germany takes Ukraine S.S.R.'.replace('Ukraine S.S.R.', spaceName('ukraine')));
assert.equal(outcomeLine('retreated', 'germany', 'ukraine', null), 'Germany aircraft break off');
assert.match(spaceName('sz-12'), /^Sea zone 12$/);

console.log('battle logic: ok');
