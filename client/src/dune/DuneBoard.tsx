// TV view for Dune: Imperium — the main board in 3D (agents, garrisons,
// conflict troops), with the current conflict card, the imperium row and
// player chips as HUD. Phones hold hands and make every move.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  CARD_BY_ID, CONFLICT_BY_ID, FACTIONS, LEADER_BY_ID,
  type DuneView, type DuneSeat, type Faction,
} from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { CardSprite } from '../trek/TrekBoard';
import { DuneTable, useDuneScene, type DuneSceneDef } from './DuneScene';
import { playSfx } from '../sfx';

/** sheet/cell for any dune card id (imperium cell may be "sheet:cell"). */
export function duneCardArt(id: string): { sheet: number; cell: number } | null {
  const c = CARD_BY_ID[id] as { sheet?: number; cell?: number | string } | undefined;
  const conflict = CONFLICT_BY_ID[id];
  if (conflict) return { sheet: conflict.sheet, cell: conflict.cell };
  if (!c) return null;
  if (typeof c.cell === 'string') {
    const [sh, ce] = c.cell.split(':').map(Number);
    return { sheet: sh, cell: ce };
  }
  if (typeof c.sheet === 'number' && typeof c.cell === 'number') return { sheet: c.sheet, cell: c.cell };
  return null;
}

export function DuneCard({ scene, id, w, h }: { scene: DuneSceneDef; id: string; w: number; h: number }) {
  const art = duneCardArt(id);
  if (!art) return null;
  const sheet = scene.sheets[String(art.sheet)];
  if (!sheet) return null;
  return <CardSprite face={sheet.face} cols={sheet.cols} rows={sheet.rows} cell={art.cell} w={w} h={h} />;
}

const FACTION_LABEL: Record<Faction, string> = {
  emperor: 'EMP', guild: 'GLD', beneGesserit: 'BG', fremen: 'FRE',
};

/** A gold-outlined explanation note the host can toggle onto the board. */
function GuideNote({ style, title, text }: { style: CSSProperties; title: string; text: string }) {
  return (
    <div className="ig-glass" style={{ position: 'absolute', padding: '10px 13px', borderRadius: 12, maxWidth: 250, border: '1px solid rgba(232,180,74,0.55)', zIndex: 20, ...style }}>
      <div className="ig-lab" style={{ color: '#e8b450' }}>{title}</div>
      <div style={{ fontSize: 12.5, opacity: 0.88, lineHeight: 1.45, paddingTop: 3 }}>{text}</div>
    </div>
  );
}

