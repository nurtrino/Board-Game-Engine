import { useEffect, useState, type CSSProperties } from 'react';
import { SETI_PROJECT_BY_ID, type SetiAction, type SetiView } from '@bge/shared';
import { SetiIcon, type SetiIconName } from './SetiIcons';
import {
  SetiCardArt,
  SetiStarfield,
  SetiTable,
  TactileSurface,
  setiPlayerBoard,
  setiGoldTile,
  setiTechBack,
  useSetiCardCatalog,
  useSetiScene,
  type SetiSceneDef,
} from './SetiScene';
import { normalizeSetiView, setiSeatColor, type SetiUiPending, type SetiUiPiece, type SetiUiPlayer, type SetiUiView } from './setiView';
import './seti.css';

export type SetiClientChoice =
  | { kind: 'card'; cardId: string }
  | { kind: 'cards'; cardIds: string[] }
  | { kind: 'sector'; sectorId: string; row?: number }
  | { kind: 'trace-space'; spaceId: string }
  | { kind: 'gold-tile'; tileId: string }
  | { kind: 'tech-stack'; stackId: string }
  | { kind: 'number'; value: number }
  | { kind: 'option'; option: string }
  | { kind: 'options'; options: string[] };

export type SetiClientAction =
  | { type: 'choose_initial_income'; cardId: string }
  | { type: 'launch' }
  | { type: 'move'; pieceId: string; to: string; payment: { energy?: number; cardId?: string } }
  | { type: 'orbit'; pieceId: string; body: string }
  | { type: 'land'; pieceId: string; body: string }
  | { type: 'scan' }
  | { type: 'place_data'; slot: number }
  | { type: 'analyze' }
  | { type: 'research'; stackId: string }
  | { type: 'play_card'; cardId: string }
  | { type: 'discard_for_corner'; cardId: string }
  | { type: 'buy_card'; source: 'deck' | number }
  | { type: 'exchange'; give: 'cards' | 'credits' | 'energy'; receive: 'card' | 'credit' | 'energy'; cardIds?: string[]; row?: number }
  | { type: 'pass' }
  | { type: 'choose'; choice: SetiClientChoice }
  | { type: 'end_turn' };

type Layer = 'personal' | 'solar';
type CardOrigin = 'hand' | 'row' | 'mission' | 'income' | 'deck' | 'pending' | 'pending-row';
interface InspectedCard { id: string; origin: CardOrigin; row?: number; pendingIndex?: number }
type Selection =
  | { kind: 'piece'; piece: SetiUiPiece }
  | { kind: 'launch' }
  | { kind: 'data' }
  | { kind: 'research' }
  | null;

const pendingKey = (pending: SetiUiPending | null) => pending ? `${pending.kind}:${pending.owner}:${JSON.stringify(pending.options)}` : '';

