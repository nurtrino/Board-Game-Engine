// TV view for Trekking the National Parks: the US map fills the screen; player
// chips top, the shared trek river + park river + major parks along the bottom
// (public info), and a caption with camera fly-to on every action.

import { PARKS, MAJORS, STONE_COLORS, TREK_CATALOG, type TrekView } from '@bge/shared';
import { SEAT_HEX } from '../brass/TableScene';
import { TrekTable, useTrekScene, nodePos, type TrekSceneDef, type TrekFocus } from './TrekScene';

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

  if (!scene) return <div className="page center"><h2>Loading the trails</h2></div>;

  const ev = view.lastEvent;
  const focus: TrekFocus | undefined = ev?.node !== undefined && ev.node !== null
    ? (() => { const [x, z] = nodePos(ev.node!); return { seq: ev.seq, x, z }; })()
    : undefined;

  const stonesOf = (seat: number) => STONE_COLORS.reduce((t, c) => t + view.players[seat].stones[c], 0);
  const current = view.players[view.turn];
  const winners = view.winners;

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

      {/* player chips */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 8 }}>
        {view.players.map((p) => (
          <div key={p.seat} className="ig-glass" style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
            outline: view.turn === p.seat && view.phase === 'playing' ? `2px solid ${SEAT_HEX[p.color]}` : 'none',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEAT_HEX[p.color] }} />
            <b>{p.name}</b>
            <span style={{ opacity: 0.75 }} title="parks claimed">{p.parks.length} parks</span>
            <span style={{ opacity: 0.5, fontSize: 12 }} title="stones · cards">{stonesOf(p.seat)}st · {p.handCount}c</span>
          </div>
        ))}
      </div>

      {/* park river — big, across the top so the table can read it */}
      <div style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 150, height: 106, borderRadius: 9, background: '#16202b', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '800 26px Inter, sans-serif' }}>{view.parkDeckCount}</div>
          <div className="ig-lab" style={{ paddingTop: 5 }}>Park deck</div>
        </div>
        {view.parkRiver.map((c, i) => (
          <div key={`P${i}`} style={{ textAlign: 'center' }}>
            {c !== null
              ? trekFaceByCell(scene, 'parks', PARKS[c].cell, 150, 106)
              : <div style={{ width: 150, height: 106, borderRadius: 9, border: '1px dashed rgba(255,255,255,0.14)' }} />}
            {c !== null && <div className="ig-lab" style={{ paddingTop: 5, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{PARKS[c].name}</div>}
          </div>
        ))}
      </div>

      {/* shared rivers: trek cards + majors */}
      <div className="ig-glass" style={{
        position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 14px', borderRadius: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 52, height: 74, borderRadius: 6, background: '#1d2416', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 13px Inter, sans-serif' }}>{view.trekDeckCount}</div>
          <div className="ig-lab" style={{ paddingTop: 4 }}>Trek</div>
        </div>
        {view.trekRiver.map((c, i) => (
          <div key={`t${i}`}>{c !== null ? trekFaceByCell(scene, 'trek', TREK_CATALOG[c].cell, 52, 74) : <div style={{ width: 52, height: 74 }} />}</div>
        ))}
        <div style={{ width: 10 }} />
        {view.majors.map((id) => (
          <div key={`m${id}`} style={{ textAlign: 'center', position: 'relative' }}>
            {trekFaceByCell(scene, 'majors', MAJORS[id].cell, 74, 52)}
            <div className="ig-lab" style={{ paddingTop: 4, maxWidth: 74, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{MAJORS[id].name}</div>
            <div style={{ position: 'absolute', top: 2, right: 2, display: 'flex', gap: 2 }}>
              {(view.majorOwners[id] ?? []).map((c) => (
                <span key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: SEAT_HEX[c], border: '1px solid rgba(0,0,0,0.5)' }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* whose turn */}
      {view.phase === 'playing' && current && (
        <div className="ig-glass" style={{
          position: 'absolute', top: 64, left: 12, padding: '8px 12px', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 8,
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

      {/* colored award cards (most / second most stones of each colour), left rail */}
      <div style={{
        position: 'absolute', top: 118, left: 12, zIndex: 5,
        display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start',
      }}>
        <div className="ig-lab">Awards</div>
        {STONE_COLORS.map((color) => {
          const most = scene.bonusCards.most[color];
          const second = scene.bonusCards.second[color];
          return (
            <div key={color} style={{ display: 'flex', gap: 4 }}>
              {most && <CardSprite face={most.face} cols={most.cols} rows={most.rows} cell={most.cell} w={32} h={50} radius={4} rotated />}
              {second && <CardSprite face={second.face} cols={second.cols} rows={second.rows} cell={second.cell} w={32} h={50} radius={4} rotated />}
            </div>
          );
        })}
      </div>

      {winners && (
        <div className="ig-glass" style={{
          position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%,-50%)',
          padding: '26px 44px', borderRadius: 20, textAlign: 'center',
        }}>
          <div className="ig-lab">{winners.length > 1 ? 'Shared victory' : 'Winner'}</div>
          <div style={{ font: '800 30px Inter, sans-serif' }}>
            {winners.map((w) => (
              <span key={w} style={{ color: SEAT_HEX[w], padding: '0 6px' }}>
                {view.players.find((p) => p.color === w)?.name}
              </span>
            ))}
          </div>
          <div style={{ opacity: 0.75, paddingTop: 8 }}>
            {view.players.map((p) => `${p.name} ${p.score}`).join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}