export function DuneBoard({ view }: { view: DuneView }) {
  const scene = useDuneScene();
  // Default the teaching guide ON for the opening round so newcomers get it for free.
  const [guide, setGuide] = useState(view.round <= 1 && view.phase !== 'ended');

  // the TV voices actions, turnovers and the win
  const lastSeq = useRef(0);
  useEffect(() => {
    const e = view.lastEvent;
    if (!e || e.seq <= lastSeq.current) return;
    lastSeq.current = e.seq;
    const t = e.title ?? '';
    playSfx(/acquires/.test(t) ? 'coins' : /reveals/.test(t) ? 'cardDraw' : /1st|2nd|3rd/.test(t) ? 'win' : 'link');
  }, [view.lastEvent?.seq]);
  const prevTurn = useRef(view.turn);
  useEffect(() => {
    if (view.phase !== 'ended' && prevTurn.current !== view.turn) { prevTurn.current = view.turn; playSfx('turn'); }
  }, [view.turn, view.phase]);
  const ended = useRef(false);
  useEffect(() => { if (view.winner && !ended.current) { ended.current = true; playSfx('win'); } }, [view.winner]);

  if (!scene) return <div className="page center"><h2>Crossing the deep desert</h2></div>;

  const ev = view.lastEvent;
  const current = view.players[view.turn];
  const agents = Object.entries(view.spaces).flatMap(([space, seats]) =>
    seats.map((seat) => ({ color: view.players[seat].color as DuneSeat, space })));

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080b', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <DuneTable
          scene={scene}
          pieces={{
            agents,
            garrisons: view.players.map((p) => ({ color: p.color, n: p.garrison })),
            conflict: view.players.map((p) => ({ color: p.color, n: p.inConflict })),
            makers: view.makerSpice,
            control: Object.entries(view.control)
              .filter(([, seat]) => seat !== null)
              .map(([space, seat]) => ({ space, color: view.players[seat!].color })),
          }}
        />
      </div>

      {/* title plate */}
      <div className="ig-glass" style={{ position: 'absolute', top: 12, left: 12, padding: '10px 14px', borderRadius: 14 }}>
        <div className="ig-lab">
          {view.phase === 'leaders' ? 'Choosing leaders'
            : view.phase === 'combat' ? `Round ${view.round} · Combat`
            : view.phase === 'ended' ? 'Game over'
            : `Round ${view.round} of ${view.rounds}`}
        </div>
        <div style={{ font: '700 16px Inter, sans-serif' }}>Dune: Imperium</div>
      </div>

      {/* current conflict */}
      {view.conflict && view.phase !== 'ended' && (
        <div className="ig-glass" style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', padding: 10, borderRadius: 14, textAlign: 'center' }}>
          <div className="ig-lab" style={{ paddingBottom: 6 }}>Conflict</div>
          <DuneCard scene={scene} id={view.conflict} w={118} h={180} />
        </div>
      )}

      {/* player chips */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            padding: '8px 12px', borderRadius: 14, minWidth: 230,
            outline: view.turn === p.seat && view.phase !== 'ended' ? `2px solid ${SEAT_HEX[p.color]}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
              <b>{p.name}</b>
              {view.firstPlayer === p.seat && <span className="ig-lab" style={{ fontSize: 9 }}>First</span>}
              <span style={{ opacity: 0.55, fontSize: 11 }}>{p.leader ? LEADER_BY_ID[p.leader]?.name : ''}</span>
              <span style={{ marginLeft: 'auto', font: '800 16px Inter, sans-serif' }}>{p.vp} VP</span>
            </div>
            <div style={{ display: 'flex', gap: 9, paddingTop: 4, fontSize: 12, opacity: 0.85 }}>
              <span title="solari">{p.solari}s</span>
              <span title="spice">{p.spice}sp</span>
              <span title="water">{p.water}w</span>
              <span title="garrison">{p.garrison}g</span>
              <span title="intrigue cards">{p.intrigueCount}i</span>
              {view.phase === 'combat' && <span title="strength">{p.strength} str</span>}
              <span title="agents" style={{ marginLeft: 'auto' }}>{p.agentsLeft}/{p.agentsTotal} ag</span>
            </div>
            <div style={{ display: 'flex', gap: 9, paddingTop: 3, fontSize: 11, opacity: 0.7 }}>
              {FACTIONS.map((f) => (
                <span key={f} style={{ fontWeight: p.alliances.includes(f) ? 800 : 400 }}>
                  {FACTION_LABEL[f]} {p.influence[f]}
                </span>
              ))}
            </div>
          </div>
        ))}
        {/* always-visible key so the abbreviated stat rows read from the couch */}
        <div className="ig-glass" style={{ padding: '8px 11px', borderRadius: 12, minWidth: 230, fontSize: 10.5, opacity: 0.82, lineHeight: 1.6 }}>
          <div className="ig-lab" style={{ fontSize: 9, marginBottom: 2 }}>Reading the panels</div>
          <div><b>s</b> solari (money) · <b>sp</b> spice · <b>w</b> water · <b>g</b> garrison troops · <b>i</b> intrigue cards · <b>ag</b> agents left / total</div>
          <div style={{ paddingTop: 2 }}><b>EMP</b> Emperor · <b>GLD</b> Spacing Guild · <b>BG</b> Bene Gesserit · <b>FRE</b> Fremen (bold = holds that alliance)</div>
        </div>
      </div>

      {/* imperium row */}
      {view.phase !== 'leaders' && view.phase !== 'ended' && (
        <div className="ig-glass" style={{
          position: 'absolute', bottom: 14, right: 14, padding: 10, borderRadius: 14,
          display: 'flex', gap: 8, alignItems: 'flex-end',
        }}>
          {view.imperiumRow.map((c, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              {c ? <DuneCard scene={scene} id={c} w={86} h={128} /> : <div style={{ width: 86, height: 128, borderRadius: 6, border: '1px dashed rgba(255,255,255,0.2)' }} />}
              {c && <div style={{ fontSize: 11, opacity: 0.7, paddingTop: 2 }}>{CARD_BY_ID[c]?.cost ?? 0}</div>}
            </div>
          ))}
          <div style={{ fontSize: 11, opacity: 0.7, paddingLeft: 6, textAlign: 'left' }}>
            <div>FOLDSPACE ×{view.reserve.foldspace}</div>
            <div>LIAISON ×{view.reserve.arrakisLiaison}</div>
            <div>SPICE MUST FLOW ×{view.reserve.theSpiceMustFlow}</div>
          </div>
        </div>
      )}

      {/* caption */}
      {ev && view.phase !== 'ended' && (
        <div className="ig-glass" style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 18px', borderRadius: 14, minWidth: 320, maxWidth: 560, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[ev.color] }} />
            <span className="ig-lab">{ev.player}</span>
          </div>
          <div style={{ font: '700 18px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ev.title}</div>
          {ev.detail && <div style={{ opacity: 0.7, fontSize: 13 }}>{ev.detail}</div>}
        </div>
      )}

      {/* combat: a big, readable callout of who is winning the conflict */}
      {view.phase === 'combat' && (() => {
        const order = view.players.filter((p) => p.inConflict > 0 || p.strength > 0).sort((a, b) => b.strength - a.strength);
        if (!order.length) return null;
        const lead = order[0];
        const tied = order.length > 1 && order[1].strength === lead.strength;
        const conflictName = view.conflict ? CONFLICT_BY_ID[view.conflict]?.name : 'the conflict';
        return (
          <div className="ig-glass" style={{
            position: 'absolute', top: '32%', left: '50%', transform: 'translate(-50%,-50%)',
            padding: '18px 30px', borderRadius: 18, textAlign: 'center', minWidth: 340, zIndex: 15,
            border: '1px solid rgba(232,180,74,0.55)',
          }}>
            <div className="ig-lab" style={{ color: '#e8b450' }}>Combat for {conflictName}</div>
            <div style={{ font: '800 26px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 0', color: tied ? '#e8ebf0' : SEAT_HEX[lead.color] }}>
              {tied ? 'Tied for the lead' : `${lead.name} leads the conflict`}
            </div>
            <div style={{ opacity: 0.7, fontSize: 12.5, paddingBottom: 8 }}>Highest strength wins. 1st and 2nd place claim the rewards.</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              {order.map((p) => (
                <span key={p.seat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
                  <b>{p.name}</b>
                  <span style={{ opacity: 0.75 }}>{p.strength} strength</span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* whose turn / pending */}
      {view.phase !== 'ended' && current && (
        <div className="ig-glass" style={{
          position: 'absolute', top: 92, left: 12, padding: '8px 12px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[view.pending ? view.players[view.pending.seat].color : current.color] }} />
          <b>{view.pending ? view.players[view.pending.seat].name : current.name}</b>
          <span style={{ opacity: 0.6 }}>
            {view.pending ? 'deciding' : view.phase === 'leaders' ? 'choosing a leader'
              : view.phase === 'combat' ? 'in combat' : current.revealed ? 'buying' : 'to act'}
          </span>
        </div>
      )}

      {view.winner && (
        <div className="ig-glass" style={{
          position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)',
          padding: '26px 44px', borderRadius: 20, textAlign: 'center',
        }}>
          <div className="ig-lab">He who controls the spice</div>
          <div style={{ font: '800 30px Inter, sans-serif', color: SEAT_HEX[view.winner] }}>
            {view.players.find((p) => p.color === view.winner)?.name}
          </div>
          {view.finalScores && (
            <div style={{ opacity: 0.8, paddingTop: 8, fontSize: 13 }}>
              {view.finalScores.map((f) => (
                <div key={f.seat}>{view.players[f.seat].name} · {f.vp} VP</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* host guide toggle: overlays plain-language explanations on the board */}
      <button
        className="ig-glass"
        onClick={() => setGuide((g) => !g)}
        style={{
          position: 'absolute', bottom: 14, left: 14, padding: '9px 14px', borderRadius: 999, cursor: 'pointer', zIndex: 25,
          font: '700 12px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase',
          border: guide ? '1px solid rgba(232,180,74,0.6)' : undefined, color: guide ? '#e8b450' : '#e8ebf0',
        }}
      >{guide ? 'Hide guide' : 'Explain the board'}</button>

      {guide && view.phase !== 'ended' && (
        <>
          {/* HUD callouts */}
          <GuideNote style={{ top: 208, left: '50%', transform: 'translateX(-50%)' }}
            title="This round's conflict"
            text="The prize being fought over. Agents at combat spaces deploy troops; after everyone reveals, 1st and 2nd place (3rd with 4 players) claim the rewards." />
          <GuideNote style={{ top: 92, right: 258 }}
            title="The players"
            text="Each panel: victory points, resources (solari, spice, water), garrison troops, intrigue cards, agents left, and the four faction influence tracks (EMP / GLD / BG / FRE)." />
          <GuideNote style={{ bottom: 168, right: 14, maxWidth: 260 }}
            title="Imperium row & reserve"
            text="Cards to buy with persuasion on a reveal turn. The reserve piles (Foldspace, Liaison, The Spice Must Flow) are always available too." />

          {/* the whole board, region by region */}
          <div className="ig-glass" style={{ position: 'absolute', top: 150, left: 12, width: 320, maxHeight: '74vh', overflowY: 'auto', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(232,180,74,0.55)', zIndex: 20 }}>
            <div className="ig-lab" style={{ color: '#e8b450' }}>The board, region by region</div>
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.4, paddingTop: 4, marginBottom: 8 }}>
              Each turn a player plays a card and sends one agent to a space here, pays its cost and takes its reward. First house to 10 victory points wins; if none, the leader after the last conflict takes it.
            </div>
            {[
              ['Faction spaces · left edge', 'Emperor, Spacing Guild, Bene Gesserit and Fremen. Sending an agent raises you on that faction track. Reaching 2 scores a VP; reaching 4 pays the bonus and the alliance.'],
              ['City spaces · Arrakeen, Carthag, Imperial Basin', 'Take troops, spice or solari and plant a control flag. Holding a city pays you spice at the start of each round.'],
              ['Spice & desert · Great Flat, Hagga Basin, Sietch Tabr', 'Harvest melange. Bonus spice piles up on these maker spaces every round until an agent finally claims it.'],
              ['Landsraad · top row', 'Mentat (extra agent + a card), High Council (+2 persuasion each reveal), Swordmaster (a permanent third agent), Rally Troops, Hall of Oratory, Secure Contract and Sell Melange (spice into solari).'],
              ['Combat arena · centre', 'The crossed blades. Troops deployed from combat spaces gather here. Each troop is 2 strength, each revealed sword is 1.'],
              ['Garrisons · four corners', "Each house's troops waiting at home. You may deploy up to 2 of them (plus any recruited that turn) when you act at a combat space."],
              ['Control flags', 'Sit under the three cities. Every flag you hold pays spice when the next round begins.'],
            ].map(([t, d]) => (
              <div key={t} style={{ marginTop: 8 }}>
                <div style={{ font: '700 11.5px Inter, sans-serif', color: '#e8b450' }}>{t}</div>
                <div style={{ fontSize: 12, opacity: 0.82, lineHeight: 1.4 }}>{d}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