export function SetiPlay({ view: rawView, act, error }: {
  view: SetiView;
  act: (action: SetiAction) => void;
  error?: string | null;
}) {
  const view = normalizeSetiView(rawView);
  const scene = useSetiScene();
  const me = view.players.find((player) => player.seat === view.you) ?? view.players[0];
  const [layer, setLayer] = useState<Layer>('personal');
  const [selection, setSelection] = useState<Selection>(null);
  const [card, setCard] = useState<InspectedCard | null>(null);
  const [showDeck, setShowDeck] = useState(false);
  const [showSolo, setShowSolo] = useState(false);
  const [exchange, setExchange] = useState<{ give: 'credits' | 'energy' | 'cards'; cardIds: string[] } | null>(null);
  const [pendingChosen, setPendingChosen] = useState<number[]>([]);
  const [pendingSignalRow, setPendingSignalRow] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const myTurn = !!me && me.seat === view.activeSeat && view.phase !== 'ended';
  const pendingForMe = !!view.pending && (view.pending.owner < 0 || view.pending.owner === me?.seat);
  const canTouch = myTurn && (!view.pending || pendingForMe);
  const cornerCards = canTouch && !view.pending ? me?.hand.filter((id) => !!SETI_PROJECT_BY_ID[id]?.printed.freeCorner) ?? [] : [];
  const selectedPiece = selection?.kind === 'piece' ? selection.piece : null;
  const legalCells = selectedPiece ? view.legal.moveTargets[selectedPiece.id] ?? [] : [];
  const orbitTargets = selectedPiece ? view.legal.orbitTargets[selectedPiece.id] ?? [] : [];
  const landTargets = selectedPiece ? view.legal.landTargets[selectedPiece.id] ?? [] : [];

  useEffect(() => {
    setSelection(null);
    setExchange(null);
    setPendingChosen([]);
    setPendingSignalRow(null);
  }, [view.activeSeat, pendingKey(view.pending)]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCard(null); setShowDeck(false); setShowSolo(false); setExchange(null); }
    };
    addEventListener('keydown', close);
    return () => removeEventListener('keydown', close);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2400);
    return () => clearTimeout(timer);
  }, [note]);

  if (!me) return <SetiDeviceLoading />;

  const send = (action: SetiClientAction, message?: string) => {
    // UI normalization keeps older saved views readable. The final cast is
    // the single boundary back into the engine's stricter branded ids.
    act(action as SetiAction);
    if (message) setNote(message);
  };

  const selectPiece = (piece: SetiUiPiece) => {
    if (piece.owner !== me.seat) return;
    setSelection({ kind: 'piece', piece });
    setLayer('solar');
  };

  const moveSelected = (cell: string) => {
    if (!selectedPiece || !legalCells.includes(cell)) return;
    const payment = movePayment(view, selectedPiece.id, cell);
    send({ type: 'move', pieceId: selectedPiece.id, to: cell, payment }, 'TRAJECTORY TRANSMITTED');
    setSelection(null);
  };

  const bodySelected = (kind: 'orbit' | 'land', body: string) => {
    if (!selectedPiece) return;
    if (kind === 'orbit' && orbitTargets.includes(body)) send({ type: 'orbit', pieceId: selectedPiece.id, body }, 'ORBIT CONFIRMED');
    if (kind === 'land' && landTargets.includes(body)) send({ type: 'land', pieceId: selectedPiece.id, body }, 'LANDING CONFIRMED');
    setSelection(null);
  };

  const beginLaunch = () => {
    if (!view.legal.canLaunch) return;
    setSelection({ kind: 'launch' });
    setLayer('solar');
    setNote('TOUCH EARTH TO LAUNCH');
  };

  const beginScan = () => {
    send({ type: 'scan' }, 'SELECT SIGNAL SECTORS');
    setLayer('solar');
  };

  const beginResearch = () => {
    if (!view.legal.techStackTargets.length) return;
    setSelection({ kind: 'research' });
    setLayer('solar');
    setNote('TOUCH A GLOWING TECH STACK');
  };

  const pickResource = (kind: 'credits' | 'energy') => {
    if (!canTouch || (kind === 'credits' ? me.credits : me.energy) < 2) return;
    setExchange((current) => current?.give === kind ? null : { give: kind, cardIds: [] });
  };

  const pickExchangeCard = (id: string) => {
    if (!exchange || exchange.give !== 'cards') return;
    const cardIds = exchange.cardIds.includes(id) ? exchange.cardIds.filter((entry) => entry !== id) : [...exchange.cardIds, id].slice(-2);
    setExchange({ ...exchange, cardIds });
  };

  const completeExchange = (receive: 'card' | 'credit' | 'energy') => {
    if (!exchange) return;
    send({ type: 'exchange', give: exchange.give, receive, cardIds: exchange.give === 'cards' ? exchange.cardIds : undefined }, 'EXCHANGE COMPLETE');
    setExchange(null);
  };

  const commitPending = (indexes: number[]) => {
    if (!view.pending) return;
    const action = pendingAction(view.pending, indexes, pendingSignalRow ?? undefined);
    if (action) send(action, 'DECISION TRANSMITTED');
    setPendingChosen([]);
  };

  const pendingOptionIndex = (value: string) => view.pending?.options.findIndex((option) => {
    if (typeof option === 'string') return option === value;
    if (!option || typeof option !== 'object') return false;
    const item = option as Record<string, unknown>;
    return item.id === value || item.sectorId === value || item.stackId === value;
  }) ?? -1;

  return (
    <main className="seti-root seti-device" data-testid="seti-device-root" style={{ '--seat': setiSeatColor(me.color) } as CSSProperties} aria-label="SETI mission control">
      <SetiStarfield density={0.9} />

      <header className="seti-device-header seti-glass">
        <div className="seti-device-agency"><span className="seti-seat-outline" /><div><small>AGENCY</small><b>{me.name}</b></div></div>
        <ResourcePiece icon="score" label="VP" value={me.score} />
        <ResourcePiece icon="publicity" label="PUBLICITY" value={me.publicity} />
        <ResourcePiece icon="credit" label="CREDITS" value={me.credits} onClick={() => pickResource('credits')} active={exchange?.give === 'credits'} disabled={!canTouch || me.credits < 2} />
        <ResourcePiece icon="energy" label="ENERGY" value={me.energy} onClick={() => pickResource('energy')} active={exchange?.give === 'energy'} disabled={!canTouch || me.energy < 2} />
        <ResourcePiece icon="data" label="DATA" value={me.dataPool} onClick={() => { if (view.legal.placeDataSlots.length) { setSelection({ kind: 'data' }); setLayer('personal'); } }} active={selection?.kind === 'data'} disabled={!canTouch || view.legal.placeDataSlots.length === 0} />
        <div className="seti-header-actions">
          <button type="button" className="seti-icon-button" onClick={() => setExchange((current) => current?.give === 'cards' ? null : { give: 'cards', cardIds: [] })} disabled={!canTouch || me.hand.length < 2} aria-label="exchange cards"><SetiIcon name="card" /><span>EXCHANGE</span></button>
          <button type="button" className="seti-icon-button" data-testid="seti-show-deck" onClick={() => setShowDeck(true)} aria-label="show deck"><SetiIcon name="deck" /><span>SHOW DECK</span></button>
        </div>
      </header>

      {view.solo && (
        <button type="button" className="seti-solo-chip seti-glass" data-testid="seti-solo-rival" onClick={() => setShowSolo(true)}>
          <span><small>RIVAL</small><b>{view.solo.rivalScore} VP</b></span>
          <span><small>PROGRESS</small><b>{view.solo.progress}</b></span>
        </button>
      )}

      <nav className="seti-layer-switch seti-glass" aria-label="table layer">
        <button type="button" data-testid="seti-layer-personal" className={layer === 'personal' ? 'is-active' : ''} onClick={() => setLayer('personal')}>PERSONAL</button>
        <button type="button" data-testid="seti-layer-solar" className={layer === 'solar' ? 'is-active' : ''} onClick={() => setLayer('solar')}>SOLAR SYSTEM</button>
        <span className={layer} />
      </nav>

      <div className={`seti-turn-line ${myTurn ? 'is-yours' : ''}`}>
        <span />
        <b>{view.phase === 'ended' ? 'MISSION COMPLETE' : myTurn ? view.pending ? 'YOUR DECISION' : 'YOUR TURN' : `${view.players.find((player) => player.seat === view.activeSeat)?.name ?? 'AGENCY'} OPERATING`}</b>
        <small>{view.phase === 'ended' ? finalMessage(view) : view.pending ? view.pending.prompt : myTurn ? view.mainActionTaken ? 'FREE ACTIONS OR END TURN' : 'TOUCH A PIECE OR PRINTED ACTION' : `ROUND ${view.round} OF 5`}</small>
      </div>

      <section className="seti-device-stage">
        {scene ? (
          <>
            <div className={`seti-layer seti-personal-layer ${layer === 'personal' ? 'is-visible' : ''}`} aria-hidden={layer !== 'personal'}>
              <PersonalBoard
                scene={scene}
                view={view}
                me={me}
                selection={selection}
                canTouch={canTouch}
                onLaunch={beginLaunch}
                onScan={beginScan}
                onAnalyze={() => send({ type: 'analyze' }, 'ANALYSIS STARTED')}
                onResearch={beginResearch}
                onPlaceData={(slot) => { send({ type: 'place_data', slot }, 'DATA PLACED'); setSelection(null); }}
                onIncomeCard={(id) => setCard({ id, origin: 'income' })}
                onMissionCard={(id) => setCard({ id, origin: 'mission' })}
              />
              <ProjectDock scene={scene} view={view} canBuyDeck={canTouch && me.publicity >= 3} onInspect={(id, row) => setCard({ id, origin: 'row', row })} onDeckBuy={() => send({ type: 'buy_card', source: 'deck' }, 'PROJECT ACQUIRED')} />
            </div>
            <div className={`seti-layer seti-solar-layer ${layer === 'solar' ? 'is-visible' : ''}`} aria-hidden={layer !== 'solar'}>
              <SetiTable
                scene={scene}
                view={view}
                compact
                interactive={canTouch}
                selectedPieceId={selectedPiece?.id}
                legalCells={legalCells}
                orbitTargets={orbitTargets}
                landTargets={landTargets}
                sectorTargets={pendingForMe && view.pending?.kind === 'signal-sector'
                  ? Array.isArray(view.pending.raw.rowOptions) && pendingSignalRow === null ? [] : view.legal.scanSectorTargets
                  : pendingForMe && view.pending?.kind === 'completed-sector-order'
                    ? view.pending.options.map((option) => String(option))
                    : []}
                launchTarget={selection?.kind === 'launch'}
                onPiece={selectPiece}
                onCell={moveSelected}
                onBody={bodySelected}
                onSector={(sectorId) => { const index = pendingOptionIndex(sectorId); if (index >= 0 && (!Array.isArray(view.pending?.raw.rowOptions) || pendingSignalRow !== null)) commitPending([index]); }}
                onCardDrop={(_cardId, row, kind, value) => {
                  if (kind !== 'sector' || view.pending?.kind !== 'signal-sector') return false;
                  const index = pendingOptionIndex(value);
                  if (index < 0) return false;
                  const action = pendingAction(view.pending, [index], row);
                  if (!action) return false;
                  send(action, 'SIGNAL TRANSMITTED');
                  return true;
                }}
                onLaunch={() => { send({ type: 'launch' }, 'PROBE LAUNCHED'); setSelection(null); }}
                onCard={(id, row) => setCard({
                  id,
                  origin: view.pending?.kind === 'signal-sector' && Array.isArray(view.pending.raw.rowOptions) ? 'pending-row' : 'row',
                  row,
                })}
                onTech={(stackId) => {
                  if (!view.legal.techStackTargets.includes(stackId)) return;
                  if (view.pending?.kind === 'tech-stack') {
                    const index = pendingOptionIndex(stackId);
                    if (index >= 0) commitPending([index]);
                  } else send({ type: 'research', stackId }, 'TECHNOLOGY ACQUIRED');
                  setSelection(null);
                }}
              />
            </div>
          </>
        ) : <SetiDeviceLoading />}
      </section>

      <HandRail
        scene={scene}
        me={me}
        playable={view.legal.playableCards}
        cornerCards={cornerCards}
        exchange={exchange}
        onCard={(id) => exchange?.give === 'cards' && me.hand.includes(id) ? pickExchangeCard(id) : setCard({ id, origin: 'hand' })}
        onPlayDrop={(id) => { if (view.legal.playableCards.includes(id)) { send({ type: 'play_card', cardId: id }, 'PROJECT COMMITTED'); return true; } return false; }}
      />

      <div className="seti-device-controls">
        {view.legal.canPass && <button type="button" className="seti-pass-control" data-testid="seti-pass" onClick={() => send({ type: 'pass' }, 'PASS TRANSMITTED')}><SetiIcon name="pass" /><span>PASS</span></button>}
        <button type="button" className="seti-end-turn" data-testid="seti-end-turn" disabled={!view.legal.canEndTurn} onClick={() => { setSelection(null); send({ type: 'end_turn' }); }}><span>END TURN</span><i /></button>
      </div>

      {exchange && <ExchangeTray exchange={exchange} onReceive={completeExchange} onClose={() => setExchange(null)} />}
      {view.pending && (
        <PendingDecision
          scene={scene}
          view={view}
          me={me}
          chosen={pendingChosen}
          onToggle={(index, pick) => {
            if (pick === 1) commitPending([index]);
            else setPendingChosen((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].slice(-pick));
          }}
          onCommit={commitPending}
          onInspectCard={(id, index) => setCard({ id, origin: 'pending', pendingIndex: index })}
          pendingRow={pendingSignalRow}
          onInspectRow={(id, row) => setCard({ id, origin: 'pending-row', row })}
          onLayer={setLayer}
        />
      )}
      {card && scene && (
        <CardCloseup
          scene={scene}
          card={card}
          view={view}
          pending={view.pending}
          cornerCards={cornerCards}
          onClose={() => setCard(null)}
          onPlay={() => { send({ type: 'play_card', cardId: card.id }, 'PROJECT COMMITTED'); setCard(null); }}
          onCorner={() => { send({ type: 'discard_for_corner', cardId: card.id }, 'CORNER EFFECT USED'); setCard(null); }}
          onBuy={() => { send({ type: 'buy_card', source: card.row ?? 'deck' }, 'PROJECT ACQUIRED'); setCard(null); }}
          onInitialIncome={() => { send({ type: 'choose_initial_income', cardId: card.id }, 'INCOME CARD TUCKED'); setCard(null); }}
          onPending={() => {
            if (card.pendingIndex === undefined || !view.pending) return;
            const pick = pendingPick(view.pending);
            if (pick === 1) commitPending([card.pendingIndex]);
            else setPendingChosen((current) => current.includes(card.pendingIndex!) ? current.filter((value) => value !== card.pendingIndex) : [...current, card.pendingIndex!].slice(-pick));
            setCard(null);
          }}
          onPendingRow={() => { if (card.row !== undefined) setPendingSignalRow(card.row); setCard(null); }}
          pendingSelected={card.pendingIndex !== undefined && pendingChosen.includes(card.pendingIndex)}
        />
      )}
      {showDeck && scene && <DeckBrowser scene={scene} includePromos={(view.raw.options as { promoCards?: boolean } | undefined)?.promoCards === true} onClose={() => setShowDeck(false)} onInspect={(id) => setCard({ id, origin: 'deck' })} />}
      {showSolo && scene && view.solo && <SoloPanel scene={scene} solo={view.solo} onClose={() => setShowSolo(false)} />}
      {note && <div className="seti-note" role="status">{note}</div>}
      {error && <div className="seti-error" role="alert">{error}</div>}
    </main>
  );
}

