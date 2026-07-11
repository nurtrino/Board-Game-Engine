// Dark Souls device: 2D node-graph readout of the active tile (the TV owns the
// 3D board). Nodes come from the tiles.json golden (pixel space, playbook §3B).
// Doubles as the tap surface for move destinations, attack targets, dodge
// moves and push placements: pass `pick` with the legal node set.

import { useMemo } from 'react';
import {
  DS_TILE_FACES, DS_ENCOUNTER_BY_ID,
  type DsView,
} from '@bge/shared';
import { DS_SEAT_HEX } from './dsAssets';
import { bossUnitAt, enemyAlive, enemyDef, bossUnitLabel } from './dsPlayRules';

export interface MapPick {
  nodes: Set<string>;
  onPick: (nodeId: string) => void;
}

const TERRAIN_GLYPH: Record<string, { label: string; hue: string }> = {
  gravestone: { label: 'G', hue: '#8d93a6' },
  barrel: { label: 'B', hue: '#b98c4f' },
  chest: { label: 'C', hue: '#d8b45a' },
  'mimic-chest': { label: 'C', hue: '#c46a9a' },
};

export function DsNodeMap({ view, seat, pick, className }: {
  view: DsView;
  seat: number;
  pick?: MapPick | null;
  className?: string;
}) {
  const enc = view.encounter;
  const face = enc ? DS_TILE_FACES[enc.faceId] : null;

  const layout = useMemo(() => {
    if (!face) return null;
    const [w, h] = face.sizePx;
    const byId = Object.fromEntries(face.nodes.map((n) => [n.id, n]));
    return { w, h, byId };
  }, [face]);

  if (!enc || !face || !layout) return null;
  const { w, h, byId } = layout;
  const r = Math.min(w, h) * 0.055;

  const encounterName = enc.encounterId ? DS_ENCOUNTER_BY_ID[enc.encounterId]?.name : (view.boss ? bossUnitLabel(view, 'boss') : null);

  const tile = enc.tileId ? view.tiles.find((t) => t.id === enc.tileId) : null;

  return (
    <div className={`ds-map ig-glass${className ? ` ${className}` : ''}`}>
      <div className="ds-map-head">
        <span className="ig-lab">{view.phase === 'bossEncounter' ? 'BOSS ARENA' : 'ENCOUNTER'}</span>
        {encounterName && <b>{encounterName.toUpperCase()}</b>}
      </div>
      <svg viewBox={`${-r} ${-r} ${w + 2 * r} ${h + 2 * r}`} className="ds-map-svg" role="img" aria-label="Tile node map">
        {/* edges */}
        {face.edges.map(([a, b]) => {
          const na = byId[a]; const nb = byId[b];
          if (!na || !nb) return null;
          return <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="rgba(255,255,255,0.14)" strokeWidth={r * 0.09} />;
        })}
        {/* nodes */}
        {face.nodes.map((n) => {
          const pickable = pick?.nodes.has(n.id) ?? false;
          const terrain = enc.terrain.find((t) => t.nodeId === n.id && !(t.piece === 'barrel' && t.destroyed));
          const glyph = terrain ? TERRAIN_GLYPH[terrain.piece] : null;
          const chestOpen = terrain && (terrain.piece === 'chest' || terrain.piece === 'mimic-chest')
            && tile?.chests[n.id] === 'open';
          const trapped = enc.trapsRevealed.includes(n.id);
          return (
            <g
              key={n.id}
              onClick={pickable ? () => pick!.onPick(n.id) : undefined}
              style={pickable ? { cursor: 'pointer' } : undefined}
            >
              <circle cx={n.x} cy={n.y} r={r} fill={pickable ? 'rgba(232,180,80,0.18)' : 'rgba(255,255,255,0.05)'}
                stroke={pickable ? '#e8b450' : 'rgba(255,255,255,0.22)'} strokeWidth={pickable ? r * 0.14 : r * 0.06}
                className={pickable ? 'ds-map-pick' : undefined} />
              {glyph && (
                <text x={n.x + r * 0.62} y={n.y - r * 0.62} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.72} fontWeight={700} fill={glyph.hue} opacity={chestOpen ? 0.35 : 1}>{glyph.label}</text>
              )}
              {trapped && (
                <text x={n.x - r * 0.62} y={n.y - r * 0.62} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.62} fontWeight={700} fill="#ff5a4d">T</text>
              )}
            </g>
          );
        })}
        {/* enemy models */}
        {enc.enemies.filter(enemyAlive).map((e, i) => {
          const n = byId[e.nodeId];
          if (!n) return null;
          const def = enemyDef(e);
          const sibs = enc.enemies.filter((x) => enemyAlive(x) && x.nodeId === e.nodeId);
          const k = sibs.findIndex((x) => x.uid === e.uid);
          const off = offset(k, sibs.length + view.characters.filter((c) => c.nodeId === e.nodeId).length, r);
          void i;
          return (
            <g key={`e${e.uid}`}>
              <circle cx={n.x + off.x} cy={n.y + off.y} r={r * 0.42}
                fill={e.invader ? '#7a2f4e' : '#5d2323'} stroke="rgba(255,255,255,0.55)" strokeWidth={r * 0.05} />
              <text x={n.x + off.x} y={n.y + off.y} textAnchor="middle" dominantBaseline="central"
                fontSize={r * 0.42} fontWeight={700} fill="#fff">{initials(def.name)}</text>
              {e.wounds > 0 && (
                <text x={n.x + off.x} y={n.y + off.y + r * 0.62} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.34} fontWeight={700} fill="#ffb1a8">{def.health - e.wounds}/{def.health}</text>
              )}
            </g>
          );
        })}
        {/* boss units + facing */}
        {(view.boss?.units ?? []).filter((u) => u.inPlay && u.nodeId).map((u) => {
          const n = byId[u.nodeId!];
          if (!n) return null;
          const f = u.facing ?? [0, -1];
          const len = Math.hypot(f[0], f[1]) || 1;
          return (
            <g key={u.key}>
              <circle cx={n.x} cy={n.y} r={r * 0.66} fill="rgba(103,58,150,0.65)" stroke="#c9a6ee" strokeWidth={r * 0.07} />
              <line x1={n.x} y1={n.y} x2={n.x + (f[0] / len) * r * 1.05} y2={n.y + (f[1] / len) * r * 1.05}
                stroke="#c9a6ee" strokeWidth={r * 0.1} markerEnd="none" />
              <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="central"
                fontSize={r * 0.44} fontWeight={800} fill="#fff">{initials(bossUnitLabel(view, u.key))}</text>
              <text x={n.x} y={n.y + r * 0.95} textAnchor="middle" dominantBaseline="central"
                fontSize={r * 0.36} fontWeight={700} fill="#e3cffa">{u.health}/{u.maxHealth}</text>
            </g>
          );
        })}
        {/* characters */}
        {view.characters.filter((c) => c.nodeId).map((c) => {
          const n = byId[c.nodeId!];
          if (!n) return null;
          const sibs = view.characters.filter((x) => x.nodeId === c.nodeId);
          const enemiesHere = enc.enemies.filter((x) => enemyAlive(x) && x.nodeId === c.nodeId).length;
          const k = enemiesHere + sibs.findIndex((x) => x.seat === c.seat);
          const off = offset(k, sibs.length + enemiesHere, r);
          const mine = c.seat === seat;
          return (
            <g key={`c${c.seat}`}>
              <circle cx={n.x + off.x} cy={n.y + off.y} r={r * (mine ? 0.46 : 0.4)}
                fill="rgba(10,12,16,0.9)" stroke={DS_SEAT_HEX[c.seat]} strokeWidth={r * (mine ? 0.12 : 0.07)} />
              <text x={n.x + off.x} y={n.y + off.y} textAnchor="middle" dominantBaseline="central"
                fontSize={r * 0.42} fontWeight={800} fill={DS_SEAT_HEX[c.seat]}>{c.className[0]}</text>
              {view.aggroSeat === c.seat && (
                <circle cx={n.x + off.x + r * 0.4} cy={n.y + off.y - r * 0.4} r={r * 0.14} fill="#ff5a4d" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="ds-map-legend ig-lab">RED DOT = AGGRO · G GRAVE · B BARREL · C CHEST · T TRAP</div>
    </div>
  );
}

function offset(index: number, count: number, r: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const d = r * 0.5;
  return { x: Math.cos(angle) * d, y: Math.sin(angle) * d };
}

function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
