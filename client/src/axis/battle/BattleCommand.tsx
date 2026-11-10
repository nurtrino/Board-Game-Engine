// The device battle screen. Shows both forces, the round and the last dice, and whatever this
// device has to decide: roll, choose casualties, submerge, press on or retreat, continue, or land
// a carrier fighter. Every action carries asPower (the power the server expects the answer from)
// and the combat id and visualSeq of the state it was made against. Nothing here waits for the TV.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AxisAction, AxisView, PowerKey } from '@bge/shared';
import UnitIcon from '../UnitIcon';
import { cardTitle, casualtyCards, confirmLabel, legalPrefix, sourcePrompt, undoCard } from './casualties';
import { lastVolley } from './dice';
import { DiceStrip, ForceCard, ResultCard, battleKicker, resultFromCombat, seat } from './Hud';
import { landingCards, landingOwner, type LandingView } from './landing';
import {
  combatantName, continueAuthority, controls, decisionAuthority, defenderOf, rollAuthority, spaceName, unitName,
  type CasualtyDecision, type Combat, type Decision, type Side,
} from './model';
import {
  buildRemainAction, buildRetreatAction, initialRetreatSelection, normalizeRetreatSelection, retreatCopy, retreatKey, retreatLabel,
  type RetreatSelection,
} from './retreat';
import { nextRollTitle, pendingHits, stageStatus } from './timeline';
import './battle.css';

type Act = (a: AxisAction & { asPower?: PowerKey }) => void;
type Send = (action: AxisAction, power: PowerKey | null) => void;

const ROLL_HELP: Record<string, string> = {
  aa_fire: 'The antiaircraft gun rolls one die at each attacking aircraft. Aircraft that are hit never reach the fight.',
  sub_strike: 'Submarines fire first. Ships they hit are removed before they can fire back.',
  bombardment: 'Battleships and cruisers fire at the shore. Units they hit still fire back this round.',
  attacker_fire: 'Every attacking unit rolls. Casualties are removed after the defender fires back.',
  defender_fire: 'Every defending unit rolls. Then both sides remove their casualties.',
  raid_damage: 'Each bomber that got through rolls one die. The number rolled is the damage.',
  rocket_damage: 'One die. The number rolled is the damage.',
};

export function BattleCommand({ view, act }: { view: AxisView; act: Act }) {
  const combat = view.combat;
  const landing = view.defendingCarrierLanding;
  if (!combat && !landing) return null;
  if (!combat) {
    return (
      <div className="axb axb-cmd landing-only">
        <header className="axb-cmd-top">
          <small className="ig-lab">After the battle</small>
          <h1>Carrier fighters must land</h1>
        </header>
        <div className="axb-cmd-main solo">
          <LandingPanel landing={landing!} view={view} act={act} />
        </div>
      </div>
    );
  }
  return <Command view={view} combat={combat} act={act} />;
}

