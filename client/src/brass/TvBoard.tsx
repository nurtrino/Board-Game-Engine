// The big screen. It shows only the main board, and it never just "updates":
// every event the engine reports is queued and staged in order. The camera goes
// to where it happened, the pieces move, the sound lands with them, and a
// caption says what it was. Rounds turning over, an era being scored, the
// railways arriving and the end of the game each get a cutscene of their own.
//
// The screen shows a state that trails the real one: `shown` only advances when
// the director has reached that beat, so nothing appears before it is staged.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOCATION_OF, type BrassView, type BrassSnap, type BrassEvent, type BrassBeat, type BrassFrame, type BrassBatch,
} from '@bge/shared';
import { TableScene, useBrassScene, FxBus, type SceneDef, type RigApi, type Shot, type Spot } from './TableScene';
import { gameSceneState } from './gameSceneState';
import { focusOf } from './focus';
import { audio } from './audio';
import { Ticker, Count, Pips, RoundBar, seatVar, ordinal } from './hud';
import './brass.css';

type Beat<T extends BrassBeat['t']> = Extract<BrassBeat, { t: T }>;

type Cut =
  | { t: 'intro'; step: 0 | 1 | 2; seated: number }
  | { t: 'round'; beat: Beat<'round'>; paid: boolean }
  | { t: 'score'; beat: Beat<'score'>; order: number[]; stage: number; done: boolean }
  | { t: 'era'; beat: Beat<'era'>; step: 0 | 1 }
  | { t: 'end'; beat: Beat<'end'>; revealed: number };

interface Turn { color: string; name: string; left: number; total: number; key: string; }

type Job = { kind: 'intro'; live: BrassSnap } | { kind: 'batch'; batch: BrassBatch; live: BrassSnap };

const WIDE: Shot = { pos: [0, 21.5, 20.5], tgt: [0, 1.3, 0.6] };
const TURN_TRACK: Shot = { pos: [-5.2, 9.8, 15.2], tgt: [-8.4, 1.5, 6.9] };
const INTRO_A: Shot = { pos: [-14, 5.2, 13], tgt: [-1, 1.3, 0] };
const INTRO_B: Shot = { pos: [9, 8.5, 15.5], tgt: [0.5, 1.3, -0.5] };

const KIND_LABEL: Record<string, string> = {
  build: 'Built', network: 'Network', sell: 'Sold', develop: 'Developed', loan: 'Loan', scout: 'Scouted', pass: 'Passed',
};

function turnOf(v: BrassSnap): Turn | null {
  if (v.phase !== 'playing') return null;
  const p = v.players.find((q) => q.color === v.currentColor);
  return {
    color: v.currentColor, name: p?.name ?? v.currentColor, left: v.actionsLeft,
    total: v.era === 'canal' && v.round === 1 ? 1 : 2,
    key: `${v.era}|${v.round}|${v.currentColor}`,
  };
}

/** A three-quarter shot of one spot. Alternates sides so turns do not all look alike. */
function shotAt(f: { x: number; z: number }, seq: number, wide = false): Shot {
  // near an edge the camera stands on the board side, looking outward
  const side = f.x > 6 ? -1 : f.x < -6 ? 1 : seq % 2 ? 1 : -1;
  return wide
    ? { pos: [f.x + side * 2.2, 10.4, f.z + 7.4], tgt: [f.x, 1.5, f.z] }
    : { pos: [f.x + side * 2.6, 8.4, f.z + 5.8], tgt: [f.x, 1.5, f.z] };
}

