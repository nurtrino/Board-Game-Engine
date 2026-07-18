// Everdell player device: the full personal tableau on one no-scroll page —
// city grid, hand row, resource ledger, meadow strip, worker placement,
// season/pass controls, every pending decision as an explicit prompt, card
// close-ups with authentic art, and an explicit END TURN. Legality mirrors
// the engine (everdellPlayCost / everdellCanPlace / everdellCityRoomFor) so
// illegal options grey out with a reason instead of bouncing errors.

import { useEffect, useMemo, useState } from 'react';
import type {
  EverdellAction, EverdellView, EvLocRef, EvPending, EvPlayAbility, EvResMap, EvResource,
  EverdellState, EvCardDef,
} from '@bge/shared';
import {
  EV_BASIC_EVENT_BY_ID, EV_BASIC_LOCATIONS, EV_CARD_BY_ID, EV_CARDS, EV_FOREST,
  EV_FOREST_BY_ID, EV_JOURNEY, EV_RESOURCES, EV_SPECIAL_BY_ID,
  everdellCanPlace, everdellCityRoomFor, everdellPlayCost, EVERDELL_SEAT_HEX,
} from '@bge/shared';
import { playSfx } from '../sfx';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { cardImg, forestImg, specialEventImg } from './ev-assets';
import { ResIcon } from './EvIcons';
import { EvBoardMap } from './EvBoardMap';
import './everdell.css';

const EVERDELL_INTRO: Intro = {
  title: 'Everdell',
  tagline: 'Build a city of critters and constructions beneath the Ever Tree.',
  goal: 'Score the most points by playing cards into your city, working the board, and achieving events across one year: winter to autumn. Points come from card values, point tokens, purple prosperity bonuses, the Journey, and events.',
  points: [
    { label: 'One action per turn', detail: 'Place a worker, play a card, or prepare for the next season. Then press END TURN.' },
    { label: 'Workers', detail: 'Deploy to board locations, forest cards, events, the Haven, or destination cards. They return when you Prepare for Season.' },
    { label: 'Playing cards', detail: 'Pay twigs, resin, pebbles, and berries to play from your hand or the shared Meadow. Constructions grant their matching critter for free.' },
    { label: 'Seasons', detail: 'Preparing brings workers back and grows your workforce: spring and autumn re-run your green production, summer draws from the Meadow.' },
    { label: 'City limit', detail: '15 spaces. Uniques are one-per-city. The Wanderer takes no space; Gatherer and Harvester can share one.' },
    { label: 'Game end', detail: 'Autumn is the last season. When you are done, pass; when all players have passed the highest score wins.' },
  ],
  rulebook: '/everdell/rulebook.pdf',
  walkthrough: [
    { title: 'Your one action', body: 'Each turn you do exactly ONE thing: PLACE WORKER, play a card (tap it in your hand or the Meadow), or PREPARE FOR SEASON. Afterwards press END TURN to hand play on.' },
    { title: 'Placing workers', body: 'Tap PLACE WORKER for the full list of open spots: board locations gather resources, forest cards are stronger, events score, the Haven turns spare cards into resources, and in autumn the Journey turns cards into points.' },
    { title: 'Playing a card', body: 'Tap any card to read it big. The play options show every way to afford it: pay the cost, use a matching construction for a free critter, or a discount from cards like the Crane, Innkeeper, Judge, or Dungeon.' },
    { title: 'Green, red, purple', body: 'Green production pays out when played and again in spring and autumn. Red destinations are spots your workers (and open ones, opponents) can visit. Purple prosperity scores bonuses at the end. Blue governance gives ongoing perks.' },
    { title: 'Seasons and passing', body: 'Out of workers and options? PREPARE FOR SEASON: workers return and your workforce grows. Autumn is last: when you are done for the year press PASS. Highest score wins.' },
  ],
};

interface Props {
  view: EverdellView;
  act: (a: EverdellAction) => void;
  seat: number;
  error: string | null;
}

/** The view, shaped like an engine state for the shared legality helpers. */
function pseudoState(view: EverdellView): EverdellState {
  return {
    ...view,
    deck: new Array(view.deckCount).fill('?'),
    discard: new Array(view.discardCount).fill('?'),
    pending: view.pending ? [view.pending] : [],
  } as unknown as EverdellState;
}

const RES_NAME: Record<string, string> = { twig: 'TWIG', resin: 'RESIN', pebble: 'PEBBLE', berry: 'BERRY' };

function CostChips({ cost, size = 13 }: { cost: EvResMap; size?: number }) {
  const parts = EV_RESOURCES.filter((r) => (cost[r] ?? 0) > 0);
  if (parts.length === 0) return <span style={{ opacity: 0.7 }}>FREE</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
      {parts.map((r) => (
        <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <b>{cost[r]}</b><ResIcon kind={r} size={size} />
        </span>
      ))}
    </span>
  );
}

/** Allocate a blanket discount: shortfalls first, then the biggest costs. */
function autoDiscount(cost: Record<EvResource, number>, res: Record<EvResource, number>, cap: number): EvResMap {
  const out: EvResMap = {};
  let left = cap;
  for (const r of EV_RESOURCES) {
    const short = Math.max(0, cost[r] - res[r]);
    const use = Math.min(short, left, cost[r]);
    if (use > 0) { out[r] = use; left -= use; }
  }
  for (const r of EV_RESOURCES) {
    const already = out[r] ?? 0;
    const use = Math.min(left, cost[r] - already);
    if (use > 0) { out[r] = already + use; left -= use; }
  }
  return out;
}

function applyDisc(cost: Record<EvResource, number>, disc: EvResMap): EvResMap {
  const out: EvResMap = {};
  for (const r of EV_RESOURCES) out[r] = Math.max(0, cost[r] - (disc[r] ?? 0));
  return out;
}

function canAfford(res: Record<EvResource, number>, cost: EvResMap): boolean {
  return EV_RESOURCES.every((r) => res[r] >= (cost[r] ?? 0));
}

/** Resource allocation steppers (gain-any, monastery give, new management…). */
function ResSteppers({ value, onChange, max, limits }: {
  value: EvResMap; onChange: (v: EvResMap) => void; max: number;
  limits?: Partial<Record<EvResource, number>>;
}) {
  const total = EV_RESOURCES.reduce((a, r) => a + (value[r] ?? 0), 0);
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {EV_RESOURCES.map((r) => (
        <span key={r} className="ev-stepper">
          <ResIcon kind={r} size={16} />
          <button onClick={() => onChange({ ...value, [r]: Math.max(0, (value[r] ?? 0) - 1) })}>−</button>
          <b>{value[r] ?? 0}</b>
          <button
            disabled={total >= max || (limits && (value[r] ?? 0) >= (limits[r] ?? Infinity))}
            onClick={() => onChange({ ...value, [r]: (value[r] ?? 0) + 1 })}>+</button>
        </span>
      ))}
    </div>
  );
}

/** Pick N cards out of a list (hand discards, journey, bard…). */
function CardPicker({ cards, min, max, onDone, doneLabel, onSkip, skipLabel }: {
  cards: string[]; min: number; max: number;
  onDone: (picked: string[]) => void; doneLabel: string;
  onSkip?: () => void; skipLabel?: string;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < max ? [...p, i] : p));
  return (
    <>
      <div className="ev-picks">
        {cards.map((c, i) => (
          <button key={`${c}:${i}`} className={`ev-pick${picked.includes(i) ? ' sel' : ''}`}
            style={{ backgroundImage: `url(${cardImg(c)})` }}
            onClick={() => toggle(i)} aria-label={EV_CARD_BY_ID[c]?.name ?? c} />
        ))}
      </div>
      <div className="row">
        <button className="ev-btn primary" disabled={picked.length < min}
          onClick={() => onDone(picked.map((i) => cards[i]))}>
          {doneLabel} ({picked.length})
        </button>
        {onSkip && <button className="ev-btn" onClick={onSkip}>{skipLabel ?? 'SKIP'}</button>}
      </div>
    </>
  );
}

function OpponentButtons({ view, seat, onPick, disabledIf }: {
  view: EverdellView; seat: number; onPick: (s: number) => void;
  disabledIf?: (s: number) => string | null;
}) {
  return (
    <div className="row">
      {view.players.filter((p) => p.seat !== seat).map((p) => {
        const why = disabledIf?.(p.seat) ?? null;
        return (
          <button key={p.seat} className="ev-btn" disabled={!!why}
            title={why ?? undefined}
            style={{ borderColor: EVERDELL_SEAT_HEX[p.color] }}
            onClick={() => onPick(p.seat)}>
            {p.name.toUpperCase()}{why ? ` · ${why}` : ''}
          </button>
        );
      })}
    </div>
  );
}

