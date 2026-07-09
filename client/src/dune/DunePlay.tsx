// Personal device for Dune: Imperium. The hand is the centrepiece: tap a
// card, pick a legal board space (costs and rewards shown), optionally
// deploy to the conflict. Reveal turns flip the rest of the hand and open
// the acquire strip. Intrigue, leader pick, combat bidding and every card
// choice run through explicit prompts. All moves are made here; the TV is
// the board.

import { useEffect, useMemo, useState } from 'react';
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
  goal: 'Reach 10 victory points, or lead when the last conflict is fought. Send agents to the board for resources, troops and influence. Reveal your hand to buy better cards and fight. Win conflicts for the biggest prizes.',
  points: [
    { label: 'Your house', detail: 'You start with a leader (two unique powers: tap your leader name any time to see them), a 10-card starter deck, 2 agents, 3 troops in your garrison, and 1 water. Draw 5 cards each round.' },
    { label: 'A round', detail: 'Players alternate single turns. Each turn is either an agent turn or your one reveal turn. When everyone has revealed, the conflict resolves, spice builds up on the desert, and the next round begins with a new first player.' },
    { label: 'Agent turn', detail: 'Play one card from your hand and send an agent to one of the board spaces shown on that card. The space must be free and you must pay its cost (spice, water or solari). Take the space rewards plus the played card\'s agent box.' },
    { label: 'Your buttons', detail: 'Tap HAND at any time, even while choosing a space, to see your full hand (the card you are placing is flagged). HOUSE shows your resources, influence, upgrades and deck. INTRIGUE holds your secret cards.' },
    { label: 'Combat spaces', detail: 'Spaces with crossed blades also let you deploy up to 2 garrison troops, plus any troops that turn recruited, into the current conflict.' },
    { label: 'Reveal turn', detail: 'When you are out of agents (or choose to stop), reveal the rest of your hand. Its persuasion buys new cards. Its swords are combat strength. Then everything you played this round goes to your discard pile.' },
    { label: 'Buying cards', detail: 'Spend persuasion on the imperium row, or the reserve: Arrakis Liaison for 2, The Spice Must Flow for 9 (worth a VP). Purchases land in your discard pile. When your deck runs out the discard reshuffles, so every buy comes back stronger.' },
    { label: 'Influence', detail: 'Faction spaces raise you on that faction\'s track. Reaching 2 is worth a VP. Reaching 4 pays that faction\'s bonus and, if you are ahead of everyone, its alliance, a VP another player can steal by passing you.' },
    { label: 'Combat', detail: 'After all reveals, compare strength: each troop in the conflict is 2, each revealed sword 1. The conflict card pays 1st and 2nd place (and 3rd with 4 players). Combat intrigue cards can swing it after strengths are shown. Tied players all lose to the place below.' },
    { label: 'Intrigue', detail: 'Intrigue cards are secret. Plots play during your turn, combat cards during the battle, endgame cards add points when the game ends.' },
    { label: 'Mentat and upgrades', detail: 'The Mentat space hires an extra agent for the round plus a card draw. High Council (+2 persuasion every reveal) and Swordmaster (a permanent third agent) are one-time upgrades. Buy them before your rivals.' },
    { label: 'Game end', detail: 'The game ends after the 10th conflict, or immediately when someone reaches 10 VP. Highest VP wins. Ties break on spice, then solari, then water, then garrison troops.' },
  ],
  rulebook: '/dune/rulebook.pdf',
};

const FACTION_NAME: Record<Faction, string> = {
  emperor: 'Emperor', guild: 'Spacing Guild', beneGesserit: 'Bene Gesserit', fremen: 'Fremen',
};