function movePayment(view: SetiUiView, pieceId: string, cell: string): { energy?: number; cardId?: string } {
  const legal = (view.raw.legal && typeof view.raw.legal === 'object' ? view.raw.legal : {}) as Record<string, unknown>;
  const paymentsValue = legal.moveEnergyCost ?? legal.movePayments;
  const payments = (paymentsValue && typeof paymentsValue === 'object' ? paymentsValue : {}) as Record<string, unknown>;
  const perPiece = (payments[pieceId] && typeof payments[pieceId] === 'object' ? payments[pieceId] : {}) as Record<string, unknown>;
  const payment = perPiece[cell];
  if (typeof payment === 'number') return { energy: payment };
  if (payment && typeof payment === 'object') return payment as { energy?: number; cardId?: string };
  return { energy: 1 };
}

function ResourcePiece({ icon, label, value, onClick, active, disabled }: {
  icon: SetiIconName;
  label: string;
  value: number;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const content = <><span className="seti-resource-icon"><SetiIcon name={icon} /></span><span><b>{value}</b><small>{label}</small></span></>;
  return onClick ? <button type="button" className={`seti-resource-piece ${active ? 'is-active' : ''}`} onClick={onClick} disabled={disabled}>{content}</button> : <div className="seti-resource-piece">{content}</div>;
}

function PersonalBoard({ scene, view, me, selection, canTouch, onLaunch, onScan, onAnalyze, onResearch, onPlaceData, onIncomeCard, onMissionCard }: {
  scene: SetiSceneDef;
  view: SetiUiView;
  me: SetiUiPlayer;
  selection: Selection;
  canTouch: boolean;
  onLaunch: () => void;
  onScan: () => void;
  onAnalyze: () => void;
  onResearch: () => void;
  onPlaceData: (slot: number) => void;
  onIncomeCard: (id: string) => void;
  onMissionCard: (id: string) => void;
}) {
  const probesInSpace = view.pieces.filter((piece) => piece.owner === me.seat && piece.kind === 'probe').length;
  const supplyCount = Math.max(view.legal.canLaunch ? 1 : 0, (me.techs.some((id) => /probe/i.test(id)) ? 2 : 1) - probesInSpace);
  return (
    <div className="seti-personal-board-wrap">
      <img className="seti-personal-board-art" src={setiPlayerBoard(scene, me.color)} alt={`${me.name} player board`} draggable={false} />

      <button type="button" data-testid="seti-action-launch" className={`seti-printed-action seti-action-launch ${view.legal.canLaunch ? 'is-legal' : ''}`} disabled={!canTouch || !view.legal.canLaunch} onClick={onLaunch}>
        <SetiIcon name="probe" /><span>LAUNCH</span><small>2</small>
      </button>
      <button type="button" data-testid="seti-action-scan" className={`seti-printed-action seti-action-scan ${view.legal.scanSectorTargets.length ? 'is-legal' : ''}`} disabled={!canTouch || view.legal.scanSectorTargets.length === 0} onClick={onScan}>
        <SetiIcon name="scan" /><span>SCAN</span>
      </button>
      <button type="button" data-testid="seti-action-analyze" className={`seti-printed-action seti-action-analyze ${view.legal.canAnalyze ? 'is-legal' : ''}`} disabled={!canTouch || !view.legal.canAnalyze} onClick={onAnalyze}>
        <SetiIcon name="analyze" /><span>ANALYZE</span>
      </button>
      <button type="button" data-testid="seti-action-research" className={`seti-printed-action seti-action-research ${view.legal.techStackTargets.length ? 'is-legal' : ''}`} disabled={!canTouch || !view.legal.techStackTargets.length} onClick={onResearch}>
        <SetiIcon name="research" /><span>RESEARCH</span><small>6</small>
      </button>

      <div className="seti-probe-supply" aria-label="probe supply">
        {Array.from({ length: Math.max(1, supplyCount) }, (_, index) => (
          <TactileSurface key={index} className={`seti-supply-probe ${view.legal.canLaunch ? 'is-legal' : ''}`} disabled={!canTouch || !view.legal.canLaunch} onTap={onLaunch} ariaLabel="take probe from supply">
            <span className="seti-piece-body" />
          </TactileSurface>
        ))}
      </div>

      <div className="seti-computer-track" aria-label="computer data track">
        {Array.from({ length: Math.max(6, me.computer.length) }, (_, slot) => {
          const filled = !!me.computer[slot];
          const legal = selection?.kind === 'data' && view.legal.placeDataSlots.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              className={`seti-computer-slot ${filled ? 'is-filled' : ''} ${legal ? 'is-legal' : ''}`}
              disabled={!legal}
              data-seti-target="computer"
              data-seti-value={`${slot}`}
              onClick={() => onPlaceData(slot)}
              aria-label={filled ? `computer slot ${slot + 1} filled` : `computer slot ${slot + 1}`}
            >{filled && <span className="seti-data-cube" />}</button>
          );
        })}
      </div>

      <div className="seti-installed-tech" aria-label="installed technology">
        {me.techs.map((tech, index) => <span key={`${tech}-${index}`} title={tech}><i />{setiTechBack(scene, tech) ? <img src={setiTechBack(scene, tech)} alt="installed technology" /> : tech.slice(0, 2)}</span>)}
      </div>

      <div className="seti-income-tuck" data-seti-target="income" data-seti-value="income">
        {me.income.map((id, index) => <button key={`${id}-${index}`} type="button" style={{ '--card-index': index } as CSSProperties} onClick={() => onIncomeCard(id)}><SetiCardArt scene={scene} cardId={id} /></button>)}
        <small>INCOME</small>
      </div>

      <div className="seti-mission-strip" data-seti-target="mission" data-seti-value="mission">
        {me.missions.slice(-4).map((id, index) => <button key={`${id}-${index}`} type="button" onClick={() => onMissionCard(id)}><SetiCardArt scene={scene} cardId={id} /></button>)}
      </div>
    </div>
  );
}

