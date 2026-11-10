// The Director turns the server's event stream into cutscenes on the Stage.
// Each batch of events arrives with the public state that follows it. The Director plays the batch,
// snaps the table to that state, then acknowledges so devices can move on.
import * as THREE from 'three';
import { POWER_LABEL, ROLE_COUNTS, claimText, type Policy, type ShPublicView, type ShEvent, type StampedEvent } from '@bge/shared';
import { Stage, shot, type Card, type Shot } from './Stage';
import { ease } from './tween';
import { sfx } from './audio';

const V3 = THREE.Vector3;
export type Tone = 'lib' | 'fas' | 'neutral';
export interface Caption {
  kicker?: string;
  title: string;
  sub?: string;
  tone?: Tone;
  size?: 'xl' | 'lg' | 'md';
}
export interface DirectorUi {
  caption(c: Caption | null): void;
  stamp(s: { text: string; tone: Tone; sub?: string } | null): void;
  tally(t: { ja: number; nein: number } | null): void;
  cinema(on: boolean): void;
  flash(color: string): void;
  toast(text: string): void;
  talk(seat: number, text: string): void;
  presented(view: ShPublicView): void;
}
interface Batch {
  events: StampedEvent[];
  view: ShPublicView;
  seq: number;
}
const LIGHT = new Set<ShEvent['t']>(['vote_cast', 'say', 'claim']);
const LIB = 0x4fb6d0;
const FAS = 0xe5573f;
const REVEAL = new V3(0, 9.5, 1);

export class Director {
  private queue: Batch[] = [];
  private running = false;
  private names: string[] = [];
  private view: ShPublicView | null = null;
  private orbitT = 0;

  constructor(private st: Stage, private ui: DirectorUi, private ack: (seq: number) => void) {}

  // Rebuild the table from a state with no cutscene (first load, reconnect).
  snap(view: ShPublicView, seq: number) {
    this.queue = [];
    this.view = view;
    this.names = view.names;
    this.st.tw.flush();
    this.st.syncTo(view);
    this.ui.presented(view);
    this.ui.cinema(false);
    this.ui.caption(null);
    this.st.rig.cut(this.idleShot(view));
    this.applyIdle(view, 0);
    sfx.ambience(view.fascist / 6);
    this.ack(seq);
  }
  push(batch: Batch) {
    this.queue.push(batch);
    if (!this.running) void this.drain();
  }
  // Finish the current cutscene at once.
  skip() {
    if (this.running) {
      this.st.tw.fast = true;
      this.st.tw.flush();
    }
  }

  private async drain() {
    this.running = true;
    while (this.queue.length) {
      const batch = this.queue.shift()!;
      const st = this.st;
      this.names = batch.view.names;
      const heavy = batch.events.some((s) => !LIGHT.has(s.e.t));
      // If the table is far behind (bots playing fast), catch up without the show.
      st.tw.fast = this.queue.length >= 3;
      try {
        if (heavy) {
          this.ui.cinema(true);
          st.rig.auto = null;
        }
        for (const { e } of batch.events) await this.play(e, batch.view);
      } catch (err) {
        console.error('cutscene failed', err);
      }
      st.tw.flush();
      st.tw.fast = false;
      this.view = batch.view;
      st.labelsVisible = true;
      st.syncTo(batch.view);
      void st.spotOn(null);
      void st.dim(1, 0.6);
      this.ui.caption(null);
      this.ui.stamp(null);
      this.ui.tally(null);
      this.ui.presented(batch.view);
      sfx.ambience(batch.view.phase === 'over' ? (batch.view.winner === 'fascist' ? 1 : 0) : batch.view.fascist / 6);
      if (heavy) {
        this.ui.cinema(false);
        this.applyIdle(batch.view, 1.5);
      }
      this.ack(batch.seq);
    }
    this.running = false;
  }

  // ---------- idle camera per phase ----------
  private idleShot(v: ShPublicView): Shot {
    switch (v.phase) {
      case 'president_discard':
        return this.st.seatShot(v.president, 'hero');
      case 'chancellor_enact':
        return this.st.seatShot(v.chancellor ?? v.president, 'hero');
      case 'veto_response':
        return this.st.pairShot(v.president, v.chancellor ?? v.president);
      default:
        return Stage.HOME;
    }
  }
  private applyIdle(v: ShPublicView, seconds: number) {
    const st = this.st;
    if (v.phase === 'vote' || v.phase === 'over') {
      // Slow orbit while the table votes, and after the game ends.
      const start = Math.atan2(st.rig.pos.x, st.rig.pos.z);
      const t0 = performance.now() / 1000;
      const high = v.phase === 'vote';
      st.rig.auto = () => st.orbitShot(start + (performance.now() / 1000 - t0) * 0.05, high ? 98 : 96, high ? 70 : 42, 0);
      return;
    }
    st.rig.auto = null;
    if (seconds > 0) void st.rig.to(this.idleShot(v), seconds, { arc: true });
  }