// A guided tour that runs ON the live interface: each step highlights a real UI
// element (data-tour="...") and explains what it does. No em dashes.
const DUNE_TOUR: { target?: string; title: string; body: string }[] = [
  { title: 'Welcome to Arrakis', body: 'This is your control screen. The TV shows the shared board; you make every move here. This tour points out each part of the interface. Tap NEXT to begin.' },
  { target: 'vp', title: 'Victory points', body: 'First to 10 victory points wins the game immediately. If nobody reaches 10, whoever leads when the last conflict is fought takes it.' },
  { target: 'leader', title: 'Your leader', body: 'Your house leader sits here. Tap this name any time to read its two powers: a passive ability and a signet-ring ability.' },
  { target: 'resources', title: 'Your resources', body: 'Solari is money, spice is the desert currency, water is spent at several spaces. Garrison is your troops at home. Agents is how many workers you still have to place this round.' },
  { target: 'influence', title: 'Faction influence', body: 'Four faction tracks. Reaching 2 on a track scores a victory point. Reaching 4 pays the faction bonus and its alliance, worth another point. An alliance is stolen if a rival passes your spot.' },
  { target: 'board', title: 'Your board', body: 'A live view of your player mat: agents, troops, resources and leader as real pieces. Drag to look around. Tap HOUSE for the full breakdown.' },
  { target: 'hand', title: 'Your hand', body: 'Your five cards this round. Each card lists the board spaces its agent can reach, plus reveal values for later. Tap a card to send an agent with it.' },
  { target: 'actions', title: 'Your buttons', body: 'REVEAL flips the rest of your hand to buy cards and add combat swords. HAND shows your cards from any menu. INTRIGUE holds your secret cards. HOUSE opens your full board and stats. END TURN passes to the next player.' },
  { target: 'conflict', title: 'This round\'s conflict', body: 'The prize everyone competes for this round. Deploy troops at combat spaces to fight for it. First and second place claim the rewards after all reveals.' },
  { title: 'A turn, start to finish', body: 'On your turn, tap a card and pick a board space, then pay the cost and take the rewards. When your agents run out, tap REVEAL, spend persuasion on new cards, and watch the conflict resolve. Then draw five fresh cards and go again, stronger each round.' },
  { title: 'How games are won', body: 'Lean on cheap early spaces for tempo, then let the cards you buy take over. Do not ignore combat: even one troop can steal an uncontested prize. Commit to two point paths, such as two alliances plus the odd conflict win, and deny rivals their tenth point when they get close.' },
];

/** Coach-marks tour over the live device screen: highlights the element named
 *  by each step's `target` (data-tour attribute) and explains it. */
function DuneTour({ step, setStep, onClose }: { step: number; setStep: (n: number) => void; onClose: () => void }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const s = DUNE_TOUR[step];
  const last = step === DUNE_TOUR.length - 1;
  useEffect(() => {
    if (!s.target) { setRect(null); return; }
    const el = document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => {
      const r = el.getBoundingClientRect(); const pad = 6;
      setRect({ top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 });
    }, 300);
    return () => clearTimeout(t);
  }, [step, s.target]);

  const topHalf = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : false;
  const calloutPos = rect
    ? (topHalf ? { left: '50%', bottom: 20, transform: 'translateX(-50%)' } : { left: '50%', top: 20, transform: 'translateX(-50%)' })
    : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95 }}>
      {rect ? (
        <div style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: 12, boxShadow: '0 0 0 9999px rgba(3,6,9,0.85)', outline: '2px solid #e8b450', pointerEvents: 'none' }} />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(3,6,9,0.9)' }} />
      )}
      <div style={{ position: 'fixed', width: 'min(520px, 92vw)', background: '#0c1219', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 16, padding: '16px 20px', boxShadow: '0 18px 50px rgba(0,0,0,0.7)', ...calloutPos }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          {DUNE_TOUR.map((_, i) => <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? '#e8b450' : 'rgba(255,255,255,0.14)' }} />)}
        </div>
        <div className="dn-lab" style={{ opacity: 0.5, fontSize: 11 }}>Step {step + 1} of {DUNE_TOUR.length}</div>
        <h2 style={{ margin: '4px 0 8px', fontSize: 18 }}>{s.title}</h2>
        <p style={{ opacity: 0.86, lineHeight: 1.55, margin: 0, fontSize: 14 }}>{s.body}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="dn-btn" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>{step === 0 ? 'Close' : 'Back'}</button>
          {!last
            ? <button className="dn-btn primary" onClick={() => setStep(step + 1)}>Next</button>
            : <button className="dn-btn primary" onClick={onClose}>Done</button>}
          <button className="dn-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.dn-wrap { position: fixed; inset: 0; background: #05080b; color: #e8ebf0; font: 14px Inter, sans-serif; overflow: hidden; display: flex; flex-direction: column; }
.dn-top { display: flex; gap: 8px; align-items: center; padding: 10px 12px 6px; flex-wrap: wrap; }
.dn-res { display: flex; gap: 10px; font-size: 13px; opacity: 0.9; }
.dn-main { flex: 1; overflow-y: auto; padding: 0 12px 12px; }

/* main-screen two-column body: interactive left, the player board on the right.
   The page itself never scrolls; the left column scrolls internally if needed. */
