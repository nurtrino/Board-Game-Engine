import assert from 'node:assert/strict';
import {
  applyCasualtyPicks, createBattle, currentStep, resolveRoll, stepDice, type BattleState,
} from '../../../../shared/src/axis/battle.js';
import { Director, type StagePort } from './director';
import type { Combat } from './model';

function combatOf(battle: BattleState, id = 1, visualSeq = 0): Combat {
  return {
    id, visualSeq, kind: 'battle', space: 'ukraine', attacker: 'germany', from: [], retreatRulesVersion: 1,
    amphibious: false, battle: JSON.parse(JSON.stringify(battle)), attackerCommitted: [], retreatPolicy: null, dice: null,
  } as unknown as Combat;
}
const roll = (b: BattleState, value: number) => resolveRoll(b, stepDice(b, currentStep(b)!).map(() => value));
const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

class FakeStage implements StagePort {
  calls: string[] = [];
  buildDelay = 5;
  beatDelay = 2;
  /** Beats of this kind never finish on their own, like a tab that stopped drawing. */
  hang: string | null = null;
  private waiters: (() => void)[] = [];
  private beat(name: string): Promise<void> {
    this.calls.push(name);
    if (this.hang === name) return new Promise((r) => { this.waiters.push(r); });
    return tick(this.beatDelay);
  }
  async build(c: Combat) { this.calls.push(`build:${c.id}`); await tick(this.buildDelay); return true; }
  sync(c: Combat) { this.calls.push(`sync:${c.visualSeq}`); }
  setPending() { /* not recorded */ }
  skip() { this.calls.push('skip'); const w = this.waiters; this.waiters = []; for (const r of w) r(); }
  playOpen() { return this.beat('open'); }
  playVolley() { return this.beat('volley'); }
  playCasualties() { return this.beat('casualties'); }
  playSubmerge() { return this.beat('submerge'); }
  playRetreat() { return this.beat('retreat'); }
  playDrop() { return this.beat('drop'); }
  playResult() { return this.beat('result'); }
}

const battle = () => createBattle(
  { units: [{ key: 'tank', power: 'germany', count: 3 }] },
  { units: [{ key: 'infantry', power: 'ussr', count: 2 }, { key: 'artillery', power: 'ussr', count: 1 }] },
  { amphibious: false, seaCombat: false },
);
const beats = (s: FakeStage) => s.calls.filter((c) => !c.startsWith('sync') && c !== 'skip' && !c.startsWith('build'));

async function main() {
  // ---------- in order, one at a time, then snapped to the truth ----------
  {
    const stage = new FakeStage();
    const phases: string[] = [];
    const d = new Director(stage, { onPhase: (p) => phases.push(p) });
    const b = battle();
    d.ingest(combatOf(b, 1, 0));
    await tick(30);
    assert.deepEqual(phases, ['loading', 'ready']);
    assert.deepEqual(beats(stage), ['open']);

    roll(b, 1); // three hits on a mixed defence
    d.ingest(combatOf(b, 1, 1));
    roll(b, 6); // return fire misses; the defender must choose
    d.ingest(combatOf(b, 1, 2));
    applyCasualtyPicks(b, b.defender.map((u) => u.uid));
    d.ingest(combatOf(b, 1, 3));
    await tick(60);
    assert.deepEqual(beats(stage), ['open', 'volley', 'volley', 'casualties', 'result']);
    assert.equal(stage.calls[stage.calls.length - 1], 'sync:3', 'the stage ends on the engine state');
  }

  // ---------- snapshots that arrive while the battlefield loads are not replayed ----------
  {
    const stage = new FakeStage();
    stage.buildDelay = 25;
    const d = new Director(stage);
    const b = battle();
    d.ingest(combatOf(b, 1, 0));
    roll(b, 1);
    d.ingest(combatOf(b, 1, 1));
    roll(b, 6);
    d.ingest(combatOf(b, 1, 2));
    await tick(70);
    assert.deepEqual(beats(stage), ['open'], 'a late mount opens on the present');
    assert.ok(stage.calls.includes('sync:2'));
  }

  // ---------- a beat that never finishes cannot hold the queue ----------
  {
    const stage = new FakeStage();
    stage.hang = 'volley';
    const d = new Director(stage, { beatTimeoutMs: 20 });
    const b = battle();
    d.ingest(combatOf(b, 1, 0));
    await tick(25);
    roll(b, 1);
    d.ingest(combatOf(b, 1, 1));
    roll(b, 6);
    d.ingest(combatOf(b, 1, 2));
    await tick(120);
    assert.deepEqual(beats(stage), ['open', 'volley', 'volley', 'casualties', 'result'], 'every later beat still plays');
    assert.ok(stage.calls.includes('skip'), 'the stage is told to finish the stuck beat');
    assert.equal(stage.calls[stage.calls.length - 1], 'sync:2');
  }

  // ---------- catching up drops the backlog and shows the present ----------
  {
    const stage = new FakeStage();
    stage.hang = 'volley';
    const d = new Director(stage, { beatTimeoutMs: 5000 });
    const b = battle();
    d.ingest(combatOf(b, 1, 0));
    await tick(25);
    roll(b, 1);
    d.ingest(combatOf(b, 1, 1));
    roll(b, 6);
    d.ingest(combatOf(b, 1, 2));
    await tick(10);
    d.catchUp();
    await tick(20);
    assert.deepEqual(beats(stage), ['open', 'volley'], 'the queued second volley is dropped');
    assert.equal(stage.calls[stage.calls.length - 1], 'sync:2');
  }

  // ---------- an out of order snapshot snaps, a new battle rebuilds ----------
  {
    const stage = new FakeStage();
    const d = new Director(stage);
    const b = battle();
    const c0 = combatOf(b, 1, 0);
    d.ingest(c0);
    await tick(30);
    roll(b, 1);
    const c1 = combatOf(b, 1, 1);
    d.ingest(c1);
    await tick(20);
    stage.calls = [];
    d.ingest(c0); // stale
    await tick(10);
    assert.deepEqual(beats(stage), []);
    assert.ok(stage.calls.includes('skip') && stage.calls.includes('sync:0'));
    stage.calls = [];
    d.ingest(combatOf(battle(), 2, 0));
    await tick(30);
    assert.ok(stage.calls.includes('build:2'));
    assert.deepEqual(beats(stage), ['open']);
    d.dispose();
    stage.calls = [];
    d.ingest(combatOf(battle(), 3, 0));
    await tick(15);
    assert.deepEqual(stage.calls, [], 'a disposed director does nothing');
  }

  console.log('battle director: ok');
}

void main();