function Banner({ ev, scene }: { ev: BrassEvent; scene: SceneDef }) {
  const income = ev.incomeDelta;
  const subject = ev.kind === 'build' || ev.kind === 'sell' || ev.kind === 'develop' ? ev.tile ?? ev.title
    : ev.kind === 'network' ? (ev.title.includes('canal') ? 'Canal' : 'Railway')
    : ev.kind === 'loan' ? '£30'
    : ev.kind === 'scout' ? 'Two wild cards'
    : ev.kind === 'pass' ? 'No action'
    : ev.title;
  const money = ev.money ?? 0;
  return (
    <div className="ig-banner ig-glass bbx-banner" key={ev.seq} style={seatVar(ev.color)}>
      <div className="ig-banner-head">
        {scene.turnTokens[ev.color] && <img className="ig-por" src={scene.turnTokens[ev.color].image} alt="" />}
        <div>
          <div className="ig-who">{ev.player}</div>
          {ev.location && <div className="ig-loc">{ev.location}</div>}
        </div>
        <span className="bbx-kind">{KIND_LABEL[ev.kind ?? ''] ?? ''}</span>
      </div>
      <div className="ig-subject">{subject}</div>
      {(ev.cost || money !== 0 || (income !== undefined && income !== 0)) && (
        <div className="ig-banner-foot">
          <div>
            <div className="ig-lab">{ev.kind === 'sell' ? 'Beer' : ev.kind === 'loan' ? 'Cash' : 'Cost'}</div>
            <div className={`ig-stat-v${ev.kind === 'loan' ? ' ig-up' : ''}`}>
              {ev.kind === 'loan' ? `+£${money}` : ev.cost ?? (money < 0 ? `£${-money}` : 'None')}
            </div>
          </div>
          {income !== undefined && income !== 0 && (
            <div style={{ textAlign: 'right' }}>
              <div className="ig-lab">Income</div>
              <div className={`ig-stat-v ${income > 0 ? 'ig-up' : 'ig-down'}`}>{income > 0 ? `+${income}` : `−${-income}`}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TvBoard({ view }: { view: BrassView }) {
  const scene = useBrassScene();
  const [shown, setShown] = useState<BrassSnap>(view);
  const [caption, setCaption] = useState<BrassEvent | null>(null);
  const [cut, setCut] = useState<Cut | null>(null);
  const [cinema, setCinema] = useState(false);
  const [hint, setHint] = useState<{ x: number; z: number } | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [turn, setTurn] = useState<Turn | null>(() => turnOf(view));
  const [statsSeat, setStatsSeat] = useState<number | null>(null);
  const [muted, setMuted] = useState(audio.muted);

  const rig = useRef<RigApi | null>(null);
  const bus = useMemo(() => new FxBus(), []);
  const sceneRef = useRef<SceneDef | null>(null);
  sceneRef.current = scene;
  const d = useRef({
    q: [] as Job[], running: false, lastSeq: null as number | null, fast: false, dead: false, ended: false,
    waits: new Set<() => void>(), shown: view as BrassSnap,
  });

  // ---- what the pieces do becomes what the table hears ----
  useEffect(() => {
    const last: Record<string, number> = {};
    const every = (key: string, ms: number) => {
      const now = performance.now();
      if (now - (last[key] ?? 0) < ms) return false;
      last[key] = now;
      return true;
    };
    let steps = 0;
    return bus.on((e) => {
      switch (e.t) {
        case 'land': audio.slam(e.tile); break;
        case 'flip': audio.flip(); break;
        case 'flipped': audio.register(); audio.coins(3, 0.3); break;
        case 'cube': if (every('cube', 55)) { if (e.kind === 'beer') audio.barrel(); else audio.cube(e.kind); } break;
        case 'link': if (e.era === 'canal') audio.canal(); else audio.rail(); break;
        case 'step': if (every('step', 42)) audio.step(steps++); break;
        case 'token': if (every('token', 90)) audio.knock(); break;
        case 'coin': if (every('coin', 50)) audio.coins(1); break;
        case 'lift': if (every('lift', 260)) audio.whoosh(0.45, 0.05); break;
        case 'scout': audio.scout(); break;
      }
    });
  }, [bus]);

  // ---- the director ----
  const director = useMemo(() => {
    const s = d.current;
    const speed = () => (s.q.length >= 3 ? 2.2 : s.q.length >= 1 ? 1.45 : 1);
    const wait = (ms: number) => new Promise<void>((res) => {
      if (s.fast || s.dead) { res(); return; }
      const done = () => { window.clearTimeout(id); s.waits.delete(done); res(); };
      const id = window.setTimeout(done, ms / speed());
      s.waits.add(done);
    });
    const fly = (shot: Shot, sec: number) => {
      const r = rig.current;
      if (!r) return Promise.resolve();
      const secs = s.fast ? 0.01 : sec / speed();
      // a hidden tab stops rendering; never let a camera move strand the queue
      return Promise.race([r.fly(shot, secs), wait(secs * 1000 + 500)]);
    };
    const show = (snap: BrassSnap) => { s.shown = snap; setShown(snap); };

    const playAction = async (ev: BrassEvent, snap: BrassSnap) => {
      const sc = sceneRef.current;
      const f = sc ? focusOf(sc, ev, s.shown, snap) : null;
      const kind = ev.kind ?? 'pass';
      setCaption(null);
      setSpot(null);
      setHint(kind === 'develop' ? null : f);
      if (kind === 'pass' || !f) {
        show(snap);
        setCaption(ev);
        if (kind === 'pass') audio.pass();
        else if (kind === 'scout') bus.emit({ t: 'scout' });
        else if (kind === 'loan') audio.loan();
        await wait(kind === 'pass' ? 2000 : 3000);
        return;
      }
      audio.whoosh(0.7, 0.09);
      await fly(shotAt(f, ev.seq, kind === 'network' || kind === 'scout' || kind === 'loan'), 0.95);
      show(snap);
      setCaption(ev);
      const money = ev.money ?? 0;
      if (kind === 'build' || kind === 'network') {
        await wait(620);
        setSpot({ ...f, color: '#ffffff', size: kind === 'build' ? 0.95 : 0.8 });
        if (money) bus.emit({ t: 'float', x: f.x, z: f.z, text: `${money > 0 ? '+' : '−'}£${Math.abs(money)}`, tone: money > 0 ? 'up' : 'down' });
        rig.current?.orbit(ev.seq % 2 ? 0.045 : -0.045);
        await wait(2700);
      } else if (kind === 'sell') {
        setSpot({ ...f, color: '#ffffff', size: 0.95 });
        rig.current?.orbit(ev.seq % 2 ? 0.05 : -0.05);
        await wait(1500);
        if (ev.incomeDelta) bus.emit({ t: 'float', x: f.x, z: f.z, text: `+${ev.incomeDelta} income`, tone: 'up' });
        await wait(2400);
      } else if (kind === 'develop') {
        audio.cube('iron');
        setSpot({ ...f, color: '#ffffff', size: 0.6 });
        await wait(2700);
      } else if (kind === 'loan') {
        audio.loan();
        bus.emit({ t: 'float', x: f.x, z: f.z, text: `+£${money}`, tone: 'up' });
        await wait(3000);
      } else if (kind === 'scout') {
        bus.emit({ t: 'scout' });
        await wait(2800);
      }
      rig.current?.orbit(0);
      setSpot(null);
    };

    const playRound = async (beat: Beat<'round'>, snap: BrassSnap) => {
      setCaption(null); setSpot(null); setHint(null);
      setTurn(null);
      setCut({ t: 'round', beat, paid: false });
      audio.bell();
      void fly(TURN_TRACK, 1.1);
      await wait(1250);
      show(snap);
      setCut({ t: 'round', beat, paid: true });
      beat.income.forEach((r, i) => { if (r.amount > 0) audio.coins(Math.min(6, 1 + Math.floor(r.amount / 3)), 0.15 + i * 0.24); });
      await wait(3600);
      setCut(null);
    };

    const playScore = async (beat: Beat<'score'>, snap: BrassSnap) => {
      setCaption(null); setSpot(null); setHint(null);
      setCinema(true);
      setTurn(null);
      // lowest score first, so the leader is the last to be read out
      const order = beat.rows.map((_, i) => i).sort((a, b) => beat.rows[a].vp - beat.rows[b].vp);
      setCut({ t: 'score', beat, order, stage: -1, done: false });
      audio.eraEnd();
      audio.ambience(1.9);
      void fly(WIDE, 2.0).then(() => rig.current?.orbit(0.03));
      await wait(2600);
      for (let i = 0; i < order.length * 3; i++) {
        setCut({ t: 'score', beat, order, stage: i, done: false });
        if (i % 3 === 2) audio.tallyDone();
        await wait(i % 3 === 2 ? 760 : 640);
      }
      show(snap);
      setCut({ t: 'score', beat, order, stage: order.length * 3, done: true });
      await wait(3600);
    };

    const playEra = async (beat: Beat<'era'>, snap: BrassSnap) => {
      setCut({ t: 'era', beat, step: 0 });
      audio.sweep();
      show(snap);
      await wait(2000);
      setCut({ t: 'era', beat, step: 1 });
      audio.eraRail();
      await wait(5600);
      setCut(null);
      setCinema(false);
      rig.current?.orbit(0);
      audio.ambience(1);
    };

    const playEnd = async (beat: Beat<'end'>, snap: BrassSnap) => {
      s.ended = true;
      show(snap);
      setCinema(true);
      setTurn(null);
      setCut({ t: 'end', beat, revealed: 0 });
      await wait(900);
      for (let i = 1; i <= beat.standings.length; i++) {
        setCut({ t: 'end', beat, revealed: i });
        if (i === beat.standings.length) audio.fanfare(); else audio.knock(0, 0.26);
        await wait(i === beat.standings.length ? 1400 : 950);
      }
      audio.ambience(1);
    };

    const playIntro = async (live: BrassSnap) => {
      setCinema(true);
      setTurn(null);
      setCut({ t: 'intro', step: 0, seated: 0 });
      audio.intro();
      audio.ambience(1.6);
      await fly(INTRO_A, 0.01);
      void fly(INTRO_B, 6.5);
      await wait(4200);
      setCut({ t: 'intro', step: 1, seated: 0 });
      void fly(TURN_TRACK, 1.5);
      await wait(1000);
      for (let i = 1; i <= live.turnOrder.length; i++) {
        setCut({ t: 'intro', step: 1, seated: i });
        audio.knock(0, 0.24);
        await wait(520);
      }
      await wait(1100);
      setCut({ t: 'intro', step: 2, seated: live.turnOrder.length });
      audio.bell();
      void rig.current?.home(s.fast ? 0.01 : 1.7);
      await wait(2900);
      setCut(null);
      setCinema(false);
      audio.ambience(1);
    };

    const playFrame = async (f: BrassFrame) => {
      const b = f.beat;
      if (b.t === 'action') { await playAction(b.ev, f.snap); setTurn(turnOf(f.snap)); }
      else if (b.t === 'round') { await playRound(b, f.snap); setTurn(turnOf(f.snap)); }
      else if (b.t === 'score') await playScore(b, f.snap);
      else if (b.t === 'era') { await playEra(b, f.snap); setTurn(turnOf(f.snap)); }
      else if (b.t === 'end') await playEnd(b, f.snap);
    };

    const run = async () => {
      if (s.running) return;
      s.running = true;
      for (;;) {
        while (s.q.length && !s.dead) {
          const job = s.q.shift()!;
          try {
            if (job.kind === 'intro') await playIntro(job.live);
            else for (const f of job.batch.frames) { if (s.dead) break; await playFrame(f); }
          } catch (err) { console.error('brass director', err); }
          if (s.dead) break;
          show(job.live);
          setTurn(turnOf(job.live));
          if (s.fast) { rig.current?.reset(); setCaption(null); setSpot(null); if (!s.ended) { setCut(null); setCinema(false); } }
          s.fast = false;
        }
        if (s.dead) break;
        // nothing waiting: let the table breathe, and give the camera back
        setCaption(null); setSpot(null); setHint(null);
        if (!s.ended) { setCinema(false); await (rig.current?.home(0.95) ?? Promise.resolve()); }
        if (!s.q.length || s.dead) break;
      }
      s.running = false;
    };

    return {
      push(job: Job) { s.q.push(job); void run(); },
      /** finish whatever is playing at once */
      skip() { if (!s.running) return; s.fast = true; for (const w of [...s.waits]) w(); },
      snapTo(snap: BrassSnap) { s.q.length = 0; show(snap); setTurn(turnOf(snap)); },
    };
  }, [bus]);

  // ---- feed: every new batch from the server joins the queue ----
  useEffect(() => {
    const s = d.current;
    const seq = view.batch?.seq ?? 0;
    if (s.lastSeq === null) {
      s.lastSeq = seq;
      s.dead = false;
      s.shown = view;
      setShown(view);
      setTurn(turnOf(view));
      const untouched = !view.batch && view.phase === 'playing' && view.era === 'canal' && view.round === 1
        && Object.keys(view.board.industries).length === 0 && Object.keys(view.board.links).length === 0
        && view.players.every((p) => p.discardCount === 0);
      if (untouched) director.push({ kind: 'intro', live: view });
      // opened on a finished game: put the final scores straight up
      const last = view.batch?.frames.find((f) => f.beat.t === 'end')?.beat;
      if (view.phase === 'ended' && last?.t === 'end') {
        s.ended = true;
        setCinema(true);
        setCut({ t: 'end', beat: last, revealed: last.standings.length });
      }
      return;
    }
    if (seq === s.lastSeq) {
      // a rebroadcast (someone reconnected): nothing to stage
      if (!s.running && !s.q.length) { s.shown = view; setShown(view); }
      return;
    }
    const missed = seq !== s.lastSeq + 1 || !view.batch;
    s.lastSeq = seq;
    // the screen was away and several turns went by: do not replay, catch up
    if (missed) director.snapTo(view);
    else director.push({ kind: 'batch', batch: view.batch!, live: view });
  }, [view, director]);

  useEffect(() => {
    const s = d.current;
    return () => {
      s.dead = true;
      s.lastSeq = null;
      s.q.length = 0;
      for (const w of [...s.waits]) w();
      audio.stopAmbience();
    };
  }, []);

  // room tone starts with the first gesture on this screen
  useEffect(() => {
    const start = () => audio.ambience(1);
    start();
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    return () => { window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
  }, []);

  // each seat has its own two-note call
  const turnKey = turn?.key;
  useEffect(() => {
    if (!turn) return;
    const seat = shown.players.find((p) => p.color === turn.color)?.seat ?? 0;
    audio.turn(seat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey]);

  const skip = useCallback(() => director.skip(), [director]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') skip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const toggleMute = () => { const next = !muted; setMuted(next); audio.setMuted(next); };
  const game = useMemo(() => gameSceneState(shown), [shown]);

  if (!scene) return <div className="page center"><h2>Loading board</h2></div>;

  const winner = shown.players.find((p) => p.color === shown.winner);
  const por = (color: string) => scene.turnTokens[color]?.image;
  const nameOf = (color: string) => shown.players.find((p) => p.color === color)?.name ?? color;

  return (
    <div className={`ig bbx${cinema ? ' cinema' : ''}`}>
      <TableScene
        scene={scene} filter={(g) => g === 'board'} frame="board" game={game}
        hint={hint} spot={spot} fx={bus} rig={rig}
      />

      <div className="bbx-bar top" />
      <div className="bbx-bar bottom" />

      {/* one row across the top: round plate, whose turn, the seats. They share
          the row, so the turn pill can never sit on top of a seat. */}
      <div className="bbx-top bbx-hud">
        {/* era / round plate */}
        <div className="ig-era ig-glass">
          {shown.phase === 'ended' ? (
            <>
              <div className="ig-lab">Game over</div>
              <div className="ig-era-v"><b>{winner?.name ?? shown.winner}</b> wins</div>
            </>
          ) : (
            <>
              <div className="ig-lab">{shown.era === 'canal' ? 'Canal Era' : 'Rail Era'}</div>
              <div className="ig-era-v">Round {shown.round} / {shown.numRounds}</div>
              <RoundBar round={shown.round} numRounds={shown.numRounds} />
            </>
          )}
        </div>

        {/* whose turn: always shown, pops on every turnover */}
        {turn && (
          <div className="ig-turn ig-glass" key={turn.key} style={seatVar(turn.color)}>
            <span className="ig-prompt-ring" />
            <span><b>{turn.name}</b> to act</span>
            <Pips total={turn.total} left={turn.left} />
          </div>
        )}

        {/* score chips: name, VP, cash. Tap for full stats */}
        <div className="ig-scores">
          {shown.players.map((p) => (
            <button
              key={p.seat}
              className={`ig-chip${turn?.color === p.color ? ' on' : ''}`}
              style={seatVar(p.color)}
              onClick={() => setStatsSeat(p.seat)}
            >
              <span className="nm">{p.name}</span>
              <span className="vp"><Ticker value={p.vp} suffix=" VP" /></span>
              <span className="mn"><Ticker value={p.money} prefix="£" /></span>
            </button>
          ))}
        </div>
      </div>

      {/* the turn changing hands, large enough to read from the sofa */}
      {turn && !cut && (
        <div className="bbx-stinger" key={`s${turn.key}`} style={seatVar(turn.color)}>
          {por(turn.color) && <img src={por(turn.color)} alt="" />}
          <div>
            <div className="ig-lab">Up next</div>
            <div className="bbx-stinger-name">{turn.name}</div>
          </div>
        </div>
      )}

      {caption && !cut && <Banner ev={caption} scene={scene} />}

      {/* ---- cutscenes ---- */}
      {cut?.t === 'intro' && (
        <div className={`bbx-cut${cut.step === 2 ? ' dim' : ''}`} onClick={skip}>
          {cut.step === 0 && (
            <div className="bbx-cover">
              <img src="/brass-logo.webp" alt="Brass: Birmingham" />
            </div>
          )}
          {cut.step === 1 && (
            <div className="bbx-plate ig-glass low">
              <div className="ig-lab">Turn order</div>
              <div className="bbx-order">
                {shown.turnOrder.map((c, i) => (
                  <div key={c} className={`bbx-seat${i < cut.seated ? ' in' : ''}`} style={seatVar(c)}>
                    <span className="n">{i + 1}</span>
                    {por(c) && <img src={por(c)} alt="" />}
                    <span className="nm">{nameOf(c)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cut.step === 2 && (
            <div className="bbx-title-card">
              <div className="bbx-kicker">Canal era</div>
              <div className="bbx-title">Round 1 of {shown.numRounds}</div>
              <div className="bbx-sub">One action each this round. Two from then on.</div>
            </div>
          )}
        </div>
      )}

      {cut?.t === 'round' && (
        <div className="bbx-cut side" onClick={skip}>
          <div className="bbx-plate ig-glass">
            <div className="ig-lab">{cut.beat.era === 'canal' ? 'Canal era' : 'Rail era'}</div>
            <div className="bbx-plate-title">Round {cut.beat.round} of {cut.beat.numRounds}</div>
            <RoundBar round={cut.beat.round} numRounds={cut.beat.numRounds} />
            <div className="bbx-table">
              <div className="bbx-th"><span>Turn order</span><span>Income</span></div>
              {cut.beat.order.map((c, i) => {
                const row = cut.beat.income.find((r) => r.color === c);
                return (
                  <div key={c} className="bbx-tr in" style={{ ...seatVar(c), animationDelay: `${i * 0.09}s` }}>
                    <span className="n">{i + 1}</span>
                    {por(c) && <img src={por(c)} alt="" />}
                    <span className="nm">{nameOf(c)}</span>
                    <span className={`v ${(row?.amount ?? 0) < 0 ? 'ig-down' : 'ig-up'}`}>
                      {cut.paid && row ? `${row.amount < 0 ? '−' : row.amount > 0 ? '+' : ''}£${Math.abs(row.amount)}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {cut?.t === 'score' && (
        <div className="bbx-cut" onClick={skip}>
          <div className="bbx-plate ig-glass wide">
            <div className="ig-lab">{cut.beat.era === 'canal' ? 'Canal era ends' : 'Rail era ends'}</div>
            <div className="bbx-plate-title">Scoring</div>
            <div className="bbx-table score">
              <div className="bbx-th"><span /><span>Links</span><span>Industries</span><span>Score</span></div>
              {cut.order.map((ri, i) => {
                const r = cut.beat.rows[ri];
                const lead = cut.done && i === cut.order.length - 1;
                return (
                  <div key={r.color} className={`bbx-tr${cut.stage >= i * 3 ? ' in' : ''}${lead ? ' lead' : ''}`} style={seatVar(r.color)}>
                    {por(r.color) && <img src={por(r.color)} alt="" />}
                    <span className="nm">{r.name}</span>
                    <span className="v"><Count to={r.links} run={cut.stage >= i * 3} prefix="+" onStep={(n) => audio.tally(n)} /></span>
                    <span className="v"><Count to={r.industries} run={cut.stage >= i * 3 + 1} prefix="+" onStep={(n) => audio.tally(n + 6)} /></span>
                    <span className="v total">
                      {cut.stage >= i * 3 + 2 ? <>{r.vp}<small>{r.before > 0 ? ` from ${r.before}` : ''}</small></> : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {cut?.t === 'era' && (
        <div className="bbx-cut dim" onClick={skip}>
          {cut.step === 0 ? (
            <div className="bbx-title-card">
              <div className="bbx-kicker">The canal era is over</div>
              <div className="bbx-sub">
                {cut.beat.links} canal{cut.beat.links === 1 ? '' : 's'} and {cut.beat.removed.length} level 1 {cut.beat.removed.length === 1 ? 'industry leaves' : 'industries leave'} the board.
              </div>
            </div>
          ) : (
            <div className="bbx-title-card">
              <div className="bbx-kicker">Round 1 of {cut.beat.numRounds}</div>
              <div className="bbx-title">Rail era</div>
              <div className="bbx-sub">New hands are dealt. Railways need coal. The merchants have beer again.</div>
              <div className="bbx-order row">
                {cut.beat.order.map((c, i) => {
                  const row = cut.beat.income.find((r) => r.color === c);
                  return (
                    <div key={c} className="bbx-seat in" style={{ ...seatVar(c), animationDelay: `${0.5 + i * 0.12}s` }}>
                      <span className="n">{i + 1}</span>
                      {por(c) && <img src={por(c)} alt="" />}
                      <span className="nm">{nameOf(c)}</span>
                      {row && <span className={`v ${row.amount < 0 ? 'ig-down' : 'ig-up'}`}>{row.amount < 0 ? '−' : row.amount > 0 ? '+' : ''}£{Math.abs(row.amount)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {cut?.t === 'end' && (() => {
        const st = cut.beat.standings;
        const top = Math.max(1, ...st.map((r) => r.vp));
        return (
          <div className="bbx-cut">
            <div className="bbx-plate ig-glass wide end">
              <div className="ig-lab">Final scores</div>
              <div className="bbx-plate-title">
                {cut.revealed >= st.length ? <><b>{st[0].name}</b> wins</> : 'Brass: Birmingham'}
              </div>
              <div className="bbx-table end">
                {st.map((r, i) => {
                  // last place is read out first, the winner last
                  const on = cut.revealed >= st.length - i;
                  return (
                    <div key={r.color} className={`bbx-tr${on ? ' in' : ''}${on && i === 0 ? ' lead' : ''}`} style={seatVar(r.color)}>
                      <span className="n">{ordinal(i + 1)}</span>
                      {por(r.color) && <img src={por(r.color)} alt="" />}
                      <span className="nm">{r.name}</span>
                      <span className="bbx-meter"><i style={{ width: on ? `${(r.vp / top) * 100}%` : 0 }} /></span>
                      <span className="v total">{on ? <>{r.vp}<small> VP</small></> : ''}</span>
                    </div>
                  );
                })}
              </div>
              {cut.revealed >= st.length && (
                <button className="bbx-dismiss" onClick={() => { setCut(null); setCinema(false); void rig.current?.home(1.2); }}>
                  Look at the board
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* sound toggle */}
      <button className="ig-glass bbx-mute bbx-hud" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          {muted
            ? <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
            : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
        </svg>
      </button>

      {/* player stats: VP, income, buildings and the rest */}
      {statsSeat !== null && shown.players[statsSeat] && (() => {
        const p = shown.players[statsSeat];
        const builds = Object.entries(shown.board.industries).filter(([, b]) => b.color === p.color);
        return (
          <div className="ig-modal" onClick={() => setStatsSeat(null)}>
            <div className="ig-modal-card ig-glass" style={seatVar(p.color)} onClick={(e) => e.stopPropagation()}>
              <div className="ig-modal-head">
                <span className="ig-prompt-ring" />
                <b>{p.name}</b>
                <button className="ig-modal-x" onClick={() => setStatsSeat(null)} aria-label="Close">✕</button>
              </div>
              <div className="ig-hold" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div><div className="ig-lab">VP</div><div className="ig-stat-v ig-num">{p.vp}</div></div>
                <div><div className="ig-lab">Income</div><div className={`ig-stat-v ig-num ${p.income < 0 ? 'ig-down' : 'ig-up'}`}>£{p.income}</div></div>
                <div><div className="ig-lab">Cash</div><div className="ig-stat-v ig-num">£{p.money}</div></div>
                <div><div className="ig-lab">Links</div><div className="ig-stat-v ig-num">{p.links}</div></div>
                <div><div className="ig-lab">Beer</div><div className="ig-stat-v ig-num">{p.beer}</div></div>
                <div><div className="ig-lab">Cards</div><div className="ig-stat-v ig-num">{p.handCount}</div></div>
              </div>
              <div className="ig-build-head">
                <span className="ig-lab">Buildings</span>
                <span className="ig-lab">{builds.length}</span>
              </div>
              {builds.length === 0 ? (
                <div style={{ color: 'var(--ink-3)', fontSize: '.85rem' }}>None built yet</div>
              ) : builds.map(([sq, b]) => (
                <div key={sq} className={`ig-build-row${b.flipped ? ' flipped' : ''}`}>
                  <span>{b.tile}</span>
                  <span className="loc">{LOCATION_OF[sq] ?? sq}{b.flipped ? ' · sold' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
