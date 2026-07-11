import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  FeastBoardDefinition, FeastBoardState, FeastEvent, FeastPhase,
  FeastPlayerView, FeastSeatColor, FeastView,
} from '@bge/shared';
import { FEAST_BOARD_BY_ID, FEAST_OCCUPATION_BY_ID } from '@bge/shared';
import { playSfx } from '../sfx';
import { FeastScene3D } from './FeastScene3D';
import { useFeastScene, type FeastScene } from './FeastScene';
import './feast.css';

const SEAT_HEX: Record<FeastSeatColor, string> = {
  Red: '#b64b40', Blue: '#3f7998', Green: '#5e8963', Purple: '#785f8d',
};

const PHASE_LABEL: Record<FeastPhase, string> = {
  new_viking: 'NEW VIKING', harvest: 'HARVEST', exploration: 'EXPLORATION BOARDS', weapon: 'DRAW WEAPON',
  actions: 'VIKING ACTIONS', start_player: 'START PLAYER', income: 'INCOME', breeding: 'ANIMAL BREEDING',
  feast: 'FEAST', bonus: 'BONUS', mountains: 'MOUNTAIN STRIPS', return_vikings: 'RETURN VIKINGS', ended: 'SAGA COMPLETE',
};

const ROUND_PHASES: readonly { phase: FeastPhase; label: string }[] = [
  { phase: 'new_viking', label: 'NEW VIKING' }, { phase: 'harvest', label: 'HARVEST' },
  { phase: 'exploration', label: 'EXPLORE' }, { phase: 'weapon', label: 'WEAPON' },
  { phase: 'actions', label: 'ACTIONS' }, { phase: 'start_player', label: 'START' },
  { phase: 'income', label: 'INCOME' }, { phase: 'breeding', label: 'BREED' },
  { phase: 'feast', label: 'FEAST' }, { phase: 'bonus', label: 'BONUS' },
  { phase: 'mountains', label: 'MOUNTAINS' }, { phase: 'return_vikings', label: 'RETURN' },
];

function speakFeast(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(text);
    line.rate = 0.94;
    line.pitch = 0.88;
    line.volume = 0.72;
    window.speechSynthesis.speak(line);
  } catch { /* Browsers without speech voices still retain visual narration. */ }
}

function Scoreboard({ view, selectedSeat, selectSeat }: { view: FeastView; selectedSeat: number; selectSeat: (seat: number) => void }) {
  return (
    <div className="ft-tv-scoreboard" style={{ gridTemplateColumns: `repeat(${view.players.length}, minmax(0, 1fr))` }} data-testid="feast-tv-scoreboard">
      {view.players.map((player) => {
        const score = (view.scores ?? view.scorePreview).find((entry) => entry.seat === player.seat)?.total ?? 0;
        const active = view.actingSeat === player.seat;
        return (
          <button type="button" key={player.seat} className={`ft-tv-player${active ? ' active' : ''}${selectedSeat === player.seat ? ' selected' : ''}`} style={{ '--seat': SEAT_HEX[player.color] } as CSSProperties} onClick={() => selectSeat(player.seat)} aria-label={`Show ${player.name} public estate`}>
            <b>{player.name.toUpperCase()}{view.firstPlayer === player.seat && <em>FIRST</em>}</b>
            <strong>{score} <small>LIVE VP</small></strong>
            <span>{player.silver} SILVER · {player.workersAvailable} VIKINGS · {player.thingPenalties} PENALTIES</span>
          </button>
        );
      })}
    </div>
  );
}

