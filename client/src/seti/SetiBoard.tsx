import { useState, type CSSProperties, type ReactNode } from 'react';
import type { SetiView } from '@bge/shared';
import { SetiIcon } from './SetiIcons';
import { SetiCardArt, SetiStarfield, SetiTable, setiGoldTile, setiTechAbilityFace, useSetiScene } from './SetiScene';
import { normalizeSetiView, setiSeatColor } from './setiView';
import { SetiSoloTvHud } from './SetiSoloRival';
import './seti.css';

export function SetiBoard({ view: rawView }: { view: SetiView }) {
  const view = normalizeSetiView(rawView);
  const scene = useSetiScene();
  const [detailSeat, setDetailSeat] = useState<number | null>(null);
  const active = view.players.find((player) => player.seat === view.activeSeat);
  const winners = view.winners.map((seat) => view.players.find((player) => player.seat === seat)?.name).filter(Boolean);

  return (
    <main className="seti-root seti-tv" data-testid="seti-tv-root" aria-label="SETI shared table">
      <SetiStarfield density={1.15} />

      <header className="seti-tv-status seti-glass">
        <div className="seti-wordmark"><span>SETI</span><small>SEARCH FOR EXTRATERRESTRIAL INTELLIGENCE</small></div>
        <div className="seti-round-readout">
          <small>{view.phase === 'ended' ? 'FINAL TRANSMISSION' : 'MISSION ROUND'}</small>
          <b>{view.phase === 'ended' ? winners.join(' + ') || 'COMPLETE' : `${view.round} / 5`}</b>
        </div>
        <div className="seti-active-readout" style={{ '--seat': setiSeatColor(active?.color) } as CSSProperties}>
          <span />
          <div><small>{view.phase === 'ended' ? 'MISSION STATUS' : 'ACTIVE AGENCY'}</small><b>{view.phase === 'ended' ? 'ARCHIVED' : active?.name ?? 'STANDBY'}</b></div>
        </div>
      </header>

      <section className="seti-tv-table">
        {scene ? <SetiTable scene={scene} view={view} /> : <SetiBoardLoading />}
      </section>

      <aside className="seti-score-rail" aria-label="agency scores">
        {view.players.map((player) => (
          <button
            key={player.seat}
            type="button"
            className={`seti-score-chip seti-glass ${player.seat === view.activeSeat ? 'is-active' : ''} ${player.passed ? 'is-passed' : ''}`}
            style={{ '--seat': setiSeatColor(player.color) } as CSSProperties}
            onClick={() => setDetailSeat(player.seat)}
          >
            <span className="seti-seat-outline" />
            <span className="seti-score-name">{player.name}</span>
            {player.seat === view.startingSeat && <span className="seti-starting-marker" title="starting player"><img src="/seti/tokens/first-player.webp" alt="starting player token" /></span>}
            <span className="seti-score-value">{view.phase === 'ended' ? player.finalScore ?? player.score : player.score}<small>VP</small></span>
            <span className="seti-pub-value"><SetiIcon name="publicity" />{player.publicity}</span>
          </button>
        ))}
      </aside>

      <div className="seti-rotation-chip seti-glass">
        <span className={`seti-rotation-mini disc-${view.rotationPointer}`} />
        <div><small>NEXT ROTATION</small><b>DISC {view.rotationPointer}</b><small>{view.roundEndCount} ROUND CARDS</small></div>
      </div>

      <aside className="seti-neutral-supply seti-glass" aria-label="neutral discovery markers">
        {([20, 30] as const).map((threshold) => <div key={threshold}><span>{Array.from({ length: view.neutralMilestonesRemaining[threshold] }, (_, index) => <i key={index} />)}</span><b>{threshold} VP</b></div>)}
      </aside>

      {view.solo && <SetiSoloTvHud solo={view.solo} />}

      {view.lastEvent && (
        <div className="seti-event-caption seti-glass" key={view.lastEvent.seq} style={{ '--seat': setiSeatColor(view.players[view.lastEvent.seat ?? -1]?.color) } as CSSProperties}>
          <span className="seti-event-scan" />
          <div><small>MISSION LOG</small><b>{view.lastEvent.title.replace(/[-_]/g, ' ')}</b>{view.lastEvent.detail && <p>{view.lastEvent.detail}</p>}</div>
        </div>
      )}

      {detailSeat !== null && (() => {
        const player = view.players.find((entry) => entry.seat === detailSeat);
        if (!player) return null;
        return (
          <div className="seti-modal-layer" onPointerDown={() => setDetailSeat(null)}>
            <section className="seti-agency-detail seti-glass" style={{ '--seat': setiSeatColor(player.color) } as CSSProperties} onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" className="seti-close" onClick={() => setDetailSeat(null)} aria-label="close agency details"><SetiIcon name="close" /></button>
              <span className="seti-seat-outline" />
              <small>AGENCY TELEMETRY</small>
              <h2>{player.name}</h2>
              {player.seat === view.startingSeat && <div className="seti-detail-starting"><span className="seti-starting-marker"><img src="/seti/tokens/first-player.webp" alt="starting player token" /></span><b>STARTING AGENCY</b></div>}
              <div className="seti-detail-grid">
                <Metric icon="score" label="VICTORY" value={view.phase === 'ended' ? player.finalScore ?? player.score : player.score} />
                <Metric icon="publicity" label="PUBLICITY" value={player.publicity} />
                <Metric icon="credit" label="CREDITS" value={player.credits} />
                <Metric icon="energy" label="ENERGY" value={player.energy} />
                <Metric icon="data" label="DATA" value={player.dataPool} />
                <Metric icon="research" label="TECH" value={player.techs.length} />
              </div>
              <div className="seti-detail-strip"><span>PROBES {view.pieces.filter((piece) => piece.owner === player.seat && piece.kind === 'probe').length}</span><span>ORBITERS {view.placedSpacecraft.filter((piece) => piece.owner === player.seat && piece.kind === 'orbiter').length}</span><span>LANDERS {view.placedSpacecraft.filter((piece) => piece.owner === player.seat && piece.kind === 'lander').length}</span><span>TRACES {view.species.flatMap((species) => species.markers).filter((marker) => marker.owner === player.seat).length}</span><span>MISSIONS {player.missions.length}</span><span>{player.passed ? 'PASSED' : 'ACTIVE'}</span></div>
              {player.finalScoreBreakdown && <div className="seti-final-breakdown"><span><small>BOARD</small><b>{player.finalScoreBreakdown.base}</b></span><span><small>GOLD</small><b>{player.finalScoreBreakdown.gold}</b></span><span><small>PROJECTS</small><b>{player.finalScoreBreakdown.projects}</b></span><span><small>ALIENS</small><b>{player.finalScoreBreakdown.aliens >= 0 ? '+' : ''}{player.finalScoreBreakdown.aliens}</b></span><span><small>FINAL</small><b>{player.finalScoreBreakdown.total}</b></span></div>}
              {scene && (
                <div className="seti-detail-tableau">
                  <TableauLane label="TECHNOLOGY">
                    {player.techs.map((tech) => <span key={tech.tileId} className="seti-detail-tech">{setiTechAbilityFace(scene, tech.stackId, tech.tileId) ? <img src={setiTechAbilityFace(scene, tech.stackId, tech.tileId)} alt={tech.stackId.replace(/[-_]/g, ' ')} /> : <b>{tech.stackId.replace(/^seti_tech_stack_/, '').slice(0, 3)}</b>}</span>)}
                  </TableauLane>
                  <TableauLane label="COMPUTER">
                    <div className="seti-detail-computer">
                      <div className="seti-detail-computer-top">{Array.from({ length: 6 }, (_, slot) => <i key={slot} className={player.computer.top[slot] ? 'is-filled' : ''} />)}</div>
                      <div className="seti-detail-computer-tech">{Array.from({ length: 4 }, (_, boardSlot) => {
                        const installed = player.computer.tech.find((tech) => tech.boardSlot === boardSlot);
                        const owned = installed && player.techs.find((tech) => tech.stackId === installed.stackId);
                        const art = installed && setiTechAbilityFace(scene, installed.stackId, owned?.tileId);
                        return <span key={boardSlot} className={installed ? 'is-installed' : ''}>{art ? <img src={art} alt={`computer technology ${boardSlot + 1}`} /> : installed ? <b>CO</b> : null}{installed?.lower && <i />}</span>;
                      })}</div>
                    </div>
                  </TableauLane>
                  <TableauLane label="INCOME">
                    {player.income.map((id, index) => <span key={`${id}-${index}`} className="seti-detail-card"><SetiCardArt scene={scene} cardId={id} /></span>)}
                  </TableauLane>
                  <TableauLane label="MISSIONS & SCORING">
                    {[...player.missions, ...player.completedMissions, ...player.scoringCards, ...player.permanentCards].map((id, index) => <span key={`${id}-${index}`} className="seti-detail-card"><SetiCardArt scene={scene} cardId={id} /></span>)}
                  </TableauLane>
                  <TableauLane label="GOLD MILESTONES">
                    {player.goldClaims.map((id, index) => {
                      const tile = view.goldTiles.find((candidate) => candidate.id === id);
                      const art = setiGoldTile(scene, id, tile?.side ?? 'A');
                      return <span key={`${id}-${index}`} className="seti-detail-gold">{art ? <img src={art} alt={id.replace(/[-_]/g, ' ')} /> : <b>{id.replace(/^seti_gold_/, '')}</b>}</span>;
                    })}
                  </TableauLane>
                </div>
              )}
            </section>
          </div>
        );
      })()}
    </main>
  );
}

function TableauLane({ label, children }: { label: string; children: ReactNode }) {
  return <section className="seti-detail-lane"><small>{label}</small><div>{children}</div></section>;
}

function Metric({ icon, label, value }: { icon: 'score' | 'publicity' | 'credit' | 'energy' | 'data' | 'research'; label: string; value: number }) {
  return <div className="seti-detail-metric"><SetiIcon name={icon} /><span><small>{label}</small><b>{value}</b></span></div>;
}

function SetiBoardLoading() {
  return (
    <div className="seti-scene-loading" role="status">
      <span className="seti-loader-orbits"><i /><i /><i /></span>
      <b>CALIBRATING SOLAR SYSTEM</b>
    </div>
  );
}

export default SetiBoard;