function ProjectDock({ scene, view, canBuyDeck, onInspect, onDeckBuy }: {
  scene: SetiSceneDef;
  view: SetiUiView;
  canBuyDeck: boolean;
  onInspect: (id: string, row: number) => void;
  onDeckBuy: () => void;
}) {
  return (
    <aside className="seti-project-dock seti-glass">
      <div className="seti-dock-label"><span>PROJECT ARRAY</span><small>{view.projectDeckCount} REMAIN</small></div>
      <TactileSurface testId="seti-project-deck" className={`seti-project-deck ${canBuyDeck ? 'is-buyable' : ''}`} disabled={!canBuyDeck} onTap={onDeckBuy} ariaLabel="buy from project deck">
        <SetiCardArt scene={scene} cardId="project-back" faceDown />
        <span className="seti-cost-ring">3</span>
      </TactileSurface>
      {view.projectRow.map((id, row) => (
        <TactileSurface key={`${id}-${row}`} className={`seti-dock-card ${view.legal.buyableRow.includes(row) ? 'is-buyable' : ''}`} onTap={() => onInspect(id, row)} ariaLabel={`inspect project card ${row + 1}`}>
          <SetiCardArt scene={scene} cardId={id} />
        </TactileSurface>
      ))}
    </aside>
  );
}