function PublicEstate({ player, view, openBoards }: { player: FeastPlayerView; view: FeastView; openBoards: () => void }) {
  const goods = Object.entries(player.goods).filter(([, amount]) => amount > 0);
  const weapons = Object.entries(player.weapons).filter(([, amount]) => amount > 0);
  const ships = player.ships.filter((ship) => !ship.emigrated);
  const emigrated = player.ships.filter((ship) => ship.emigrated);
  return <div className="ft-tv-estate">
    <div className="ft-section-heading"><h3>{player.name.toUpperCase()} · PUBLIC ESTATE</h3><span>SELECT A PLAYER ABOVE</span></div>
    <div className="ft-tv-estate-facts">
      <span><b>{player.resources.wood}/{player.resources.stone}/{player.resources.ore}</b> WOOD · STONE · ORE</span>
      <span><b>{ships.length}/{emigrated.length}</b> ACTIVE · EMIGRATED SHIPS</span>
      <span><b>{player.boards.length}</b> BOARDS AND BUILDINGS</span>
      <span><b>{player.playedOccupations.length}</b> PLAYED OCCUPATIONS</span>
    </div>
    <div className="ft-tv-public-chips" aria-label={`${player.name} public goods`}>
      {goods.map(([id, amount]) => <span key={id}>{id.replaceAll('-', ' ').toUpperCase()} <b>{amount}</b></span>)}
      {ships.map((ship) => <span key={ship.id}>{ship.type.replaceAll('-', ' ').toUpperCase()} <b>{ship.ore} ORE</b></span>)}
      {weapons.map(([id, amount]) => <span key={id}>{id.replaceAll('-', ' ').toUpperCase()} <b>{amount}</b></span>)}
      {player.playedOccupations.map((id) => <span key={id}>{FEAST_OCCUPATION_BY_ID[id]?.name.toUpperCase() ?? id}</span>)}
      {!goods.length && !ships.length && !weapons.length && !player.playedOccupations.length && <span>NO PUBLIC INVENTORY YET</span>}
    </div>
    <div className="ft-tv-discard"><b>FACE-UP WEAPON DISCARD</b>{(['bow', 'snare', 'spear', 'long-sword'] as const).map((weapon) => <span key={weapon}>{weapon.replaceAll('-', ' ').toUpperCase()} {view.weaponDiscard.filter((card) => card === weapon).length}</span>)}</div>
    <button type="button" className="ft-tv-board-open" onClick={openBoards}>VIEW AUTHENTIC BOARD LAYOUTS</button>
  </div>;
}

const PUBLIC_PIECE_COLOR: Record<string, string> = {
  orange: '#c99550', red: '#b85e4c', green: '#63836a', blue: '#477c94',
  silver: '#d3d6d2', ore: '#555d60', wood: '#855d3e', stone: '#8b8980',
};

function publicBoardDefinition(board: FeastBoardState): FeastBoardDefinition {
  return FEAST_BOARD_BY_ID[board.definitionId] ?? {
    id: board.definitionId, name: board.definitionId.replaceAll('-', ' '), kind: board.kind,
    faceCode: board.definitionId, rows: 9, cols: 12,
    layout: Array.from({ length: 9 }, () => '#'.repeat(12)), points: 0,
    negativeCells: [], incomeTracks: [], bonuses: [], designatedResources: [],
  };
}

function publicBoardVisual(scene: FeastScene, board: FeastBoardState) {
  if (board.kind === 'home') {
    const asset = board.definitionId.includes('short') ? scene.homeBoards.short : scene.homeBoards.long;
    return { image: asset.image, imagePx: asset.imagePx, grid: asset.grid };
  }
  if (board.kind === 'exploration') {
    const asset = scene.exploration[board.definitionId];
    return { image: asset?.image, imagePx: asset?.imagePx, grid: asset?.grid };
  }
  const asset = scene.buildings[board.definitionId];
  return { image: asset?.front, imagePx: asset?.imagePx, grid: asset?.grid };
}

function PublicBoardMini({ board, scene }: { board: FeastBoardState; scene: FeastScene }) {
  const definition = publicBoardDefinition(board);
  const visual = publicBoardVisual(scene, board);
  const aspect = visual.imagePx ? visual.imagePx[0] / visual.imagePx[1] : definition.cols / definition.rows;
  const origin = visual.grid?.normalizedOrigin ?? [0, 0];
  const cell = visual.grid?.normalizedCell ?? [1 / definition.cols, 1 / definition.rows];
  return <article className="ft-public-board-card">
    <div className="ft-public-board-art" style={{ aspectRatio: `${aspect}` }}>
      {visual.image && <img className="ft-public-board-face" src={visual.image} alt={definition.name} />}
      {board.placements.map((placement) => {
        const width = Math.max(...placement.mask.map((row) => row.length));
        const height = placement.mask.length;
        const art = placement.pieceKind === 'good' ? scene.goods[placement.pieceId]?.front
          : placement.pieceKind === 'special' ? scene.specials[placement.pieceId]?.image : undefined;
        const turned = placement.rotation === 90 || placement.rotation === 270;
        return <span key={placement.id} className={`ft-public-board-piece${art ? '' : ' token'}`} style={{
          left: `${(origin[0] + placement.x * cell[0]) * 100}%`,
          top: `${(origin[1] + placement.y * cell[1]) * 100}%`,
          width: `${width * cell[0] * 100}%`, height: `${height * cell[1] * 100}%`,
          background: art ? undefined : PUBLIC_PIECE_COLOR[placement.color],
        }} title={placement.pieceId.replaceAll('-', ' ')}>
          {art && <img src={art} alt={placement.pieceId.replaceAll('-', ' ')} style={turned
            ? { width: `${(height / width) * 100}%`, height: `${(width / height) * 100}%`, transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)` }
            : { transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)` }} />}
        </span>;
      })}
    </div>
    <footer><b>{definition.name.toUpperCase()}</b><span>{board.placements.length} PLACED TILE{board.placements.length === 1 ? '' : 'S'}</span></footer>
  </article>;
}

