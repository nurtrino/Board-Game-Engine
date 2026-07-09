// Personal device for Dune: Imperium. The hand is the centrepiece: tap a
// card, pick a legal board space (costs and rewards shown), optionally
// deploy to the conflict. Reveal turns flip the rest of the hand and open
// the acquire strip. Intrigue, leader pick, combat bidding and every card
// choice run through explicit prompts. All moves are made here; the TV is
// the board.

import { useMemo, useState } from 'react';
import {
  CARD_BY_ID, DUNE_RULES, FACTIONS, INTRIGUE_BY_ID, LEADER_BY_ID, LEADERS, SELL_MELANGE, SPACES, SPACE_BY_ID,
  type DuneAction, type DuneView, type Faction,
} from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { useDuneScene, type DuneSceneDef } from './DuneScene';
import { DuneCard } from './DuneBoard';
import { GameIntro, type Intro } from '../ttr/GameIntro';
import { playSfx } from '../sfx';

const DUNE_INTRO: Intro = {
  title: 'Dune: Imperium',
  tagline: 'Deck-building meets worker placement on Arrakis.',
  goal: 'Reach 10 victory points — or lead when the last conflict is fought. Send agents to the board for resources, troops and influence; reveal your hand to buy better cards and fight; win conflicts for the biggest prizes.',
  points: [
    { label: 'Your house', detail: 'You start with a leader (two unique powers — tap your leader name any time to see them), a 10-card starter deck, 2 agents, 3 troops in your garrison, 1 water. Draw 5 cards each round.' },
    { label: 'A round', detail: 'Players alternate single turns. Each turn is either an agent turn or your one reveal turn. When everyone has revealed, the conflict resolves, spice builds up on the desert, and the next round begins with a new first player.' },
    { label: 'Agent turn', detail: 'Play one card from your hand and send an agent to one of the board spaces shown on that card. The space must be free and you must pay its cost (spice, water or solari). Take the space rewards plus the played card\'s agent box.' },
    { label: 'Combat spaces', detail: 'Spaces with crossed blades also let you deploy up to 2 garrison troops — plus any troops that turn recruited — into the current conflict.' },
    { label: 'Reveal turn', detail: 'When you are out of agents (or choose to stop), reveal the rest of your hand. Its persuasion buys new cards; its swords are combat strength. Then everything you played this round goes to your discard pile.' },
    { label: 'Buying cards', detail: 'Spend persuasion on the imperium row (or the reserve: Arrakis Liaison for 2, The Spice Must Flow for 9 — worth a VP). Purchases land in your discard pile; when your deck runs out, the discard reshuffles, so every buy comes back stronger.' },
    { label: 'Influence', detail: 'Faction spaces raise you on that faction\'s track. Reaching 2 is worth a VP. Reaching 4 pays that faction\'s bonus and, if you are ahead of everyone, its alliance — a VP another player can steal by passing you.' },
    { label: 'Combat', detail: 'After all reveals, compare strength: each troop in the conflict is 2, each revealed sword 1. The conflict card pays 1st and 2nd place (and 3rd with 4 players). Combat intrigue cards can swing it after strengths are shown; tied players all lose to the place below.' },
    { label: 'Intrigue', detail: 'Intrigue cards are secret. Plots play during your turn, combat cards during the battle, endgame cards add points when the game ends.' },
    { label: 'Mentat and upgrades', detail: 'The Mentat space hires an extra agent for the round plus a card draw. High Council (+2 persuasion every reveal) and Swordmaster (a permanent third agent) are one-time upgrades — buy them before your rivals.' },
    { label: 'Game end', detail: 'The game ends after the 10th conflict, or immediately when someone reaches 10 VP. Highest VP wins; ties break on spice, then solari, then water, then garrison troops.' },
  ],
  rulebook: '/dune/rulebook.pdf',
};

const FACTION_NAME: Record<Faction, string> = {
  emperor: 'Emperor', guild: 'Spacing Guild', beneGesserit: 'Bene Gesserit', fremen: 'Fremen',
};