function HandRail({ scene, me, playable, cornerCards, exchange, onCard, onPlayDrop }: {
  scene: SetiSceneDef | null;
  me: SetiUiPlayer;
  playable: string[];
  cornerCards: string[];
  exchange: { give: 'credits' | 'energy' | 'cards'; cardIds: string[] } | null;
  onCard: (id: string) => void;
  onPlayDrop: (id: string) => boolean;
}) {
  const cards = [...me.hand, ...me.alienHand, ...me.hiddenExertian];
  return (
    <footer className="seti-hand-rail seti-glass">
      <div className="seti-hand-label"><small>MISSION HAND</small><b>{cards.length}</b></div>
      <div className="seti-hand-cards">
        {cards.map((id, index) => {
          const offset = index - (cards.length - 1) / 2;
          const cardGap = Math.min(68, 560 / Math.max(1, cards.length - 1));
          const selected = exchange?.give === 'cards' && exchange.cardIds.includes(id);
          return (
            <TactileSurface
              key={`${id}-${index}`}
              testId={`seti-hand-card-${index}`}
              className={`seti-hand-card ${me.alienHand.includes(id) || me.hiddenExertian.includes(id) ? 'is-alien' : ''} ${playable.includes(id) ? 'is-playable' : ''} ${cornerCards.includes(id) ? 'has-corner' : ''} ${selected ? 'is-exchange-selected' : ''}`}
              style={{ '--hand-x': `${offset * cardGap}px`, '--hand-r': `${offset * 1.7}deg`, '--hand-z': index } as CSSProperties}
              onTap={() => onCard(id)}
              onDrop={(kind) => kind === 'mission' ? onPlayDrop(id) : false}
              ariaLabel={`inspect hand card ${index + 1}`}
            >
              <span className="seti-hand-transform">
                <SetiCardArt scene={scene} cardId={id} />
                {selected && <i className="seti-selection-notch" />}
              </span>
            </TactileSurface>
          );
        })}
      </div>
    </footer>
  );
}