export default function EverdellPlay({ view, act, seat, error }: Props) {
  const me = view.players[seat];
  const s = useMemo(() => pseudoState(view), [view]);
  const [closeup, setCloseup] = useState<{ card: string; source: 'hand' | 'meadow' | 'city' | 'ref'; meadowIndex?: number } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [eventView, setEventView] = useState<{ img: string; name: string; sub: string } | null>(null);
  const [showHand, setShowHand] = useState(false);
  const [intro, setIntro] = useState(false);
  const [confirmPass, setConfirmPass] = useState(false);
  const [oppSeat, setOppSeat] = useState<number | null>(null);

  useEffect(() => {
    if (error) playSfx('error'); // device blips on rejected actions (house rule)
  }, [error]);

  if (!me) return <div className="page center"><h2>Watching the board</h2></div>;

  const hex = EVERDELL_SEAT_HEX[me.color];
  const pending = view.pending && view.pending.seat === seat ? view.pending : null;
  const waitingOnOther = view.pending && view.pending.seat !== seat;
  const myTurn = view.phase === 'playing' && view.turn === seat && !view.pending;
  const canAct = myTurn && !view.turnDone && !me.passed;
  const workersFree = me.workersTotal - me.workers.length;

  const doAct = (a: EverdellAction) => { playSfx('click'); act(a); };
  const choose = (payload: Record<string, unknown>) => doAct({ type: 'choose', ...payload } as EverdellAction);

  const statusLine = view.phase === 'ended'
    ? `${view.winners.map((w) => view.players[w].name.toUpperCase()).join(' · ')} WINS`
    : pending ? 'YOUR DECISION'
    : waitingOnOther ? `${view.players[view.pending!.seat].name.toUpperCase()} IS DECIDING`
    : me.passed ? 'PASSED · YEAR OVER FOR YOU'
    : view.turn === seat
      ? (view.turnDone ? 'ACTION DONE · PRESS END TURN' : 'YOUR TURN · ONE ACTION')
      : `${view.players[view.turn].name.toUpperCase()} TO PLAY`;

  // ---------- card close-up ----------
  const renderCloseup = () => {
    if (!closeup) return null;
    const def = EV_CARD_BY_ID[closeup.card];
    if (!def) return null;
    const playable = canAct && (closeup.source === 'hand' || closeup.source === 'meadow');
    return (
      <div className="ev-overlay" onClick={() => setCloseup(null)}>
        <div className="ev-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="ev-closeup">
            <img className="big" src={cardImg(def.id)} alt={def.name} data-testid="ev-closeup-img" />
            <div className="side">
              <h3>{def.name.toUpperCase()} · {def.rarity.toUpperCase()} {def.kind.toUpperCase()}</h3>
              <div className="row" style={{ font: '700 12px Inter, sans-serif' }}>
                COST <CostChips cost={def.cost} /> · {def.points} PTS · {def.color.toUpperCase()}
              </div>
              {playable ? (
                <PlayOptions view={view} s={s} seat={seat} def={def}
                  source={closeup.source as 'hand' | 'meadow'} meadowIndex={closeup.meadowIndex}
                  onPlay={(a) => { setCloseup(null); doAct(a); }} />
              ) : (
                <small className="dim" style={{ letterSpacing: 0.4 }}>
                  {closeup.source === 'city' ? 'IN A CITY' : closeup.source === 'ref' ? 'REFERENCE' :
                    view.turnDone ? 'ACTION ALREADY TAKEN · END TURN' :
                    view.pending ? 'RESOLVE THE PENDING DECISION FIRST' : 'NOT YOUR TURN'}
                </small>
              )}
              <button className="ev-btn" onClick={() => setCloseup(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ---------- worker placement: the real board, tappable ----------
  const renderPlacing = () => {
    if (!placing) return null;
    return (
      <div className="ev-overlay" onClick={() => setPlacing(false)}>
        <div className="ev-sheet" onClick={(e) => e.stopPropagation()} data-testid="ev-place-sheet">
          <h3>PLACE A WORKER · {workersFree} FREE · TAP A GLOWING SPOT</h3>
          <EvBoardMap view={view} seat={seat}
            groups={{ basics: true, forest: true, haven: true, journey: true, dests: true, events: true }}
            check={(loc) => (workersFree < 1 ? 'no workers available' : everdellCanPlace(s, seat, loc))}
            onPick={(loc) => { setPlacing(false); doAct({ type: 'place_worker', loc }); }} />
          <button className="ev-btn" onClick={() => setPlacing(false)}>CLOSE</button>
        </div>
      </div>
    );
  };

  // ---------- pending decisions ----------
  const renderPending = () => {
    if (!pending) return null;
    return (
      <div className="ev-overlay">
        <div className="ev-sheet" data-testid="ev-pending-sheet">
          <PendingUI view={view} s={s} seat={seat} pending={pending} me={me} choose={choose} />
        </div>
      </div>
    );
  };

  // ---------- whole hand grouped ----------
  const renderHand = () => {
    if (!showHand) return null;
    const groups = new Map<string, number>();
    for (const c of me.hand) groups.set(c, (groups.get(c) ?? 0) + 1);
    return (
      <div className="ev-overlay" onClick={() => setShowHand(false)}>
        <div className="ev-sheet" onClick={(e) => e.stopPropagation()}>
          <h3>YOUR HAND · {me.hand.length}/8</h3>
          <div className="ev-picks">
            {[...groups.entries()].map(([c, n]) => (
              <button key={c} className="ev-pick" style={{ backgroundImage: `url(${cardImg(c)})`, width: 128 }}
                onClick={() => { setShowHand(false); setCloseup({ card: c, source: 'hand' }); }} aria-label={EV_CARD_BY_ID[c]?.name}>
                {n > 1 && <span style={{
                  position: 'absolute', right: 3, bottom: 3, background: 'rgba(10,12,15,0.85)',
                  color: '#e8ebf0', font: '800 10px Inter', padding: '1px 5px', borderRadius: 4,
                }}>×{n}</span>}
              </button>
            ))}
            {me.hand.length === 0 && <span className="dim">EMPTY HAND</span>}
          </div>
          <button className="ev-btn" onClick={() => setShowHand(false)}>CLOSE</button>
        </div>
      </div>
    );
  };

  // spaceless cards (Wanderer) still show in the city zone after the 15 slots
  const citySlots = Array.from({ length: 15 }, (_, i) => me.city.filter((c) => !EV_CARD_BY_ID[c.card]?.noSpace)[i] ?? null);
  const spaceless = me.city.filter((c) => EV_CARD_BY_ID[c.card]?.noSpace);

  return (
    <div className="ev-play" style={{ ['--seat' as never]: hex }} data-testid="ev-play">
      <header className="ev-head">
        <span className="ev-id">{me.color.toUpperCase()} · {me.name.toUpperCase()}</span>
        <span className="ev-season" data-testid="ev-season">{me.season.toUpperCase()} · {workersFree}/{me.workersTotal} WORKERS</span>
        <span className="ev-ledger" data-testid="ev-ledger">
          {EV_RESOURCES.map((r) => (
            <span key={r} className="led"><b>{me.res[r]}</b><ResIcon kind={r} size={15} /></span>
          ))}
          <span className="led"><b>{me.points}</b><ResIcon kind="point" size={15} /></span>
        </span>
        <span className={'ev-status' + (myTurn || pending ? ' active' : '')} aria-live="polite" data-testid="ev-status">{statusLine}</span>
        <button className="ev-btn" onClick={() => setShowHand(true)} data-tour="hand-all">HAND</button>
        <button className="ev-btn" onClick={() => setIntro(true)} aria-label="How to play">?</button>
        <button className={'ev-btn' + (view.turnDone && view.turn === seat ? ' primary' : '')}
          disabled={!(view.turnDone && view.turn === seat && !view.pending)}
          onClick={() => doAct({ type: 'end_turn' })} data-testid="ev-end-turn" data-tour="end-turn">
          END TURN
        </button>
      </header>

      <div className="ev-main">
        <aside className="ev-rail" data-testid="ev-rail">
          <div className="ev-rail-label">ACTIONS</div>
          {waitingOnOther && (
            <div className="ev-prompt"><b>WAITING</b>{view.players[view.pending!.seat].name.toUpperCase()} IS DECIDING</div>
          )}
          <div className="ev-acts">
            <button className="ev-act" disabled={!canAct || workersFree < 1}
              onClick={() => setPlacing(true)} data-tour="place-worker">
              PLACE WORKER
              <small>{workersFree < 1 ? 'No workers available' : `${workersFree} available · board, forest, events`}</small>
            </button>
            <button className="ev-act" disabled={!canAct || me.season === 'autumn'}
              onClick={() => doAct({ type: 'prepare' })} data-tour="prepare">
              PREPARE FOR SEASON
              <small>{me.season === 'autumn' ? 'Autumn is the last season' : 'Recall workers, grow the workforce'}</small>
            </button>
            {confirmPass ? (
              <div className="row">
                <button className="ev-act warn" style={{ flex: 1 }} onClick={() => { setConfirmPass(false); doAct({ type: 'pass' }); }}>
                  CONFIRM PASS<small>Ends your year for good</small>
                </button>
                <button className="ev-btn" onClick={() => setConfirmPass(false)}>KEEP PLAYING</button>
              </div>
            ) : (
              <button className="ev-act" disabled={!canAct || me.season !== 'autumn'}
                onClick={() => setConfirmPass(true)} data-tour="pass">
                PASS
                <small>{me.season !== 'autumn' ? 'Only in autumn' : 'Finish your year'}</small>
              </button>
            )}
          </div>
          <div className="ev-rail-label">EVENTS · TAP TO READ</div>
          <div className="ev-events-strip" data-testid="ev-events-strip">
            {view.basicEvents.map((e) => {
              const d = EV_BASIC_EVENT_BY_ID[e.id];
              const claimed = e.claimedBy !== null;
              return (
                <button key={e.id}
                  className={'ev-event-thumb tile' + (claimed ? ' claimed' : '')}
                  style={claimed ? { ['--claim' as never]: EVERDELL_SEAT_HEX[view.players[e.claimedBy!].color] } : undefined}
                  onClick={() => setEventView({
                    img: d.img,
                    name: d.name.toUpperCase(),
                    sub: claimed
                      ? `ACHIEVED BY ${view.players[e.claimedBy!].name.toUpperCase()}`
                      : `${d.count} ${d.requiresColor.toUpperCase()} CARDS · ${d.points} PTS`,
                  })}
                  aria-label={d.name}>
                  <img src={d.img} alt={d.name} />
                </button>
              );
            })}
            {view.specialEvents.map((e) => {
              const d = EV_SPECIAL_BY_ID[e.id];
              const claimed = e.claimedBy !== null;
              const req = d.requiresCards
                ? d.requiresCards.map((id) => EV_CARD_BY_ID[id]?.name.toUpperCase() ?? id).join(' + ')
                : '2 OF EACH COLOR';
              return (
                <button key={e.id}
                  className={'ev-event-thumb' + (claimed ? ' claimed' : '')}
                  style={claimed ? { ['--claim' as never]: EVERDELL_SEAT_HEX[view.players[e.claimedBy!].color] } : undefined}
                  onClick={() => setEventView({
                    img: specialEventImg(e.id),
                    name: d.name.toUpperCase(),
                    sub: claimed ? `ACHIEVED BY ${view.players[e.claimedBy!].name.toUpperCase()}` : req,
                  })}
                  aria-label={d.name}>
                  <img src={specialEventImg(e.id)} alt={d.name} />
                </button>
              );
            })}
          </div>
          <div className="ev-rail-label">OPPONENTS</div>
          <div className="ev-opps" data-testid="ev-opps">
            {view.players.filter((p) => p.seat !== seat).map((p) => (
              <button key={p.seat} className="ev-opp" style={{ borderColor: EVERDELL_SEAT_HEX[p.color] }}
                onClick={() => setOppSeat(p.seat)}>
                <span className="nm">{p.name.toUpperCase()}{p.passed ? ' · PASSED' : ''}</span>
                <span className="ln">{p.season.toUpperCase()} · {p.workersTotal - p.workers.length}/{p.workersTotal} WORKERS · HAND {p.handCount}</span>
                <span className="ln">
                  {EV_RESOURCES.map((r) => (
                    <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 6 }}>
                      {p.res[r]}<ResIcon kind={r} size={11} />
                    </span>
                  ))}
                  {p.points}<ResIcon kind="point" size={11} />
                </span>
                <span className="ln dim">CITY {p.city.length} · TAP TO BROWSE</span>
              </button>
            ))}
          </div>
          <span className="ev-rail-city-note">DECK {view.deckCount} · DISCARD {view.discardCount} · TAP ANY CARD TO READ IT</span>
        </aside>

        <section className="ev-center">
          <div className="ev-zone-label" data-testid="ev-city-label">
            <span>YOUR CITY · {me.city.filter((c) => !EV_CARD_BY_ID[c.card]?.noSpace).length}/15</span>
            {spaceless.length > 0 && <span>NO-SPACE: {spaceless.map((c) => EV_CARD_BY_ID[c.card]?.name.toUpperCase()).join(' · ')}</span>}
          </div>
          <div className="ev-city" data-testid="ev-city">
            {citySlots.map((cc, i) => (
              <div key={cc ? `u${cc.uid}` : `empty-${i}`} className={'ev-slot' + (cc ? ' filled' : '')}
                onClick={cc ? () => setCloseup({ card: cc.card, source: 'city' }) : undefined}>
                {cc && (
                  <>
                    <img src={cardImg(cc.card)} alt={EV_CARD_BY_ID[cc.card]?.name ?? cc.card} />
                    {cc.sharedWith && <img className="ev-city-shared" src={cardImg(cc.sharedWith)} alt={cc.sharedWith}
                      style={{ position: 'absolute', right: -3, bottom: -3, border: '1px solid rgba(255,255,255,0.5)', borderRadius: 5 }} />}
                    {cc.occupiedUsed && <span className="used">USED</span>}
                    {cc.storedPoints > 0 && <span className="ev-badge pts">{cc.storedPoints}</span>}
                    {(cc.storedRes.twig + cc.storedRes.resin + cc.storedRes.pebble + cc.storedRes.berry) > 0 && (
                      <span className="ev-badge" style={{ background: '#8a6a42', color: '#fff', top: 'auto', bottom: 3 }}>
                        {cc.storedRes.twig + cc.storedRes.resin + cc.storedRes.pebble + cc.storedRes.berry}
                      </span>
                    )}
                    {cc.prisoners.length > 0 && <span className="ev-badge pri">{cc.prisoners.length}</span>}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="ev-zone-label"><span>MEADOW · SHARED</span><span>PLAY FROM HERE TOO</span></div>
          <div className="ev-meadow-row" data-testid="ev-meadow">
            {view.meadow.map((m, i) => (
              m
                ? <button key={`${i}:${m}`} className="ev-mcard" style={{ backgroundImage: `url(${cardImg(m)})` }}
                    onClick={() => setCloseup({ card: m, source: 'meadow', meadowIndex: i })}
                    aria-label={EV_CARD_BY_ID[m]?.name ?? m} />
                : <span key={`empty${i}`} className="ev-mcard" style={{ opacity: 0.2, cursor: 'default' }} />
            ))}
          </div>
        </section>
      </div>

      <div className="ev-hand-wrap">
        <div className="ev-zone-label"><span>HAND · {me.hand.length}/8</span></div>
        <div className="ev-hand" data-testid="ev-hand" data-tour="hand">
          {me.hand.map((c, i) => (
            <button key={`${c}:${i}`} className="ev-hcard" style={{ backgroundImage: `url(${cardImg(c)})` }}
              onClick={() => setCloseup({ card: c, source: 'hand' })} aria-label={EV_CARD_BY_ID[c]?.name ?? c} />
          ))}
          {me.hand.length === 0 && <span className="dim" style={{ font: '600 11px Inter', alignSelf: 'center' }}>EMPTY HAND</span>}
        </div>
      </div>

      {renderCloseup()}
      {renderPlacing()}
      {renderPending()}
      {renderHand()}
      {eventView && (
        <div className="ev-overlay" onClick={() => setEventView(null)}>
          <div className="ev-sheet" onClick={(e) => e.stopPropagation()} data-testid="ev-event-view">
            <h3>{eventView.name}</h3>
            <small className="dim" style={{ font: '700 11px Inter, sans-serif', letterSpacing: 0.5 }}>{eventView.sub}</small>
            <img src={eventView.img} alt={eventView.name} style={{ maxWidth: 'min(420px, 80vw)', borderRadius: 10 }} />
            <button className="ev-btn" onClick={() => setEventView(null)}>CLOSE</button>
          </div>
        </div>
      )}
      {oppSeat !== null && (() => {
        const p = view.players[oppSeat];
        if (!p) return null;
        return (
          <div className="ev-overlay" onClick={() => setOppSeat(null)}>
            <div className="ev-sheet" onClick={(e) => e.stopPropagation()} data-testid="ev-opp-city">
              <h3 style={{ color: EVERDELL_SEAT_HEX[p.color] }}>
                {p.name.toUpperCase()} · {p.season.toUpperCase()} · CITY {p.city.filter((c) => !EV_CARD_BY_ID[c.card]?.noSpace).length}/15
              </h3>
              <div className="ev-picks">
                {p.city.map((cc) => (
                  <button key={cc.uid} className="ev-pick" style={{ backgroundImage: `url(${cardImg(cc.card)})`, width: 108 }}
                    onClick={() => { setOppSeat(null); setCloseup({ card: cc.card, source: 'ref' }); }}
                    aria-label={EV_CARD_BY_ID[cc.card]?.name ?? cc.card}>
                    {cc.sharedWith && (
                      <img src={cardImg(cc.sharedWith)} alt={cc.sharedWith}
                        style={{ position: 'absolute', right: -4, bottom: -4, width: '58%', borderRadius: 5, border: '1px solid rgba(255,255,255,0.5)' }} />
                    )}
                    {cc.storedPoints > 0 && <span className="ev-badge pts">{cc.storedPoints}</span>}
                    {cc.prisoners.length > 0 && <span className="ev-badge pri">{cc.prisoners.length}</span>}
                  </button>
                ))}
                {p.city.length === 0 && <span className="dim">NO CARDS YET</span>}
              </div>
              <button className="ev-btn" onClick={() => setOppSeat(null)}>CLOSE</button>
            </div>
          </div>
        );
      })()}
      {intro && <GameIntro intro={EVERDELL_INTRO} onClose={() => setIntro(false)} />}
      {view.phase === 'ended' && (
        <div className="ev-end" role="alert" data-testid="ev-play-end">
          <div className="ev-end-title">
            {view.winners.map((w) => view.players[w].name.toUpperCase()).join(' · ')} WINS
          </div>
          <div className="ev-end-scores">
            {[...view.players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((p) => (
              <div key={p.seat} className="ev-end-row ig-glass" style={{ borderColor: EVERDELL_SEAT_HEX[p.color] }}>
                <b>{p.name.toUpperCase()}{p.seat === seat ? ' · YOU' : ''}</b>
                <span>{p.score} PTS</span>
                {p.scoreParts && (
                  <small>
                    CARDS {p.scoreParts.cards} · TOKENS {p.scoreParts.tokens} · PROSPERITY {p.scoreParts.prosperity} · JOURNEY {p.scoreParts.journey} · EVENTS {p.scoreParts.events}
                  </small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <div className="ev-toast" role="alert">{error}</div>}
    </div>
  );
}

// ---------- play options (payment + abilities) ----------

function PlayOptions({ view, s, seat, def, source, meadowIndex, onPlay }: {
  view: EverdellView; s: EverdellState; seat: number; def: EvCardDef;
  source: 'hand' | 'meadow'; meadowIndex?: number;
  onPlay: (a: EverdellAction) => void;
}) {
  const me = view.players[seat];
  const [ability, setAbility] = useState<EvPlayAbility>({ kind: 'none' });
  const [judgeFrom, setJudgeFrom] = useState<EvResource>('berry');
  const [judgeTo, setJudgeTo] = useState<EvResource>('twig');
  const [foolTarget, setFoolTarget] = useState<number | null>(null);
  const [payTo, setPayTo] = useState<number | null>(null);
  const [prisonerUid, setPrisonerUid] = useState<number | null>(null);
  const [manualDisc, setManualDisc] = useState<EvResMap | null>(null);

  const roomWhy = everdellCityRoomFor(s, seat, def);
  const isFool = def.id === 'fool';
  const isRuins = def.id === 'ruins';

  // available abilities with effective costs
  const options: { key: string; label: string; sub: string; ability: EvPlayAbility; cost: EvResMap | null }[] = [];
  options.push({ key: 'none', label: 'PAY THE COST', sub: '', ability: { kind: 'none' }, cost: { ...def.cost } });
  if (def.kind === 'critter') {
    for (const cc of me.city) {
      const host = EV_CARD_BY_ID[cc.card];
      if (!host || host.kind !== 'construction' || cc.occupiedUsed) continue;
      const links = host.link === 'harvester-gatherer' ? ['harvester', 'gatherer'] : [host.link];
      if (links.includes(def.id)) {
        options.push({ key: `occ${cc.uid}`, label: `FREE VIA ${host.name.toUpperCase()}`, sub: 'Places an occupied token', ability: { kind: 'occupied', uid: cc.uid }, cost: {} });
      } else if (host.link === 'any' && cc.card === 'ever-tree') {
        options.push({ key: `tree${cc.uid}`, label: 'FREE VIA EVER TREE', sub: 'Places an occupied token', ability: { kind: 'evertree', uid: cc.uid }, cost: {} });
      }
    }
    const inn = me.city.find((c) => c.card === 'innkeeper');
    if (inn) {
      const cost = everdellPlayCost(me as never, def, { kind: 'innkeeper', uid: inn.uid });
      options.push({ key: 'innkeeper', label: 'INNKEEPER · −3 BERRIES', sub: 'Discards your Innkeeper', ability: { kind: 'innkeeper', uid: inn.uid }, cost });
    }
    const dungeon = me.city.find((c) => c.card === 'dungeon');
    if (dungeon) {
      const disc = manualDisc ?? autoDiscount(def.cost, me.res, 3);
      options.push({
        key: 'dungeon', label: 'DUNGEON · −3 ANY', sub: 'Imprison a critter from your city',
        ability: { kind: 'dungeon', uid: dungeon.uid, prisonerUid: prisonerUid ?? -1, discount: disc },
        cost: applyDisc(def.cost, disc),
      });
    }
  }
  if (def.kind === 'construction') {
    const crane = me.city.find((c) => c.card === 'crane');
    if (crane) {
      const disc = manualDisc ?? autoDiscount(def.cost, me.res, 3);
      options.push({ key: 'crane', label: 'CRANE · −3 ANY', sub: 'Discards your Crane', ability: { kind: 'crane', uid: crane.uid, discount: disc }, cost: applyDisc(def.cost, disc) });
    }
  }
  const judge = me.city.find((c) => c.card === 'judge');
  if (judge && !isRuins) {
    const cost = everdellPlayCost(me as never, def, { kind: 'judge', from: judgeFrom, to: judgeTo });
    options.push({ key: 'judge', label: `JUDGE · SWAP 1 ${RES_NAME[judgeFrom]} FOR 1 ${RES_NAME[judgeTo]}`, sub: 'Replace one cost resource', ability: { kind: 'judge', from: judgeFrom, to: judgeTo }, cost });
  }

  const selected = options.find((o) => keyOf(o.ability) === keyOf(ability)) ?? options[0];
  const cost = selected.cost;
  const affordable = cost !== null && canAfford(me.res, cost);
  const needsPrisoner = selected.ability.kind === 'dungeon';
  const critters = me.city.filter((c) => EV_CARD_BY_ID[c.card]?.kind === 'critter');
  const dungeonOk = !needsPrisoner || (prisonerUid !== null && critters.some((c) => c.uid === prisonerUid));

  let blocked: string | null = null;
  if (isRuins) blocked = everdellCityRoomFor(s, seat, def);
  else if (isFool) {
    const anyTarget = view.players.some((p) => p.seat !== seat && !p.city.some((c) => c.card === 'fool') && p.city.filter((c) => !EV_CARD_BY_ID[c.card]?.noSpace).length < 15);
    if (!anyTarget) blocked = 'no opponent city has room';
    else if (foolTarget === null) blocked = 'choose an opponent';
  } else if (roomWhy) blocked = roomWhy;
  if (!blocked && cost === null) blocked = 'ability does not apply';
  if (!blocked && !affordable) blocked = 'not enough resources';
  if (!blocked && needsPrisoner && !dungeonOk) blocked = 'choose a prisoner';
  if (!blocked && def.costToOpponent && sumRes(cost ?? {}) > 0 && payTo === null && view.players.length > 1) blocked = 'choose who to pay';

  return (
    <>
      <div className="ev-rail-label">PLAY OPTIONS</div>
      {options.map((o) => (
        <button key={o.key} className={'ev-pay-opt' + (keyOf(o.ability) === keyOf(selected.ability) ? ' sel' : '')}
          disabled={o.cost === null}
          onClick={() => setAbility(o.ability)}>
          <span>{o.label}</span>
          <small>{o.cost === null ? 'Does not apply' : <>PAY <CostChips cost={o.cost} size={11} /></>}{o.sub ? ` · ${o.sub}` : ''}</small>
        </button>
      ))}
      {(selected.ability.kind === 'crane' || selected.ability.kind === 'dungeon') && (
        <>
          <div className="ev-rail-label">DISCOUNT UP TO 3 · WHICH RESOURCES</div>
          <ResSteppers
            value={selected.ability.discount}
            onChange={(v) => setManualDisc(v)}
            max={3}
            limits={Object.fromEntries(EV_RESOURCES.map((r) => [r, def.cost[r]]))} />
        </>
      )}
      {selected.ability.kind === 'judge' && (
        <div className="row" style={{ font: '700 11px Inter' }}>
          SWAP
          {EV_RESOURCES.map((r) => (
            <button key={`f${r}`} className={'ev-btn' + (judgeFrom === r ? ' primary' : '')} disabled={(def.cost[r] ?? 0) < 1}
              onClick={() => setJudgeFrom(r)}><ResIcon kind={r} size={13} /></button>
          ))}
          FOR
          {EV_RESOURCES.map((r) => (
            <button key={`t${r}`} className={'ev-btn' + (judgeTo === r ? ' primary' : '')}
              onClick={() => setJudgeTo(r)}><ResIcon kind={r} size={13} /></button>
          ))}
        </div>
      )}
      {needsPrisoner && (
        <>
          <div className="ev-rail-label">PRISONER (LOSES ITS POINTS)</div>
          <div className="ev-picks">
            {critters.map((c) => (
              <button key={c.uid} className={'ev-pick' + (prisonerUid === c.uid ? ' sel' : '')}
                style={{ backgroundImage: `url(${cardImg(c.card)})`, width: 66 }}
                onClick={() => setPrisonerUid(c.uid)} aria-label={c.card} />
            ))}
          </div>
        </>
      )}
      {isFool && (
        <>
          <div className="ev-rail-label">SEND THE FOOL TO</div>
          <OpponentButtons view={view} seat={seat}
            disabledIf={(sx) => {
              const q = view.players[sx];
              if (q.city.some((c) => c.card === 'fool')) return 'HAS THE FOOL';
              if (q.city.filter((c) => !EV_CARD_BY_ID[c.card]?.noSpace).length >= 15) return 'CITY FULL';
              return foolTarget === sx ? null : null;
            }}
            onPick={(sx) => setFoolTarget(sx)} />
          {foolTarget !== null && <small style={{ font: '700 11px Inter' }}>TO {view.players[foolTarget].name.toUpperCase()}</small>}
        </>
      )}
      {def.costToOpponent && sumRes(cost ?? {}) > 0 && view.players.length > 1 && (
        <>
          <div className="ev-rail-label">PAY THE COST TO</div>
          <OpponentButtons view={view} seat={seat} onPick={setPayTo} />
          {payTo !== null && <small style={{ font: '700 11px Inter' }}>PAYING {view.players[payTo].name.toUpperCase()}</small>}
        </>
      )}
      <button className="ev-btn primary" disabled={!!blocked} data-testid="ev-play-card"
        title={blocked ?? undefined}
        onClick={() => onPlay({
          type: 'play_card', source, card: def.id, meadowIndex,
          ability: selected.ability.kind === 'dungeon'
            ? { ...selected.ability, prisonerUid: prisonerUid ?? -1 }
            : selected.ability.kind === 'none' ? undefined : selected.ability,
          foolTarget: isFool ? foolTarget ?? undefined : undefined,
          payTo: def.costToOpponent ? payTo ?? undefined : undefined,
        })}>
        {blocked ? `CANNOT PLAY · ${blocked.toUpperCase()}` : 'PLAY THIS CARD'}
      </button>
    </>
  );
}

function keyOf(a: EvPlayAbility): string {
  switch (a.kind) {
    case 'none': return 'none';
    case 'occupied': return `occ${a.uid}`;
    case 'evertree': return `tree${a.uid}`;
    case 'innkeeper': return 'innkeeper';
    case 'crane': return 'crane';
    case 'judge': return 'judge';
    case 'dungeon': return 'dungeon';
  }
}

function sumRes(m: EvResMap): number {
  return EV_RESOURCES.reduce((a, r) => a + (m[r] ?? 0), 0);
}

// ---------- pending decision prompts ----------

function PendingUI({ view, s, seat, pending, me, choose }: {
  view: EverdellView; s: EverdellState; seat: number; pending: EvPending;
  me: EverdellView['players'][number];
  choose: (payload: Record<string, unknown>) => void;
}) {
  const [resPick, setResPick] = useState<EvResMap>({});
  const [give, setGive] = useState<EvResMap>({});
  const [n, setN] = useState(0);
  const [opp, setOpp] = useState<number | null>(null);
  const [fromLoc, setFromLoc] = useState<EvLocRef | null>(null);
  const firstOpp = view.players.find((p) => p.seat !== seat)?.seat ?? 0;

  const title = (t: string, sub?: string) => (
    <><h3>{t}</h3>{sub && <small className="dim" style={{ font: '600 11px Inter' }}>{sub}</small>}</>
  );

  switch (pending.kind) {
    case 'gain-any':
      return (
        <>
          {title(`GAIN ${pending.n} OF ANY RESOURCE`, pending.reason)}
          <ResSteppers value={resPick} onChange={setResPick} max={pending.n} />
          <button className="ev-btn primary" disabled={sumRes(resPick) !== pending.n}
            onClick={() => choose({ gains: resPick })}>TAKE THEM</button>
        </>
      );
    case 'harvester-any':
      return (
        <>
          {title('HARVESTER · GAIN 1 ANY', 'Paired with a Gatherer beside a Farm')}
          <div className="row">
            {EV_RESOURCES.map((r) => (
              <button key={r} className="ev-btn" onClick={() => choose({ gains: { [r]: 1 } })}>
                <ResIcon kind={r} size={15} /> {RES_NAME[r]}
              </button>
            ))}
          </div>
        </>
      );
    case 'storehouse':
      return (
        <>
          {title('STOREHOUSE · STOCK THE SHELVES', 'Placed on the card; collect later with a worker')}
          <div className="row">
            <button className="ev-btn" onClick={() => choose({ pick: 'twig' })}>3 <ResIcon kind="twig" size={14} /></button>
            <button className="ev-btn" onClick={() => choose({ pick: 'resin' })}>2 <ResIcon kind="resin" size={14} /></button>
            <button className="ev-btn" onClick={() => choose({ pick: 'pebble' })}>1 <ResIcon kind="pebble" size={14} /></button>
            <button className="ev-btn" onClick={() => choose({ pick: 'berry' })}>2 <ResIcon kind="berry" size={14} /></button>
          </div>
        </>
      );
    case 'pay-per-point': {
      const max = Math.min(pending.max, me.res[pending.resource]);
      return (
        <>
          {title(`${pending.reason} · PAY ${RES_NAME[pending.resource]}S FOR POINTS`, `1 point each, up to ${pending.max}`)}
          <span className="ev-stepper">
            <button onClick={() => setN(Math.max(0, n - 1))}>−</button><b>{n}</b>
            <button disabled={n >= max} onClick={() => setN(n + 1)}>+</button>
          </span>
          <button className="ev-btn primary" onClick={() => choose({ n })}>{n === 0 ? 'PAY NOTHING' : `PAY ${n} · GAIN ${n} POINTS`}</button>
        </>
      );
    }
    case 'peddler':
      return (
        <>
          {title('PEDDLER · TRADE UP TO 2', 'Give resources, take the same number back')}
          <div className="ev-rail-label">GIVE</div>
          <ResSteppers value={give} onChange={setGive} max={2} limits={me.res} />
          <div className="ev-rail-label">TAKE</div>
          <ResSteppers value={resPick} onChange={setResPick} max={sumRes(give)} />
          <button className="ev-btn primary" disabled={sumRes(resPick) !== sumRes(give)}
            onClick={() => choose({ give, get: resPick })}>
            {sumRes(give) === 0 ? 'TRADE NOTHING' : 'TRADE'}
          </button>
        </>
      );
    case 'monk-give': {
      const max = Math.min(2, me.res.berry);
      return (
        <>
          {title('MONK · GIVE BERRIES', '2 points per berry given to one opponent')}
          <span className="ev-stepper">
            <button onClick={() => setN(Math.max(0, n - 1))}>−</button><b>{n}</b>
            <button disabled={n >= max} onClick={() => setN(n + 1)}>+</button>
          </span>
          {n > 0 && <OpponentButtons view={view} seat={seat} onPick={setOpp} />}
          {opp !== null && n > 0 && <small style={{ font: '700 11px Inter' }}>TO {view.players[opp].name.toUpperCase()}</small>}
          <button className="ev-btn primary" disabled={n > 0 && opp === null}
            onClick={() => choose({ n, to: opp ?? firstOpp })}>
            {n === 0 ? 'GIVE NOTHING' : `GIVE ${n} · GAIN ${2 * n} POINTS`}
          </button>
        </>
      );
    }
    case 'chip-sweep': {
      const targets = me.city.flatMap((c) => {
        const ids = [c.card, ...(c.sharedWith ? [c.sharedWith] : [])];
        return ids.filter((id) => EV_CARD_BY_ID[id]?.color === 'production' && id !== 'chip-sweep').map((id) => ({ uid: c.uid, id }));
      });
      return (
        <>
          {title('CHIP SWEEP · ACTIVATE A PRODUCTION CARD')}
          <div className="ev-picks">
            {targets.map((t, i) => (
              <button key={`${t.uid}:${t.id}:${i}`} className="ev-pick" style={{ backgroundImage: `url(${cardImg(t.id)})` }}
                onClick={() => choose({ uid: t.uid, card: t.id })} aria-label={t.id} />
            ))}
            {targets.length === 0 && <span className="dim">NO OTHER PRODUCTION CARDS — PICK ANY TO CONTINUE</span>}
          </div>
          {targets.length === 0 && me.city.length > 0 && (
            <button className="ev-btn" onClick={() => choose({ uid: me.city[0].uid, card: me.city[0].card })}>CONTINUE</button>
          )}
        </>
      );
    }
    case 'miner-mole': {
      const targets = view.players.filter((p) => p.seat !== seat).flatMap((p) =>
        p.city.flatMap((c) => {
          const ids = [c.card, ...(c.sharedWith ? [c.sharedWith] : [])];
          return ids
            .filter((id) => EV_CARD_BY_ID[id]?.color === 'production' && id !== 'storehouse' && id !== 'miner-mole')
            .map((id) => ({ seat: p.seat, uid: c.uid, id, name: p.name }));
        }));
      return (
        <>
          {title('MINER MOLE · COPY AN OPPONENT PRODUCTION CARD')}
          <div className="ev-picks">
            {targets.map((t, i) => (
              <button key={`${t.seat}:${t.uid}:${i}`} className="ev-pick" style={{ backgroundImage: `url(${cardImg(t.id)})` }}
                onClick={() => choose({ seat: t.seat, uid: t.uid, card: t.id })} aria-label={`${t.name} ${t.id}`} />
            ))}
            {targets.length === 0 && <span className="dim">NOTHING TO COPY</span>}
          </div>
          {targets.length === 0 && <button className="ev-btn" onClick={() => choose({ seat: firstOpp, uid: -1 })}>CONTINUE</button>}
        </>
      );
    }
    case 'teacher-give':
      return (
        <>
          {title('TEACHER · KEEP ONE, GIVE ONE')}
          <div className="ev-picks">
            {pending.cards.map((c, i) => (
              <button key={`${c}:${i}`} className={'ev-pick' + (resKeyEq(resPick, c) ? ' sel' : '')}
                style={{ backgroundImage: `url(${cardImg(c)})` }}
                onClick={() => setResPick({ [c]: 1 } as EvResMap)} aria-label={c} />
            ))}
          </div>
          <OpponentButtons view={view} seat={seat} onPick={setOpp} />
          <button className="ev-btn primary" disabled={Object.keys(resPick).length === 0 || opp === null}
            onClick={() => choose({ keep: Object.keys(resPick)[0], to: opp })}>
            KEEP IT · GIVE THE OTHER
          </button>
        </>
      );
    case 'courthouse':
      return (
        <>
          {title('COURTHOUSE · GAIN 1', 'For the construction you just played')}
          <div className="row">
            {(['twig', 'resin', 'pebble'] as const).map((r) => (
              <button key={r} className="ev-btn" onClick={() => choose({ pick: r })}>
                <ResIcon kind={r} size={15} /> {RES_NAME[r]}
              </button>
            ))}
          </div>
        </>
      );
    case 'bard-discard':
      return (
        <>
          {title('BARD · DISCARD UP TO 5', '1 point per card')}
          <CardPicker cards={me.hand} min={0} max={5} doneLabel="DISCARD"
            onDone={(cards) => choose({ cards })} />
        </>
      );
    case 'ruins-target': {
      const targets = me.city.filter((c) => EV_CARD_BY_ID[c.card]?.kind === 'construction' && c.card !== 'ruins');
      return (
        <>
          {title('RUINS · DEMOLISH A CONSTRUCTION', 'Its cost comes back to you, then draw 2')}
          <div className="ev-picks">
            {targets.map((c) => (
              <button key={c.uid} className="ev-pick" style={{ backgroundImage: `url(${cardImg(c.card)})` }}
                onClick={() => choose({ uid: c.uid })} aria-label={c.card} />
            ))}
          </div>
        </>
      );
    }
    case 'pigeon-play':
      return (
        <>
          {title('POSTAL PIGEON · PLAY ONE FOR FREE?', 'Worth up to 3 points; the rest are discarded')}
          <div className="ev-picks">
            {pending.revealed.map((c, i) => {
              const d = EV_CARD_BY_ID[c];
              const why = !d ? 'unknown' : d.points > 3 ? 'WORTH MORE THAN 3' : everdellCityRoomFor(s, seat, d);
              return (
                <button key={`${c}:${i}`} className={'ev-pick' + (why ? ' dim' : '')} disabled={!!why}
                  style={{ backgroundImage: `url(${cardImg(c)})` }} title={why ?? undefined}
                  onClick={() => choose({ pick: c })} aria-label={c} />
              );
            })}
          </div>
          <button className="ev-btn" onClick={() => choose({ pick: null })}>DISCARD BOTH</button>
        </>
      );
    case 'ranger-move': {
      const movable = me.workers.filter((w) => !w.permanent);
      const isMineAt = (loc: EvLocRef) =>
        movable.some((w) => JSON.stringify(w.loc) === JSON.stringify(loc));
      return (
        <>
          {title('RANGER · MOVE A WORKER', fromLoc
            ? `MOVING FROM ${locText(view, fromLoc)} · TAP THE NEW SPOT`
            : 'Tap the worker to move')}
          {!fromLoc ? (
            <EvBoardMap view={view} seat={seat}
              groups={{ basics: true, forest: true, haven: true, journey: true, dests: true, events: true }}
              check={(loc) => (isMineAt(loc) ? null : 'no worker of yours there')}
              onPick={(loc) => setFromLoc(loc)} />
          ) : (
            <>
              <EvBoardMap view={view} seat={seat}
                groups={{ basics: true, forest: true, haven: true, journey: true, dests: true, events: true }}
                check={(loc) => everdellCanPlace(s, seat, loc)}
                onPick={(to) => choose({ from: fromLoc, to })} />
              <button className="ev-btn" onClick={() => setFromLoc(null)}>PICK A DIFFERENT WORKER</button>
            </>
          )}
          {movable.length === 0 && <span className="dim">NO DEPLOYED WORKERS</span>}
          <button className="ev-btn" onClick={() => choose({ skip: true })}>SKIP</button>
        </>
      );
    }
    case 'undertaker-discard': {
      const idx = view.meadow.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
      return (
        <>
          {title('UNDERTAKER · DISCARD 3 MEADOW CARDS')}
          <MeadowPicker view={view} count={Math.min(3, idx.length)} onDone={(cards) => choose({ cards })} />
        </>
      );
    }
    case 'undertaker-draw':
      return (
        <>
          {title('UNDERTAKER · DRAW 1 FROM THE MEADOW')}
          <MeadowPicker view={view} count={1} onDone={(cards) => choose({ index: cards[0] })} />
        </>
      );
    case 'haven': {
      return (
        <>
          {title('HAVEN', 'Gain 1 any resource for every 2 cards discarded')}
          <HavenUI me={me} choose={choose} />
        </>
      );
    }
    case 'journey-discard':
      return (
        <>
          {title(`JOURNEY · DISCARD ${pending.n} CARDS`)}
          <CardPicker cards={me.hand} min={pending.n} max={pending.n} doneLabel="SET OUT"
            onDone={(cards) => choose({ cards })} />
        </>
      );
    case 'copy-basic':
      return (
        <>
          {title('COPY A LOCATION', pending.allowForest ? 'Tap any basic or forest location · occupied is fine' : 'Tap any basic location')}
          <EvBoardMap view={view} seat={seat}
            groups={{ basics: true, forest: pending.allowForest }}
            check={() => null}
            onPick={(loc) => {
              if (loc.t === 'basic' || loc.t === 'forest') choose({ id: loc.id });
            }} />
        </>
      );
    case 'meadow2-draw': {
      const cap = Math.min(2, view.meadow.filter((m) => m).length, 8 - me.hand.length);
      return (
        <>
          {title(`DRAW ${cap} MEADOW CARDS`, 'Then you may play one for 1 fewer resource')}
          <MeadowPicker view={view} count={cap} onDone={(cards) => choose({ cards })} />
        </>
      );
    }
    case 'play-discounted': {
      const from = pending.fromCards ?? (
        pending.from === 'meadow' ? view.meadow.filter((m): m is string => !!m)
          : pending.from === 'both' ? [...me.hand, ...view.meadow.filter((m): m is string => !!m)]
          : me.hand);
      return (
        <>
          {title(
            pending.free ? `${pending.reason} · PLAY A CARD FOR FREE` : `${pending.reason} · PLAY WITH −${pending.discount}`,
            pending.maxPoints !== null ? `Worth up to ${pending.maxPoints} points` : undefined,
          )}
          <div className="ev-picks">
            {from.map((c, i) => {
              const d = EV_CARD_BY_ID[c];
              let why = d ? everdellCityRoomFor(s, seat, d) : 'unknown';
              if (!why && pending.maxPoints !== null && d!.points > pending.maxPoints) why = 'worth too much';
              if (!why && !pending.free) {
                const disc = autoDiscount(d!.cost, me.res, pending.discount);
                if (!canAfford(me.res, applyDisc(d!.cost, disc))) why = 'not enough resources';
              }
              return (
                <button key={`${c}:${i}`} className={'ev-pick' + (why ? ' dim' : '')} disabled={!!why}
                  style={{ backgroundImage: `url(${cardImg(c)})` }} title={why ?? undefined}
                  onClick={() => choose(pending.free
                    ? { card: c }
                    : { card: c, discount: autoDiscount(d!.cost, me.res, pending.discount) })}
                  aria-label={c} />
              );
            })}
          </div>
          {pending.optional && <button className="ev-btn" onClick={() => choose({ skip: true })}>SKIP</button>}
        </>
      );
    }
    case 'inn-play':
      return (
        <>
          {title('INN · PLAY FROM THE MEADOW', 'Up to 3 fewer resources')}
          <div className="ev-picks">
            {view.meadow.filter((m): m is string => !!m).map((c, i) => {
              const d = EV_CARD_BY_ID[c];
              let why = d ? everdellCityRoomFor(s, seat, d) : 'unknown';
              if (!why) {
                const disc = autoDiscount(d!.cost, me.res, 3);
                if (!canAfford(me.res, applyDisc(d!.cost, disc))) why = 'not enough resources';
              }
              return (
                <button key={`${c}:${i}`} className={'ev-pick' + (why ? ' dim' : '')} disabled={!!why}
                  style={{ backgroundImage: `url(${cardImg(c)})` }} title={why ?? undefined}
                  onClick={() => choose({ card: c, discount: autoDiscount(d!.cost, me.res, 3) })} aria-label={c} />
              );
            })}
          </div>
        </>
      );
    case 'post-office-give':
      return (
        <>
          {title('POST OFFICE · GIVE 2 CARDS')}
          <OpponentButtons view={view} seat={seat} onPick={setOpp} />
          {opp !== null && (
            <CardPicker cards={me.hand} min={Math.min(2, me.hand.length)} max={Math.min(2, me.hand.length)}
              doneLabel={`GIVE TO ${view.players[opp].name.toUpperCase()}`}
              onDone={(cards) => choose({ to: opp, cards })} />
          )}
        </>
      );
    case 'post-office-redraw':
      return (
        <>
          {title('POST OFFICE · DISCARD ANY, THEN DRAW TO 8')}
          <CardPicker cards={me.hand} min={0} max={me.hand.length} doneLabel="DISCARD + DRAW"
            onDone={(cards) => choose({ cards })} />
        </>
      );
    case 'university-target': {
      const targets = me.city.filter((c) => c.card !== 'university');
      return (
        <>
          {title('UNIVERSITY · DISCARD A CITY CARD', 'Its cost returns, plus 1 any and 1 point')}
          <div className="ev-picks">
            {targets.map((c) => (
              <button key={c.uid} className="ev-pick" style={{ backgroundImage: `url(${cardImg(c.card)})` }}
                onClick={() => choose({ uid: c.uid })} aria-label={c.card} />
            ))}
          </div>
        </>
      );
    }
    case 'monastery-give':
      return (
        <>
          {title('MONASTERY · GIVE 2 RESOURCES', 'Gain 4 points')}
          <ResSteppers value={give} onChange={setGive} max={2} limits={me.res} />
          <OpponentButtons view={view} seat={seat} onPick={setOpp} />
          <button className="ev-btn primary" disabled={sumRes(give) !== 2 || opp === null}
            onClick={() => choose({ to: opp, give })}>GIVE · GAIN 4 POINTS</button>
        </>
      );
    case 'cemetery-source':
      return (
        <>
          {title('CEMETERY · REVEAL 4 FROM…')}
          <div className="row">
            <button className="ev-btn" disabled={view.deckCount === 0} onClick={() => choose({ source: 'deck' })}>THE DECK ({view.deckCount})</button>
            <button className="ev-btn" disabled={view.discardCount === 0} onClick={() => choose({ source: 'discard' })}>THE DISCARD ({view.discardCount})</button>
          </div>
        </>
      );
    case 'cemetery-play':
      return (
        <>
          {title('CEMETERY · PLAY ONE FOR FREE', 'The rest are discarded')}
          <div className="ev-picks">
            {pending.revealed.map((c, i) => {
              const d = EV_CARD_BY_ID[c];
              const why = d ? everdellCityRoomFor(s, seat, d) : 'unknown';
              return (
                <button key={`${c}:${i}`} className={'ev-pick' + (why ? ' dim' : '')} disabled={!!why}
                  style={{ backgroundImage: `url(${cardImg(c)})` }} title={why ?? undefined}
                  onClick={() => choose({ pick: c })} aria-label={c} />
              );
            })}
          </div>
          <button className="ev-btn" onClick={() => choose({ pick: null })}>PLAY NOTHING</button>
        </>
      );
    case 'clock-tower': {
      const spots = me.workers.filter((w) => w.loc.t === 'basic' || w.loc.t === 'forest');
      const isMineAt = (loc: EvLocRef) =>
        spots.some((w) => JSON.stringify(w.loc) === JSON.stringify(loc));
      return (
        <>
          {title('CLOCK TOWER', 'Spend 1 point token to re-activate a location where your worker stands')}
          <EvBoardMap view={view} seat={seat}
            groups={{ basics: true, forest: true }}
            check={(loc) => (isMineAt(loc) ? null : 'no worker of yours there')}
            onPick={(loc) => choose({ loc })} />
          <button className="ev-btn" onClick={() => choose({ skip: true })}>SKIP · KEEP THE POINT</button>
        </>
      );
    }
    case 'summer-meadow':
      return (
        <>
          {title('SUMMER · DRAW FROM THE MEADOW', `${pending.remaining} left`)}
          <MeadowPicker view={view} count={1} onDone={(cards) => choose({ index: cards[0] })} />
          <button className="ev-btn" onClick={() => choose({ skip: true })}>SKIP</button>
        </>
      );
    case 'discard-any-draw':
      return (
        <>
          {title('FOREST · DISCARD ANY, DRAW 2 PER CARD')}
          <CardPicker cards={me.hand} min={1} max={me.hand.length} doneLabel="DISCARD + DRAW"
            onDone={(cards) => choose({ cards })} />
        </>
      );
    case 'discard-up-to-3-any':
      return (
        <>
          {title('FOREST · DISCARD UP TO 3, GAIN 1 ANY EACH')}
          <CardPicker cards={me.hand} min={1} max={3} doneLabel="DISCARD"
            onDone={(cards) => choose({ cards })} />
        </>
      );
    case 'fireworks-twigs': {
      const max = Math.min(3, me.res.twig);
      return (
        <>
          {title('AN EVENING OF FIREWORKS', 'Place up to 3 twigs · 2 points each at the end')}
          <span className="ev-stepper">
            <button onClick={() => setN(Math.max(0, n - 1))}>−</button><b>{n}</b>
            <button disabled={n >= max} onClick={() => setN(n + 1)}>+</button>
          </span>
          <button className="ev-btn primary" onClick={() => choose({ n })}>PLACE {n}</button>
        </>
      );
    }
    case 'performer-berries': {
      const max = Math.min(3, me.res.berry);
      return (
        <>
          {title('PERFORMER IN RESIDENCE', 'Place up to 3 berries · 2 points each at the end')}
          <span className="ev-stepper">
            <button onClick={() => setN(Math.max(0, n - 1))}>−</button><b>{n}</b>
            <button disabled={n >= max} onClick={() => setN(n + 1)}>+</button>
          </span>
          <button className="ev-btn primary" onClick={() => choose({ n })}>PLACE {n}</button>
        </>
      );
    }
    case 'new-management':
      return (
        <>
          {title('UNDER NEW MANAGEMENT', 'Berries and twigs score 1, resin and pebbles 2')}
          <ResSteppers value={give} onChange={setGive} max={3} limits={me.res} />
          <button className="ev-btn primary" onClick={() => choose({ place: give })}>PLACE THEM</button>
        </>
      );
    case 'acorn-thieves': {
      const critters = me.city.filter((c) => EV_CARD_BY_ID[c.card]?.kind === 'critter');
      return (
        <>
          {title('CAPTURE OF THE ACORN THIEVES', 'Up to 2 critters go beneath the event · 3 points each')}
          <CityMultiPick cards={critters.map((c) => ({ uid: c.uid, id: c.card }))} max={2}
            onDone={(uids) => choose({ uids })} doneLabel="PLACE BENEATH" />
        </>
      );
    }
    case 'graduation':
      return (
        <>
          {title('GRADUATION OF SCHOLARS', 'Up to 3 critters from your hand · 2 points each')}
          <CardPicker cards={me.hand.filter((c) => EV_CARD_BY_ID[c]?.kind === 'critter')} min={0} max={3}
            doneLabel="PLACE BENEATH" onDone={(cards) => choose({ cards })} />
        </>
      );
    case 'ancient-scrolls':
      return (
        <>
          {title('ANCIENT SCROLLS DISCOVERED', 'Pick which to draw; the rest score 1 each beneath the event')}
          <CardPicker cards={pending.revealed} min={0} max={pending.revealed.length}
            doneLabel="DRAW PICKED" onDone={(cards) => choose({ keep: cards })} />
        </>
      );
    case 'marketing-plan':
      return (
        <>
          {title('A BRILLIANT MARKETING PLAN', 'Give up to 3 resources · 2 points each')}
          <ResSteppers value={give} onChange={setGive} max={3} limits={me.res} />
          <OpponentButtons view={view} seat={seat} onPick={setOpp} />
          <button className="ev-btn primary" disabled={sumRes(give) > 0 && opp === null}
            onClick={() => choose({ gives: sumRes(give) > 0 ? [{ to: opp ?? firstOpp, res: give }] : [] })}>
            {sumRes(give) === 0 ? 'GIVE NOTHING' : `GIVE · GAIN ${2 * sumRes(give)} POINTS`}
          </button>
        </>
      );
    case 'croak-city-discard': {
      const need = Math.min(2, me.city.length);
      return (
        <>
          {title('CROAK WART CURE', `Discard ${need} cards from your city`)}
          <CityMultiPick cards={me.city.map((c) => ({ uid: c.uid, id: c.card }))} max={need} min={need}
            onDone={(uids) => choose({ uids })} doneLabel="DISCARD" />
        </>
      );
    }
    case 'well-run-city': {
      const spots = me.workers.filter((w) => !w.permanent);
      const isMineAt = (loc: EvLocRef) =>
        spots.some((w) => JSON.stringify(w.loc) === JSON.stringify(loc));
      return (
        <>
          {title('A WELL RUN CITY', 'Tap the worker to bring back')}
          <EvBoardMap view={view} seat={seat}
            groups={{ basics: true, forest: true, haven: true, journey: true, dests: true, events: true }}
            check={(loc) => (isMineAt(loc) ? null : 'no worker of yours there')}
            onPick={(loc) => choose({ from: loc })} />
        </>
      );
    }
    default:
      return <>{title('DECISION')}<button className="ev-btn" onClick={() => choose({})}>CONTINUE</button></>;
  }
}

function resKeyEq(m: EvResMap, key: string): boolean {
  return Object.keys(m)[0] === key;
}

function HavenUI({ me, choose }: { me: EverdellView['players'][number]; choose: (p: Record<string, unknown>) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [gains, setGains] = useState<EvResMap>({});
  const quota = Math.floor(picked.length / 2);
  return (
    <>
      <div className="ev-picks">
        {me.hand.map((c, i) => (
          <button key={`${c}:${i}`} className={`ev-pick${picked.includes(i) ? ' sel' : ''}`}
            style={{ backgroundImage: `url(${cardImg(c)})` }}
            onClick={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} aria-label={c} />
        ))}
      </div>
      <div className="ev-rail-label">GAIN {quota}</div>
      <ResSteppers value={gains} onChange={setGains} max={quota} />
      <button className="ev-btn primary"
        disabled={picked.length < 1 || sumRes(gains) !== quota}
        onClick={() => choose({ cards: picked.map((i) => me.hand[i]), gains })}>
        DISCARD {picked.length} · GAIN {quota}
      </button>
    </>
  );
}

function MeadowPicker({ view, count, onDone }: { view: EverdellView; count: number; onDone: (indices: number[]) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  return (
    <>
      <div className="ev-picks">
        {view.meadow.map((m, i) => (
          m ? (
            <button key={`${m}:${i}`} className={`ev-pick${picked.includes(i) ? ' sel' : ''}`}
              style={{ backgroundImage: `url(${cardImg(m)})` }}
              onClick={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < count ? [...p, i] : p))}
              aria-label={m} />
          ) : null
        ))}
      </div>
      <button className="ev-btn primary" disabled={picked.length !== count}
        onClick={() => onDone(picked)}>CONFIRM ({picked.length}/{count})</button>
    </>
  );
}

function CityMultiPick({ cards, max, min = 0, onDone, doneLabel }: {
  cards: { uid: number; id: string }[]; max: number; min?: number;
  onDone: (uids: number[]) => void; doneLabel: string;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  return (
    <>
      <div className="ev-picks">
        {cards.map((c) => (
          <button key={c.uid} className={`ev-pick${picked.includes(c.uid) ? ' sel' : ''}`}
            style={{ backgroundImage: `url(${cardImg(c.id)})` }}
            onClick={() => setPicked((p) => (p.includes(c.uid) ? p.filter((x) => x !== c.uid) : p.length < max ? [...p, c.uid] : p))}
            aria-label={c.id} />
        ))}
      </div>
      <button className="ev-btn primary" disabled={picked.length < min}
        onClick={() => onDone(picked)}>{doneLabel} ({picked.length})</button>
    </>
  );
}

function locText(view: EverdellView, loc: EvLocRef): string {
  switch (loc.t) {
    case 'basic': {
      const l = EV_BASIC_LOCATIONS.find((x) => x.id === loc.id);
      return l ? Object.entries(l.gain).map(([k, v]) => `${v} ${k.toUpperCase()}`).join(' + ') : loc.id;
    }
    case 'forest': return `FOREST · ${EV_FOREST_BY_ID[loc.id]?.text.toUpperCase() ?? ''}`;
    case 'haven': return 'HAVEN';
    case 'journey': return `JOURNEY ${EV_JOURNEY.find((j) => j.id === loc.id)?.points ?? ''}`;
    case 'city': {
      const p = view.players[loc.seat];
      const cc = p?.city.find((c) => c.uid === loc.uid);
      return cc ? `${EV_CARD_BY_ID[cc.card]?.name.toUpperCase() ?? cc.card}${loc.seat !== view.you ? ` · ${p.name.toUpperCase()}` : ''}` : 'CITY CARD';
    }
    case 'basicEvent': return EV_BASIC_EVENT_BY_ID[loc.id]?.name.toUpperCase() ?? loc.id;
    case 'specialEvent': return EV_SPECIAL_BY_ID[loc.id]?.name.toUpperCase() ?? loc.id;
  }
}