  // ---------- helpers ----------
  private n(i: number) {
    return this.names[i] ?? '';
  }
  private get fast() {
    return this.st.tw.fast;
  }
  private wait(s: number) {
    return this.st.tw.wait(s);
  }
  private async cap(c: Caption, hold: number) {
    if (this.fast) return;
    this.ui.caption(c);
    await this.wait(hold);
    this.ui.caption(null);
    await this.wait(0.25);
  }
  private snd(fn: () => void) {
    if (!this.fast) fn();
  }
  // Stands a card up facing the home camera at the reveal point.
  private present(c: Card, at = REVEAL, dur = 0.9) {
    const m = c.mesh;
    const x0 = m.rotation.x;
    void this.st.tw.run(dur, (k) => { m.rotation.x = x0 + (1.1 - x0) * k; });
    return this.st.fly(m, at, { dur, lift: 3, rotY: 0 });
  }
  private layFlat(c: Card, dur: number) {
    const m = c.mesh;
    const x0 = m.rotation.x;
    return this.st.tw.run(dur, (k) => { m.rotation.x = x0 * (1 - k); });
  }

  private async play(e: ShEvent, view: ShPublicView): Promise<void> {
    const st = this.st;
    switch (e.t) {
      case 'game_start': return this.intro(view);
      case 'roles_dealt': return;
      case 'candidate': return this.candidate(e.president, e.special, e.round, view);
      case 'nominated': return this.nominated(e.president, e.chancellor);
      case 'vote_cast': {
        const s = st.seats[e.seat];
        st.setBallot(e.seat, 'down');
        st.setChip(e.seat, { text: 'VOTED', tone: 'ok' });
        const to = st.ballotPos(e.seat);
        s.ballot.mesh.position.copy(st.seatPos(e.seat, 1.5, 0, 0.4));
        this.snd(() => sfx.card());
        void st.fly(s.ballot.mesh, to, { dur: 0.45, lift: 0.6, ease: ease.out });
        return;
      }
      case 'vote_result': return this.voteResult(e, view);
      case 'government': return this.government(e.president, e.chancellor);
      case 'not_hitler': return this.notHitler(e.chancellor);
      case 'tracker': return this.tracker(e.value);
      case 'chaos': {
        await st.rig.to(Stage.BOARDS, 1.2, { arc: true });
        this.snd(() => sfx.sting('fascist'));
        st.prevPres.visible = false;
        st.prevChan.visible = false;
        await this.cap({ kicker: 'THREE GOVERNMENTS REJECTED', title: 'TOP POLICY ENACTED', sub: 'TERM LIMITS RESET', tone: 'fas', size: 'lg' }, 2.6);
        return;
      }
      case 'draw3': return this.draw3(e.president);
      case 'president_discard': return this.presidentDiscard(e.president, e.chancellor);
      case 'veto_proposed': {
        void st.rig.to(st.pairShot(e.president, e.chancellor), 1.2, { arc: true });
        this.snd(() => sfx.sting('neutral'));
        await this.cap({ kicker: 'VETO', title: `${this.n(e.chancellor)} ASKS TO VETO`, sub: `PRESIDENT ${this.n(e.president)} MUST CONSENT`, size: 'lg' }, 2.4);
        return;
      }
      case 'veto_refused': {
        this.snd(() => sfx.slam());
        await this.cap({ kicker: 'VETO REFUSED', title: `${this.n(e.president)} SAYS NO`, sub: `${this.n(e.chancellor)} MUST ENACT A POLICY`, tone: 'fas', size: 'lg' }, 2.2);
        return;
      }
      case 'veto_passed': {
        void st.rig.to(Stage.BOARDS, 1.2, { arc: true });
        for (const c of st.hand.splice(0)) {
          st.discard.push(c);
          this.snd(() => sfx.whoosh(0.4));
          void st.fly(c.mesh, st.discardPos(st.discard.length - 1), { dur: 0.9, lift: 7, rotY: 0 });
          await this.wait(0.18);
        }
        await this.cap({ kicker: 'VETO', title: 'AGENDA VETOED', sub: 'BOTH POLICIES ARE DISCARDED', size: 'lg' }, 2.2);
        return;
      }
      case 'enacted': return this.enacted(e.policy, e.by, e.slot, e.liberal, e.fascist, view);
      case 'veto_unlocked': {
        void st.rig.to(st.slotShot('F', 4), 1.2);
        this.snd(() => sfx.sting('neutral'));
        await this.cap({ kicker: 'FIVE FASCIST POLICIES', title: 'VETO POWER UNLOCKED', sub: 'THE CHANCELLOR MAY ASK TO VETO AN AGENDA', tone: 'fas', size: 'lg' }, 2.6);
        return;
      }
      case 'reshuffle': {
        void st.rig.to(Stage.BOARDS, 1.1, { arc: true });
        this.ui.caption({ kicker: 'DRAW PILE', title: 'DISCARDS RESHUFFLED', sub: `${e.deck} POLICIES IN THE NEW PILE`, size: 'md' });
        const moving = st.discard.splice(0).reverse();
        for (const c of moving) {
          st.deck.push(c);
          this.snd(() => sfx.card());
          void st.fly(c.mesh, st.deckPos(st.deck.length - 1), { dur: 0.6, lift: 6, spin: 1 });
          await this.wait(0.07);
        }
        await this.wait(1.4);
        this.ui.caption(null);
        return;
      }
      case 'power': {
        void st.rig.to(st.slotShot('F', Math.max(0, view.fascist - 1)), 1.2);
        this.snd(() => sfx.sting('neutral'));
        const must = { investigate: 'INVESTIGATE ONE PLAYER', special_election: 'CHOOSE THE NEXT CANDIDATE', peek: 'EXAMINE THE TOP THREE POLICIES', execute: 'EXECUTE ONE PLAYER' }[e.power];
        await this.cap({ kicker: 'PRESIDENTIAL POWER', title: POWER_LABEL[e.power], sub: `${this.n(e.president)} MUST ${must}`, tone: 'fas', size: 'lg' }, 2.6);
        return;
      }
      case 'peeked': return this.peeked(e.president);
      case 'investigated': return this.investigated(e.president, e.target);
      case 'special_election': {
        void st.rig.to(st.pairShot(e.president, e.target), 1.2, { arc: true });
        await this.cap({ kicker: 'SPECIAL ELECTION', title: `${this.n(e.president)} CHOOSES ${this.n(e.target)}`, sub: 'THE ORDER RETURNS AFTERWARDS', size: 'lg' }, 2.2);
        return;
      }
      case 'executed': return this.executed(e.president, e.target, e.wasHitler);
      case 'claim': {
        this.ui.toast(`${this.n(e.seat)} ${claimText(e.kind, e.value, this.names, e.target).toUpperCase()}`);
        this.snd(() => sfx.tick());
        return;
      }
      case 'say': {
        st.say(e.seat, e.text);
        this.ui.talk(e.seat, e.text);
        if (!this.fast && view.ai[e.seat]) sfx.speak(e.text, e.seat);
        return;
      }
      case 'game_over': return this.gameOver(e, view);
    }
  }

