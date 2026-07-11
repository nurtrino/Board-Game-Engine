import { useState, type CSSProperties } from 'react';
import type { SetiView } from '@bge/shared';
import { SetiIcon } from './SetiIcons';
import { SetiStarfield, SetiTable, setiAlienBoard, useSetiScene } from './SetiScene';
import { normalizeSetiView, setiSeatColor } from './setiView';
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
            className={`seti-score-chip seti-glass ${player.seat === view.activeSeat ? 'is-active' : ''}`}
            style={{ '--seat': setiSeatColor(player.color) } as CSSProperties}
            onClick={() => setDetailSeat(player.seat)}
          >
            <span className="seti-seat-outline" />
            <span className="seti-score-name">{player.name}</span>
            <span className="seti-score-value">{player.score}<small>VP</small></span>
            <span className="seti-pub-value"><SetiIcon name="publicity" />{player.publicity}</span>
          </button>
        ))}
      </aside>

      {scene && view.species.length > 0 && (
        <aside className="seti-species-rail" aria-label="alien species">
          {view.species.slice(0, 2).map((species, index) => (
            <figure key={`${species.id}-${index}`} className={`seti-species-tile ${species.revealed ? 'is-revealed' : ''}`}>
              <img src={setiAlienBoard(scene, species.id, species.revealed)} alt={species.revealed ? species.id : `hidden species ${index + 1}`} />
              {species.markers.map((marker, markerIndex) => (
                <span
                  key={marker.id}
                  className={`seti-alien-marker trace-${marker.color}`}
                  style={{ '--seat': setiSeatColor(view.players[marker.owner]?.color), left: `${22 + markerIndex % 3 * 28}%`, bottom: `${8 + Math.floor(markerIndex / 3) * 9}%` } as CSSProperties}
                />
              ))}
              <figcaption>{species.revealed ? species.id.replace(/[-_]/g, ' ') : `SIGNAL ${index + 1}`}</figcaption>
            </figure>
          ))}
        </aside>
      )}

      <div className="seti-rotation-chip seti-glass">
        <span className={`seti-rotation-mini disc-${view.rotationPointer}`} />
        <div><small>NEXT ROTATION</small><b>DISC {view.rotationPointer}</b></div>
      </div>

      {view.solo && <div className="seti-tv-solo seti-glass"><small>SOLO RIVAL</small><b>{view.solo.rivalScore} VP</b><span>{view.solo.progress} PROGRESS</span></div>}

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
              <div className="seti-detail-grid">
                <Metric icon="score" label="VICTORY" value={player.score} />
                <Metric icon="publicity" label="PUBLICITY" value={player.publicity} />
                <Metric icon="credit" label="CREDITS" value={player.credits} />
                <Metric icon="energy" label="ENERGY" value={player.energy} />
                <Metric icon="data" label="DATA" value={player.dataPool} />
                <Metric icon="research" label="TECH" value={player.techs.length} />
              </div>
              <div className="seti-detail-strip"><span>PROBES {view.pieces.filter((piece) => piece.owner === player.seat && piece.kind === 'probe').length}</span><span>MISSIONS {player.missions.length}</span><span>{player.passed ? 'PASSED' : 'ACTIVE'}</span></div>
            </section>
          </div>
        );
      })()}
    </main>
  );
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