function Command({ view, combat, act }: { view: AxisView; combat: Combat; act: Act }) {
  const b = combat.battle;
  const d = b.decision;
  const over = b.status !== 'ongoing';
  const defender = defenderOf(b);
  const pending = pendingHits(b);
  const volley = useMemo(() => lastVolley(b.log, [...b.attacker, ...b.defender]), [b.log, b.attacker, b.defender]);

  // One order at a time: after sending, the buttons rest until the state moves on. If the server
  // refuses the order the state never moves, so the lock also lifts by itself.
  const stamp = `${combat.id}:${combat.visualSeq}:${b.log.length}:${b.status}:${d?.type ?? ''}:${combat.confirmed?.attacker ?? ''}:${combat.confirmed?.defender ?? ''}`;
  const [sent, setSent] = useState<string | null>(null);
  const busy = sent === stamp;
  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setSent(null), 3500);
    return () => window.clearTimeout(id);
  }, [busy, stamp]);
  const send: Send = (action, power) => {
    if (busy || !controls(view.controlledPowers, power)) return;
    setSent(stamp);
    act({ ...action, asPower: power });
  };
  const target = { combatId: combat.id, visualSeq: combat.visualSeq };

  let panel: ReactNode;
  if (view.defendingCarrierLanding) {
    panel = <LandingPanel landing={view.defendingCarrierLanding} view={view} act={act} />;
  } else if (over) {
    panel = <ContinuePanel view={view} combat={combat} busy={busy} send={send} />;
  } else if (!d) {
    const who = rollAuthority(view);
    const step = b.steps[b.stepIndex] ?? '';
    const mine = controls(view.controlledPowers, who);
    panel = (
      <Panel kicker={combat.kind === 'battle' ? `Round ${b.round}` : battleKicker(combat)} title={mine ? nextRollTitle(combat) : `Waiting for ${combatantName(who)}`} seatPower={who}>
        <p>{mine ? ROLL_HELP[step] ?? 'Roll the next dice.' : `${combatantName(who)} rolls the dice for both sides.`}</p>
        {mine && (
          <Actions>
            <button className="axb-btn primary" disabled={busy} onClick={() => send({ type: 'battleRoll', ...target }, who)}>
              {busy ? 'Rolling' : 'Roll'}
            </button>
          </Actions>
        )}
      </Panel>
    );
  } else {
    const who = decisionAuthority(view);
    if (!controls(view.controlledPowers, who)) {
      panel = (
        <Panel kicker="Decision" title={`Waiting for ${combatantName(who)}`} seatPower={who}>
          <p>{stageStatus(combat, view.active).line}.</p>
        </Panel>
      );
    } else if (d.type === 'casualties') {
      panel = <CasualtyPanel key={`${combat.id}:${combat.visualSeq}`} combat={combat} decision={d} busy={busy} onConfirm={(uids) => send({ type: 'battleCasualties', uids, ...target }, who)} who={who} />;
    } else if (d.type === 'submerge') {
      panel = <SubmergePanel decision={d} busy={busy} who={who} onChoose={(uids) => send({ type: 'battleSubmerge', uids, ...target }, who)} />;
    } else {
      panel = <RetreatPanel key={retreatKey(combat)} combat={combat} busy={busy} who={who} send={send} />;
    }
  }

  return (
    <div className="axb axb-cmd" style={seat(combat.attacker)}>
      <header className="axb-cmd-top">
        <small className="ig-lab">{battleKicker(combat)}</small>
        <h1>{spaceName(combat.space)}</h1>
        {combat.kind === 'battle' && <span className="axb-round ig-num">Round {b.round}</span>}
      </header>
      <div className="axb-cmd-main">
        <div className="axb-cmd-info">
          <div className="axb-cmd-forces">
            <ForceCard compact side="attacker" power={combat.attacker} units={b.attacker} pending={pending.find((p) => p.side === 'attacker')} />
            <ForceCard compact side="defender" power={defender} units={b.defender} pending={pending.find((p) => p.side === 'defender')} />
          </div>
          <div className="axb-cmd-dice ig-glass">
            {volley
              ? <DiceStrip volley={volley} combatId={combat.id} />
              : <div className="axb-volley empty"><span className="ig-lab">Dice</span><b>No roll yet</b></div>}
          </div>
        </div>
        <div className="axb-cmd-decision">{panel}</div>
      </div>
    </div>
  );
}

