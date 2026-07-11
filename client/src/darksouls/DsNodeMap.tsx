// Dark Souls device encounter board. The authentic room art stays visible
// under the golden node graph, while exact enemy/boss/character ids make the
// physical-looking pieces the authoritative tap targets. Nodes remain the hit
// surface for movement, dodges and pushes.

import { useMemo, type KeyboardEvent } from 'react';
import {
  DS_TILE_FACES, DS_ENCOUNTER_BY_ID,
  type DsView,
} from '@bge/shared';
import {
  DS_SEAT_HEX, dsBossPortrait, dsCardStyle, dsClassPortrait, dsMiniPortrait,
  type DsManifest,
} from './dsAssets';
import { DS_FACE_ART } from './ds-assets';
import { enemyAlive, enemyDef, bossUnitLabel } from './dsPlayRules';

export interface MapPick {
  nodes: Set<string>;
  pieces?: Set<string>;
  onPick: (nodeId: string) => void;
  onPickPiece?: (pieceId: string) => void;
}

const TERRAIN_GLYPH: Record<string, { label: string; hue: string }> = {
  gravestone: { label: 'G', hue: '#aeb4c4' },
  barrel: { label: 'B', hue: '#d6a35d' },
  chest: { label: 'C', hue: '#f0c866' },
  'mimic-chest': { label: 'C', hue: '#dc82b2' },
};