function PublicBoardGallery({ player, scene, close }: { player: FeastPlayerView; scene: FeastScene; close: () => void }) {
  return <div className="ft-public-board-gallery" role="dialog" aria-modal="true" aria-label={`${player.name} public board layouts`}>
    <section>
      <header><div><span className="ft-kicker">PUBLIC PHYSICAL INFORMATION</span><h2>{player.name.toUpperCase()} · BOARD LAYOUTS</h2></div><button className="ft-button" onClick={close}>CLOSE</button></header>
      <div className="ft-public-board-grid">{player.boards.map((board) => <PublicBoardMini key={board.id} board={board} scene={scene} />)}</div>
    </section>
  </div>;
}

function PhaseTrack({ phase, phaseNumber }: { phase: FeastPhase; phaseNumber: number }) {
  return <div className="ft-tv-phases" aria-label={`Round phase ${phaseNumber} of 12`}>{ROUND_PHASES.map((entry, index) => {
    const number = index + 1;
    const current = phase !== 'ended' && entry.phase === phase;
    const done = phase === 'ended' || number < phaseNumber;
    return <div key={entry.phase} className={`${current ? 'current' : ''}${done ? ' done' : ''}`}><b>{number}</b><span>{entry.label}</span></div>;
  })}</div>;
}

function ImitationExtensions({ view, scene }: { view: FeastView; scene: NonNullable<ReturnType<typeof useFeastScene>> }) {
  const faces = Object.values(scene.extensions).flatMap((extension) => extension.faces).filter((face) => face.column && view.imitationColumns.includes(face.column));
  if (!faces.length) return null;
  return <div className="ft-tv-extensions">{faces.map((face) => {
    const imitators = view.actionSpaces.filter((space) => space.column === face.column).flatMap((space) => space.occupants.filter((occupant) => occupant.copiedFrom !== null).map((occupant) => ({ ...occupant, space: space.name })));
    return <div key={face.id}><img src={face.image} alt={`Column ${face.column} imitation extension`} /><footer><b>COLUMN {face.column} IMITATION</b>{imitators.length ? imitators.map((occupant, index) => <span key={`${occupant.seat}-${occupant.space}-${index}`}><i style={{ '--worker': SEAT_HEX[occupant.workerColor] } as CSSProperties} />{view.players[occupant.seat]?.name ?? 'PLAYER'} · {occupant.space}</span>) : <span>OPEN GREY SPACES</span>}</footer></div>;
  })}</div>;
}

function MountainDisplay({ view, scene }: { view: FeastView; scene: NonNullable<ReturnType<typeof useFeastScene>> }) {
  return (
    <div className="ft-tv-mountains" data-feast-tour="mountains">
      {view.mountains.map((mountain, index) => {
        const art = scene.mountains.find((entry) => entry.id === mountain.id) ?? scene.mountains[index];
        const removed = Math.max(0, (art?.items.length ?? 7) - mountain.items.length);
        return (
          <div key={mountain.id} className="ft-tv-mountain" title={`${mountain.items.join(', ')} · take from the arrow end`}>
            {art && <img src={art.image} alt={`Mountain strip ${index + 1}`} />}
            {Array.from({ length: removed }, (_, item) => <i key={item} style={{ left: `${item * 12.5}%` }} />)}
          </div>
        );
      })}
    </div>
  );
}

