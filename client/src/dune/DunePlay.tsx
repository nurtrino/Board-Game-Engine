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
import { DuneMat } from './DuneMat';
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
  walkthrough: [
    {
      title: 'What you are trying to do',
      body: 'Dune: Imperium is a race to 10 victory points (VP). Whoever hits 10 wins immediately; otherwise the player with the most VP when the last conflict is fought takes it.\n\nVP come from a few reliable places: winning conflicts, reaching influence 2 and 4 with the factions, holding a faction alliance, controlling Arrakeen or Carthag, and a handful of powerful cards. You rarely win on one path — you stack two or three.\n\nEverything else in the game — sending agents, buying cards, gathering spice and water — is just fuel for those VP.',
    },
    {
      title: 'Your house',
      body: 'You start with a leader (two unique powers: a passive and a signet-ring ability — tap your leader name any time to read them), a 10-card starter deck, 2 agents, 3 troops in your garrison, and 1 water.\n\nEach round you shuffle and draw 5 cards. Those 5 cards ARE your options this round — each one lists the board spaces its agent may visit, plus a "reveal" value (persuasion and swords) for later.\n\nYour resources: solari (money), spice (the desert currency), and water (needed at several desert spaces). Spend them to reach the strongest spaces.',
    },
    {
      title: 'A round, and whose turn it is',
      body: 'Players take single turns, going around the table. On your turn you do exactly one of two things: an AGENT turn (place one agent) or your one REVEAL turn.\n\nYou keep taking agent turns — one per turn, alternating with everyone else — until your agents are used up or you choose to stop. Then you reveal.\n\nWhen everyone has revealed, the conflict is resolved, fresh spice appears on the desert, a new conflict is flipped, and the next round begins with a new first player.',
    },
    {
      title: 'The agent turn — the heart of the game',
      body: 'Pick one card from your hand and send an agent to one of the board spaces printed on that card. The space must be empty (most spaces hold one agent) and you must pay its cost — spice, water, or solari.\n\nYou then take that space\'s rewards AND the played card\'s "agent" box. So the card matters twice: which spaces it can reach, and the bonus it hands you for going there.\n\nSpaces come in families: city/CHOAM spaces give resources and let you buy or draw; faction spaces raise your influence; the Spice fields hand you spice that has piled up; and combat spaces let you commit troops to the fight.',
    },
    {
      title: 'Combat spaces and troops',
      body: 'Spaces marked with crossed blades are combat spaces. When you send an agent there you may also deploy up to 2 troops from your garrison — plus any troops that same turn just recruited — into this round\'s conflict.\n\nTroops in the conflict are your muscle: each one is worth 2 combat strength. Garrison troops sitting at home are safe but do nothing until deployed.\n\nDeciding how many to commit is a real choice: over-commit and you win a conflict you didn\'t need; hold back and a rival steals the prize.',
    },
    {
      title: 'The reveal turn',
      body: 'When you are out of agents (or simply want to stop placing), you REVEAL: flip the rest of your hand face-up. Two numbers matter — persuasion (buys cards) and swords (adds combat strength to any troops you already committed).\n\nSpend persuasion on the acquire strip: the face-up Imperium Row, or the reserve (Arrakis Liaison for 2, The Spice Must Flow for 9 — and it is worth a VP). Bought cards go to your DISCARD pile, not your hand.\n\nWhen your deck runs out it reshuffles the discard, so every card you buy comes back around, stronger each cycle. After you finish buying, everything you played this round is discarded and your turn ends.',
    },
    {
      title: 'Influence and the four factions',
      body: 'The Emperor, Spacing Guild, Bene Gesserit and Fremen each have a track. Faction spaces (and some cards) raise you on a track.\n\nReaching 2 on a track scores a VP. Reaching 4 pays that faction\'s bonus and — if you are strictly ahead of everyone on it — its ALLIANCE, worth another VP. An alliance can be stolen: if a rival passes your spot, the alliance flag moves to them.\n\nInfluence is one of the steadiest VP engines in the game. Two tracks to 4 with both alliances is 4 VP before you\'ve won a single fight.',
    },
    {
      title: 'Resolving the conflict',
      body: 'After everyone reveals, strengths are compared: each troop you have in the conflict is 2, each revealed sword is 1.\n\nThe round\'s conflict card pays 1st and 2nd place (and 3rd in a 4-player game) — troops, spice, VP, control of a city, whatever it shows. Ties all lose to the place below, so an exact tie for first can leave both players with second-place scraps or nothing.\n\nCombat intrigue cards can be played after strengths are shown to swing the result — so a fight is never truly over until the last card is down.',
    },
    {
      title: 'Intrigue and one-time upgrades',
      body: 'Intrigue cards are secret. There are three kinds: plots (play on your own turn), combat cards (play during the battle), and endgame cards (extra points scored when the game ends).\n\nThe Mentat space hires an extra agent for the round and draws you a card — a great tempo boost. Two upgrades change your whole game: High Council (+2 persuasion on every reveal, forever) and Swordmaster (a permanent third agent). They are expensive and one-per-player-per-game, so buy them before your rivals lock you out.',
    },
    {
      title: 'Your first round, step by step',
      body: 'Look at your five cards. Each shows which spaces it can reach. A common strong opening: use one card to grab money or spice and buy toward High Council or Swordmaster, and another to nudge an influence track toward 2.\n\nSend your first agent — pay the cost, take the rewards and the card\'s agent box. If it was a combat space and you like this round\'s conflict prize, deploy a troop or two. Then it is the next player\'s turn.\n\nOn your next turn send your second agent the same way. Then REVEAL: spend your persuasion on the best card you can afford (or save toward an upgrade), and see how the conflict shakes out. That is one full round — now you draw five fresh cards and do it again, a little stronger.',
    },
    {
      title: 'Strategy — how games are won',
      body: 'Tempo vs. engine: early spaces and cheap cards give you resources NOW; upgrades and expensive cards pay off over many rounds. Good players lean on tempo early and let their deck take over.\n\nDon\'t sleepwalk past combat. Even one troop can steal a second-place prize nobody contested — free VP and resources. But don\'t pour your whole garrison into a fight whose reward you don\'t want.\n\nPick two VP paths and commit: e.g. two alliances plus the odd conflict win, or a control-Arrakeen board game plus The Spice Must Flow. Watch rivals\' VP — when someone nears 10, deny their last point (pass an alliance, contest their conflict) rather than chasing your own.',
    },
  ],
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