function ExchangeTray({ exchange, onReceive, onClose }: {
  exchange: { give: 'credits' | 'energy' | 'cards'; cardIds: string[] };
  onReceive: (receive: 'card' | 'credit' | 'energy') => void;
  onClose: () => void;
}) {
  const ready = exchange.give !== 'cards' || exchange.cardIds.length === 2;
  return (
    <div className="seti-exchange-tray seti-glass">
      <button type="button" className="seti-close" onClick={onClose} aria-label="cancel exchange"><SetiIcon name="close" /></button>
      <small>{exchange.give === 'cards' ? `${exchange.cardIds.length} / 2 CARDS SELECTED` : `2 ${exchange.give.toUpperCase()} SELECTED`}</small>
      <b>TOUCH WHAT YOU NEED</b>
      <div>
        <button type="button" disabled={!ready} onClick={() => onReceive('card')}><SetiIcon name="card" /><span>CARD</span></button>
        <button type="button" disabled={!ready} onClick={() => onReceive('credit')}><SetiIcon name="credit" /><span>CREDIT</span></button>
        <button type="button" disabled={!ready} onClick={() => onReceive('energy')}><SetiIcon name="energy" /><span>ENERGY</span></button>
      </div>
    </div>
  );
}

function CardCloseup({ scene, card, view, pending, cornerCards, onClose, onPlay, onCorner, onBuy, onInitialIncome, onPending, onPendingRow, pendingSelected }: {
  scene: SetiSceneDef;
  card: InspectedCard;
  view: SetiUiView;
  pending: SetiUiPending | null;
  cornerCards: string[];
  onClose: () => void;
  onPlay: () => void;
  onCorner: () => void;
  onBuy: () => void;
  onInitialIncome: () => void;
  onPending: () => void;
  onPendingRow: () => void;
  pendingSelected: boolean;
}) {
  const canPlay = card.origin === 'hand' && view.legal.playableCards.includes(card.id);
  const canCorner = card.origin === 'hand' && cornerCards.includes(card.id);
  const canBuy = card.origin === 'row' && card.row !== undefined && view.legal.buyableRow.includes(card.row);
  const canIncome = card.origin === 'hand' && /initial[-_]income/i.test(pending?.kind ?? '');
  const canPending = card.origin === 'pending' && card.pendingIndex !== undefined;
  const canPendingRow = card.origin === 'pending-row' && card.row !== undefined;
  return (
    <div className="seti-modal-layer seti-card-modal" onPointerDown={onClose}>
      <section className="seti-card-closeup" data-testid="seti-card-closeup" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="seti-close" onClick={onClose} aria-label="close card"><SetiIcon name="close" /></button>
        <SetiCardArt scene={scene} cardId={card.id} />
        {(canPlay || canCorner || canBuy || canIncome || canPending || canPendingRow) && (
          <div className="seti-card-commit seti-glass">
            {canPlay && <button type="button" onClick={onPlay}><SetiIcon name="card" /><span>PLAY MAIN</span></button>}
            {canCorner && <button type="button" onClick={onCorner}><span className="seti-corner-mark" /><span>USE CORNER</span></button>}
            {canBuy && <button type="button" onClick={onBuy}><span className="seti-cost-ring">3</span><span>BUY PROJECT</span></button>}
            {canIncome && <button type="button" onClick={onInitialIncome}><SetiIcon name="card" /><span>TUCK FOR INCOME</span></button>}
            {canPending && <button type="button" onClick={onPending}><SetiIcon name="card" /><span>{pendingSelected ? 'UNMARK CARD' : pendingPick(pending) > 1 ? 'MARK CARD' : 'SELECT CARD'}</span></button>}
            {canPendingRow && <button type="button" onClick={onPendingRow}><SetiIcon name="scan" /><span>USE FOR SIGNAL</span></button>}
          </div>
        )}
      </section>
    </div>
  );
}

function DeckBrowser({ scene, includePromos, onClose, onInspect }: { scene: SetiSceneDef; includePromos: boolean; onClose: () => void; onInspect: (id: string) => void }) {
  const catalog = useSetiCardCatalog(scene).filter((card) => /project/i.test(card.id) && !/back/i.test(card.id));
  const activeCatalog = includePromos ? catalog : catalog.filter((card) => card.id !== 'project-41500' && card.id !== 'project-204700');
  return (
    <div className="seti-modal-layer seti-deck-modal" onPointerDown={onClose}>
      <section className="seti-deck-browser seti-glass" data-testid="seti-deck-browser" onPointerDown={(event) => event.stopPropagation()}>
        <header><div><small>REFERENCE LIBRARY</small><h2>PROJECT CATALOG</h2></div><span>{activeCatalog.length} CARDS</span><button type="button" className="seti-close" onClick={onClose} aria-label="close deck"><SetiIcon name="close" /></button></header>
        <p>CARD ORDER REMAINS HIDDEN</p>
        <div className="seti-deck-grid">
          {activeCatalog.map((card) => <button key={card.id} type="button" onClick={() => onInspect(card.id)}><SetiCardArt scene={scene} cardId={card.id} /><span>{card.name}</span></button>)}
        </div>
      </section>
    </div>
  );
}