.dn-body { flex: 1; min-height: 0; display: flex; gap: 12px; padding: 4px 12px 0; }
.dn-left { flex: 1 1 54%; min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.dn-right { flex: 1 1 46%; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 4px; }
.dn-mat-frame { flex: 1; min-height: 0; border: 1px solid rgba(255,255,255,0.09); border-radius: 14px; overflow: hidden; }
@media (max-width: 720px) {
  .dn-body { flex-direction: column; overflow-y: auto; }
  .dn-left { overflow: visible; }
  .dn-right { flex: none; }
  .dn-mat-frame { flex: none; height: 42vh; }
}
.dn-hand { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 8px; }
.dn-card { border: none; background: none; padding: 0; cursor: pointer; position: relative; border-radius: 8px; }
.dn-card.sel { outline: 3px solid #e8ebf0; outline-offset: 2px; }
.dn-actions { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap; }
.dn-btn { padding: 12px 16px; border-radius: 11px; border: 1px solid rgba(255,255,255,0.14); cursor: pointer; background: rgba(255,255,255,0.06); color: #e8ebf0; font: 700 13px Inter, sans-serif; letter-spacing: 1px; text-transform: uppercase; }
.dn-btn.primary { background: rgba(232,180,80,0.16); border-color: rgba(232,180,80,0.5); }
.dn-btn:disabled { opacity: 0.35; cursor: default; }
.dn-space { display: flex; justify-content: space-between; gap: 8px; width: 100%; text-align: left; padding: 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #e8ebf0; cursor: pointer; font: 13px Inter, sans-serif; text-transform: uppercase; letter-spacing: 0.3px; }
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
  const [showHand, setShowHand] = useState(false); // peek at your full hand from any menu
  const [tour, setTour] = useState<number | null>(null); // interface walkthrough step
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
          <button className="dn-btn" style={{ marginLeft: 'auto', padding: '8px 12px' }} onClick={() => setShowHand(true)}>Hand</button>
          <button className="dn-btn" style={{ padding: '8px 12px' }} onClick={() => setSelected(null)}>Back</button>
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
          {legalSpaces.some((sp) => sp.combat) && (
            <>
              <div className="dn-lab" style={{ paddingTop: 8 }}>Troops to deploy · only if you pick a combat space</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className="dn-btn" style={n === deploy ? { outline: '2px solid #e8ebf0' } : undefined} onClick={() => setDeploy(n)}>{n}</button>
                ))}
              </div>
              <div style={{ opacity: 0.55, fontSize: 12 }}>Up to 2 from your garrison plus any troops this turn recruits. Ignored for non-combat spaces.</div>
            </>
          )}
          {view.conflict && (
            <>
              <div className="dn-lab" style={{ paddingTop: 8 }}>This round's conflict</div>
              <DuneCard scene={scene} id={view.conflict} w={128} h={196} />
            </>
          )}
        </div>
        {showHand && <HandOverlay scene={scene} hand={me.hand ?? []} selected={selected} onClose={() => setShowHand(false)} />}
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
            data-tour="leader"
            style={{ background: 'none', border: 'none', color: '#e8ebf0', opacity: 0.75, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, padding: 0, font: 'inherit' }}
            onClick={() => setShowMat(true)}
          >{LEADER_BY_ID[me.leader]?.name}</button>
        )}
        <span data-tour="vp" style={{ marginLeft: 'auto', font: '800 16px Inter, sans-serif' }}>{me.vp} VP</span>
        <button className="dn-btn" style={{ padding: '6px 10px' }} onClick={() => setShowIntro(true)}>?</button>
      </div>
      <div className="dn-top" style={{ paddingTop: 2 }}>
        <div className="dn-chips" data-tour="resources">
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
        <div className="dn-inf-row" data-tour="influence">
          {FACTIONS.map((f) => (
            <InfluenceTrack key={f} faction={f} value={me.influence[f]} allied={me.alliances.includes(f)} />
          ))}
        </div>
      </div>

      <div className="dn-body">
        {/* left column: everything you act on */}
        <div className="dn-left">
          {/* status line */}
          <div className="dn-lab" style={{ padding: '2px 0' }}>
            {view.phase === 'ended' ? `${view.players.find((p) => p.color === view.winner)?.name} wins`
              : waitingOn ? `${waitingOn.name} is deciding`
              : view.phase === 'combat' ? (view.turn === me.seat ? 'Combat · play a card or pass' : `Combat · ${view.players[view.turn].name} bids`)
              : myTurn ? (me.actedThisTurn != null ? (revealing ? 'Buy cards, then end your turn' : 'End your turn') : canAgent ? 'Play a card for an agent turn, or reveal' : 'Reveal your hand')
              : `${view.players[view.turn].name} is acting`}
          </div>

          {/* combat: everyone's strength */}
          {view.phase === 'combat' && (
            <div style={{ display: 'flex', gap: 12, fontSize: 13, paddingBottom: 4, flexWrap: 'wrap' }}>
              {view.players.filter((p) => p.inConflict > 0 || p.strength > 0).map((p) => (
                <span key={p.seat} style={{ fontWeight: p.seat === me.seat ? 800 : 400 }}>
                  {p.name}: {p.strength} strength
                </span>
              ))}
            </div>
          )}

          {/* current conflict */}
          {view.conflict && view.phase !== 'ended' && (
            <div data-tour="conflict" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', paddingBottom: 6 }}>
              <DuneCard scene={scene} id={view.conflict} w={150} h={230} />
              <span className="dn-lab" style={{ paddingBottom: 6 }}>Conflict · round {view.round}</span>
            </div>
          )}

          {/* reveal strip: acquire targets */}
          {revealing && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 6 }}>
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
              <div className="dn-hand" data-tour="hand">
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
              <div className="dn-lab" style={{ paddingTop: 8 }}>In play</div>
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

        {/* right column: the player board, expanded to fill the height */}
        <div className="dn-right" data-tour="board">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingLeft: 2 }}>
            <span className="dn-lab">Your board</span>
            <span style={{ fontSize: 11, opacity: 0.45 }}>drag to look around · House for the full detail</span>
          </div>
          <div className="dn-mat-frame">
            <DuneMat scene={scene} view={view} me={me} height="100%" />
          </div>
        </div>
      </div>

      {/* actions */}
      <div className="dn-actions" data-tour="actions">
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
        {(me.hand?.length ?? 0) > 0 && (
          <button className="dn-btn" onClick={() => setShowHand(true)}>Hand ({me.hand!.length})</button>
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
            {me.hasSwordmaster && <span className="dn-chip" style={{ padding: '5px 10px' }}>Swordmaster · permanent 3rd agent</span>}
            {me.hasHighCouncil && <span className="dn-chip" style={{ padding: '5px 10px' }}>High Council seat · +2 persuasion each reveal</span>}
            {!me.hasSwordmaster && !me.hasHighCouncil && <span style={{ opacity: 0.5 }}>No upgrades yet · High Council and Swordmaster are strong early buys.</span>}
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
            <div style={{ paddingTop: 8, fontSize: 13, opacity: 0.85 }}>Prescience · top of deck: <b>{me.deckTop ? CARD_BY_ID[me.deckTop]?.name : 'empty'}</b></div>
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
          <div className="dn-lab">Intrigue · {view.phase === 'combat' ? 'combat cards' : 'plots on your turn'}</div>
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

      {showHand && <HandOverlay scene={scene} hand={me.hand ?? []} selected={selected} onClose={() => setShowHand(false)} />}
      {showIntro && (
        <GameIntro
          intro={DUNE_INTRO}
          onClose={() => setShowIntro(false)}
          onWalkthrough={() => { setShowIntro(false); setShowHand(false); setShowMat(false); setShowIntrigue(false); setSelected(null); setTour(0); }}
        />
      )}
      {tour !== null && <DuneTour step={tour} setStep={setTour} onClose={() => setTour(null)} />}
      {error && <div className="dn-err">{error}</div>}
    </div>
  );
}

