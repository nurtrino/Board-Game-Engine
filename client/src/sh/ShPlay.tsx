// Secret Hitler on a player's device: the secret role, every decision, claims and table talk.
import './sh.css';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  CLAIM_VALUES, POWER_LABEL, seatHex,
  type ClaimSlot, type Policy, type RoomInfo, type ShAction, type ShPrivateView, type ShView,
} from '@bge/shared';
import { socket } from '../net';
import { playSfx } from '../sfx';

type PlayerWire = Extract<ShView, { role: 'player' }>;
const seatVar = (color: string) => ({ '--seat': color } as CSSProperties);
const policyImg = (p: Policy) => `/sh/cards/policy-${p === 'L' ? 'liberal' : 'fascist'}.png`;
const policyName = (p: Policy) => (p === 'L' ? 'Liberal' : 'Fascist');
const roleImg = (v: Pick<ShPrivateView, 'role' | 'myArt'>) => `/sh/cards/${v.role === 'hitler' ? 'role-hitler' : `role-${v.role}-${v.myArt}`}.jpg`;
const cardsText = (s: string) => s.split('').map((c) => (c === 'L' ? 'Liberal' : 'Fascist')).join(', ');
const titleCase = (s: string) => s.toLowerCase().replace(/^./, (c) => c.toUpperCase());
const tone = (party: string | null | undefined) => (party === 'liberal' ? 'lib' : 'fas');
const IN_OFFICE = ['president_discard', 'chancellor_enact', 'veto_response', 'power'];