export function DsNodeMap({ view, seat, manifest, pick, className }: {
  view: DsView;
  seat: number;
  manifest: DsManifest;
  pick?: MapPick | null;
  className?: string;
}) {
  const enc = view.encounter;
  const face = enc ? DS_TILE_FACES[enc.faceId] : null;

  const layout = useMemo(() => {
    if (!face) return null;
    const [w, h] = face.sizePx;
    const byId = Object.fromEntries(face.nodes.map((node) => [node.id, node]));
    return { w, h, byId };
  }, [face]);

  if (!enc || !face || !layout) return null;
  const { w, h, byId } = layout;
  const r = Math.min(w, h) * 0.055;
  const encounterDef = enc.encounterId ? DS_ENCOUNTER_BY_ID[enc.encounterId] : null;
  const encounterName = encounterDef?.name ?? (view.boss ? bossUnitLabel(view, 'boss') : null);
  const tile = enc.tileId ? view.tiles.find((candidate) => candidate.id === enc.tileId) : null;
  const art = DS_FACE_ART[enc.faceId];
  const aliveEnemies = enc.enemies.filter(enemyAlive);
  const hint = pick
    ? pick.pieces && pick.pieces.size > 0 ? 'TAP A GLOWING MINIATURE' : 'TAP A GLOWING NODE'
    : 'TAP AN ACTION TO BEGIN';

  const activateNode = (nodeId: string) => pick?.onPick(nodeId);
  const activatePiece = (pieceId: string) => pick?.onPickPiece?.(pieceId);
  const keyActivate = (event: KeyboardEvent<SVGGElement>, run: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      run();
    }
  };

  return (
    <div className={`ds-map ds-encounter-board ig-glass${pick ? ' targeting' : ''}${className ? ` ${className}` : ''}`}>
      <div className="ds-map-head">
        <div className="ds-map-head-copy">
          <span className="ig-lab">
            {view.phase === 'bossEncounter' ? 'BOSS ARENA' : `ENCOUNTER${encounterDef ? ` · LEVEL ${encounterDef.level}` : ''}`}
          </span>
          {encounterName && <b>{encounterName.toUpperCase()}</b>}
          <small>{hint}</small>
        </div>
        {enc.encounterId && (
          <span className="ds-map-card" style={dsCardStyle(enc.encounterId)} title={`${encounterName ?? 'Encounter'} card`} />
        )}
      </div>

      <svg viewBox={`${-r} ${-r} ${w + 2 * r} ${h + 2 * r}`} className="ds-map-svg" role="img" aria-label="Tile encounter board">
        {art && <image href={art.image} x="0" y="0" width={w} height={h} preserveAspectRatio="none" className="ds-map-art" />}
        <rect x="0" y="0" width={w} height={h} rx={r * 0.28} className="ds-map-shade" />

        {face.edges.map(([a, b]) => {
          const from = byId[a];
          const to = byId[b];
          if (!from || !to) return null;
          return <line key={`${a}-${b}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="ds-map-edge" strokeWidth={r * 0.075} />;
        })}

        {face.nodes.map((node) => {
          const pickable = pick?.nodes.has(node.id) ?? false;
          const terrain = enc.terrain.find((item) => item.nodeId === node.id && !(item.piece === 'barrel' && item.destroyed));
          const glyph = terrain ? TERRAIN_GLYPH[terrain.piece] : null;
          const chestOpen = terrain && (terrain.piece === 'chest' || terrain.piece === 'mimic-chest')
            && tile?.chests[node.id] === 'open';
          const trapped = enc.trapsRevealed.includes(node.id);
          return (
            <g
              key={node.id}
              data-node-id={node.id}
              data-map-target={pickable ? 'node' : undefined}
              role={pickable ? 'button' : undefined}
              tabIndex={pickable ? 0 : undefined}
              aria-label={pickable ? `Choose node ${node.id}` : undefined}
              onClick={pickable ? () => activateNode(node.id) : undefined}
              onKeyDown={pickable ? (event) => keyActivate(event, () => activateNode(node.id)) : undefined}
              style={pickable ? { cursor: 'pointer' } : undefined}
            >
              <circle cx={node.x} cy={node.y} r={r}
                className={`ds-map-node${pickable ? ' ds-map-pick' : ''}`}
                strokeWidth={pickable ? r * 0.14 : r * 0.05} />
              {glyph && (
                <text x={node.x + r * 0.62} y={node.y - r * 0.62} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.72} fontWeight={800} fill={glyph.hue} opacity={chestOpen ? 0.35 : 1} className="ds-map-glyph">{glyph.label}</text>
              )}
              {trapped && (
                <text x={node.x - r * 0.62} y={node.y - r * 0.62} textAnchor="middle" dominantBaseline="central"
                  fontSize={r * 0.62} fontWeight={800} fill="#ff675a" className="ds-map-glyph">T</text>
              )}
            </g>
          );
        })}

        {aliveEnemies.map((enemy) => {
          const node = byId[enemy.nodeId];
          if (!node) return null;
          const def = enemyDef(enemy);
          const siblings = aliveEnemies.filter((candidate) => candidate.nodeId === enemy.nodeId);
          const index = siblings.findIndex((candidate) => candidate.uid === enemy.uid);
          const otherModels = view.characters.filter((character) => character.nodeId === enemy.nodeId).length;
          const off = offset(index, siblings.length + otherModels, r);
          const cx = node.x + off.x;
          const cy = node.y + off.y;
          const pieceId = `enemy:${enemy.uid}`;
          const pickable = pick?.pieces?.has(pieceId) ?? false;
          const portrait = dsMiniPortrait(manifest, enemy.typeId);
          const clipId = `ds-enemy-${enemy.uid}`;
          return (
            <g key={pieceId} className={`ds-map-entity enemy${pickable ? ' target' : ''}`}
              data-piece-id={pieceId} data-map-target={pickable ? 'piece' : undefined}
              role={pickable ? 'button' : undefined} tabIndex={pickable ? 0 : undefined}
              aria-label={pickable ? `Target ${def.name}` : undefined}
              onClick={pickable ? (event) => { event.stopPropagation(); activatePiece(pieceId); } : undefined}
              onKeyDown={pickable ? (event) => keyActivate(event, () => activatePiece(pieceId)) : undefined}
              style={pickable ? { cursor: 'pointer' } : undefined}>
              {pickable && <circle cx={cx} cy={cy} r={r * 0.65} className="ds-map-target-ring" />}
              <circle cx={cx} cy={cy} r={r * 0.46} fill={enemy.invader ? '#7a2f4e' : '#5d2323'}
                className="ds-map-piece-base" strokeWidth={r * 0.06} />
              {portrait && <>
                <clipPath id={clipId}><circle cx={cx} cy={cy} r={r * 0.4} /></clipPath>
                <image href={portrait} x={cx - r * 0.42} y={cy - r * 0.42} width={r * 0.84} height={r * 0.84}
                  preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} className="ds-map-portrait" />
              </>}
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 0.34} fontWeight={800}
                className={`ds-map-piece-initials${portrait ? ' with-art' : ''}`}>{initials(def.name)}</text>
              <text x={cx} y={cy + r * 0.64} textAnchor="middle" dominantBaseline="central" fontSize={r * 0.3} fontWeight={800}
                className="ds-map-hp">{def.health - enemy.wounds}/{def.health}</text>
            </g>
          );
        })}

        {(view.boss?.units ?? []).filter((unit) => unit.inPlay && unit.nodeId).map((unit) => {
          const node = byId[unit.nodeId!];
          if (!node) return null;
          const facing = unit.facing ?? [0, -1];
          const length = Math.hypot(facing[0], facing[1]) || 1;
          const pieceId = `boss:${unit.key}`;
          const pickable = pick?.pieces?.has(pieceId) ?? false;
          const portrait = dsBossPortrait(manifest, view.boss!.id, unit.key);
          const clipId = `ds-boss-${unit.key}`;
          const label = bossUnitLabel(view, unit.key);
          return (
            <g key={pieceId} className={`ds-map-entity boss${pickable ? ' target' : ''}`}
              data-piece-id={pieceId} data-map-target={pickable ? 'piece' : undefined}
              role={pickable ? 'button' : undefined} tabIndex={pickable ? 0 : undefined}
              aria-label={pickable ? `Target ${label}` : undefined}
              onClick={pickable ? (event) => { event.stopPropagation(); activatePiece(pieceId); } : undefined}
              onKeyDown={pickable ? (event) => keyActivate(event, () => activatePiece(pieceId)) : undefined}>
              {pickable && <circle cx={node.x} cy={node.y} r={r * 0.84} className="ds-map-target-ring" />}
              <circle cx={node.x} cy={node.y} r={r * 0.66} fill="rgba(103,58,150,0.82)"
                className="ds-map-piece-base" strokeWidth={r * 0.07} />
              {portrait && <>
                <clipPath id={clipId}><circle cx={node.x} cy={node.y} r={r * 0.59} /></clipPath>
                <image href={portrait} x={node.x - r * 0.61} y={node.y - r * 0.61} width={r * 1.22} height={r * 1.22}
                  preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} className="ds-map-portrait" />
              </>}
              <line x1={node.x} y1={node.y} x2={node.x + (facing[0] / length) * r * 1.05} y2={node.y + (facing[1] / length) * r * 1.05}
                stroke="#d4b2f2" strokeWidth={r * 0.1} />
              <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="central" fontSize={r * 0.38} fontWeight={800}
                className={`ds-map-piece-initials${portrait ? ' with-art' : ''}`}>{initials(label)}</text>
              <text x={node.x} y={node.y + r * 0.95} textAnchor="middle" dominantBaseline="central" fontSize={r * 0.36} fontWeight={800}
                fill="#ead8ff" className="ds-map-hp">{unit.health}/{unit.maxHealth}</text>
            </g>
          );
        })}

        {view.characters.filter((character) => character.nodeId).map((character) => {
          const node = byId[character.nodeId!];
          if (!node) return null;
          const siblings = view.characters.filter((candidate) => candidate.nodeId === character.nodeId);
          const enemiesHere = aliveEnemies.filter((candidate) => candidate.nodeId === character.nodeId).length;
          const index = enemiesHere + siblings.findIndex((candidate) => candidate.seat === character.seat);
          const off = offset(index, siblings.length + enemiesHere, r);
          const cx = node.x + off.x;
          const cy = node.y + off.y;
          const mine = character.seat === seat;
          const pieceId = `character:${character.seat}`;
          const pickable = pick?.pieces?.has(pieceId) ?? false;
          const portrait = dsClassPortrait(manifest, character.classId);
          const clipId = `ds-character-${character.seat}`;
          return (
            <g key={pieceId} className={`ds-map-entity character${pickable ? ' target' : ''}`}
              data-piece-id={pieceId} data-map-target={pickable ? 'piece' : undefined}
              role={pickable ? 'button' : undefined} tabIndex={pickable ? 0 : undefined}
              aria-label={pickable ? `Choose ${character.className}` : undefined}
              onClick={pickable ? (event) => { event.stopPropagation(); activatePiece(pieceId); } : undefined}
              onKeyDown={pickable ? (event) => keyActivate(event, () => activatePiece(pieceId)) : undefined}>
              {pickable && <circle cx={cx} cy={cy} r={r * 0.65} className="ds-map-target-ring friendly" />}
              <circle cx={cx} cy={cy} r={r * (mine ? 0.46 : 0.42)} fill="rgba(10,12,16,0.92)"
                stroke={DS_SEAT_HEX[character.seat]} strokeWidth={r * (mine ? 0.12 : 0.08)} className="ds-map-piece-base" />
              {portrait && <>
                <clipPath id={clipId}><circle cx={cx} cy={cy} r={r * 0.37} /></clipPath>
                <image href={portrait} x={cx - r * 0.39} y={cy - r * 0.39} width={r * 0.78} height={r * 0.78}
                  preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} className="ds-map-portrait" />
              </>}
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={r * 0.38} fontWeight={800}
                fill={DS_SEAT_HEX[character.seat]} className={`ds-map-piece-initials${portrait ? ' with-art' : ''}`}>{character.className[0]}</text>
              {view.aggroSeat === character.seat && <circle cx={cx + r * 0.4} cy={cy - r * 0.4} r={r * 0.14} fill="#ff5a4d" />}
            </g>
          );
        })}

        {view.summon?.nodeId && byId[view.summon.nodeId] && (() => {
          const node = byId[view.summon!.nodeId!];
          const portrait = dsMiniPortrait(manifest, view.summon!.id);
          return (
            <g className="ds-map-entity summon">
              <circle cx={node.x + r * 0.42} cy={node.y + r * 0.42} r={r * 0.39}
                fill="rgba(215,225,255,.24)" stroke="#d8e1ff" strokeWidth={r * 0.07} />
              {portrait && <image href={portrait} x={node.x + r * 0.08} y={node.y + r * 0.08} width={r * 0.68} height={r * 0.68}
                preserveAspectRatio="xMidYMid meet" className="ds-map-portrait" />}
            </g>
          );
        })()}
      </svg>

      {aliveEnemies.length > 0 && (
        <div className="ds-map-roster" aria-label="Enemies in this encounter">
          {aliveEnemies.map((enemy) => {
            const def = enemyDef(enemy);
            return (
              <span key={enemy.uid}>
                <b>{def.name.toUpperCase()}</b>
                <small className="ig-num">HP {def.health - enemy.wounds}/{def.health} · THREAT {def.threat}</small>
              </span>
            );
          })}
        </div>
      )}
      <div className="ds-map-legend ig-lab">G GRAVE · B BARREL · C CHEST · T TRAP</div>
    </div>
  );
}

function offset(index: number, count: number, r: number): { x: number; y: number } {
  if (count <= 1) return { x: 0, y: 0 };
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const distance = r * 0.52;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}

function initials(name: string): string {
  const words = name.split(/[\s-]+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}