  // ---------- cutscenes ----------
  private async intro(view: ShPublicView) {
    const st = this.st;
    const pre: ShPublicView = { ...view, phase: 'roles', round: 0, chancellor: null, lastGov: null, liberal: 0, fascist: 0, tracker: 0, deck: 17 - view.discard, voted: view.voted.map(() => false), alive: view.alive.map(() => true), notHitler: view.notHitler.map(() => false), governments: [], winner: null, roles: null, roleArt: null };
    st.syncTo(pre);
    this.ui.presented(pre);
    st.labelsVisible = false;
    const boxAt = new V3(0, 15, 0);
    st.ballotBox.position.copy(boxAt);
    st.ballotBox.rotation.y = 0.3;
    for (const s of st.seats) {
      s.envelope.position.copy(boxAt);
      s.envelope.visible = false;
    }
    if (this.fast) return;
    sfx.ambience(0.15);
    st.rig.cut(shot(0, 9, 124, 0, 26, 0, 50));
    void st.dim(0.3, 0.1);
    sfx.riser(3.2);
    void st.rig.to(st.orbitShot(0.55, 104, 30, 6), 6.5, { ease: ease.inOut });
    await this.wait(1.4);
    const c = ROLE_COUNTS[view.n];
    this.ui.caption({ title: 'SECRET HITLER', sub: `${view.n} PLAYERS · ${c.liberal} LIBERALS · ${c.fascist} ${c.fascist === 1 ? 'FASCIST' : 'FASCISTS'} · HITLER`, size: 'xl', tone: 'fas' });
    await this.wait(1.7);
    sfx.sting('fascist');
    void st.dim(1, 2.5);
    await this.wait(3.4);
    this.ui.caption(null);
    await this.wait(0.4);

    // The ballot box hangs over the table and deals the envelopes.
    void st.spotOn(boxAt, 2.6, 0.2);
    void st.rig.to(st.orbitShot(1.3, 78, 44, 4), 5.5, { ease: ease.inOut });
    this.ui.caption({ kicker: 'SECRET ROLES', title: 'OPEN YOUR ENVELOPE', sub: `ON YOUR DEVICE · ${view.n <= 6 ? 'HITLER KNOWS THE FASCIST' : 'HITLER DOES NOT KNOW THE FASCISTS'}`, size: 'lg' });
    st.labelsVisible = true;
    for (let i = 0; i < st.seats.length; i++) {
      const s = st.seats[i];
      s.envelope.visible = true;
      sfx.whoosh(0.45, 0.12);
      void st.fly(s.envelope, st.envelopePos(i), { dur: 0.95, lift: 5, rotY: s.rotY, spin: 1, ease: ease.out }).then(() => this.snd(() => sfx.card()));
      await this.wait(0.24);
    }
    await this.wait(1.2);
    void st.spotOn(null);
    void st.fly(st.ballotBox, new V3(-51.5, 3, -29.5), { dur: 1.6, lift: 4, rotY: 0.4 });
    void st.rig.to(Stage.HOME, 2.6, { arc: true });
    await this.wait(2.6);
    this.ui.caption(null);
  }