export function ShPlay({ wire, room, host, error }: { wire: PlayerWire; room: RoomInfo; host: boolean; error: string | null }) {
  const gated = wire.screenLive && wire.screenSeq < wire.seq;
  // While the screen is mid-cutscene the device keeps showing the last settled state, so it never spoils a reveal.
  const [settled, setSettled] = useState(wire);
  useEffect(() => {
    if (!gated) setSettled(wire);
  }, [gated, wire]);
  const v = gated ? settled.view : wire.view;
  const [peekRole, setPeekRole] = useState(false);
  const [sentKey, setSentKey] = useState('');
  const [skipClaims, setSkipClaims] = useState<string[]>([]);
  const [seenIntel, setSeenIntel] = useState(v.intel.length);
  const [say, setSay] = useState('');

  // A fingerprint of "what I am being asked", so a tap disables the prompt until the server moves on.
  const askKey = `${v.phase}:${v.round}:${v.governments.length}:${JSON.stringify(v.actions)}`;
  const busy = sentKey === askKey;
  const send = (action: ShAction) => socket.send({ type: 'action', action });
  const act = (action: ShAction) => {
    playSfx('click');
    setSentKey(askKey);
    send(action);
  };
  useEffect(() => {
    if (error) {
      playSfx('error');
      setSentKey('');
    }
  }, [error]);

  const myTurn = v.actions.length > 0 && !gated;
  const wasTurn = useRef(false);
  useEffect(() => {
    // Browsers only allow vibration after the user has touched the page.
    if (myTurn && !wasTurn.current) {
      playSfx('turn');
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(40);
    }
    wasTurn.current = myTurn;
  }, [myTurn]);

  // A fresh investigation result pops up once the screen has finished showing the moment.
  const newIntel = !gated && v.intel.length > seenIntel ? v.intel.slice(seenIntel).filter((i) => i.kind === 'investigate').at(-1) ?? null : null;
  useEffect(() => {
    if (!gated && v.intel.length > seenIntel && !newIntel) setSeenIntel(v.intel.length);
  }, [gated, v.intel.length, seenIntel, newIntel]);

  const claim = !gated ? v.claimSlots.find((c) => !skipClaims.includes(`${c.kind}:${c.gov}`)) : undefined;
  const name = (i: number) => v.names[i];
  const sendSay = () => {
    const text = say.trim();
    if (!text) return;
    playSfx('click');
    send({ type: 'say', text });
    setSay('');
  };
  const intel = v.intel.filter((i) => i.kind === 'investigate' || i.kind === 'peek');

  return (
    <div className="shx shx-phone" style={seatVar(seatHex(v.slots[v.seat]))}>
      <header className="shx-top">
        <div className="shx-me">{name(v.seat)}</div>
        <div className="shx-score">
          <Pips n={5} on={v.liberal} color="var(--sh-lib)" />
          <Pips n={6} on={v.fascist} color="var(--sh-fas)" />
          <Pips n={3} on={v.tracker} color="#ffffff" />
        </div>
      </header>

      <main className="shx-main">
        {gated ? (
          <div className="card fill">
            <span className="eyebrow">Hold on</span>
            <h2>Watch the screen</h2>
          </div>
        ) : (
          <Prompt v={v} busy={busy} act={act} host={host} />
        )}

        {claim && (
          <ClaimPanel
            v={v}
            slot={claim}
            onClaim={(value) => { playSfx('click'); send({ type: 'claim', kind: claim.kind, value }); }}
            onSkip={() => setSkipClaims((s) => [...s, `${claim.kind}:${claim.gov}`])}
          />
        )}

        {v.phase !== 'roles' && v.phase !== 'over' && (
          <div className="shx-strip">
            <div><span className="eyebrow">{IN_OFFICE.includes(v.phase) ? 'President' : 'Candidate'}</span><b style={{ color: seatHex(v.slots[v.president]) }}>{name(v.president)}</b></div>
            <div><span className="eyebrow">{IN_OFFICE.includes(v.phase) ? 'Chancellor' : 'Nominee'}</span><b style={v.chancellor !== null ? { color: seatHex(v.slots[v.chancellor]) } : undefined}>{v.chancellor !== null ? name(v.chancellor) : 'None yet'}</b></div>
            <div><span className="eyebrow">Draw pile</span><b>{v.deck}</b></div>
          </div>
        )}

        {intel.length > 0 && (
          <div className="card">
            <div className="pl-players-label">Only you know</div>
            <ul className="player-list">
              {intel.map((i, k) => (
                <li key={k}>
                  <span className="tag" style={{ marginLeft: 0 }}>R{i.round}</span>
                  {i.kind === 'investigate'
                    ? <span>{name(i.target!)} is <b className={`${tone(i.party)}-t`}>{i.party}</b></span>
                    : <span>Top three were {cardsText((i.cards ?? []).join(''))}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <footer className="shx-foot">
        {(v.alive[v.seat] || v.phase === 'over') && (
          <form className="shx-say" onSubmit={(e) => { e.preventDefault(); sendSay(); }}>
            <input value={say} onChange={(e) => setSay(e.target.value.slice(0, 200))} placeholder="Say something to the table" enterKeyHint="send" autoComplete="off" />
            <button type="submit" disabled={!say.trim()}>Send</button>
          </form>
        )}
        {v.phase !== 'over' && (
          <button
            className="shx-hold"
            onPointerDown={(e) => { e.preventDefault(); setPeekRole(true); }}
            onPointerUp={() => setPeekRole(false)}
            onPointerLeave={() => setPeekRole(false)}
            onPointerCancel={() => setPeekRole(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            Hold to see your role
          </button>
        )}
      </footer>

      {peekRole && <div className="shx-overlay"><RoleSheet v={v} /></div>}
      {newIntel && (
        <div className="shx-overlay">
          <span className="eyebrow">Investigation · only you see this</span>
          <h2>{name(newIntel.target!)}</h2>
          <img className="solo" src={`/sh/cards/membership-${newIntel.party}.png`} alt="" />
          <h2 className={tone(newIntel.party)}>{titleCase(newIntel.party ?? '')} party</h2>
          <button className="big primary" style={{ maxWidth: 320 }} onClick={() => { playSfx('click'); setSeenIntel(v.intel.length); }}>Done</button>
        </div>
      )}
      {error && <div className="toast">{error}</div>}
    </div>
  );
}

function Pips({ n, on, color }: { n: number; on: number; color: string }) {
  return <span className="shx-pips" style={seatVar(color)}>{Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : ''} />)}</span>;
}

function RoleSheet({ v }: { v: ShPrivateView }) {
  return (
    <div className="shx-rolesheet">
      <div className="art">
        <img src={roleImg(v)} alt="" />
        <img src={`/sh/cards/membership-${v.party}.png`} alt="" />
      </div>
      <h2 className={tone(v.party)}>{v.role === 'hitler' ? 'You are Hitler' : `You are a ${v.role}`}</h2>
      {v.role === 'liberal' && <p className="dim">You know nobody. Find Hitler.</p>}
      {v.role === 'hitler' && v.known.length === 0 && <p className="dim">You do not know the fascists. They know you.</p>}
      {v.known.length > 0 && (
        <>
          <div className="pl-players-label" style={{ marginBottom: 0 }}>Your team</div>
          <ul className="player-list">
            {v.known.map((k) => (
              <li key={k.seat}>
                <span><span className="swatch" style={{ background: seatHex(v.slots[k.seat]) }} />{v.names[k.seat]}</span>
                <span className="tag">{k.role === 'hitler' ? 'Hitler' : 'Fascist'}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Prompt({ v, busy, act, host }: { v: ShPrivateView; busy: boolean; act: (a: ShAction) => void; host: boolean }) {
  const name = (i: number) => v.names[i];
  const first = v.actions[0];

  if (v.phase === 'over') {
    return (
      <div className="card">
        <span className="eyebrow">{v.winner === v.party ? 'Your side won' : 'Your side lost'}</span>
        <h2 className={tone(v.winner)}>{v.winner === 'liberal' ? 'Liberals win' : 'Fascists win'}</h2>
        <ul className="player-list">
          {v.names.map((n, i) => (
            <li key={i} style={{ justifyContent: 'space-between' }}>
              <span><span className="swatch" style={{ background: seatHex(v.slots[i]) }} />{n}</span>
              <b className={`${tone(v.roles?.[i] === 'liberal' ? 'liberal' : 'fascist')}-t`}>{titleCase(v.roles?.[i] ?? '')}</b>
            </li>
          ))}
        </ul>
        {host && <button className="big primary" onClick={() => { playSfx('click'); socket.send({ type: 'rematch' }); }}>Play again</button>}
      </div>
    );
  }
  if (!v.alive[v.seat]) {
    return (
      <div className="card fill">
        <span className="eyebrow">Executed</span>
        <h2 className="fas">You are dead</h2>
        <p className="dim">Do not speak. Do not reveal your role.</p>
      </div>
    );
  }
  if (!first) return <Waiting v={v} />;

  switch (first.type) {
    case 'ready':
      return <RoleReveal v={v} busy={busy} onReady={() => act({ type: 'ready' })} />;
    case 'nominate':
      return <PlayerPicker v={v} busy={busy} lab="You are the presidential candidate" title="Nominate a Chancellor" verb="Nominate" targets={v.actions.flatMap((a) => (a.type === 'nominate' ? [a.target] : []))} why={(i) => (v.lastGov && (i === v.lastGov.chancellor || i === v.lastGov.president) ? 'Term limited' : '')} onPick={(target) => act({ type: 'nominate', target })} />;
    case 'vote':
      return <Ballot v={v} busy={busy} onVote={(ja) => act({ type: 'vote', ja })} />;
    case 'discard':
      return <PolicyPick busy={busy} lab={`You are President · ${name(v.chancellor!)} is Chancellor`} title="Discard one" sub="The other two go to the Chancellor." verb="Discard" cards={v.hand} onPick={(index) => act({ type: 'discard', index })} />;
    case 'enact':
    case 'veto':
      return (
        <PolicyPick busy={busy} lab={`You are Chancellor · ${name(v.president)} is President`} title="Enact one" sub="The other is discarded face down." verb="Enact" cards={v.hand} onPick={(index) => act({ type: 'enact', index })}>
          {v.actions.some((a) => a.type === 'veto') && <button className="big" disabled={busy} onClick={() => act({ type: 'veto' })}>Ask to veto both</button>}
        </PolicyPick>
      );
    case 'veto_response':
      return (
        <div className="card">
          <span className="eyebrow">Chancellor {name(v.chancellor!)} asks to veto</span>
          <h2>Consent to the veto?</h2>
          <p className="dim">If you consent, both policies are discarded and the election tracker advances.</p>
          <div className="shx-two">
            <button className="big" disabled={busy} onClick={() => act({ type: 'veto_response', consent: false })}>Refuse</button>
            <button className="big primary" disabled={busy} onClick={() => act({ type: 'veto_response', consent: true })}>Consent</button>
          </div>
        </div>
      );
    case 'investigate':
      return <PlayerPicker v={v} busy={busy} lab={`Presidential power · ${titleCase(POWER_LABEL.investigate)}`} title="Investigate a player" verb="Investigate" targets={v.actions.flatMap((a) => (a.type === 'investigate' ? [a.target] : []))} why={(i) => (v.investigated[i] ? 'Already investigated' : '')} onPick={(target) => act({ type: 'investigate', target })} />;
    case 'special_election':
      return <PlayerPicker v={v} busy={busy} lab={`Presidential power · ${titleCase(POWER_LABEL.special_election)}`} title="Choose the next candidate" verb="Choose" targets={v.actions.flatMap((a) => (a.type === 'special_election' ? [a.target] : []))} why={() => ''} onPick={(target) => act({ type: 'special_election', target })} />;
    case 'execute':
      return <PlayerPicker v={v} busy={busy} danger lab={`Presidential power · ${titleCase(POWER_LABEL.execute)}`} title="Execute a player" verb="Execute" targets={v.actions.flatMap((a) => (a.type === 'execute' ? [a.target] : []))} why={() => ''} onPick={(target) => act({ type: 'execute', target })} />;
    case 'peek_ack':
      return (
        <div className="card">
          <span className="eyebrow">Presidential power · {titleCase(POWER_LABEL.peek)}</span>
          <h2>The top three</h2>
          <div className="shx-cards three">
            {(v.peek ?? []).map((p, i) => (
              <div key={i}><img src={policyImg(p)} alt={policyName(p)} /><span>{i === 0 ? 'Next' : i === 1 ? 'Second' : 'Third'}</span></div>
            ))}
          </div>
          <p className="dim">Only you see this. The order does not change.</p>
          <button className="big primary" disabled={busy} onClick={() => act({ type: 'peek_ack' })}>Done</button>
        </div>
      );
    default:
      return <Waiting v={v} />;
  }
}

function Waiting({ v }: { v: ShPrivateView }) {
  const name = (i: number) => v.names[i];
  let lab = 'Wait';
  let title = 'Watch the screen';
  let sub = '';
  switch (v.phase) {
    case 'roles':
      lab = 'You are ready';
      title = 'Waiting for the others';
      sub = v.names.filter((_, i) => !v.ready[i]).join(', ');
      break;
    case 'nominate': lab = 'Election'; title = `${name(v.president)} is choosing a Chancellor`; break;
    case 'vote':
      lab = `Your vote is in: ${v.myVote ? 'ja' : 'nein'}`;
      title = 'Waiting for votes';
      sub = v.names.filter((_, i) => v.alive[i] && !v.voted[i]).join(', ');
      break;
    case 'president_discard': lab = 'Legislative session'; title = `President ${name(v.president)} is choosing`; sub = v.seat === v.chancellor ? 'You are next. Say nothing.' : 'Silence until a policy is enacted.'; break;
    case 'chancellor_enact': lab = 'Legislative session'; title = `Chancellor ${name(v.chancellor!)} is choosing`; sub = 'Silence until a policy is enacted.'; break;
    case 'veto_response': lab = 'Veto'; title = `President ${name(v.president)} must answer`; break;
    case 'power': lab = 'Presidential power'; title = `${name(v.president)}: ${v.power ? titleCase(POWER_LABEL[v.power]) : ''}`; break;
  }
  return (
    <div className="card fill">
      <span className="eyebrow">{lab}</span>
      <h2>{title}</h2>
      {sub && <p className="dim">{sub}</p>}
    </div>
  );
}

function RoleReveal({ v, busy, onReady }: { v: ShPrivateView; busy: boolean; onReady: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <span className="eyebrow">Your secret role</span>
        <h2>Open your envelope</h2>
        <button className="shx-env" onClick={() => { playSfx('shuffle'); setOpen(true); }} aria-label="Open envelope"><img src="/sh/cards/role-back.jpg" alt="" /></button>
        <p className="dim">Make sure nobody can see your screen.</p>
        <button className="big primary" onClick={() => { playSfx('shuffle'); setOpen(true); }}>Open</button>
      </div>
    );
  }
  return (
    <div className="card">
      <RoleSheet v={v} />
      <button className="big primary" disabled={busy} onClick={onReady}>Ready</button>
    </div>
  );
}

function PlayerPicker({ v, busy, lab, title, verb, targets, why, onPick, danger }: { v: ShPrivateView; busy: boolean; lab: string; title: string; verb: string; targets: number[]; why: (i: number) => string; onPick: (seat: number) => void; danger?: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const others = v.names.map((_, i) => i).filter((i) => i !== v.seat);
  const chosen = sel !== null && targets.includes(sel) ? sel : null;
  return (
    <div className="card">
      <span className="eyebrow">{lab}</span>
      <h2>{title}</h2>
      <div className="shx-players">
        {others.map((i) => {
          const ok = targets.includes(i);
          const note = !v.alive[i] ? 'Executed' : ok ? (v.notHitler[i] ? 'Not Hitler' : v.ai[i] ? 'Claude' : '') : why(i) || 'Not eligible';
          return (
            <button key={i} className={chosen === i ? 'sel' : ''} style={seatVar(seatHex(v.slots[i]))} disabled={!ok || busy} onClick={() => { playSfx('click'); setSel(i); }}>
              <b>{v.names[i]}</b>
              <span>{note}</span>
            </button>
          );
        })}
      </div>
      <button className={`big ${danger ? 'shx-danger' : 'primary'}`} disabled={chosen === null || busy} onClick={() => chosen !== null && onPick(chosen)}>
        {chosen === null ? 'Choose a player' : `${verb} ${v.names[chosen]}`}
      </button>
    </div>
  );
}

function Ballot({ v, busy, onVote }: { v: ShPrivateView; busy: boolean; onVote: (ja: boolean) => void }) {
  const [sel, setSel] = useState<boolean | null>(null);
  return (
    <div className="card">
      <span className="eyebrow">Vote on the government</span>
      <h2><span style={{ color: seatHex(v.slots[v.president]) }}>{v.names[v.president]}</span> + <span style={{ color: seatHex(v.slots[v.chancellor!]) }}>{v.names[v.chancellor!]}</span></h2>
      <p className="dim">President and Chancellor.{v.fascist >= 3 ? ' If the Chancellor is Hitler, the fascists win.' : ''}</p>
      <div className="shx-ballots">
        <button className={sel === true ? 'sel' : sel === false ? 'dim' : ''} disabled={busy} onClick={() => { playSfx('click'); setSel(true); }}><img src="/sh/cards/ballot-ja.png" alt="Ja" /></button>
        <button className={sel === false ? 'sel' : sel === true ? 'dim' : ''} disabled={busy} onClick={() => { playSfx('click'); setSel(false); }}><img src="/sh/cards/ballot-nein.png" alt="Nein" /></button>
      </div>
      <button className="big primary" disabled={sel === null || busy} onClick={() => sel !== null && onVote(sel)}>
        {sel === null ? 'Choose a ballot' : `Cast ${sel ? 'ja' : 'nein'}`}
      </button>
    </div>
  );
}

function PolicyPick({ busy, lab, title, sub, verb, cards, onPick, children }: { busy: boolean; lab: string; title: string; sub: string; verb: string; cards: Policy[]; onPick: (index: number) => void; children?: ReactNode }) {
  const [sel, setSel] = useState<number | null>(null);
  const key = useMemo(() => cards.join(''), [cards]);
  useEffect(() => setSel(null), [key]);
  return (
    <div className="card">
      <span className="eyebrow">{lab}</span>
      <h2>{title}</h2>
      <p className="dim">{sub}</p>
      <div className={`shx-cards ${cards.length === 3 ? 'three' : 'two'}`}>
        {cards.map((p, i) => (
          <button key={i} className={sel === i ? 'sel' : sel !== null ? 'dim' : ''} disabled={busy} onClick={() => { playSfx('click'); setSel(i); }}>
            <img src={policyImg(p)} alt={policyName(p)} />
          </button>
        ))}
      </div>
      <button className="big primary" disabled={sel === null || busy} onClick={() => sel !== null && onPick(sel)}>
        {sel === null ? 'Choose a policy' : `${verb} ${policyName(cards[sel])}`}
      </button>
      {children}
    </div>
  );
}

function ClaimPanel({ v, slot, onClaim, onSkip }: { v: ShPrivateView; slot: ClaimSlot; onClaim: (value: string) => void; onSkip: () => void }) {
  const title = slot.kind === 'drew' ? 'Tell the table what you drew' : slot.kind === 'got' ? 'Tell the table what you were passed' : slot.kind === 'peek' ? 'Tell the table what you saw' : `Tell the table about ${v.names[slot.target ?? 0]}`;
  return (
    <div className="card">
      <span className="eyebrow">Public claim · you may lie</span>
      <h3>{title}</h3>
      <div className="shx-claims">
        {CLAIM_VALUES[slot.kind].map((value) => (
          <button key={value} onClick={() => onClaim(value)}>
            {slot.kind === 'inv' ? titleCase(value) : value.split('').map((c, i) => <i key={i} className={c === 'L' ? '' : 'fas'} />)}
          </button>
        ))}
      </div>
      <button className="shx-link" onClick={onSkip}>Say nothing</button>
    </div>
  );
}