function ExplorationDisplay({ view, scene }: { view: FeastView; scene: NonNullable<ReturnType<typeof useFeastScene>> }) {
  return (
    <div className="ft-tv-exploration-grid" data-feast-tour="boards">
      {view.explorations.map((board) => {
        const art = scene.exploration[board.face];
        return (
          <div key={board.boardId} className="ft-tv-exploration">
            {art && <img src={art.image} alt={board.face.replaceAll('-', ' ')} />}
            <footer><span>{board.face.replaceAll('-', ' ').toUpperCase()}</span><b>{board.claimedBy === null ? `${board.silver} SILVER` : `${view.players[board.claimedBy]?.name ?? 'PLAYER'} CLAIMED`}</b></footer>
          </div>
        );
      })}
    </div>
  );
}

function ExplainBoard({ close }: { close: () => void }) {
  return (
    <div className="ft-explain" onClick={close} role="dialog" aria-label="Explain the Feast for Odin table">
      <div className="ft-explain-callout" style={{ left: '4%', top: '7%' }}><b>ACTION BOARD</b><span>Columns cost 1, 2, 3, or 4 Vikings. Workers on the authentic spaces show what has been claimed this round.</span></div>
      <div className="ft-explain-callout" style={{ left: '47%', top: '17%' }}><b>ROUND AND PHASE</b><span>The complete twelve-phase sequence is always visible. Automatic phases pause for every real player choice.</span></div>
      <div className="ft-explain-callout" style={{ right: '3%', top: '33%' }}><b>EXPLORATION</b><span>These four double-sided boards flip during the printed rounds. Unclaimed alternatives accumulate silver.</span></div>
      <div className="ft-explain-callout" style={{ left: '48%', bottom: '24%' }}><b>MOUNTAINS</b><span>Resources leave from the arrow end. One leftmost item ages away after every round.</span></div>
      <div className="ft-explain-callout" style={{ right: '4%', bottom: '5%' }}><b>PUBLIC NARRATION</b><span>Every action, die result, phase change, and final score is announced here and voiced through the shared display.</span></div>
    </div>
  );
}