  private async candidate(president: number, special: boolean, round: number, view: ShPublicView) {
    const st = this.st;
    st.setTags(president, ['CANDIDATE']);
    for (let i = 0; i < st.seats.length; i++) {
      if (i !== president) st.setTags(i, []);
      if (view.alive[i]) st.setChip(i, null);
      st.setBallot(i, 'hidden');
    }
    void st.rig.to(st.seatShot(president, 'hero'), 1.5, { arc: true });
    void st.dim(0.55, 0.8);
    void st.spotOn(st.seatLook(president, 3), 2.6, 0.2);
    this.snd(() => sfx.whoosh(0.7));
    void st.fly(st.chanPlacard, st.placardPos(president, 'chancellor', true), { dur: 1.25, rotY: st.placardRot(president), ease: ease.inOut });
    await st.fly(st.presPlacard, st.placardPos(president, 'president', true), { dur: 1.1, rotY: st.placardRot(president), ease: ease.slam });
    this.snd(() => sfx.slam());
    st.rig.shake = this.fast ? 0 : 0.35;
    await this.cap({ kicker: special ? `ROUND ${round} · SPECIAL ELECTION` : `ROUND ${round}`, title: this.n(president), sub: 'PRESIDENTIAL CANDIDATE', size: 'lg' }, 2.3);
  }

  private async nominated(president: number, chancellor: number) {
    const st = this.st;
    void st.rig.to(st.pairShot(president, chancellor), 1.3, { arc: true });
    await this.wait(0.5);
    this.snd(() => sfx.whoosh(0.9));
    st.rig.follow = () => st.chanPlacard.position;
    await st.fly(st.chanPlacard, st.placardPos(chancellor, 'chancellor', false), { dur: 1.3, lift: 9, rotY: st.placardRot(chancellor), ease: ease.slam });
    st.rig.follow = null;
    this.snd(() => sfx.slam());
    st.rig.shake = this.fast ? 0 : 0.3;
    st.setTags(chancellor, ['NOMINEE']);
    await this.cap({ kicker: 'NOMINATION', title: `${this.n(president)} PICKS ${this.n(chancellor)}`, sub: 'VOTE JA OR NEIN ON YOUR DEVICE', size: 'lg' }, 2.4);
  }

