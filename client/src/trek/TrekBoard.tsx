// TV view for Trekking the National Parks: the US map fills the screen; player
// chips top, the shared trek river + park river + major parks along the bottom
// (public info), and a caption with camera fly-to on every action.

import { useEffect, useRef } from 'react';
import { PARKS, MAJORS, STONE_COLORS, SCORING, TREK_CATALOG, type TrekView, type StoneColor } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TrekTable, useTrekScene, nodePos, type TrekSceneDef, type TrekFocus } from './TrekScene';
import { playSfx } from '../sfx';

/** One card cropped out of a 10x7 sheet. Park/major sheets store the card art
 *  rotated 90 degrees inside portrait cells — pass `rotated` to counter-rotate
 *  the crop into a landscape frame that reads upright. The trek sheet's cells
 *  are upright portrait cards; render those directly. */
export function CardSprite({ face, cols, rows, cell, w, h, radius = 6, rotated = false }: {
  face: string; cols: number; rows: number; cell: number; w: number; h: number; radius?: number; rotated?: boolean;
}) {
  const col = cell % cols, row = Math.floor(cell / cols);
  const crop = {
    backgroundImage: `url(${face})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
  };
  return (
    <div style={{
      width: w, height: h, borderRadius: radius, overflow: 'hidden', position: 'relative',
      border: '1px solid rgba(255,255,255,0.18)', background: '#0a0e12',
    }}>
      {rotated ? (
        <div style={{
          position: 'absolute', width: h, height: w, left: '50%', top: '50%',
          transform: 'translate(-50%,-50%) rotate(-90deg)', ...crop,
        }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, ...crop }} />
      )}
    </div>
  );
}

export function trekCardSprite(scene: TrekSceneDef, deck: 'trek' | 'parks' | 'majors', idx: number, w: number, h: number) {
  const d = scene.decks[deck];
  const c = d.cards[idx];
  if (!c) return null;
  const sheet = d.sheets[String(c.sheet)];
  if (!sheet) return null;
  return <CardSprite face={sheet.face} cols={sheet.cols} rows={sheet.rows} cell={c.cell} w={w} h={h} />;
}

export const trekFaceByCell = (scene: TrekSceneDef, deck: 'trek' | 'parks' | 'majors', cell: number, w: number, h: number) => {
  const sheet = Object.values(scene.decks[deck].sheets)[0];
  return <CardSprite face={sheet.face} cols={sheet.cols} rows={sheet.rows} cell={cell} w={w} h={h} rotated={deck !== 'trek'} />;
};

export function TrekBoard({ view }: { view: TrekView }) {
  const scene = useTrekScene();

  // the TV voices each action, the turnover, and the win
  const lastSeq = useRef(0);
  useEffect(() => {
    const e = view.lastEvent;
    if (!e || e.seq <= lastSeq.current) return;
    lastSeq.current = e.seq;
    const t = e.title ?? '';
    playSfx(/claim|occup/i.test(t) ? 'coins' : /drew|draw/i.test(t) ? null : 'link');
  }, [view.lastEvent?.seq]);
  const prevTurn = useRef(view.turn);
  useEffect(() => {
    if (view.phase === 'playing' && prevTurn.current !== view.turn) { prevTurn.current = view.turn; playSfx('turn'); }
  }, [view.turn, view.phase]);
  const ended = useRef(false);
  useEffect(() => { if (view.winners && !ended.current) { ended.current = true; playSfx('win'); } }, [view.winners]);

  if (!scene) return <div className="page center"><h2>Loading the trails</h2></div>;

  const ev = view.lastEvent;
  const focus: TrekFocus | undefined = ev?.node !== undefined && ev.node !== null
    ? (() => { const [x, z] = nodePos(ev.node!); return { seq: ev.seq, x, z }; })()
    : undefined;

  const stonesOf = (seat: number) => STONE_COLORS.reduce((t, c) => t + view.players[seat].stones[c], 0);
  // running score (park points + 5 per campsite + 1 per stone); end-of-game stone awards not yet counted
  const scoreOf = (p: TrekView['players'][number]) =>
    p.parks.reduce((t, id) => t + PARKS[id].vp, 0) + p.majors.length * SCORING.campsiteVp + stonesOf(p.seat) * SCORING.stoneVp;
  const current = view.players[view.turn];
  const winners = view.winners;
  // who earns each colour's most / second-most stone award (endgame display)
  const awardOf = (color: StoneColor) => {
    const ranked = view.players.map((p) => ({ p, n: p.stones[color] })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    return { most: ranked[0]?.p ?? null, second: ranked[1]?.p ?? null };
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <TrekTable
          scene={scene}
          stones={view.stones}
          trekkers={view.players.map((p) => ({ color: p.color, node: p.node }))}
          majorTents={view.majors.map((id) => ({ node: MAJORS[id].node, colors: view.majorOwners[id] ?? [] }))}
          focus={focus}
          interactive
        />
      </div>

      {/* phase banner */}
      <div className="ig-glass" style={{ position: 'absolute', top: 12, left: 12, padding: '10px 14px', borderRadius: 14 }}>
        <div className="ig-lab">{view.finalRound && view.phase === 'playing' ? 'Final round' : 'Trekking'}</div>
        <div style={{ font: '700 16px Inter, sans-serif' }}>The National Parks</div>
      </div>

      {/* player chips (top centre) */}
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 6 }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
            outline: view.turn === p.seat && view.phase === 'playing' ? `2px solid ${SEAT_HEX[p.color]}` : 'none',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
            <b>{p.name}</b>
            <span style={{ fontWeight: 700 }}>{scoreOf(p)} pts</span>
            <span style={{ opacity: 0.6, fontSize: 12 }}>{p.parks.length} parks · {stonesOf(p.seat)} stones · {p.handCount} cards</span>
          </div>
        ))}
      </div>

      {/* PARKS — the claimable river, big down the left margin */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 16, zIndex: 5, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
        <div>
          <div className="ig-lab" style={{ fontSize: 13 }}>Parks</div>
          <div className="ig-lab" style={{ fontSize: 10, opacity: 0.55, textTransform: 'none', letterSpacing: 0 }}>Stand on one to claim it</div>
        </div>
        {view.parkRiver.map((c, i) => (c === null ? null : (
          <div key={`P${i}`}>
            {trekFaceByCell(scene, 'parks', PARKS[c].cell, 224, 158)}
            <div style={{ font: '700 16px Inter, sans-serif', paddingTop: 4, maxWidth: 224, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{PARKS[c].name}</div>
          </div>
        )))}
      </div>

      {/* trek draw pile + river + the small awards strip (bottom centre) */}
      <div className="ig-glass" style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 14px', borderRadius: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 34, height: 48, borderRadius: 5, background: '#1d2416', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 12px Inter, sans-serif' }}>{view.trekDeckCount}</div>
          <div className="ig-lab" style={{ paddingTop: 3, fontSize: 9 }}>Trek</div>
        </div>
        {view.trekRiver.map((c, i) => (
          <div key={`t${i}`}>{c !== null ? trekFaceByCell(scene, 'trek', TREK_CATALOG[c].cell, 52, 74) : <div style={{ width: 52, height: 74 }} />}</div>
        ))}
        <div style={{ width: 14 }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {STONE_COLORS.map((color) => {
              const m = scene.bonusCards.most[color];
              return m ? <CardSprite key={color} face={m.face} cols={m.cols} rows={m.rows} cell={m.cell} w={34} h={50} radius={4} rotated /> : null;
            })}
          </div>
          <div className="ig-lab" style={{ paddingTop: 4, fontSize: 12 }}>Stone awards</div>
          <div className="ig-lab" style={{ fontSize: 10, opacity: 0.55, textTransform: 'none', letterSpacing: 0 }}>Most of each color at game end</div>
        </div>
      </div>

      {/* MAJOR PARKS — big down the right margin */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 16, zIndex: 5, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, alignItems: 'flex-end' }}>
        <div style={{ textAlign: 'right' }}>
          <div className="ig-lab" style={{ fontSize: 13 }}>Major parks</div>
          <div className="ig-lab" style={{ fontSize: 10, opacity: 0.55, textTransform: 'none', letterSpacing: 0 }}>Occupy for a campsite and a power</div>
        </div>
        {view.majors.map((id) => (
          <div key={`m${id}`} style={{ position: 'relative' }}>
            {trekFaceByCell(scene, 'majors', MAJORS[id].cell, 224, 158)}
            <div style={{ font: '700 16px Inter, sans-serif', paddingTop: 4, maxWidth: 224, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{MAJORS[id].name}</div>
            <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3 }}>
              {(view.majorOwners[id] ?? []).map((c) => (
                <span key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: SEAT_HEX[c], border: '1px solid rgba(0,0,0,0.5)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* whose turn (top centre, under the chips) */}
      {view.phase === 'playing' && current && (
        <div className="ig-glass" style={{
          position: 'absolute', top: 58, left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 8, zIndex: 6,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[current.color] }} />
          <b>{current.name}</b>
          <span style={{ opacity: 0.6 }}>{view.actionsLeft} action{view.actionsLeft === 1 ? '' : 's'} left</span>
        </div>
      )}

      {/* caption */}
      {ev && (
        <div className="ig-glass" style={{
          position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)',
          padding: '12px 18px', borderRadius: 14, minWidth: 300, textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[ev.color] }} />
            <span className="ig-lab">{ev.player}</span>
          </div>
          <div style={{ font: '700 18px Inter, sans-serif', textTransform: 'uppercase', letterSpacing: 0.4 }}>{ev.title}</div>
          {ev.detail && <div style={{ opacity: 0.7, fontSize: 13 }}>{ev.detail}</div>}
        </div>
      )}

      {/* endgame: winner + the awards, large and distributed to who earned them */}
      {winners && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(2,4,6,0.86)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div className="ig-lab">{winners.length > 1 ? 'Shared victory' : 'Winner'}</div>
            <div style={{ font: '800 34px Inter, sans-serif' }}>
              {winners.map((w) => (
                <span key={w} style={{ color: SEAT_HEX[w], padding: '0 8px' }}>{view.players.find((p) => p.color === w)?.name}</span>
              ))}
            </div>
            <div style={{ opacity: 0.75, paddingTop: 6 }}>{view.players.map((p) => `${p.name} ${p.score}`).join(' · ')}</div>
          </div>
          <div className="ig-lab">Stone awards</div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
            {STONE_COLORS.map((color) => {
              const { most, second } = awardOf(color);
              const mc = scene.bonusCards.most[color], sc = scene.bonusCards.second[color];
              const winnerTag = (p: typeof most) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center', paddingTop: 4, minHeight: 18 }}>
                  {p ? <><span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} /><b>{p.name}</b></> : <span className="dim">—</span>}
                </div>
              );
              return (
                <div key={color} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                  <div>{mc && <CardSprite face={mc.face} cols={mc.cols} rows={mc.rows} cell={mc.cell} w={132} h={93} rotated />}{winnerTag(most)}</div>
                  <div>{sc && <CardSprite face={sc.face} cols={sc.cols} rows={sc.rows} cell={sc.cell} w={104} h={73} rotated />}{winnerTag(second)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