/* resource chips */
.dn-chips { display: flex; gap: 7px; flex-wrap: wrap; }
.dn-chip { display: flex; align-items: center; gap: 8px; padding: 6px 11px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.11); background: rgba(255,255,255,0.05); }
.dn-chip-dot { width: 13px; height: 13px; border-radius: 4px; flex: 0 0 auto; box-shadow: inset 0 -1px 2px rgba(0,0,0,0.35); }
.dn-chip-v { font: 800 17px Inter, sans-serif; line-height: 1; }
.dn-chip-l { font: 600 10px Inter, sans-serif; letter-spacing: 0.6px; text-transform: uppercase; opacity: 0.55; }
.dn-chip.big { padding: 10px 15px; }
.dn-chip.big .dn-chip-v { font-size: 24px; }
.dn-chip.big .dn-chip-l { font-size: 11px; }

/* influence tracks */
.dn-inf-row { display: flex; gap: 7px 16px; flex-wrap: wrap; }
.dn-inf { display: flex; align-items: center; gap: 8px; }
.dn-inf-name { font: 700 12px Inter, sans-serif; min-width: 96px; opacity: 0.9; }
.dn-inf-pips { display: flex; align-items: center; gap: 4px; }
.dn-pip { width: 15px; height: 15px; border-radius: 4px; }
.dn-pip.mark { box-shadow: 0 0 0 1.5px rgba(255,255,255,0.4); }
.dn-inf-plus { font: 800 12px Inter, sans-serif; opacity: 0.8; margin-left: 3px; }