  private async voteResult(e: Extract<ShEvent, { t: 'vote_result' }>, view: ShPublicView) {
    const st = this.st;
    const n = st.seats.length;
    for (let i = 0; i < n; i++) if (e.votes[i] !== null) st.setBallot(i, 'down');
    void st.rig.to(shot(0, 106, 46, 0, 0, -2.5, 43), 1.4, { arc: true });
    void st.dim(0.6, 0.8);
    this.ui.caption({ kicker: 'VOTE', title: `${this.n(e.president)} + ${this.n(e.chancellor)}`, size: 'md' });
    this.snd(() => sfx.drumroll(1.3));
    await this.wait(1.4);
    this.ui.caption(null);
    let ja = 0;
    let nein = 0;
    this.ui.tally({ ja, nein });
    // Ballots turn over clockwise around the table, starting with the candidate.
    const order = view.slots.map((slot, seat) => ({ slot, seat })).sort((a, b) => a.slot - b.slot).map((x) => x.seat);
    const from = Math.max(0, order.indexOf(e.president));
    for (let k = 0; k < n; k++) {
      const i = order[(from + k) % n];
      const v = e.votes[i];
      if (v === null) continue;
      st.setBallot(i, v ? 'ja' : 'nein');
      st.seats[i].ballot.faceUp = false;
      await st.flip(st.seats[i].ballot, true, 0.34, 1.8);
      if (v) ja++;
      else nein++;
      this.snd(() => (v ? sfx.ja() : sfx.nein()));
      st.setChip(i, { text: v ? 'JA' : 'NEIN', tone: v ? 'ja' : 'nein' });
      this.ui.tally({ ja, nein });
      await this.wait(0.26);
    }
    await this.wait(0.6);
    this.ui.tally(null);
    this.ui.stamp({ text: e.passed ? 'ELECTED' : 'REJECTED', tone: e.passed ? 'lib' : 'fas', sub: `${ja} JA · ${nein} NEIN` });
    this.snd(() => sfx.slam());
    st.rig.shake = this.fast ? 0 : 0.9;
    await this.wait(2.1);
    this.ui.stamp(null);
    this.ui.tally(null);
    void st.dim(1, 0.6);
    for (let i = 0; i < n; i++) {
      st.setBallot(i, 'hidden');
      if (e.votes[i] !== null) st.setChip(i, null);
    }
    await this.wait(0.3);
  }

  private async government(president: number, chancellor: number) {
    const st = this.st;
    st.setTags(president, ['PRESIDENT']);
    st.setTags(chancellor, ['CHANCELLOR']);
    void st.rig.to(st.pairShot(president, chancellor), 1.2, { arc: true });
    this.snd(() => sfx.sting('neutral'));
    // The mod's "previously elected" markers go to the new government.
    st.prevPres.visible = true;
    st.prevChan.visible = true;
    void st.fly(st.prevPres, st.seatPos(president, 4.5, 9, 0.12), { dur: 1, rotY: st.seats[president].rotY });
    void st.fly(st.prevChan, st.seatPos(chancellor, 4.5, 9, 0.12), { dur: 1.1, rotY: st.seats[chancellor].rotY });
    await this.cap({ kicker: 'GOVERNMENT ELECTED', title: `PRESIDENT ${this.n(president)}`, sub: `CHANCELLOR ${this.n(chancellor)}`, size: 'lg' }, 2.2);
  }

  private async notHitler(chancellor: number) {
    const st = this.st;
    const card = st.seats[chancellor].notHitler;
    void st.rig.to(st.seatShot(chancellor, 'hero'), 1.2, { arc: true });
    const rest = card.mesh.position.clone();
    card.mesh.position.set(18, 14, -6);
    card.mesh.visible = true;
    this.snd(() => sfx.whoosh(0.6));
    await st.fly(card.mesh, rest, { dur: 1, lift: 4, spin: 1, ease: ease.slam });
    this.snd(() => sfx.thump(0.4));
    await this.cap({ kicker: 'THREE FASCIST POLICIES ARE DOWN', title: `${this.n(chancellor)} IS NOT HITLER`, sub: 'CONFIRMED BY TAKING OFFICE', tone: 'lib', size: 'lg' }, 2.4);
  }

  private async tracker(value: number) {
    const st = this.st;
    const to = st.trackerPos(value);
    if (value === 0) {
      await st.fly(st.tracker, to, { dur: 0.6, lift: 1.5 });
      return;
    }
    void st.rig.to(shot(to.x * 0.6, 10, to.z + 15, to.x, 0.5, to.z - 1, 30), 1.1);
    await this.wait(0.7);
    await st.fly(st.tracker, to, { dur: 0.55, lift: 2.6, ease: ease.slam });
    this.snd(() => sfx.thump(0.6));
    st.rig.shake = this.fast ? 0 : 0.25;
    await this.cap({ kicker: 'ELECTION TRACKER', title: `${value} OF 3`, sub: value === 2 ? 'ONE MORE FAILURE ENACTS THE TOP POLICY' : value === 3 ? 'THREE FAILED ELECTIONS' : undefined, tone: value >= 2 ? 'fas' : 'neutral', size: 'lg' }, 1.9);
  }