function SoloPanel({ scene, solo, onClose }: { scene: SetiSceneDef; solo: NonNullable<SetiUiView['solo']>; onClose: () => void }) {
  const rivalBoards = Array.isArray(scene.solo?.rivalBoards) ? scene.solo.rivalBoards as unknown[] : [];
  const board = rivalBoards.map((entry) => entry as Record<string, unknown>).find((entry) => Array.isArray(entry.difficulty) && entry.difficulty.map(Number).includes(solo.difficulty));
  const objectives = Array.isArray(scene.solo?.objectives) ? scene.solo.objectives as unknown[] : [];
  const objectiveArt = (id: string) => {
    const number = Number(id.match(/(\d+)$/)?.[1] ?? 0);
    const entry = objectives[number - 1] as Record<string, unknown> | undefined;
    return typeof entry?.face === 'string' ? entry.face : '';
  };
  return (
    <div className="seti-modal-layer seti-solo-modal" onPointerDown={onClose}>
      <section className="seti-solo-panel seti-glass" data-testid="seti-solo-panel" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="seti-close" onClick={onClose} aria-label="close rival board"><SetiIcon name="close" /></button>
        <header><div><small>OFFICIAL SOLO RIVAL</small><h2>DIFFICULTY {solo.difficulty}</h2></div><div><span>{solo.rivalScore}<small>VP</small></span><span>{solo.progress}<small>PROGRESS</small></span><span>{solo.techTokens}<small>TECH</small></span></div></header>
        {typeof board?.image === 'string' && <img className="seti-rival-board-art" src={board.image} alt={`rival board difficulty ${solo.difficulty}`} />}
        <div className="seti-rival-objectives">
          <div><small>ACTIVE OBJECTIVES</small><b>{solo.activeObjectives.length}</b></div>
          {solo.activeObjectives.map((id) => objectiveArt(id) && <img key={id} src={objectiveArt(id)} alt="active rival objective" />)}
          {solo.completedObjectives.map((id) => objectiveArt(id) && <img key={id} className="is-complete" src={objectiveArt(id)} alt="completed rival objective" />)}
          <span className="seti-rival-decks"><i>{solo.objectiveDeckCount}<small>OBJECTIVES</small></i><i>{solo.actionDeckCount}<small>ACTIONS</small></i></span>
        </div>
      </section>
    </div>
  );
}