export function FeastBoard({ view }: { view: FeastView }) {
  const scene = useFeastScene();
  const [explain, setExplain] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [boardGallerySeat, setBoardGallerySeat] = useState<number | null>(null);
  const [selectedSeat, setSelectedSeat] = useState(view.actingSeat ?? view.firstPlayer);
  const [voice, setVoice] = useState(() => { try { return localStorage.getItem('feast-tv-voice') !== '0'; } catch { return true; } });
  const [eventQueue, setEventQueue] = useState<FeastEvent[]>([]);
  const [presentedEvent, setPresentedEvent] = useState<FeastEvent | null>(null);
  const lastQueuedEvent = useRef(0);
  const lastPresentedEvent = useRef(0);
  const eventHistory = view.events ?? (view.lastEvent ? [view.lastEvent] : []);

  useEffect(() => {
    const fresh = eventHistory.filter((event) => event.seq > lastQueuedEvent.current);
    if (!fresh.length) return;
    lastQueuedEvent.current = fresh[fresh.length - 1].seq;
    setEventQueue((current) => [...current, ...fresh]);
  }, [eventHistory]);
  useEffect(() => {
    const current = eventQueue[0];
    if (!current) return;
    setPresentedEvent(current);
    if (current.seq > lastPresentedEvent.current) {
      lastPresentedEvent.current = current.seq;
      playSfx(current.die ? 'click' : current.phase === 'ended' || /game over/i.test(current.title) ? 'win' : /turn began|action phase/i.test(current.title) ? 'turn' : 'build');
      if (voice) speakFeast(`${current.player ? `${current.player}. ` : ''}${current.title}. ${current.detail}`);
    }
    const timer = window.setTimeout(() => setEventQueue((queue) => queue.slice(1)), current.die ? 1250 : 850);
    return () => window.clearTimeout(timer);
  }, [eventQueue, voice]);
  useEffect(() => { if (view.actingSeat !== null) setSelectedSeat(view.actingSeat); }, [view.actingSeat]);

  const active = view.actingSeat === null ? null : view.players[view.actingSeat];
  const presenting = eventQueue.length > 0;
  const event = presenting ? presentedEvent : view.lastEvent;
  const displayPhase = presenting && event ? event.phase : view.phase;
  const displayPhaseNumber = presenting && event ? event.phaseNumber : view.phaseNumber;
  const displayRound = presenting && event ? event.round : view.round;
  const winnerNames = useMemo(() => view.winners?.map((color) => view.players.find((player) => player.color === color)?.name ?? color).join(' · '), [view.players, view.winners]);

  if (!scene) return <div className="page center"><h2>PREPARING THE GREAT HALL</h2></div>;
  return (
    <div className="ft-tv" data-testid="feast-tv">
      <div className="ft-tv-stage" data-testid="feast-action-board-3d"><FeastScene3D scene={scene} spaces={view.actionSpaces} /></div>
      <div className="ft-tv-hud">
        <div className="ft-tv-title">
          <div><span className="ft-kicker">{view.edition}</span><h1>A FEAST FOR ODIN</h1></div>
          <div className={`ft-status${active ? ' you' : ''}`} style={{ '--ft-seat': active ? SEAT_HEX[active.color] : '#7fb4bd' } as CSSProperties}>
            <span className="ft-turn-outline" />
             <div><strong>{displayPhase === 'ended' ? `${winnerNames ?? 'SAGA'} WINS` : `ROUND ${displayRound}/${view.rounds} · ${PHASE_LABEL[displayPhase]}`}</strong><span>{displayPhase === 'actions' && active ? `${active.name} IS ACTING` : 'THE TABLE IS RESOLVING'}</span></div>
          </div>
           <div className="ft-tv-title-actions"><button className="ft-icon-button" onClick={() => { const next = !voice; setVoice(next); try { localStorage.setItem('feast-tv-voice', next ? '1' : '0'); } catch { /* ignore */ } }}>{voice ? 'VOICE ON' : 'VOICE OFF'}</button><button className="ft-icon-button" onClick={() => setShowLog(true)}>SAGA LOG</button><button className="ft-icon-button" onClick={() => setExplain((value) => !value)}>{explain ? 'CLOSE GUIDE' : 'EXPLAIN THE BOARD'}</button></div>
         </div>
        <Scoreboard view={view} selectedSeat={selectedSeat} selectSeat={setSelectedSeat} />
        <PhaseTrack phase={displayPhase} phaseNumber={displayPhaseNumber} />
        <div className="ft-tv-public">
          <section className="ft-tv-supply"><div className="ft-section-heading"><h3>MOUNTAIN STRIPS</h3><span>TAKE FROM THE ARROW END</span></div><MountainDisplay view={view} scene={scene} /><ImitationExtensions view={view} scene={scene} /><div className="ft-section-heading"><h3>PUBLIC SUPPLY</h3><span>{view.specialSupply.length} SPECIAL TILES · {view.occupationDeckCount} OCCUPATIONS</span></div><div className="ft-resource-grid"><div className="ft-resource"><span>SHEDS</span><b>{view.buildingSupply.shed}</b></div><div className="ft-resource"><span>STONE HOUSES</span><b>{view.buildingSupply['stone-house']}</b></div><div className="ft-resource"><span>LONG HOUSES</span><b>{view.buildingSupply['long-house']}</b></div><div className="ft-resource"><span>WEAPON DECK</span><b>{view.weaponDeckCount}</b></div></div><PublicEstate player={view.players[selectedSeat] ?? view.players[view.firstPlayer]} view={view} openBoards={() => setBoardGallerySeat(selectedSeat)} /></section>
          <section className="ft-tv-explorations"><div className="ft-section-heading"><h3>EXPLORATION BOARDS</h3><span>UNCLAIMED FACES GAIN SILVER</span></div><ExplorationDisplay view={view} scene={scene} /></section>
        </div>
        <div className="ft-tv-event" aria-live="polite"><i /><div><b>{event?.title ?? `${PHASE_LABEL[view.phase]} · ROUND ${view.round}`}</b><span>{event?.detail ?? 'THE TABLE IS READY FOR THE NEXT VIKING SAGA.'}</span></div></div>
      </div>
      {explain && <ExplainBoard close={() => setExplain(false)} />}
      {showLog && <div className="ft-saga-log" role="dialog" aria-modal="true" aria-label="Saga event log"><section><header><div><span className="ft-kicker">PUBLIC AUDIT TRAIL</span><h2>THE SAGA SO FAR</h2></div><button className="ft-button" onClick={() => setShowLog(false)}>CLOSE</button></header><ol>{[...view.log].reverse().map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol></section></div>}
      {boardGallerySeat !== null && <PublicBoardGallery player={view.players[boardGallerySeat] ?? view.players[view.firstPlayer]} scene={scene} close={() => setBoardGallerySeat(null)} />}
    </div>
  );
}

export default FeastBoard;
