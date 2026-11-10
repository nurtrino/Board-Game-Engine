// Secret Hitler on the big screen: the 3D table, the cutscene layer and the engine's in-game HUD.
import './sh.css';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { POWER_LABEL, seatHex, type RoomInfo, type ShPublicView, type ShView } from '@bge/shared';
import { socket } from '../net';
import { sfxEnabled, setSfxEnabled } from '../sfx';
import { Stage } from './Stage';
import { Director, type Caption, type Tone } from './director';
import { sfx } from './audio';

type ScreenWire = Extract<ShView, { role: 'screen' }>;
const seatVar = (color: string) => ({ '--seat': color } as CSSProperties);
const LIB = '#58c2dc';
const FAS = '#ef5b3f';
const titleCase = (s: string) => s.toLowerCase().replace(/^./, (c) => c.toUpperCase());
const cardsText = (s: string) => s.split('').map((c) => (c === 'L' ? 'Lib' : 'Fas')).join(' ');

export function ShBoard({ wire, room }: { wire: ScreenWire; room: RoomInfo }) {
  const nav = useNavigate();
  const stageHost = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const director = useRef<Director | null>(null);
  const latest = useRef(wire);
  const lastSeq = useRef(0);
  const synced = useRef(false);
  const ready = useRef(false);

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState('');
  const [pv, setPv] = useState<ShPublicView | null>(null);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [stamp, setStamp] = useState<{ text: string; tone: Tone; sub?: string } | null>(null);
  const [tally, setTally] = useState<{ ja: number; nein: number } | null>(null);
  const [cinema, setCinema] = useState(false);
  const [flash, setFlash] = useState<{ color: string; id: number } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [talk, setTalk] = useState<{ id: number; seat: number; text: string }[]>([]);
  const [muted, setMuted] = useState(!sfxEnabled());
  const [voice, setVoice] = useState(sfx.voice);

  // Feed the director: the first state either starts the opening or snaps to a game in progress;
  // after that only events it has not seen yet are played.
  const ingest = (w: ScreenWire) => {
    const d = director.current;
    if (!d || !ready.current) return;
    if (!synced.current) {
      synced.current = true;
      lastSeq.current = w.seq;
      if (w.fresh && w.events[0]?.e.t === 'game_start') d.push({ events: w.events, view: w.view, seq: w.seq });
      else d.snap(w.view, w.seq);
      return;
    }
    const news = w.events.filter((e) => e.seq > lastSeq.current);
    if (!news.length) return;
    lastSeq.current = news[news.length - 1].seq;
    d.push({ events: news, view: w.view, seq: lastSeq.current });
  };

  useEffect(() => {
    if (!stageHost.current || !labelHost.current) return;
    let st: Stage;
    try {
      st = new Stage(stageHost.current, labelHost.current);
    } catch (e) {
      console.error(e);
      setFailed('This browser cannot draw the 3D table.');
      return;
    }
    let uid = 0;
    let alive = true;
    sfx.setMuted(!sfxEnabled());
    sfx.unlock();
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    director.current = new Director(st, {
      caption: setCaption,
      stamp: setStamp,
      tally: setTally,
      cinema: setCinema,
      flash: (color) => setFlash({ color, id: ++uid }),
      toast: (text) => {
        const id = ++uid;
        setToasts((t) => [...t.slice(-2), { id, text }]);
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6500);
      },
      talk: (seat, text) => {
        const id = ++uid;
        setTalk((t) => [...t.slice(-3), { id, seat, text }]);
        window.setTimeout(() => setTalk((t) => t.filter((x) => x.id !== id)), 9000 + text.length * 60);
      },
      presented: setPv,
    }, (seq) => socket.send({ type: 'presented', seq }));
    st.load().then(() => {
      if (!alive) return;
      ready.current = true;
      setLoaded(true);
      ingest(latest.current);
    }).catch((e) => {
      console.error(e);
      if (alive) setFailed('The table could not be loaded.');
    });
    return () => {
      alive = false;
      ready.current = false;
      synced.current = false;
      director.current = null;
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      sfx.stopAmbience();
      st.dispose();
    };
    // The stage lives as long as this screen does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    latest.current = wire;
    ingest(wire);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wire]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        director.current?.skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSfxEnabled(!next);
    sfx.setMuted(next);
  };
  const toggleVoice = () => {
    sfx.setVoice(!sfx.voice);
    setVoice(sfx.voice);
  };

  const v = pv;
  return (
    <div className={`ig shx${cinema ? ' cinema' : ''}`}>
      <div className="shx-stage" ref={stageHost} />
      <div className="shx-labels" ref={labelHost} />
      {!loaded && !failed && <div className="route-loading" role="status"><span />Setting the table…</div>}
      {failed && <div className="page center"><h2>{failed}</h2></div>}

      {v && (
        <div className="shx-hud">
          <div className="ig-era ig-glass">
            <div className="ig-lab">Secret Hitler · Room {room.roomId}</div>
            <div className="ig-era-v">{v.phase === 'over' ? 'Game over' : v.phase === 'roles' ? 'Secret roles' : `Round ${v.round}`}</div>
            <div className="ig-era-rule" />
          </div>

          <Turn v={v} />

          <div className="ig-scores">
            <span className="ig-chip" style={seatVar(LIB)}><span className="nm">Liberal</span><Pips n={5} on={v.liberal} /></span>
            <span className="ig-chip" style={seatVar(FAS)}><span className="nm">Fascist</span><Pips n={6} on={v.fascist} /></span>
            <span className="ig-chip" style={seatVar('#ffffff')}><span className="nm">Tracker</span><Pips n={3} on={v.tracker} /></span>
            <span className="ig-chip" style={seatVar('#ffffff')}><span className="nm">Draw</span><span className="mn">{v.deck}</span></span>
            {v.vetoUnlocked && <span className="ig-chip on" style={seatVar(FAS)}><span className="nm">Veto unlocked</span></span>}
          </div>

          <div className="shx-talk">
            {talk.map((t) => (
              <div key={t.id} className="ig-glass" style={seatVar(seatHex(v.slots[t.seat] ?? 0))}>
                <b>{v.names[t.seat]}</b>
                <span>{t.text}</span>
              </div>
            ))}
          </div>

          <div className="shx-toasts">{toasts.map((t) => <div key={t.id}>{t.text}</div>)}</div>

          {v.phase !== 'over' && v.governments.length > 0 && (
            <div className="shx-record ig-glass">
              <div className="ig-lab">Public record</div>
              {v.governments.slice(-4).reverse().map((g, i) => {
                const ja = g.votes.filter((x) => x === true).length;
                const nein = g.votes.filter((x) => x === false).length;
                const res = !g.passed ? `Rejected ${ja}-${nein}` : g.vetoed ? 'Vetoed' : g.policy === 'L' ? 'Liberal' : g.policy === 'F' ? 'Fascist' : 'In session';
                const claims = [g.claims.drew && `P ${cardsText(g.claims.drew)}`, g.claims.got && `C ${cardsText(g.claims.got)}`].filter(Boolean).join(' / ');
                return (
                  <div key={`${g.round}-${i}`} className={`shx-record-row ${g.passed && g.policy === 'L' ? 'lib' : g.passed && g.policy === 'F' ? 'fas' : ''}`}>
                    <span className="r">R{g.round}</span>
                    <span className="who">{v.names[g.president]} + {v.names[g.chancellor]}</span>
                    {claims && <span className="claim">{claims}</span>}
                    <span className="res">{res}{g.chaos ? ` · top deck ${g.chaos === 'L' ? 'Liberal' : 'Fascist'}` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}

          {wire.claudeLive === false && v.ai.some(Boolean) && v.phase === 'roles' && (
            <div className="toast" style={{ background: 'rgba(0,0,0,.6)', borderColor: 'var(--brd)', color: 'var(--ink-2)' }}>
              No Anthropic API key on the server. Claude seats are using the built-in bot.
            </div>
          )}
        </div>
      )}

      <div className="shx-tools">
        {v && v.phase !== 'over' && (
          <button className="ig-glass" onClick={() => director.current?.skip()} aria-label="Skip scene" title="Skip scene (Space)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 4 10 8-10 8z" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
          </button>
        )}
        <button className={`ig-glass${voice ? '' : ' off'}`} onClick={toggleVoice} aria-label={voice ? 'Turn Claude voice off' : 'Turn Claude voice on'} title={voice ? 'Claude voice on' : 'Claude voice off'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
            {!voice && <line x1="4" y1="4" x2="20" y2="20" />}
          </svg>
        </button>
        <button className="ig-glass" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4z" />
            {muted
              ? <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
              : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
          </svg>
        </button>
      </div>

      {/* cutscene layer */}
      <div className="shx-bar top" />
      <div className="shx-bar bottom" />
      {flash && <div key={flash.id} className="shx-flash" style={{ background: flash.color }} />}
      {caption && (
        <div key={`${caption.kicker}|${caption.title}`} className={`shx-cap ${caption.size ?? 'lg'} ${caption.tone ?? 'neutral'}`}>
          {caption.kicker && <div className="kicker">{caption.kicker}</div>}
          <div className="title">{caption.title}</div>
          {caption.sub && <div className="sub">{caption.sub}</div>}
        </div>
      )}
      {tally && (
        <div className="shx-tally">
          <div><b>{tally.ja}</b><span>JA</span></div>
          <i />
          <div className="nein"><b>{tally.nein}</b><span>NEIN</span></div>
        </div>
      )}
      {stamp && <div key={stamp.text} className={`shx-stamp ${stamp.tone}`}>{stamp.text}{stamp.sub && <small>{stamp.sub}</small>}</div>}

      {v && v.phase === 'over' && v.roles && !cinema && (
        <div className="ig-modal">
          <div className="shx-over-card ig-glass">
            <div className="ig-lab">
              {v.winReason === 'policies' ? (v.winner === 'liberal' ? 'Five liberal policies enacted' : 'Six fascist policies enacted') : v.winReason === 'hitler_elected' ? 'Hitler was elected Chancellor' : 'Hitler was executed'}
            </div>
            <h1 className={v.winner === 'liberal' ? 'lib' : 'fas'}>{v.winner === 'liberal' ? 'Liberals win' : 'Fascists win'}</h1>
            <div className="shx-roles">
              {v.names.map((name, i) => {
                const role = v.roles![i];
                const art = role === 'hitler' ? 'role-hitler' : `role-${role}-${v.roleArt![i]}`;
                return (
                  <div key={i} className={role === 'liberal' ? 'lib' : 'fas'} style={seatVar(seatHex(v.slots[i]))}>
                    <img src={`/sh/cards/${art}.jpg`} alt="" />
                    <b>{name}</b>
                    <span>{titleCase(role)}{v.alive[i] ? '' : ' · dead'}</span>
                  </div>
                );
              })}
            </div>
            <div className="shx-over-actions">
              <button onClick={() => nav('/')}>Leave table</button>
              <button className="primary" onClick={() => socket.send({ type: 'rematch' })}>Play again</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pips({ n, on }: { n: number; on: number }) {
  return <span className="shx-pips">{Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</span>;
}

function Turn({ v }: { v: ShPublicView }) {
  const P = v.names[v.president];
  const C = v.chancellor !== null ? v.names[v.chancellor] : '';
  let seat: number | null = null;
  let body: JSX.Element;
  switch (v.phase) {
    case 'roles': {
      const waiting = v.names.filter((_, i) => !v.ready[i]);
      body = waiting.length ? <span>Waiting for <b>{waiting.join(', ')}</b></span> : <span>Everyone is ready</span>;
      break;
    }
    case 'nominate': seat = v.president; body = <span><b>{P}</b> to nominate a Chancellor</span>; break;
    case 'vote': body = <span>Vote on <b>{P} + {C}</b> · {v.voted.filter(Boolean).length} of {v.alive.filter(Boolean).length} in</span>; break;
    case 'president_discard': seat = v.president; body = <span><b>President {P}</b> to discard a policy</span>; break;
    case 'chancellor_enact': seat = v.chancellor; body = <span><b>Chancellor {C}</b> to enact a policy</span>; break;
    case 'veto_response': seat = v.president; body = <span><b>President {P}</b> to answer the veto</span>; break;
    case 'power': seat = v.president; body = <span><b>President {P}</b> · {v.power ? titleCase(POWER_LABEL[v.power]) : ''}</span>; break;
    default: return null;
  }
  return (
    <div className="ig-turn ig-glass" key={`${v.phase}-${v.round}-${seat}`} style={seatVar(seat !== null ? seatHex(v.slots[seat]) : '#ffffff')}>
      {seat !== null && <span className="ig-prompt-ring" />}
      {body}
    </div>
  );
}