function PendingDecision({ scene, view, me, chosen, onToggle, onCommit, onInspectCard, pendingRow, onInspectRow, onLayer }: {
  scene: SetiSceneDef | null;
  view: SetiUiView;
  me: SetiUiPlayer;
  chosen: number[];
  onToggle: (index: number, pick: number) => void;
  onCommit: (indexes: number[]) => void;
  onInspectCard: (id: string, index: number) => void;
  pendingRow: number | null;
  onInspectRow: (id: string, row: number) => void;
  onLayer: (layer: Layer) => void;
}) {
  const pending = view.pending!;
  const mine = pending.owner < 0 || pending.owner === me.seat;
  const pick = pendingPick(pending);
  const cardOptions = pending.options.every((option) => optionCardId(option));
  const rowOptions = Array.isArray(pending.raw.rowOptions) ? pending.raw.rowOptions.map(Number).filter(Number.isInteger) : [];
  useEffect(() => {
    if (/signal|sector|tech|trace|moon|planet/i.test(pending.kind)) onLayer('solar');
  }, [pending.kind, onLayer]);
  if (!mine) return <div className="seti-pending-wait seti-glass"><span className="seti-loader-orbits"><i /><i /><i /></span><div><small>AWAITING DECISION</small><b>{view.players.find((player) => player.seat === pending.owner)?.name ?? 'AGENCY'}</b></div></div>;

  const directCue = pending.kind === 'signal-sector'
    ? rowOptions.length > 0 && pendingRow === null ? 'TOUCH OR DRAG A PROJECT CARD' : 'TOUCH THE GLOWING STAR SECTOR'
    : pending.kind === 'tech-stack' ? 'TOUCH A GLOWING TECH TILE'
    : pending.kind === 'completed-sector-order' ? 'TOUCH A COMPLETED STAR SECTOR'
    : null;
  if (directCue) {
    return <div className="seti-direct-cue seti-glass"><SetiIcon name={pending.kind === 'tech-stack' ? 'research' : 'scan'} /><b>{directCue}</b></div>;
  }

  const toggle = (index: number) => {
    if (rowOptions.length && pendingRow === null) return;
    const cardId = optionCardId(pending.options[index]);
    if (cardId) { onInspectCard(cardId, index); return; }
    onToggle(index, pick);
  };
  return (
    <div className="seti-pending-panel seti-glass">
      <header><small>DECISION REQUIRED</small><b>{pending.prompt}</b>{pick > 1 && <span>{chosen.length} / {pick}</span>}</header>
      <div className={`seti-pending-options ${cardOptions ? 'is-cards' : ''}`}>
        {rowOptions.map((row) => {
          const id = view.projectRow[row];
          if (!id) return null;
          return (
            <button key={`row-${row}`} type="button" className={`seti-pending-row-card ${pendingRow === row ? 'is-selected' : ''}`} onClick={() => onInspectRow(id, row)}>
              {scene && <SetiCardArt scene={scene} cardId={id} />}
              <span>ROW {row + 1}</span>
            </button>
          );
        })}
        {pending.options.map((option, index) => {
          const id = optionCardId(option);
          const label = optionLabel(option, index);
          const asset = pendingAsset(scene, view, pending.kind, option);
          return (
            <button key={`${label}-${index}`} type="button" disabled={rowOptions.length > 0 && pendingRow === null} className={chosen.includes(index) ? 'is-selected' : ''} onClick={() => toggle(index)}>
              {id && scene ? <SetiCardArt scene={scene} cardId={id} /> : asset ? <img className="seti-pending-art" src={asset} alt="" /> : <PendingSymbol kind={pending.kind} label={label} />}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {pick > 1 && <button type="button" className="seti-pending-confirm" disabled={chosen.length !== pick} onClick={() => onCommit(chosen)}>CONFIRM {pick}</button>}
    </div>
  );
}

function pendingAsset(scene: SetiSceneDef | null, view: SetiUiView, kind: string, option: unknown): string | null {
  if (!scene || !/gold-tile/i.test(kind)) return null;
  const optionValue = typeof option === 'string' ? option : optionLabel(option, 0);
  const tile = view.goldTiles.find((entry) => entry.id === optionValue);
  return setiGoldTile(scene, optionValue, tile?.side ?? 'A') ?? null;
}

function pendingPick(pending: SetiUiPending | null): number {
  if (!pending) return 1;
  return Math.max(1, Number(pending.raw.pick ?? pending.raw.count ?? pending.raw.required ?? 1));
}

function pendingAction(pending: SetiUiPending, indexes: number[], row?: number): SetiClientAction | null {
  const values = indexes.map((index) => pending.options[index]);
  if (/initial[-_]income/i.test(pending.kind)) {
    const id = optionCardId(values[0]);
    return id ? { type: 'choose_initial_income', cardId: id } : null;
  }
  return { type: 'choose', choice: makeChoice(pending, values, indexes, row) };
}

function optionCardId(option: unknown): string {
  if (typeof option === 'string' && /^seti_(?:project|alien)_/i.test(option)) return option;
  if (!option || typeof option !== 'object') return '';
  const item = option as Record<string, unknown>;
  const value = item.cardId ?? item.card ?? (item.kind === 'card' ? item.id : undefined);
  return typeof value === 'string' ? value : '';
}

function optionLabel(option: unknown, index: number): string {
  if (typeof option === 'string') return option.replace(/[-_]/g, ' ');
  if (typeof option === 'number') return `${option}`;
  if (option && typeof option === 'object') {
    const item = option as Record<string, unknown>;
    const value = item.label ?? item.name ?? item.title ?? item.sectorId ?? item.spaceId ?? item.stackId ?? item.body ?? item.id ?? item.cardId;
    if (typeof value === 'string') return value.replace(/[-_]/g, ' ');
  }
  return `OPTION ${index + 1}`;
}

function makeChoice(pending: SetiUiPending, values: unknown[], indexes: number[], row?: number): SetiClientChoice {
  if (values.length === 1 && values[0] && typeof values[0] === 'object') {
    const option = values[0] as Record<string, unknown>;
    if (option.choice && typeof option.choice === 'object') return option.choice as SetiClientChoice;
  }
  const kind = pending.kind.replace(/_/g, '-');
  const first = values[0];
  const firstRecord = first && typeof first === 'object' ? first as Record<string, unknown> : {};
  if (/discard-to-four/.test(kind)) return { kind: 'cards', cardIds: values.map(optionCardId).filter(Boolean) };
  if (/end-round-card|tuck-income-card|initial-income-card/.test(kind)) return { kind: 'card', cardId: String(optionCardId(first) || firstRecord.id || first) };
  if (/signal-sector|completed-sector-order/.test(kind)) return { kind: 'sector', sectorId: String(firstRecord.sectorId ?? firstRecord.id ?? first), ...(row === undefined ? {} : { row }) };
  if (/trace-space/.test(kind)) return { kind: 'trace-space', spaceId: String(firstRecord.spaceId ?? firstRecord.id ?? first) };
  if (/gold-tile/.test(kind)) return { kind: 'gold-tile', tileId: String(firstRecord.tileId ?? firstRecord.id ?? first) };
  if (/tech-stack/.test(kind)) return { kind: 'tech-stack', stackId: String(firstRecord.stackId ?? firstRecord.id ?? first) };
  if (/mars-first-data/.test(kind)) return { kind: 'number', value: Number(firstRecord.value ?? firstRecord.id ?? first) };
  const options = values.map((value) => String(recordChoiceValue(value)));
  return options.length > 1 ? { kind: 'options', options } : { kind: 'option', option: options[0] ?? String(indexes[0]) };
}

function recordChoiceValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const item = value as Record<string, unknown>;
  return item.option ?? item.value ?? item.id ?? item.name ?? value;
}

function PendingSymbol({ kind, label }: { kind: string; label: string }) {
  const icon: SetiIconName = /tech/i.test(kind) ? 'research' : /signal|sector/i.test(kind) ? 'scan' : /data/i.test(kind) ? 'data' : /pass|round/i.test(kind) ? 'pass' : 'card';
  return <span className="seti-pending-symbol"><SetiIcon name={icon} /><i>{label.slice(0, 2)}</i></span>;
}

function finalMessage(view: SetiUiView) {
  const names = view.winners.map((seat) => view.players.find((player) => player.seat === seat)?.name).filter(Boolean);
  return names.length ? `${names.join(' + ')} LEADS CONTACT` : 'FINAL SCORING COMPLETE';
}

function SetiDeviceLoading() {
  return <div className="seti-scene-loading" role="status"><span className="seti-loader-orbits"><i /><i /><i /></span><b>CONNECTING MISSION CONTROL</b></div>;
}

export default SetiPlay;
