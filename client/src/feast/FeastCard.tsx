import { useEffect, type CSSProperties } from 'react';
import type { FeastOccupationDefinition } from '@bge/shared';
import type { FeastScene } from './FeastScene';

function sheetFor(scene: FeastScene, card: FeastOccupationDefinition) {
  const sheets = Object.entries(scene.decks.sheets);
  if (card.starting) return sheets.find(([key]) => /start/i.test(key))?.[1] ?? sheets[0]?.[1];
  const wanted = new RegExp(`occupation[-_]?${card.deck}$`, 'i');
  return sheets.find(([key]) => wanted.test(key))?.[1]
    ?? sheets.find(([key]) => new RegExp(card.deck, 'i').test(key) && !/start/i.test(key))?.[1]
    ?? sheets[0]?.[1];
}

export function occupationFaceStyle(scene: FeastScene, card: FeastOccupationDefinition): CSSProperties {
  const sheet = sheetFor(scene, card);
  if (!sheet) return {};
  const col = card.cell % sheet.cols;
  const row = Math.floor(card.cell / sheet.cols);
  const face = sheet.image ?? sheet.face;
  if (!face) return {};
  return {
    backgroundImage: `url("${face}")`,
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${sheet.cols <= 1 ? 0 : (col / (sheet.cols - 1)) * 100}% ${sheet.rows <= 1 ? 0 : (row / (sheet.rows - 1)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export function FeastOccupationCard({ scene, card, played = false, onClick }: {
  scene: FeastScene;
  card: FeastOccupationDefinition;
  played?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`ft-card${played ? ' played' : ''}`} onClick={onClick} aria-label={`Inspect ${card.name}`}>
      <span className="ft-card-sprite" style={occupationFaceStyle(scene, card)} />
      <footer><b>{card.name}</b><span>{card.starting ? 'STARTING' : 'DARK'} · DECK {card.deck} · {card.points} VP</span></footer>
    </button>
  );
}

export function FeastCardDialog({ scene, card, close, canPlay, onPlay, onResolve, resolveLabel, usageHint }: {
  scene: FeastScene;
  card: FeastOccupationDefinition;
  close: () => void;
  canPlay?: boolean;
  onPlay?: () => void;
  onResolve?: () => void;
  resolveLabel?: string;
  usageHint?: string;
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close]);
  return (
    <div className="ft-card-dialog" onClick={close} role="dialog" aria-modal="true" aria-label={`${card.name} occupation`} data-testid="feast-card-dialog">
      <div className="ft-card-dialog-shell" onClick={(event) => event.stopPropagation()}>
        <div className="ft-card-dialog-art"><div className="ft-card-dialog-sprite" style={occupationFaceStyle(scene, card)} role="img" aria-label={card.name} /></div>
        <div className="ft-card-dialog-copy">
          <div className="ft-kicker">CARD {card.number} · DECK {card.deck} · {card.points} VP</div>
          <h2>{card.name}</h2>
          <span className={`ft-card-type ${card.type}`}>{card.type.replaceAll('-', ' ').toUpperCase()}</span>
          <div className="ft-section-heading"><h3>OFFICIAL APPENDIX CLARIFICATION</h3></div>
          <p>{card.clarification}</p>
          {usageHint && <div className="ft-card-usage-hint"><b>HOW TO USE THIS CARD</b><span>{usageHint}</span></div>}
          <div className="ft-card-dialog-actions">
            {onPlay && <button className="ft-button primary" disabled={!canPlay} onClick={onPlay}>{canPlay ? 'PLAY OCCUPATION' : 'PLAY WHEN THE ACTION ALLOWS'}</button>}
            {onResolve && <button className="ft-button" onClick={onResolve}>{resolveLabel ?? 'USE ANYTIME EFFECT'}</button>}
            <a className="ft-button" href="/feast/appendix.pdf" target="_blank" rel="noreferrer">OPEN APPENDIX</a>
            <button className="ft-button quiet" onClick={close}>CLOSE</button>
          </div>
        </div>
      </div>
    </div>
  );
}