  private async draw3(president: number) {
    const st = this.st;
    void st.rig.to(shot(-33, 13, 24, -18, 2.5, 6, 32), 1.3, { arc: true });
    await this.wait(0.8);
    this.ui.caption({ kicker: 'LEGISLATIVE SESSION', title: `${this.n(president)} DRAWS THREE`, sub: 'SILENCE UNTIL A POLICY IS ENACTED', size: 'md' });
    const drawn: Card[] = [];
    for (let i = 0; i < 3 && st.deck.length; i++) {
      const c = st.deck.pop()!;
      drawn.push(c);
      this.snd(() => sfx.card());
      void st.fly(c.mesh, new V3(-18 + (i - 1) * 3.6, 4.5, 6 + 1.5), { dur: 0.5, lift: 1 });
      await this.wait(0.22);
    }
    await this.wait(0.9);
    void st.rig.to(st.seatShot(president, 'hero'), 1.6, { arc: true });
    drawn.forEach((c, i) => {
      st.hand.push(c);
      void st.fly(c.mesh, st.handPos(president, i, 3), { dur: 1.3 + i * 0.1, lift: 5, rotY: st.seats[president].rotY });
    });
    this.snd(() => sfx.whoosh(1));
    await this.wait(2.2);
    this.ui.caption(null);
  }

  private async presidentDiscard(president: number, chancellor: number) {
    const st = this.st;
    if (st.hand.length < 3) return;
    const [gone] = st.hand.splice(Math.floor(Math.random() * 3), 1);
    st.discard.push(gone);
    this.ui.caption({ kicker: `PRESIDENT ${this.n(president)}`, title: 'DISCARDS ONE', sub: `TWO POLICIES PASS TO ${this.n(chancellor)}`, size: 'md' });
    this.snd(() => sfx.whoosh(0.8));
    st.rig.follow = () => gone.mesh.position;
    await st.fly(gone.mesh, st.discardPos(st.discard.length - 1), { dur: 1.2, lift: 8, rotY: 0, ease: ease.inOut });
    st.rig.follow = null;
    this.snd(() => sfx.card());
    void st.rig.to(st.seatShot(chancellor, 'hero'), 1.6, { arc: true });
    st.hand.forEach((c, i) => void st.fly(c.mesh, st.handPos(chancellor, i, 2), { dur: 1.3 + i * 0.12, lift: 6, rotY: st.seats[chancellor].rotY }));
    this.snd(() => sfx.whoosh(1));
    await this.wait(2.1);
    this.ui.caption(null);
  }

  private async enacted(policy: Policy, by: 'government' | 'chaos', slot: number, liberal: number, fascist: number, view: ShPublicView) {
    const st = this.st;
    const tone: Tone = policy === 'L' ? 'lib' : 'fas';
    let card: Card | undefined;
    if (by === 'government') {
      // The Chancellor buries one and plays the other.
      if (st.hand.length > 1) {
        const gone = st.hand.splice(Math.floor(Math.random() * st.hand.length), 1)[0];
        st.discard.push(gone);
        this.snd(() => sfx.card());
        void st.fly(gone.mesh, st.discardPos(st.discard.length - 1), { dur: 1, lift: 7, rotY: 0 });
        await this.wait(0.5);
      }
      card = st.hand.pop();
    } else card = st.deck.pop();
    if (!card) return;
    const pool = policy === 'L' ? st.lib : st.fas;
    pool.push(card);
    st.setPolicyFace(card, policy);
    st.labelsVisible = false;
    st.showSeats(false);
    void st.dim(0.28, 1);
    void st.spotOn(REVEAL, 1.9, 0.14);
    void st.rig.to(shot(0, 15, 25, REVEAL.x, REVEAL.y - 0.6, REVEAL.z, 34), 1.5, { arc: true });
    this.snd(() => sfx.whoosh(0.9));
    await this.present(card, REVEAL, 1.2);
    this.ui.caption({ kicker: by === 'chaos' ? 'TOP OF THE DRAW PILE' : `CHANCELLOR ${this.n(view.governments.at(-1)?.chancellor ?? 0)} ENACTS`, title: 'A NEW POLICY', size: 'md' });
    this.snd(() => { sfx.drumroll(1.7); sfx.heartbeat(); });
    void st.rig.to(shot(0, 13, 20, REVEAL.x, REVEAL.y - 0.4, REVEAL.z, 30), 1.9, { ease: ease.in });
    await this.wait(1.8);
    this.ui.caption(null);
    // The turn.
    const flip = st.tw.run(0.5, (k) => { card!.mesh.rotation.z = Math.PI * (1 - k); }, ease.outBack);
    await this.wait(0.2);
    this.snd(() => sfx.sting(policy === 'L' ? 'liberal' : 'fascist'));
    st.pulse(policy === 'L' ? LIB : FAS, 10, 2);
    if (!this.fast) this.ui.flash(policy === 'L' ? '#4fb6d0' : '#e5573f');
    st.rig.shake = this.fast ? 0 : policy === 'F' ? 0.8 : 0.3;
    await flip;
    this.ui.caption({ title: policy === 'L' ? 'LIBERAL POLICY' : 'FASCIST POLICY', sub: policy === 'L' ? `LIBERAL ${liberal} OF 5` : `FASCIST ${fascist} OF 6`, tone, size: 'xl' });
    await this.wait(2.3);
    this.ui.caption(null);
    // Down onto the track.
    st.showSeats(true);
    void st.rig.to(st.slotShot(policy, slot), 1.3);
    void this.layFlat(card, 0.7);
    await st.fly(card.mesh, st.slotPos(policy, slot), { dur: 0.95, lift: 2, rotY: 0, ease: ease.slam });
    this.snd(() => sfx.slam());
    st.rig.shake = this.fast ? 0 : 0.5;
    st.setMood(fascist / 6, liberal / 5);
    this.snd(() => sfx.ambience(fascist / 6));
    void st.spotOn(null);
    void st.dim(1, 1);
    await this.wait(1.3);
    st.labelsVisible = true;
  }