const CSS = `
.dn-wrap { position: fixed; inset: 0; background: #05080b; color: #e8ebf0; font: 14px Inter, sans-serif; overflow: hidden; display: flex; flex-direction: column; }
.dn-top { display: flex; gap: 8px; align-items: center; padding: 10px 12px 6px; flex-wrap: wrap; }
.dn-res { display: flex; gap: 10px; font-size: 13px; opacity: 0.9; }
.dn-main { flex: 1; overflow-y: auto; padding: 0 12px 12px; }
.dn-hand { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 8px; }
.dn-card { border: none; background: none; padding: 0; cursor: pointer; position: relative; border-radius: 8px; }
.dn-card.sel { outline: 3px solid #e8ebf0; outline-offset: 2px; }
.dn-actions { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap; }
.dn-btn { padding: 12px 16px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06); color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1px; text-transform: uppercase; }
.dn-btn.primary { background: rgba(232,180,80,0.16); border-color: rgba(232,180,80,0.5); }
.dn-btn:disabled { opacity: 0.35; cursor: default; }
.dn-space { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #e8ebf0; cursor: pointer; font: 13px Inter, sans-serif; }
.dn-space:disabled { opacity: 0.4; cursor: default; }
.dn-overlay { position: absolute; inset: 0; background: rgba(3,6,9,0.92); z-index: 60; display: flex; flex-direction: column; padding: 16px; overflow-y: auto; gap: 8px; }
.dn-lab { font: 700 11px Inter, sans-serif; letter-spacing: 1.6px; text-transform: uppercase; opacity: 0.6; }
.dn-err { position: absolute; bottom: 74px; left: 50%; transform: translateX(-50%); background: #35131a; border: 1px solid rgba(255,90,90,0.4); color: #ffb3b3; padding: 8px 14px; border-radius: 10px; z-index: 70; font-size: 13px; }
`;

function rewardText(r: Record<string, unknown> | null | undefined): string {
  if (!r) return '';
  const bits: string[] = [];
  if (r.solari) bits.push(`${r.solari} solari`);
  if (r.spice) bits.push(`${r.spice} spice`);
  if (r.water) bits.push(`${r.water} water`);
  if (r.troops) bits.push(`${r.troops} troop${(r.troops as number) > 1 ? 's' : ''}`);
  if (r.draw) bits.push(`draw ${r.draw}`);
  if (r.intrigue) bits.push(`${r.intrigue} intrigue`);
  if (r.vp) bits.push(`${r.vp} VP`);
  if (r.persuasion) bits.push(`${r.persuasion} persuasion`);
  if (r.revealPersuasion) bits.push(`${r.revealPersuasion} reveal persuasion`);
  if (r.swords) bits.push(`${r.swords} sword${(r.swords as number) > 1 ? 's' : ''}`);
  if (r.influenceAny) bits.push(`${r.influenceAny} influence`);
  if (r.influence) bits.push(Object.entries(r.influence as Record<string, number>).map(([f, n]) => `${n} ${FACTION_NAME[f as Faction]}`).join(', '));
  if (r.mentat) bits.push('the Mentat');
  if (r.control) bits.push('control flag');
  if (r.trash) bits.push('trash a card');
  if (r.trashToDraw2) bits.push('trash: draw 2');
  if (r.stealIntrigue) bits.push('steal intrigue');
  if (r.acquireFoldspace) bits.push('a Foldspace card');
  if (r.highCouncil) bits.push('council seat (+2 persuasion)');
  if (r.swordmaster) bits.push('3rd agent');
  if (r.text) bits.push(String(r.text));
  if (r.choice) bits.push('choice');
  return bits.join(', ');
}

function costText(c: Record<string, number> | undefined): string {
  if (!c) return '';
  return Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ');
}