/** Peek at your full hand from any menu (the space picker hides it otherwise).
 *  The card you are currently sending an agent with is flagged. */
function HandOverlay({ scene, hand, selected, onClose }: {
  scene: DuneSceneDef; hand: string[]; selected: string | null; onClose: () => void;
}) {
  return (
    <div className="dn-overlay" onClick={onClose}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="dn-lab">Your hand · {hand.length} card{hand.length === 1 ? '' : 's'}</div>
        <button className="dn-btn" style={{ marginLeft: 'auto', padding: '7px 14px' }} onClick={onClose}>Close</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', paddingTop: 6 }} onClick={(e) => e.stopPropagation()}>
        {hand.length === 0 && <div style={{ opacity: 0.6, padding: 24 }}>No cards in hand right now.</div>}
        {hand.map((c, i) => (
          <div key={`${c}-${i}`} style={{ textAlign: 'center' }}>
            <div style={{ borderRadius: 12, outline: selected === c ? '3px solid #e8b450' : 'none', outlineOffset: 2, display: 'inline-block' }}>
              <DuneCard scene={scene} id={c} w={168} h={252} />
            </div>
            {selected === c && <div style={{ fontSize: 11, color: '#e8b450', fontWeight: 800, letterSpacing: 1, paddingTop: 4 }}>SENDING AGENT</div>}
          </div>
        ))}
      </div>
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
          {FACTION_NAME[f]}{first === f ? ' · pick a second' : ''}
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