  private async peeked(president: number) {
    const st = this.st;
    void st.rig.to(shot(-33, 12, 23, -18, 3, 6, 32), 1.2, { arc: true });
    await this.wait(0.7);
    const top = st.deck.slice(-3).reverse();
    this.ui.caption({ kicker: 'POLICY PEEK', title: `${this.n(president)} EXAMINES THE TOP THREE`, sub: 'SHOWN ON THEIR DEVICE ONLY', size: 'md' });
    const rest = top.map((c) => c.mesh.position.clone());
    top.forEach((c, i) => {
      this.snd(() => sfx.card());
      void st.fly(c.mesh, new V3(-18 + (i - 1) * 3.7, 5, 7.5), { dur: 0.6 + i * 0.12, lift: 1 });
    });
    await this.wait(2.8);
    top.forEach((c, i) => void st.fly(c.mesh, rest[i], { dur: 0.5 + (2 - i) * 0.1, lift: 0.5 }));
    await this.wait(0.9);
    this.ui.caption(null);
  }

  private async investigated(president: number, target: number) {
    const st = this.st;
    const card = st.seats[target].member;
    void st.rig.to(st.pairShot(president, target), 1.3, { arc: true });
    void st.spotOn(st.seatLook(target, 2), 2.4, 0.2);
    this.ui.caption({ kicker: 'INVESTIGATE LOYALTY', title: `${this.n(president)} INVESTIGATES ${this.n(target)}`, sub: 'PARTY MEMBERSHIP · SHOWN ON THEIR DEVICE ONLY', tone: 'fas', size: 'md' });
    await this.wait(0.9);
    card.mesh.visible = true;
    const home = card.mesh.position.clone();
    this.snd(() => sfx.whoosh(0.9));
    st.rig.follow = () => card.mesh.position;
    await st.fly(card.mesh, st.seatPos(president, 10, 0, 0.1), { dur: 1.5, lift: 8, rotY: st.seats[president].rotY });
    st.rig.follow = null;
    this.snd(() => sfx.card());
    await this.wait(1.6);
    await st.fly(card.mesh, home, { dur: 1.1, lift: 7, rotY: st.seats[target].rotY });
    card.mesh.visible = false;
    void st.spotOn(null);
    this.ui.caption(null);
  }

  private async executed(president: number, target: number, wasHitler: boolean) {
    const st = this.st;
    void st.rig.to(st.seatShot(president, 'hero'), 1.1, { arc: true });
    await this.cap({ kicker: 'EXECUTION', title: `${this.n(president)} DECIDES`, tone: 'fas', size: 'md' }, 1.3);
    void st.dim(0.2, 1.2);
    void st.spotOn(st.seatLook(target, 3), 3.4, 0.11, 0xffd9d0);
    void st.rig.to(st.seatShot(target, 'close'), 2.4, { arc: true, ease: ease.inOut });
    for (let i = 0; i < 3; i++) {
      this.snd(() => sfx.heartbeat());
      await this.wait(0.8);
    }
    this.ui.caption({ kicker: `PRESIDENT ${this.n(president)} EXECUTES`, title: this.n(target), tone: 'fas', size: 'xl' });
    await this.wait(1.3);
    this.snd(() => sfx.gunshot());
    if (!this.fast) this.ui.flash('#ffffff');
    st.rig.shake = this.fast ? 0 : 2.4;
    st.setChip(target, { text: 'EXECUTED', tone: 'dead' });
    st.setTags(target, []);
    await st.setDead(target, true, true);
    this.snd(() => sfx.thump(0.7));
    await this.wait(1.4);
    this.ui.caption(null);
    await this.wait(0.3);
    if (!wasHitler) await this.cap({ kicker: `${this.n(target)} IS DEAD`, title: 'NOT HITLER', size: 'lg' }, 2.2);
    void st.dim(1, 1);
    void st.spotOn(null);
  }