function Panel({ kicker, title, seatPower, children }: { kicker: string; title: string; seatPower?: string | null; children?: ReactNode }) {
  return (
    <section className="axb-panel ig-glass" style={seat(seatPower ?? null)} aria-live="polite">
      <small className="ig-lab">{kicker}</small>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
const Actions = ({ children }: { children: ReactNode }) => <div className="axb-actions">{children}</div>;

// ---------- casualties ----------

function CasualtyPanel({ combat, decision, busy, who, onConfirm }: {
  combat: Combat;
  decision: CasualtyDecision;
  busy: boolean;
  who: PowerKey | null;
  onConfirm: (uids: number[]) => void;
}) {
  const b = combat.battle;
  const units = decision.side === 'attacker' ? b.attacker : b.defender;
  const [raw, setRaw] = useState<number[]>([]);
  // never trust stored picks: replay them against the current decision and keep the legal prefix
  const picks = useMemo(() => legalPrefix(decision, units, raw), [decision, units, raw]);
  const { cards, plan } = useMemo(() => casualtyCards(decision, units, picks, b.ctx.seaCombat), [decision, units, picks, b.ctx.seaCombat]);
  const left = Math.max(0, plan.assignable - plan.assigned);
  return (
    <Panel kicker={decision.side === 'attacker' ? 'Attacker casualties' : 'Defender casualties'} title={plan.complete ? 'Casualties chosen' : `Choose ${left} ${left === 1 ? 'casualty' : 'casualties'}`} seatPower={who}>
      <p>{sourcePrompt(plan.nextSource)}</p>
      <div className="axb-progress" role="progressbar" aria-valuemin={0} aria-valuemax={plan.assignable} aria-valuenow={plan.assigned}>
        {Array.from({ length: Math.max(1, plan.assignable) }, (_, i) => <i key={i} className={i < plan.assigned ? 'on' : ''} />)}
      </div>
      <ul className="axb-picks">
        {cards.map((card) => {
          const open = card.nextUid !== null && !plan.complete;
          const line = card.picked > 0
            ? `${card.picked} ${card.picked === 1 ? 'hit' : 'hits'} assigned`
            : open ? (card.note || 'Tap to assign a hit') : card.reason ?? 'Not a legal target for this hit';
          return (
            <li key={card.id} className={`axb-pick${card.picked > 0 ? ' picked' : ''}${open ? '' : ' closed'}`}>
              <button
                type="button"
                className="axb-pick-main"
                disabled={busy || !open}
                aria-label={`${cardTitle(card)}. ${line}`}
                onClick={() => { if (card.nextUid !== null) setRaw([...picks, card.nextUid]); }}
              >
                <UnitIcon unitKey={card.key} size={34} title={unitName(card.key)} />
                <span>
                  <b>{cardTitle(card)}</b>
                  <small>{combatantName(card.power)}{card.maxHp > 1 ? `, ${card.hp} of ${card.maxHp} hits left` : ''}</small>
                  <em>{line}</em>
                  {card.picked > 0 && !open && card.reason && !plan.complete && <em>{card.reason}</em>}
                </span>
                {card.picked > 0 && <strong className="ig-num">{card.picked}</strong>}
              </button>
              {card.picked > 0 && (
                <button type="button" className="axb-pick-undo" disabled={busy} onClick={() => setRaw(undoCard(card, picks))} aria-label={`Take one hit back from ${cardTitle(card)}`}>
                  Undo
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <Actions>
        {picks.length > 0 && <button className="axb-btn" disabled={busy} onClick={() => setRaw([])}>Start over</button>}
        <button className="axb-btn primary" disabled={busy || !plan.complete} onClick={() => onConfirm(plan.payload)}>
          {busy ? 'Sending' : confirmLabel(plan)}
        </button>
      </Actions>
    </Panel>
  );
}

// ---------- submarines ----------

function SubmergePanel({ decision, busy, who, onChoose }: {
  decision: Extract<Decision, { type: 'submerge' }>;
  busy: boolean;
  who: PowerKey | null;
  onChoose: (uids: number[]) => void;
}) {
  const n = decision.subs.length;
  return (
    <Panel kicker="Submarines" title={n === 1 ? 'Fight or submerge?' : `${n} submarines: fight or submerge?`} seatPower={who}>
      <p>A submerged submarine leaves this battle. It cannot fire and cannot be hit, and it stays in the sea zone.</p>
      <Actions>
        <button className="axb-btn primary" disabled={busy} onClick={() => onChoose([])}>Stay and fight</button>
        <button className="axb-btn" disabled={busy} onClick={() => onChoose(decision.subs)}>{n === 1 ? 'Submerge' : 'Submerge all'}</button>
      </Actions>
    </Panel>
  );
}

// ---------- press on or retreat ----------

function RetreatPanel({ combat, busy, who, send }: { combat: Combat; busy: boolean; who: PowerKey | null; send: Send }) {
  const policy = combat.retreatPolicy;
  const [choice, setChoice] = useState<RetreatSelection>(() => initialRetreatSelection(policy));
  const route = normalizeRetreatSelection(policy, choice);
  const copy = retreatCopy(combat);
  const stay = buildRemainAction(combat);
  const leave = buildRetreatAction(combat, route);
  return (
    <Panel kicker="Attacker decision" title={copy.title} seatPower={who}>
      <p>{copy.body}</p>
      {copy.routePrompt && <p className="axb-hint">{copy.routePrompt}</p>}
      {policy && policy.canRetreat && policy.destinations.length > 0 && (
        <div className="axb-routes" role="radiogroup" aria-label="Retreat to">
          {policy.destinations.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={id === route} className={`axb-route${id === route ? ' on' : ''}`} disabled={busy} onClick={() => setChoice(id)}>
              <b>{spaceName(id)}</b>
              <small>{id === route ? 'Chosen' : 'Retreat here'}</small>
            </button>
          ))}
        </div>
      )}
      {copy.blocked && <p className="axb-why">{copy.blocked}</p>}
      <Actions>
        <button className="axb-btn primary" disabled={busy || !stay} onClick={() => { if (stay) send(stay, who); }}>{copy.stay}</button>
        <button className="axb-btn" disabled={busy || !leave} onClick={() => { if (leave) send(leave, who); }}>{retreatLabel(combat, route)}</button>
      </Actions>
    </Panel>
  );
}

// ---------- battle over ----------

function ContinuePanel({ view, combat, busy, send }: { view: AxisView; combat: Combat; busy: boolean; send: Send }) {
  const result = resultFromCombat(combat);
  const target = { combatId: combat.id, visualSeq: combat.visualSeq };
  const sides: Side[] = ['attacker', 'defender'];
  const mine = sides
    .map((side) => ({ side, who: continueAuthority(view, side), done: combat.confirmed?.[side] ?? false }))
    .filter((row) => controls(view.controlledPowers, row.who));
  const open = mine.filter((row) => !row.done);
  return (
    <ResultCard result={result}>
      {open.length > 0 ? (
        <Actions>
          {open.map((row) => (
            <button key={row.side} className="axb-btn primary" disabled={busy} onClick={() => send({ type: 'battleContinue', ...target }, row.who)}>
              {open.length > 1 ? `Continue as ${combatantName(row.side === 'attacker' ? combat.attacker : defenderOf(combat.battle))}` : 'Continue'}
            </button>
          ))}
        </Actions>
      ) : (
        <p className="axb-result-wait">
          {result.owed.length > 0 ? `Waiting for ${result.owed.join(' and ')} to continue` : 'Returning to the map'}
        </p>
      )}
    </ResultCard>
  );
}

// ---------- carrier fighters ----------

function LandingPanel({ landing, view, act }: { landing: LandingView; view: AxisView; act: Act }) {
  const owner = landingOwner(landing);
  const cards = useMemo(() => landingCards(landing), [landing]);
  const progress = landing.progress;
  const fighter = progress.ok && progress.status === 'decision' ? progress.decision.fighter : null;
  const stamp = `${fighter?.ref ?? ''}:${landing.choices.length}`;
  const [sent, setSent] = useState<string | null>(null);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const busy = sent === stamp;
  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(() => setSent(null), 3500);
    return () => window.clearTimeout(id);
  }, [busy, stamp]);
  useEffect(() => { setChosenKey(null); }, [stamp]);
  // a single option is the only thing that can happen: it is preselected, but still confirmed
  const chosen = cards.find((c) => c.key === chosenKey) ?? (cards.length === 1 ? cards[0] : null);
  if (!progress.ok) {
    return (
      <Panel kicker="Carrier fighters" title="This landing needs attention">
        <p className="axb-why">{progress.error}</p>
      </Panel>
    );
  }
  if (!fighter || !owner) {
    return <Panel kicker="Carrier fighters" title="Landing resolved"><p>Returning to the map.</p></Panel>;
  }
  if (!controls(view.controlledPowers, owner)) {
    return (
      <Panel kicker="Carrier fighters" title={`Waiting for ${combatantName(owner)}`} seatPower={owner}>
        <p>{combatantName(owner)} is landing a fighter whose carrier was attacked in {spaceName(fighter.originSeaZone)}.</p>
      </Panel>
    );
  }
  const left = progress.remainingFighterRefs.length;
  return (
    <Panel kicker={left > 1 ? `Carrier fighters, ${left} to land` : 'Carrier fighter'} title="Where does this fighter land?" seatPower={owner}>
      <p>It defended from a carrier in {spaceName(fighter.originSeaZone)}. Choose one place.</p>
      <div className="axb-routes" role="radiogroup" aria-label="Landing places">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            role="radio"
            aria-checked={card.key === chosen?.key}
            className={`axb-route${card.kind === 'destroy' ? ' loss' : ''}${card.key === chosen?.key ? ' on' : ''}`}
            disabled={busy}
            onClick={() => setChosenKey(card.key)}
          >
            <b>{card.title}</b>
            <small>{card.detail}{card.open != null ? ` ${card.open} deck ${card.open === 1 ? 'space' : 'spaces'} open.` : ''}</small>
          </button>
        ))}
      </div>
      <Actions>
        <button
          className="axb-btn primary"
          disabled={busy || !chosen}
          onClick={() => { if (!chosen) return; setSent(stamp); act({ ...chosen.action, asPower: owner }); }}
        >
          {busy ? 'Sending' : !chosen ? 'Choose a place' : chosen.kind === 'destroy' ? 'Confirm the loss' : `Land at ${chosen.title}`}
        </button>
      </Actions>
    </Panel>
  );
}