/* section header inside overlays */
.dn-sec { font: 700 11px Inter, sans-serif; letter-spacing: 1.4px; text-transform: uppercase; opacity: 0.55; margin: 14px 0 2px; }
.dn-sec:first-of-type { margin-top: 2px; }
`;

const FACTION_COLOR: Record<Faction, string> = {
  emperor: '#e05a5a', guild: '#e0a34a', beneGesserit: '#8a7fe0', fremen: '#6ac07a',
};
const RES_COLOR = { solari: '#e8b84a', spice: '#e08a3a', water: '#5aa9e0', persuasion: '#b07fd4', strength: '#d9534a', intrigue: '#47b8a8', vp: '#6bd08a' };

function Chip({ color, value, label, big }: { color: string; value: string | number; label: string; big?: boolean }) {
  return (
    <div className={`dn-chip${big ? ' big' : ''}`}>
      <span className="dn-chip-dot" style={{ background: color }} />
      <span className="dn-chip-v">{value}</span>
      <span className="dn-chip-l">{label}</span>
    </div>
  );
}

function InfluenceTrack({ faction, value, allied }: { faction: Faction; value: number; allied: boolean }) {
  const c = FACTION_COLOR[faction];
  return (
    <div className="dn-inf">
      <span className="dn-inf-name" style={{ color: allied ? c : undefined }}>{FACTION_NAME[faction]}{allied ? ' ★' : ''}</span>
      <span className="dn-inf-pips">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`dn-pip${n === 2 || n === 4 ? ' mark' : ''}`}
            title={n === 2 ? 'reaching 2 scores a VP' : n === 4 ? 'reaching 4 pays the bonus and alliance' : undefined}
            style={{ background: value >= n ? c : 'rgba(255,255,255,0.09)' }} />
        ))}
        {value > 4 && <span className="dn-inf-plus" style={{ color: c }}>+{value - 4}</span>}
      </span>
    </div>
  );
}

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
  const [sell, setSell] = useState(2); // Sell Melange amount (2-5)
  const [useBox, setUseBox] = useState(true); // pay the card's optional agent-box cost
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
        <div className="dn-main" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 14px' }}>
          <div style={{ textAlign: 'center', maxWidth: 560 }}>
            <div className="dn-lab">Dune: Imperium</div>
            <h1 style={{ fontSize: 24, margin: '4px 0 6px' }}>{picking ? 'Choose your leader' : `${view.players[view.turn].name} is choosing`}</h1>
            <p style={{ opacity: 0.6, fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
              {picking ? 'Each leader has a passive power and a signet-ring ability. Tap one to take it.' : 'Waiting for the other players to pick their leaders.'}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', maxWidth: 780, margin: '0 auto' }}>
            {view.leaderPool.map((l) => (
              <button key={l} className="dn-card" disabled={!picking} onClick={() => send({ type: 'pick_leader', leader: l })}>
                <img src={LEADER_BY_ID[l].image} alt={LEADER_BY_ID[l].name}
                  style={{ width: 216, maxWidth: '44vw', borderRadius: 10, opacity: picking ? 1 : 0.45, boxShadow: '0 6px 20px rgba(0,0,0,0.5)' }} />
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
        <div className="dn-overlay" style={{ position: 'relative', flex: 1, alignSelf: 'center', width: '100%', maxWidth: 560 }}>
          <div className="dn-lab" style={{ textAlign: 'center', fontSize: 13 }}>{String(d.label ?? 'Choose')}</div>
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
              {[...me.hand ?? [], ...me.discard, ...me.inPlay].map((c, i) => (
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
    const boxCost = card?.agentBox?.cost as Record<string, number> | undefined;
    return (
      <div className="dn-wrap">
        <style>{CSS}</style>
        <div className="dn-top">
          <span className="dn-lab">Send an agent with {card?.name}</span>
          <button className="dn-btn" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)}>Back</button>
        </div>
        <div className="dn-main" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {boxCost && (
            <button
              className="dn-space"
              style={useBox ? { outline: '2px solid #e8ebf0' } : undefined}
              onClick={() => setUseBox(!useBox)}
            >
              <span>
                <b>Card effect · pay {costText(boxCost)}</b>
                <div style={{ opacity: 0.65, fontSize: 12 }}>
                  {rewardText(card.agentBox)} · tap to {useBox ? 'skip (you are never forced to pay)' : 'pay it'}
                </div>
              </span>
              <span style={{ opacity: 0.7 }}>{useBox ? 'PAYING' : 'SKIPPING'}</span>
            </button>
          )}
          {legalSpaces.map((sp) => {
            const occupied = (view.spaces[sp.id]?.length ?? 0) > 0 && sp.id !== 'highCouncil' && sp.id !== 'swordmaster';
            const blocked = view.voiceBlock?.space === sp.id && view.voiceBlock.by !== me.seat;
            const bonus = sp.maker ? view.makerSpice[sp.id as keyof typeof view.makerSpice] ?? 0 : 0;
            return (
              <button
                key={sp.id}
                className="dn-space"
                disabled={(occupied && !card.agents.includes('any')) || blocked}
                onClick={() => {
                  const a: DuneAction = { type: 'agent', card: selected, space: sp.id };
                  if (sp.id === 'sellMelange') a.sell = sell;
                  if (sp.combat) a.deploy = deploy;
                  if (boxCost) a.useOptional = useBox;
                  send(a);
                  setSelected(null);
                }}
              >
                <span>
                  <b>{sp.name}</b>
                  {sp.combat && <span style={{ opacity: 0.6 }}> · combat</span>}
                  {occupied && <span style={{ opacity: 0.6 }}> · occupied</span>}
                  {blocked && <span style={{ opacity: 0.6 }}> · the Voice</span>}
                  <div style={{ opacity: 0.65, fontSize: 12 }}>
                    {sp.cost && `pay ${costText(sp.cost)} · `}
                    {sp.id === 'sellMelange' ? `sell 2-5 spice (${Object.entries(SELL_MELANGE).map(([k, v]) => `${k}→${v}`).join(' ')})` : rewardText(sp.rewards)}
                    {sp.influence && ` · +1 ${FACTION_NAME[sp.influence]}`}
                    {bonus > 0 && ` · +${bonus} bonus spice waiting`}
                  </div>
                </span>
              </button>
            );
          })}
          {legalSpaces.some((sp) => sp.id === 'sellMelange') && me.spice >= 2 && (
            <>
              <div className="dn-lab" style={{ paddingTop: 8 }}>Spice to sell (Sell Melange)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[2, 3, 4, 5].map((n) => (
                  <button key={n} className="dn-btn" disabled={n > me.spice}
                    style={n === sell ? { outline: '2px solid #e8ebf0' } : undefined} onClick={() => setSell(n)}>
                    {n} for {SELL_MELANGE[String(n)]}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="dn-lab" style={{ paddingTop: 8 }}>Deploy to conflict (combat spaces)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="dn-btn" style={n === deploy ? { outline: '2px solid #e8ebf0' } : undefined} onClick={() => setDeploy(n)}>{n}</button>
            ))}
          </div>
          <div style={{ opacity: 0.55, fontSize: 12 }}>Up to 2 from your garrison plus any troops this turn recruits.</div>
          {view.conflict && (
            <>
              <div className="dn-lab" style={{ paddingTop: 8 }}>This round's conflict</div>
              <DuneCard scene={scene} id={view.conflict} w={128} h={196} />
            </>
          )}
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
      <div className="dn-top" style={{ paddingTop: 2 }}>
        <div className="dn-chips">
          <Chip color={RES_COLOR.solari} value={me.solari} label="Solari" />
          <Chip color={RES_COLOR.spice} value={me.spice} label="Spice" />
          <Chip color={RES_COLOR.water} value={me.water} label="Water" />
          <Chip color={SEAT_HEX[me.color]} value={me.garrison} label="Garrison" />
          {me.inConflict > 0 && <Chip color={RES_COLOR.strength} value={me.inConflict} label="In fight" />}
          <Chip color={SEAT_HEX[me.color]} value={`${me.agentsLeft}${me.mentat ? '+1' : ''}`} label="Agents" />
          {me.intrigueCount > 0 && <Chip color={RES_COLOR.intrigue} value={me.intrigueCount} label="Intrigue" />}
          {revealing && <Chip color={RES_COLOR.persuasion} value={me.persuasion} label="Persuasion" />}
          {view.phase === 'combat' && <Chip color={RES_COLOR.strength} value={me.strength} label="Strength" />}
        </div>
      </div>
      <div className="dn-top" style={{ paddingTop: 2 }}>
        <div className="dn-inf-row">
          {FACTIONS.map((f) => (
            <InfluenceTrack key={f} faction={f} value={me.influence[f]} allied={me.alliances.includes(f)} />
          ))}
        </div>
      </div>

      <div className="dn-main">
        {/* the player mat: leader card, agents, troops, resources as real objects */}
        <div style={{ paddingTop: 6, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="dn-lab">Your board</span>
          <span style={{ fontSize: 11, opacity: 0.45 }}>drag to look around · tap House for the full detail</span>
        </div>
        <div style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
          <DuneMat scene={scene} view={view} me={me} height="42vh" />
        </div>

        {/* status line */}
        <div className="dn-lab" style={{ padding: '6px 0' }}>
          {view.phase === 'ended' ? `${view.players.find((p) => p.color === view.winner)?.name} wins`
            : waitingOn ? `${waitingOn.name} is deciding`
            : view.phase === 'combat' ? (view.turn === me.seat ? 'Combat · play a card or pass' : `Combat · ${view.players[view.turn].name} bids`)
            : myTurn ? (me.actedThisTurn != null ? (revealing ? 'Buy cards, then end your turn' : 'End your turn') : canAgent ? 'Play a card for an agent turn, or reveal' : 'Reveal your hand')
            : `${view.players[view.turn].name} is acting`}
        </div>

        {/* combat: everyone's strength */}
        {view.phase === 'combat' && (
          <div style={{ display: 'flex', gap: 12, fontSize: 13, paddingBottom: 6, flexWrap: 'wrap' }}>
            {view.players.filter((p) => p.inConflict > 0 || p.strength > 0).map((p) => (
              <span key={p.seat} style={{ fontWeight: p.seat === me.seat ? 800 : 400 }}>
                {p.name}: {p.strength} strength
              </span>
            ))}
          </div>
        )}

        {/* current conflict, always in reach on the device */}
        {view.conflict && view.phase !== 'ended' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', paddingBottom: 8 }}>
            <DuneCard scene={scene} id={view.conflict} w={86} h={132} />
            <span className="dn-lab">Conflict · round {view.round}</span>
          </div>
        )}

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
                  onClick={() => { if (canAgent) { setSelected(c); setUseBox(true); playSfx('click'); } }}>
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

      {/* house overlay: leader powers, resources, forces, influence, mat, deck */}
      {showMat && (
        <div className="dn-overlay">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: SEAT_HEX[me.color] }} />
            <b style={{ fontSize: 16 }}>{me.name}</b>
            <Chip color={RES_COLOR.vp} value={me.vp} label="VP" />
            <button className="dn-btn" style={{ marginLeft: 'auto', padding: '7px 14px' }} onClick={() => setShowMat(false)}>Close</button>
          </div>

          {me.leader && (() => {
            const l = LEADER_BY_ID[me.leader!];
            return (
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginTop: 6 }}>
                <img src={l.image} alt={l.name} style={{ width: 156, borderRadius: 10, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                  <b style={{ fontSize: 15 }}>{l.name}</b>
                  <div>
                    <div className="dn-lab" style={{ fontSize: 10 }}>{l.passive.title}</div>
                    <div style={{ opacity: 0.78, lineHeight: 1.45 }}>{l.passive.text}</div>
                  </div>
                  <div>
                    <div className="dn-lab" style={{ fontSize: 10 }}>Signet ring · {l.signet.title}</div>
                    <div style={{ opacity: 0.78, lineHeight: 1.45 }}>{l.signet.text}</div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="dn-sec">Resources</div>
          <div className="dn-chips">
            <Chip big color={RES_COLOR.solari} value={me.solari} label="Solari" />
            <Chip big color={RES_COLOR.spice} value={me.spice} label="Spice" />
            <Chip big color={RES_COLOR.water} value={me.water} label="Water" />
          </div>

          <div className="dn-sec">Forces & upgrades</div>
          <div className="dn-chips">
            <Chip color={SEAT_HEX[me.color]} value={me.garrison} label="Garrison" />
            <Chip color={RES_COLOR.strength} value={me.inConflict} label="In fight" />
            <Chip color="#8a94a6" value={DUNE_RULES.troopsTotal - me.garrison - me.inConflict} label="Supply" />
            <Chip color={SEAT_HEX[me.color]} value={`${me.agentsLeft}/${me.agentsTotal}${me.mentat ? '+M' : ''}`} label="Agents" />
            <Chip color={RES_COLOR.intrigue} value={me.intrigueCount} label="Intrigue" />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 6, fontSize: 12.5, opacity: 0.85 }}>
            {me.hasSwordmaster && <span className="dn-chip" style={{ padding: '5px 10px' }}>Swordmaster — permanent 3rd agent</span>}
            {me.hasHighCouncil && <span className="dn-chip" style={{ padding: '5px 10px' }}>High Council seat — +2 persuasion each reveal</span>}
            {!me.hasSwordmaster && !me.hasHighCouncil && <span style={{ opacity: 0.5 }}>No upgrades yet — High Council and Swordmaster are strong early buys.</span>}
          </div>

          <div className="dn-sec">Influence · 2 scores a VP, 4 pays the bonus and the alliance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FACTIONS.map((f) => (
              <InfluenceTrack key={f} faction={f} value={me.influence[f]} allied={me.alliances.includes(f)} />
            ))}
          </div>

          <div className="dn-sec">Your player mat</div>
          <div style={{ border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
            <DuneMat scene={scene} view={view} me={me} height="52vh" />
          </div>

          <div className="dn-sec">Deck</div>
          <div className="dn-chips">
            <Chip color="#8a94a6" value={me.deckCount} label="In deck" />
            <Chip color="#8a94a6" value={me.hand?.length ?? me.handCount} label="In hand" />
            <Chip color="#8a94a6" value={me.discard.length} label="Discard" />
          </div>
          {me.deckTop !== undefined && (
            <div style={{ paddingTop: 8, fontSize: 13, opacity: 0.85 }}>Prescience — top of deck: <b>{me.deckTop ? CARD_BY_ID[me.deckTop]?.name : 'empty'}</b></div>
          )}
          {me.discard.length > 0 && (
            <>
              <div className="dn-sec">Discard pile</div>
              <div className="dn-hand">
                {me.discard.map((c, i) => (
                  <div key={`${c}-${i}`} style={{ opacity: 0.9 }}>
                    <DuneCard scene={scene} id={c} w={84} h={126} />
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="dn-btn" style={{ margin: '14px 0 4px' }} onClick={() => setShowMat(false)}>Close</button>
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
            // Reinforcements on a reveal turn may deploy 0-3 of the new troops
            if (c === 'reinforcements' && playable && me.actedThisTurn === 'reveal') {
              return (
                <div key={`${c}-${i}`} className="dn-space" style={{ cursor: 'default', flexDirection: 'column', display: 'flex', alignItems: 'stretch', gap: 6 }}>
                  <span><b>{def?.name}</b> <span style={{ opacity: 0.5, fontSize: 11 }}>{def?.kind}</span></span>
                  <span style={{ opacity: 0.65, fontSize: 12 }}>{costText(def?.effect.cost as Record<string, number>)} {rewardText(def?.effect)} · choose how many go to the conflict</span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    {[0, 1, 2, 3].map((n) => (
                      <button key={n} className="dn-btn" onClick={() => { setShowIntrigue(false); send({ type: 'intrigue', card: c, deploy: n }); }}>
                        Deploy {n}
                      </button>
                    ))}
                  </span>
                </div>
              );
            }
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