  // Stands one seat's role card up in front of them and turns it over.
  private async revealRole(i: number, view: ShPublicView, dur = 0.5) {
    const st = this.st;
    if (!view.roles || !view.roleArt) return;
    const s = st.seats[i];
    const c = s.role;
    st.setRoleFace(i, view.roles[i], view.roleArt[i]);
    c.mesh.visible = true;
    c.mesh.rotation.set(0, s.rotY + Math.PI, Math.PI);
    const x0 = 0;
    void st.tw.run(dur, (k) => { c.mesh.rotation.x = x0 + 1.1 * k; });
    await st.fly(c.mesh, st.rolePresentPos(i), { dur, lift: 1.5 });
    await st.tw.run(0.4, (k) => { c.mesh.rotation.z = Math.PI * (1 - k); }, ease.outBack);
    const role = view.roles[i];
    st.setChip(i, { text: role.toUpperCase(), tone: role === 'liberal' ? 'lib' : 'fas' });
  }

  private async gameOver(e: Extract<ShEvent, { t: 'game_over' }>, view: ShPublicView) {
    const st = this.st;
    const tone: Tone = e.winner === 'liberal' ? 'lib' : 'fas';
    const color = e.winner === 'liberal' ? LIB : FAS;
    const hitler = e.roles.indexOf('hitler');
    for (let i = 0; i < st.seats.length; i++) st.setTags(i, []);
    if (e.reason === 'hitler_elected' || e.reason === 'hitler_executed') {
      // Show the table who Hitler was before anything else.
      void st.dim(0.22, 1);
      void st.spotOn(st.seatLook(hitler, 4), 3.2, 0.13, 0xffd9d0);
      await st.rig.to(st.seatShot(hitler, 'close'), 1.8, { arc: true });
      this.snd(() => sfx.drumroll(1.2));
      await this.wait(1.2);
      await this.revealRole(hitler, view, 0.7);
      this.snd(() => sfx.sting(e.winner === 'liberal' ? 'liberal' : 'fascist'));
      st.pulse(color, 10, 2.2);
      if (!this.fast) this.ui.flash(e.winner === 'liberal' ? '#4fb6d0' : '#e5573f');
      st.rig.shake = this.fast ? 0 : 0.9;
      await this.cap({ kicker: this.n(hitler), title: e.reason === 'hitler_elected' ? 'HITLER IS CHANCELLOR' : 'HITLER IS DEAD', tone, size: 'xl' }, 3);
    }
    st.setMood(e.winner === 'fascist' ? 1 : 0, e.winner === 'liberal' ? 1 : 0, 2.5);
    this.snd(() => { sfx.ambience(e.winner === 'fascist' ? 1 : 0); sfx.fanfare(e.winner === 'liberal' ? 'liberal' : 'fascist'); });
    void st.dim(0.75, 1.5);
    void st.spotOn(null);
    void st.rig.to(st.orbitShot(0.4, 100, 34, 6), 3.2, { arc: true });
    st.pulse(color, 7, 3);
    const why = e.reason === 'policies' ? (e.winner === 'liberal' ? 'FIVE LIBERAL POLICIES ENACTED' : 'SIX FASCIST POLICIES ENACTED') : e.reason === 'hitler_elected' ? 'HITLER WAS ELECTED CHANCELLOR' : 'HITLER WAS EXECUTED';
    await this.cap({ title: e.winner === 'liberal' ? 'LIBERALS WIN' : 'FASCISTS WIN', sub: why, tone, size: 'xl' }, 4);
    // Roll call: every role card turns over.
    this.ui.caption({ title: 'ROLES', tone, size: 'md' });
    void st.rig.to(shot(0, 84, 58, 0, 0, 3, 42), 2.4, { arc: true });
    void st.dim(1, 1.5);
    await this.wait(1.2);
    for (let i = 0; i < st.seats.length; i++) {
      if (i === hitler && e.reason !== 'policies') continue;
      await this.revealRole(i, view, 0.35);
      this.snd(() => (e.roles[i] === 'liberal' ? sfx.ja() : sfx.nein()));
      await this.wait(0.2);
    }
    await this.wait(2);
    this.ui.caption(null);
  }
}