export function DunePlay({ view, act, error }: {
  view: DuneView;
  act: (a: DuneAction) => void;
  error: string | null;
}) {
  const scene = useDuneScene();
  const [selected, setSelected] = useState<string | null>(null); // hand card picked for an agent turn
  const [deploy, setDeploy] = useState(2);
  const [showIntro, setShowIntro] = useState(true);
  const [showIntrigue, setShowIntrigue] = useState(false);
  const [showMat, setShowMat] = useState(false);
  const me = view.you !== null ? view.players[view.you] : null;
  const myTurn = me !== null && view.turn === me.seat && !view.pending;
  const myPending = me !== null && view.pending?.seat === me.seat ? view.pending : null;

  const legalSpaces = useMemo(() => {
    if (!selected || !me) return [];
    const card = CARD_BY_ID[selected];
    if (!card) return [];
    const any = card.agents.includes('any');
    return SPACES.filter((sp) => any || card.agents.includes(sp.icon));
  }, [selected, me?.seat]);

  if (!scene || !me) return <div className="page center"><h2>Crossing the deep desert</h2></div>;

  const send = (a: DuneAction) => { playSfx('click'); act(a); };

  // ---------- leader pick ----------
  if (view.phase === 'leaders' && !me.leader) {
    const picking = view.turn === me.seat;
    return (
      <div className="dn-wrap">
        <style>{CSS}</style>
        <div className="dn-top">
          <span className="dn-lab">{picking ? 'Choose your leader' : `${view.players[view.turn].name} is choosing`}</span>
        </div>
        <div className="dn-main">
          <div className="dn-hand">
            {view.leaderPool.map((l) => (
              <button key={l} className="dn-card" disabled={!picking} onClick={() => send({ type: 'pick_leader', leader: l })}>
                <img src={LEADER_BY_ID[l].image} alt={LEADER_BY_ID[l].name} style={{ width: 168, borderRadius: 8, opacity: picking ? 1 : 0.5 }} />
              </button>
            ))}
          </div>
        </div>
        {error && <div className="dn-err">{error}</div>}
      </div>
    );
  }

  // ---------- pending decision ----------
  if (myPending) {
    const d = myPending.decision as Record<string, unknown> & { kind: string; label?: string };
    return (
      <div className="dn-wrap">
        <style>{CSS}</style>
        <div className="dn-overlay" style={{ position: 'relative', flex: 1 }}>
          <div className="dn-lab">{String(d.label ?? 'Choose')}</div>
          {(d.kind === 'influenceAny' || d.kind === 'influenceWhereBehind' || d.kind === 'influencePick') && (
            <>
              {((d.kind === 'influencePick' ? d.options as Faction[] : FACTIONS)).map((f) => (
                <button key={f} className="dn-btn" onClick={() => send({ type: 'choose', faction: f })}>{FACTION_NAME[f]}</button>
              ))}
              {d.kind === 'influenceWhereBehind' && <button className="dn-btn" onClick={() => send({ type: 'choose', accept: false })}>Skip</button>}
            </>
          )}
          {(d.kind === 'influencePickTwo' || d.kind === 'baronFactions') && (
            <PickTwoFactions onPick={(fs) => send({ type: 'choose', factions: fs })} />
          )}
          {d.kind === 'voiceSpace' && SPACES.map((sp) => (
            <button key={sp.id} className="dn-space" onClick={() => send({ type: 'choose', space: sp.id })}>
              <b>{sp.name}</b>
            </button>
          ))}
          {d.kind === 'trash' && (
            <>
              {[...me.hand ?? [], ...me.discard].map((c, i) => (
                <button key={`${c}-${i}`} className="dn-space" onClick={() => send({ type: 'choose', card: c })}>
                  <b>{CARD_BY_ID[c]?.name ?? c}</b><span style={{ opacity: 0.6 }}>trash</span>
                </button>
              ))}
              <button className="dn-btn" onClick={() => send({ type: 'choose', accept: false })}>Keep everything</button>
            </>
          )}
          {d.kind === 'discardOrLoseTroop' && (
            <>
              {(me.hand ?? []).map((c, i) => (
                <button key={`${c}-${i}`} className="dn-space" onClick={() => send({ type: 'choose', card: c })}>
                  <b>Discard {CARD_BY_ID[c]?.name ?? c}</b>
                </button>
              ))}
              <button className="dn-btn" onClick={() => send({ type: 'choose' })}>Lose a troop</button>
            </>
          )}
          {d.kind === 'helenaRow' && (
            <>
              {view.imperiumRow.map((c, i) => c && (
                <button key={i} className="dn-space" onClick={() => send({ type: 'choose', option: i })}>
                  <b>{CARD_BY_ID[c]?.name}</b><span style={{ opacity: 0.6 }}>set aside</span>
                </button>
              ))}
              <button className="dn-btn" onClick={() => send({ type: 'choose', accept: false })}>Skip</button>
            </>
          )}
          {d.kind === 'freeAcquire' && (
            <>
              {view.imperiumRow.map((c, i) => c && (CARD_BY_ID[c]?.cost ?? 99) <= (d.limit as number) && (
                <button key={i} className="dn-space" onClick={() => send({ type: 'choose', option: i })}>
                  <b>{CARD_BY_ID[c]?.name}</b><span style={{ opacity: 0.6 }}>{CARD_BY_ID[c]?.cost}</span>
                </button>
              ))}
              <button className="dn-btn" onClick={() => send({ type: 'choose', accept: false })}>Skip</button>
            </>
          )}
          {d.kind === 'recallAgent' && Object.entries(view.spaces).filter(([, seats]) => seats.includes(me.seat)).map(([sp]) => (
            <button key={sp} className="dn-space" onClick={() => send({ type: 'choose', space: sp })}>
              <b>{SPACE_BY_ID[sp]?.name ?? sp}</b><span style={{ opacity: 0.6 }}>recall</span>
            </button>
          ))}
          {d.kind === 'pickOpponentInConflict' && view.players.filter((q) => q.seat !== me.seat && q.inConflict > 0).map((q) => (
            <button key={q.seat} className="dn-space" onClick={() => send({ type: 'choose', seat: q.seat })}>
              <b>{q.name}</b><span style={{ opacity: 0.6 }}>{q.inConflict} in conflict</span>
            </button>
          ))}
          {d.kind === 'conflictChoice' && (
            <ConflictChoice
              options={d.options as Record<string, unknown>[]}
              pick={(d.pick as number) ?? 1}
              onPick={(idxs) => ((d.pick as number) ?? 1) === 1
                ? send({ type: 'choose', option: idxs[0] })
                : send({ type: 'choose', options: idxs })}
            />
          )}
        </div>
        {error && <div className="dn-err">{error}</div>}
      </div>
    );
  }

  const waitingOn = view.pending ? view.players[view.pending.seat] : null;

  // ---------- space picker for the selected card ----------
  if (selected && myTurn && view.phase === 'round') {
    const card = CARD_BY_ID[selected];
    return (
      <div className="dn-wrap">
        <style>{CSS}</style>
        <div className="dn-top">
          <span className="dn-lab">Send an agent with {card?.name}</span>
          <button className="dn-btn" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)}>Back</button>
        </div>
        <div className="dn-main" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {legalSpaces.map((sp) => {
            const occupied = (view.spaces[sp.id]?.length ?? 0) > 0 && sp.id !== 'highCouncil' && sp.id !== 'swordmaster';
            const blocked = view.voiceBlock?.space === sp.id && view.voiceBlock.by !== me.seat;
            return (
              <button
                key={sp.id}
                className="dn-space"
                disabled={(occupied && !card.agents.includes('any')) || blocked}
                onClick={() => {
                  const a: DuneAction = { type: 'agent', card: selected, space: sp.id };
                  if (sp.id === 'sellMelange') a.sell = Math.min(me.spice, 5) >= 2 ? Math.min(me.spice, 5) : 2;
                  if (sp.combat) a.deploy = deploy;
                  send(a);
                  setSelected(null);
                }}
              >
                <span>
                  <b>{sp.name}</b>
                  {sp.combat && <span style={{ opacity: 0.6 }}> — combat</span>}
                  {occupied && <span style={{ opacity: 0.6 }}> — occupied</span>}
                  {blocked && <span style={{ opacity: 0.6 }}> — the Voice</span>}
                  <div style={{ opacity: 0.65, fontSize: 12 }}>
                    {sp.cost && `pay ${costText(sp.cost)} · `}
                    {sp.id === 'sellMelange' ? `sell 2-5 spice (${Object.entries(SELL_MELANGE).map(([k, v]) => `${k}→${v}`).join(' ')})` : rewardText(sp.rewards)}
                    {sp.influence && ` · +1 ${FACTION_NAME[sp.influence]}`}
                  </div>
                </span>
              </button>
            );
          })}
          <div className="dn-lab" style={{ paddingTop: 8 }}>Deploy to conflict (combat spaces)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="dn-btn" style={n === deploy ? { outline: '2px solid #e8ebf0' } : undefined} onClick={() => setDeploy(n)}>{n}</button>
            ))}
          </div>
          <div style={{ opacity: 0.55, fontSize: 12 }}>Up to 2 from your garrison plus any troops this turn recruits.</div>
        </div>
        {error && <div className="dn-err">{error}</div>}
      </div>
    );
  }

  // ---------- main screen ----------
  const canAgent = myTurn && view.phase === 'round' && !me.revealed && me.actedThisTurn == null && me.agentsLeft + (me.mentat ? 1 : 0) > 0;
  const revealing = myTurn && view.phase === 'round' && me.revealed;
  const plotCards = (me.intrigue ?? []).filter((c) => INTRIGUE_BY_ID[c]?.kind === 'plot');
  const combatCards = (me.intrigue ?? []).filter((c) => INTRIGUE_BY_ID[c]?.kind.includes('combat'));

  return (
    <div className="dn-wrap">
      <style>{CSS}</style>
      <div className="dn-top">
        <span style={{ width: 12, height: 12, borderRadius: '50%', background: SEAT_HEX[me.color] }} />
        <b>{me.name}</b>
        {me.leader && (
          <button
            style={{ background: 'none', border: 'none', color: '#e8ebf0', opacity: 0.75, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, font: 'inherit' }}
            onClick={() => setShowMat(true)}
          >{LEADER_BY_ID[me.leader]?.name}</button>
        )}
        <span style={{ marginLeft: 'auto', font: '800 16px Inter, sans-serif' }}>{me.vp} VP</span>
        <button className="dn-btn" style={{ padding: '6px 10px' }} onClick={() => setShowIntro(true)}>?</button>
      </div>
      <div className="dn-top" style={{ paddingTop: 0 }}>
        <div className="dn-res">
          <span>{me.solari} solari</span>
          <span>{me.spice} spice</span>
          <span>{me.water} water</span>
          <span>{me.garrison} garrison</span>
          {me.inConflict > 0 && <span>{me.inConflict} in conflict</span>}
          <span>{me.agentsLeft}{me.mentat ? '+M' : ''} agents</span>
          <span style={{ opacity: 0.7 }}>deck {me.deckCount} · discard {me.discard.length}</span>
          {revealing && <span style={{ fontWeight: 800 }}>{me.persuasion} persuasion</span>}
        </div>
      </div>
      <div className="dn-top" style={{ paddingTop: 0, fontSize: 12, opacity: 0.75 }}>
        {FACTIONS.map((f) => (
          <span key={f} style={{ fontWeight: me.alliances.includes(f) ? 800 : 400 }}>
            {FACTION_NAME[f]} {me.influence[f]}{me.alliances.includes(f) ? '★' : ''}
          </span>
        ))}
      </div>

      <div className="dn-main">
        {/* status line */}
        <div className="dn-lab" style={{ padding: '6px 0' }}>
          {view.phase === 'ended' ? `${view.players.find((p) => p.color === view.winner)?.name} wins`
            : waitingOn ? `${waitingOn.name} is deciding`
            : view.phase === 'combat' ? (view.turn === me.seat ? 'Combat — play a card or pass' : `Combat — ${view.players[view.turn].name} bids`)
            : myTurn ? (me.actedThisTurn != null ? (revealing ? 'Buy cards, then end your turn' : 'End your turn') : canAgent ? 'Play a card for an agent turn, or reveal' : 'Reveal your hand')
            : `${view.players[view.turn].name} is acting`}
        </div>

        {/* reveal strip: acquire targets */}
        {revealing && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 8 }}>
            {view.imperiumRow.map((c, i) => c && (
              <button key={i} className="dn-card" onClick={() => send({ type: 'acquire', row: i })}
                style={{ opacity: (CARD_BY_ID[c]?.cost ?? 99) <= me.persuasion ? 1 : 0.4 }}>
                <DuneCard scene={scene} id={c} w={92} h={138} />
                <div style={{ fontSize: 11, textAlign: 'center', opacity: 0.75 }}>{CARD_BY_ID[c]?.cost}</div>
              </button>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="dn-btn" disabled={me.persuasion < 2 || view.reserve.arrakisLiaison <= 0} onClick={() => send({ type: 'acquire', reserve: 'arrakisLiaison' })}>Liaison (2)</button>
              <button className="dn-btn" disabled={me.persuasion < 9 - me.spiceMustFlowBonus || view.reserve.theSpiceMustFlow <= 0} onClick={() => send({ type: 'acquire', reserve: 'theSpiceMustFlow' })}>
                Spice Must Flow ({9 - (me.spiceMustFlowBonus ?? 0)})
              </button>
              {me.helenaAside && (
                <button className="dn-btn" onClick={() => send({ type: 'acquire', helena: true })}>
                  {CARD_BY_ID[me.helenaAside.card]?.name} ({Math.max(0, (CARD_BY_ID[me.helenaAside.card]?.cost ?? 0) - 1)})
                </button>
              )}
            </div>
          </div>
        )}

        {/* hand */}
        {(me.hand?.length ?? 0) > 0 && (
          <>
            <div className="dn-lab">Hand</div>
            <div className="dn-hand">
              {(me.hand ?? []).map((c, i) => (
                <button key={`${c}-${i}`} className={`dn-card${selected === c ? ' sel' : ''}`}
                  onClick={() => { if (canAgent) { setSelected(c); playSfx('click'); } }}>
                  <DuneCard scene={scene} id={c} w={104} h={156} />
                </button>
              ))}
            </div>
          </>
        )}

        {/* in play */}
        {me.inPlay.length > 0 && (
          <>
            <div className="dn-lab" style={{ paddingTop: 10 }}>In play</div>
            <div className="dn-hand">
              {me.inPlay.map((c, i) => (
                <div key={`${c}-${i}`} style={{ opacity: 0.8 }}>
                  <DuneCard scene={scene} id={c} w={82} h={122} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* actions */}
      <div className="dn-actions">
        {view.phase === 'round' && myTurn && !me.revealed && me.actedThisTurn == null && (
          <button className="dn-btn primary" onClick={() => send({ type: 'reveal' })}>Reveal</button>
        )}
        {view.phase === 'round' && myTurn && (me.actedThisTurn != null) && (
          <button className="dn-btn primary" onClick={() => { setSelected(null); send({ type: 'end_turn' }); }}>End Turn</button>
        )}
        {view.phase === 'combat' && view.turn === me.seat && !view.pending && (
          <button className="dn-btn primary" onClick={() => send({ type: 'combat_pass' })}>Pass</button>
        )}
        {(me.intrigue?.length ?? 0) > 0 && (
          <button className="dn-btn" onClick={() => setShowIntrigue(true)}>Intrigue ({me.intrigue!.length})</button>
        )}
        <button className="dn-btn" onClick={() => setShowMat(true)}>House</button>
      </div>

      {/* house mat: leader, pieces, piles */}
      {showMat && (
        <div className="dn-overlay">
          <div className="dn-lab">Your house</div>
          {me.leader && (() => {
            const l = LEADER_BY_ID[me.leader!];
            return (
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <img src={l.image} alt={l.name} style={{ width: 148, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <b style={{ fontSize: 15 }}>{l.name}</b>
                  <div>
                    <div className="dn-lab" style={{ fontSize: 10 }}>{l.passive.title}</div>
                    <div style={{ opacity: 0.75, lineHeight: 1.45 }}>{l.passive.text}</div>
                  </div>
                  <div>
                    <div className="dn-lab" style={{ fontSize: 10 }}>Signet ring — {l.signet.title}</div>
                    <div style={{ opacity: 0.75, lineHeight: 1.45 }}>{l.signet.text}</div>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="dn-lab" style={{ paddingTop: 10 }}>Pieces</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 13 }}>
            <span>Agents: {me.agentsLeft} of {me.agentsTotal} left{me.mentat ? ' (incl. the Mentat)' : ''}</span>
            <span>Victory points: {me.vp}</span>
            <span>Garrison: {me.garrison} troops</span>
            <span>In conflict: {me.inConflict}</span>
            <span>Supply: {DUNE_RULES.troopsTotal - me.garrison - me.inConflict} troops</span>
            <span>Intrigue cards: {me.intrigue?.length ?? 0}</span>
            {me.hasSwordmaster && <span>Swordmaster — third agent</span>}
            {me.hasHighCouncil && <span>High Council seat — +2 persuasion</span>}
          </div>
          <div className="dn-lab" style={{ paddingTop: 10 }}>Influence</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 13 }}>
            {FACTIONS.map((f) => (
              <span key={f} style={{ fontWeight: me.alliances.includes(f) ? 800 : 400 }}>
                {FACTION_NAME[f]}: {me.influence[f]}{me.alliances.includes(f) ? ' — alliance' : ''}
              </span>
            ))}
          </div>
          <div className="dn-lab" style={{ paddingTop: 10 }}>Deck</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {me.deckCount} in deck · {me.hand?.length ?? me.handCount} in hand · {me.discard.length} discarded
            {me.deckTop !== undefined && <div style={{ paddingTop: 4 }}>Prescience — top of deck: <b>{me.deckTop ? CARD_BY_ID[me.deckTop]?.name : 'empty'}</b></div>}
          </div>
          {me.discard.length > 0 && (
            <>
              <div className="dn-lab" style={{ paddingTop: 6 }}>Discard pile</div>
              <div className="dn-hand">
                {me.discard.map((c, i) => (
                  <div key={`${c}-${i}`} style={{ opacity: 0.85 }}>
                    <DuneCard scene={scene} id={c} w={82} h={122} />
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="dn-btn" style={{ marginTop: 8 }} onClick={() => setShowMat(false)}>Close</button>
        </div>
      )}

      {/* intrigue drawer */}
      {showIntrigue && (
        <div className="dn-overlay">
          <div className="dn-lab">Intrigue — {view.phase === 'combat' ? 'combat cards' : 'plots on your turn'}</div>
          {(me.intrigue ?? []).map((c, i) => {
            const def = INTRIGUE_BY_ID[c];
            const playable = view.phase === 'combat'
              ? view.turn === me.seat && !view.pending && combatCards.includes(c)
              : myTurn && view.phase === 'round' && plotCards.includes(c);
            return (
              <button key={`${c}-${i}`} className="dn-space" disabled={!playable}
                onClick={() => { setShowIntrigue(false); send({ type: 'intrigue', card: c, deploy: 3 }); }}>
                <span>
                  <b>{def?.name ?? c}</b> <span style={{ opacity: 0.5, fontSize: 11 }}>{def?.kind}</span>
                  <div style={{ opacity: 0.65, fontSize: 12 }}>{costText(def?.effect.cost as Record<string, number>)} {rewardText(def?.effect)}</div>
                </span>
              </button>
            );
          })}
          <button className="dn-btn" onClick={() => setShowIntrigue(false)}>Close</button>
        </div>
      )}

      {showIntro && <GameIntro intro={DUNE_INTRO} onClose={() => setShowIntro(false)} />}
      {error && <div className="dn-err">{error}</div>}
    </div>
  );
}

function PickTwoFactions({ onPick }: { onPick: (fs: Faction[]) => void }) {
  const [first, setFirst] = useState<Faction | null>(null);
  return (
    <>
      {FACTIONS.map((f) => (
        <button key={f} className="dn-btn" style={first === f ? { outline: '2px solid #e8ebf0' } : undefined}
          onClick={() => {
            if (!first) setFirst(f);
            else if (first !== f) onPick([first, f]);
          }}>
          {FACTION_NAME[f]}{first === f ? ' — pick a second' : ''}
        </button>
      ))}
    </>
  );
}

function ConflictChoice({ options, pick, onPick }: {
  options: Record<string, unknown>[]; pick: number; onPick: (idxs: number[]) => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  return (
    <>
      {options.map((o, i) => (
        <button key={i} className="dn-space" style={chosen.includes(i) ? { outline: '2px solid #e8ebf0' } : undefined}
          onClick={() => {
            if (pick === 1) return onPick([i]);
            const next = chosen.includes(i) ? chosen.filter((x) => x !== i) : [...chosen, i];
            if (next.length === pick) onPick(next);
            else setChosen(next);
          }}>
          <span>
            <b>{rewardText(o) || 'Nothing'}</b>
            {o.cost != null && <div style={{ opacity: 0.65, fontSize: 12 }}>pay {costText(o.cost as Record<string, number>)}</div>}
          </span>
        </button>
      ))}
    </>
  );
}
