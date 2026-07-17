import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SETI_ALIEN_CARDS_BY_ID, SETI_PROJECT_CATALOG_BY_ID, SETI_RULES, SETI_SECTORS, SETI_TECH_BY_ID, type SetiAction, type SetiView } from '@bge/shared';
import { SetiIcon, type SetiIconName } from './SetiIcons';
import {
  SetiCardArt,
  SetiStarfield,
  SetiTable,
  TactileSurface,
  setiPlayerBoard,
  setiGoldTile,
  setiTechAbilityFace,
  useSetiCardCatalog,
  useSetiScene,
  type SetiSceneDef,
} from './SetiScene';
import { normalizeSetiView, setiSeatColor, type SetiUiPending, type SetiUiPiece, type SetiUiPlayer, type SetiUiView } from './setiView';
import {
  setiPendingCue,
  setiPendingPresentation,
  type SetiPendingMissionChoice,
  type SetiPendingPresentation,
} from './setiPendingPresentation';
import { SetiSoloObjectiveDecision, SetiSoloRivalPanel } from './SetiSoloRival';
import { SetiPendingArtifacts, setiPendingArtifactModel } from './SetiPendingArtifacts';
import { setiAffordableMoveCells, setiMovePaymentForCost } from './setiMovePayment';
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
  | { type: 'research' }
  | { type: 'play_card'; cardId: string }
  | { type: 'discard_for_corner'; cardId: string }
  | { type: 'complete_alien_mission'; cardId: string }
  | { type: 'deliver_sample'; pieceId: string; cardId: string }
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
  const [exchangeCardSource, setExchangeCardSource] = useState(false);
  const [pendingChosen, setPendingChosen] = useState<number[]>([]);
  const [pendingSignalRow, setPendingSignalRow] = useState<number | null>(null);
  const [pendingPieceId, setPendingPieceId] = useState<string | null>(null);
  const [deliveryCardId, setDeliveryCardId] = useState<string | null>(null);
  const [moveCardId, setMoveCardId] = useState<string | null>(null);
  const [handExpanded, setHandExpanded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const pendingCommitRef = useRef('');
  const scanProjectRowRef = useRef<number | null>(null);
  const scanEnergyPieceRef = useRef<string | null>(null);
  const myTurn = !!me && me.seat === view.activeSeat && view.phase !== 'ended';
  const pendingForMe = !!view.pending && (view.pending.owner < 0 || view.pending.owner === me?.seat);
  const canTouch = view.phase !== 'ended' && (myTurn || pendingForMe) && (!view.pending || pendingForMe);
  const pendingSurface = setiPendingPresentation(pendingForMe ? view.pending : null, view);
  const scanStepIndex = (surface: SetiPendingPresentation['scanStepChoices'][number]['surface']) => pendingSurface.scanStepChoices.find((choice) => choice.surface === surface)?.index;
  const scanEarthStepIndex = scanStepIndex('earth-body');
  const scanProjectRowStepIndex = scanStepIndex('project-row');
  const scanTechChoiceIndexes = new Map<string, number>([
    ['seti_tech_stack_telescope_2', scanStepIndex('telescope-tech-discard')],
    ['seti_tech_stack_telescope_3', scanStepIndex('telescope-tech-mercury')],
    ['seti_tech_stack_telescope_4', scanStepIndex('telescope-tech-energy')],
  ].filter((entry): entry is [string, number] => entry[1] !== undefined));
  const scanEnergyBranch = view.pending?.kind === 'card-effect-choice'
    && /launch bay|telescope.tech action/i.test(view.pending.prompt);
  const pendingEnergyLaunchIndex = scanEnergyBranch ? view.pending!.options.findIndex((option) => String(option) === 'launch') : -1;
  const pendingEnergyMoveIndex = scanEnergyBranch ? view.pending!.options.findIndex((option) => String(option) === 'move') : -1;
  const ordinaryAlienCards = me?.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians') ?? [];
  const exchangeableCards = [...(me?.hand ?? []), ...ordinaryAlienCards];
  const cornerCards = canTouch && !view.pending ? [
    ...(me?.hand.filter((id) => !!SETI_PROJECT_CATALOG_BY_ID[id]?.freeCorner) ?? []),
    ...ordinaryAlienCards.filter((id) => (SETI_ALIEN_CARDS_BY_ID[id]?.freeCorner.length ?? 0) > 0),
  ] : [];
  const movementPaymentCards = canTouch && !view.pending
    ? me?.hand.filter(isProjectMovementCorner) ?? []
    : [];
  const selectedPiece = selection?.kind === 'piece' ? selection.piece : null;
  const rawLegalCells = selectedPiece ? view.legal.moveTargets[selectedPiece.id] ?? [] : [];
  const orbitTargets = selectedPiece ? view.legal.orbitTargets[selectedPiece.id] ?? [] : [];
  const landTargets = selectedPiece ? view.legal.landTargets[selectedPiece.id] ?? [] : [];
  const rawMoveCosts = selectedPiece ? moveCostMap(view, selectedPiece.id) : {};
  const legalCells = setiAffordableMoveCells(rawLegalCells, rawMoveCosts, me?.energy ?? 0, moveCardId, movementPaymentCards);
  const movePaymentCardTargets = selectedPiece
    ? movementPaymentCards.filter((cardId) => rawLegalCells.some((cell) => setiMovePaymentForCost(
        rawMoveCosts[cell], me?.energy ?? 0, cardId, movementPaymentCards,
      ) !== null))
    : [];
  const movementCardRequired = !!selectedPiece && moveCardId === null && rawLegalCells.some((cell) => (
    setiMovePaymentForCost(rawMoveCosts[cell], me?.energy ?? 0, null, movementPaymentCards) === null
    && movePaymentCardTargets.some((cardId) => setiMovePaymentForCost(rawMoveCosts[cell], me?.energy ?? 0, cardId, movementPaymentCards) !== null)
  ));
  const moveCosts = Object.fromEntries(legalCells.flatMap((cell) => {
    const cost = rawMoveCosts[cell] ?? SETI_RULES.moveEnergy;
    const payment = setiMovePaymentForCost(cost, me?.energy ?? 0, moveCardId, movementPaymentCards);
    if (!payment) return [];
    return [[cell, 'cardId' in payment
      ? { card: true, ...(cost > SETI_RULES.moveEnergy ? { energy: cost - SETI_RULES.moveEnergy } : {}) }
      : { energy: payment.energy }]];
  }));
  const orbitCosts = Object.fromEntries(orbitTargets.map((body) => [body, { credit: SETI_RULES.orbitCredits, energy: SETI_RULES.orbitEnergy }]));
  const landingDiscount = me?.techs.some((tech) => SETI_TECH_BY_ID[tech.stackId as keyof typeof SETI_TECH_BY_ID]?.ability === 'landing-discount') ? 1 : 0;
  const landCosts = Object.fromEntries(landTargets.map((body) => {
    const planet = view.planets.find((candidate) => candidate.body === body);
    const hasOrbiter = (planet?.orbiters.length ?? 0) > 0 || view.placedSpacecraft.some((piece) => piece.body === body && piece.kind === 'orbiter');
    return [body, Math.max(0, (hasOrbiter ? SETI_RULES.landWithOrbiterEnergy : SETI_RULES.landEnergy) - landingDiscount)];
  }));
  const pendingPieceChoices = new Set([
    ...pendingSurface.pieceIndexes.keys(),
    ...pendingSurface.bodyChoices.flatMap((choice) => choice.pieceId ? [choice.pieceId] : []),
    ...pendingSurface.moveChoices.map((choice) => choice.pieceId),
    ...(deliveryCardId ? view.pieces.filter((piece) => piece.owner === me.seat && piece.kind === 'capsule').map((piece) => piece.id) : []),
    ...(pendingEnergyMoveIndex >= 0 ? view.pieces.filter((piece) => piece.owner === me.seat).map((piece) => piece.id) : []),
  ]);
  const pendingBodyChoices = pendingSurface.bodyChoices.filter((choice) => choice.pieceId === pendingPieceId);
  const pendingOrbitTargets = pendingBodyChoices.filter((choice) => choice.action === 'orbit' && !choice.spacecraftId).map((choice) => choice.body);
  const pendingLandTargets = pendingBodyChoices.filter((choice) => choice.action === 'land' && !choice.spacecraftId).map((choice) => choice.body);
  const pendingRemoveTargets = pendingSurface.bodyChoices.filter((choice) => choice.action === 'remove').map((choice) => choice.body);
  const pendingSpacecraftTargets = [
    ...pendingSurface.spacecraftIndexes.keys(),
    ...pendingBodyChoices.flatMap((choice) => choice.spacecraftId ? [choice.spacecraftId] : []),
  ];
  const pendingMoveCells = pendingSurface.moveChoices.filter((choice) => choice.pieceId === pendingPieceId).map((choice) => choice.cell);
  const exchangeRowTargets = exchangeCardSource ? view.projectRow.map((id, row) => id ? row : -1).filter((row) => row >= 0) : [];
  const signalRowTargets = view.pending?.kind === 'signal-sector' && Array.isArray(view.pending.raw.rowOptions)
    ? view.pending.raw.rowOptions.map(Number).filter(Number.isInteger)
    : [];
  const effectiveSignalRow = pendingSignalRow ?? (
    signalRowTargets.includes(scanProjectRowRef.current ?? -1) ? scanProjectRowRef.current : null
  );
  const scanProjectRows = scanProjectRowStepIndex === undefined ? [] : view.projectRow.map((id, row) => id ? row : -1).filter((row) => row >= 0);
  const visualRowTargets = [...new Set([...pendingSurface.rowIndexes.keys(), ...exchangeRowTargets, ...signalRowTargets, ...scanProjectRows])];
  const visualDeckTarget = pendingSurface.projectDeckIndex !== null || exchangeCardSource;
  const pendingSignalSectors = (() => {
    if (view.pending?.kind !== 'signal-sector') return [...pendingSurface.sectorIndexes.keys()];
    if (!Array.isArray(view.pending.raw.rowOptions)) return [...pendingSurface.sectorIndexes.keys()];
    if (effectiveSignalRow === null) return [];
    const card = SETI_PROJECT_CATALOG_BY_ID[view.projectRow[effectiveSignalRow]];
    return card ? SETI_SECTORS.filter((sector) => sector.printedSignalColor === card.signalColor).map((sector) => sector.id) : [];
  })();
  const computerInstallTargets = pendingSurface.computerTechChoices.map((choice) => choice.boardSlot);

  useEffect(() => {
    pendingCommitRef.current = '';
    setSelection(null);
    setExchange(null);
    setExchangeCardSource(false);
    setPendingChosen([]);
    setPendingSignalRow(null);
    setPendingPieceId(scanEnergyPieceRef.current);
    setDeliveryCardId(null);
    setMoveCardId(null);
  }, [rawView, view.activeSeat, pendingKey(view.pending)]);

  useEffect(() => {
    if (view.pending?.kind !== 'signal-sector' && scanProjectRowStepIndex === undefined) scanProjectRowRef.current = null;
    const carriedPiece = scanEnergyPieceRef.current;
    if (!carriedPiece || !view.pending || !pendingForMe) return;
    const pieceIndex = pendingSurface.pieceIndexes.get(carriedPiece);
    if (pieceIndex === undefined) return;
    const key = pendingKey(view.pending);
    if (pendingCommitRef.current === key) return;
    const action = pendingAction(view.pending, [pieceIndex]);
    if (!action) return;
    pendingCommitRef.current = key;
    act(action as SetiAction);
    setPendingPieceId(carriedPiece);
    setNote('PROBE LIFTED · DROP ON A GLOWING DESTINATION');
  }, [rawView, view.pending, pendingForMe, pendingSurface, scanProjectRowStepIndex, act]);

  useEffect(() => {
    if (error) pendingCommitRef.current = '';
  }, [error]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setCard(null); setShowDeck(false); setShowSolo(false); setExchange(null); setExchangeCardSource(false); setDeliveryCardId(null); setMoveCardId(null); setHandExpanded(false); }
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

  const pieceNeedsMovementCard = (piece: SetiUiPiece): boolean => {
    const cells = view.legal.moveTargets[piece.id] ?? [];
    const costs = moveCostMap(view, piece.id);
    return cells.some((cell) => (
      setiMovePaymentForCost(costs[cell], me.energy, null, movementPaymentCards) === null
      && movementPaymentCards.some((cardId) => setiMovePaymentForCost(costs[cell], me.energy, cardId, movementPaymentCards) !== null)
    ));
  };

  const armMovementCard = (cardId: string) => {
    if (!selectedPiece || !movePaymentCardTargets.includes(cardId)) return;
    setMoveCardId(cardId);
    setCard(null);
    setLayer('solar');
    setNote('MOVEMENT CORNER ARMED · TOUCH OR DROP ON A GLOWING DESTINATION');
  };

  const selectPiece = (piece: SetiUiPiece) => {
    if (piece.owner !== me.seat) return;
    if (pendingEnergyMoveIndex >= 0) {
      scanEnergyPieceRef.current = piece.id;
      setPendingPieceId(piece.id);
      commitPending([pendingEnergyMoveIndex]);
      setLayer('solar');
      return;
    }
    if (deliveryCardId && piece.kind === 'capsule') {
      send({ type: 'deliver_sample', pieceId: piece.id, cardId: deliveryCardId }, 'SAMPLE DELIVERED');
      setDeliveryCardId(null);
      return;
    }
    const pendingIndex = pendingSurface.pieceIndexes.get(piece.id);
    if (pendingIndex !== undefined) {
      commitPending([pendingIndex]);
      return;
    }
    if (String(view.pending?.raw.cardId ?? '').startsWith('seti_alien:sample-probe-inspect:')) {
      const sampleProbe = pendingSurface.bodyChoices.find((choice) => choice.pieceId === piece.id);
      if (sampleProbe) {
        commitPending([sampleProbe.index]);
        return;
      }
    }
    if (pendingSurface.bodyChoices.some((choice) => choice.pieceId === piece.id)) {
      setPendingPieceId(piece.id);
      setLayer('solar');
      return;
    }
    if (pendingSurface.moveChoices.some((choice) => choice.pieceId === piece.id)) {
      setPendingPieceId(piece.id);
      setLayer('solar');
      return;
    }
    setSelection({ kind: 'piece', piece });
    setLayer('solar');
    if (pieceNeedsMovementCard(piece) && !moveCardId) setNote('TOUCH OR DRAG A GLOWING MOVEMENT CORNER CARD');
  };

  const preparePieceDrag = (piece: SetiUiPiece) => {
    if (piece.owner !== me.seat) return;
    if (pendingEnergyMoveIndex >= 0) {
      scanEnergyPieceRef.current = piece.id;
      setPendingPieceId(piece.id);
      commitPending([pendingEnergyMoveIndex]);
      setLayer('solar');
      return;
    }
    if (pendingSurface.bodyChoices.some((choice) => choice.pieceId === piece.id)
      || pendingSurface.moveChoices.some((choice) => choice.pieceId === piece.id)) {
      setPendingPieceId(piece.id);
    } else if (!view.pending && (
      (view.legal.moveTargets[piece.id]?.length ?? 0) > 0
      || (view.legal.orbitTargets[piece.id]?.length ?? 0) > 0
      || (view.legal.landTargets[piece.id]?.length ?? 0) > 0
    )) {
      setSelection({ kind: 'piece', piece });
      if (pieceNeedsMovementCard(piece) && !moveCardId) setNote('TOUCH OR DRAG A GLOWING MOVEMENT CORNER CARD');
    }
    setLayer('solar');
  };

  const moveSelected = (cell: string, draggedPieceId?: string) => {
    const activePieceId = draggedPieceId ?? pendingPieceId ?? selectedPiece?.id ?? null;
    const pendingMove = pendingSurface.moveChoices.find((choice) => choice.pieceId === activePieceId && choice.cell === cell);
    if (pendingMove) {
      commitPending([pendingMove.index]);
      return;
    }
    const pendingIndex = pendingSurface.cellIndexes.get(cell);
    if (pendingIndex !== undefined) {
      commitPending([pendingIndex]);
      return;
    }
    const piece = activePieceId ? view.pieces.find((candidate) => candidate.id === activePieceId) : null;
    if (!piece || !view.legal.moveTargets[piece.id]?.includes(cell)) return;
    const cost = moveCostMap(view, piece.id)[cell] ?? SETI_RULES.moveEnergy;
    const payment = setiMovePaymentForCost(cost, me.energy, moveCardId, movementPaymentCards);
    if (!payment) {
      setNote(!moveCardId && movementPaymentCards.length
        ? 'CHOOSE A GLOWING MOVEMENT CORNER CARD FIRST'
        : 'NOT ENOUGH ENERGY FOR THIS TRAJECTORY');
      return;
    }
    send({ type: 'move', pieceId: piece.id, to: cell, payment }, 'TRAJECTORY TRANSMITTED');
    setSelection(null);
    setMoveCardId(null);
  };

  const bodySelected = (kind: 'orbit' | 'land', body: string, draggedPieceId?: string) => {
    const activePieceId = draggedPieceId ?? pendingPieceId ?? selectedPiece?.id ?? null;
    if (activePieceId) {
      const pendingChoice = pendingSurface.bodyChoices.find((choice) => choice.pieceId === activePieceId && choice.body === body && choice.action === kind);
      if (pendingChoice) {
        commitPending([pendingChoice.index]);
        setPendingPieceId(null);
        return;
      }
    }
    const piece = activePieceId ? view.pieces.find((candidate) => candidate.id === activePieceId) : null;
    if (!piece) return;
    if (kind === 'orbit' && view.legal.orbitTargets[piece.id]?.includes(body)) send({ type: 'orbit', pieceId: piece.id, body }, 'ORBIT CONFIRMED');
    if (kind === 'land' && view.legal.landTargets[piece.id]?.includes(body)) send({ type: 'land', pieceId: piece.id, body }, 'LANDING CONFIRMED');
    setSelection(null);
  };

  const beginLaunch = () => {
    if (pendingEnergyLaunchIndex >= 0) {
      commitPending([pendingEnergyLaunchIndex]);
      return;
    }
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
    if (!view.legal.canResearch) return;
    send({ type: 'research' }, 'TOUCH A GLOWING TECH STACK');
    setLayer('solar');
  };

  const pickResource = (kind: 'credits' | 'energy') => {
    if (!canTouch || (kind === 'credits' ? me.credits : me.energy) < 2) return;
    setExchangeCardSource(false);
    setExchange((current) => current?.give === kind ? null : { give: kind, cardIds: [] });
  };

  const pickExchangeCard = (id: string) => {
    if (!exchange || exchange.give !== 'cards') return;
    const cardIds = exchange.cardIds.includes(id) ? exchange.cardIds.filter((entry) => entry !== id) : [...exchange.cardIds, id].slice(-2);
    setExchange({ ...exchange, cardIds });
  };

  const completeExchange = (receive: 'card' | 'credit' | 'energy') => {
    if (!exchange) return;
    if (receive === 'card') {
      setExchangeCardSource(true);
      setLayer('solar');
      setNote('TOUCH THE PROJECT DECK OR A ROW CARD');
      return;
    }
    send({ type: 'exchange', give: exchange.give, receive, cardIds: exchange.give === 'cards' ? exchange.cardIds : undefined }, 'EXCHANGE COMPLETE');
    setExchange(null);
    setExchangeCardSource(false);
  };

  const completeCardExchange = (row?: number) => {
    if (!exchange || !exchangeCardSource) return false;
    send({ type: 'exchange', give: exchange.give, receive: 'card', cardIds: exchange.give === 'cards' ? exchange.cardIds : undefined, ...(row === undefined ? {} : { row }) }, 'EXCHANGE COMPLETE');
    setExchange(null);
    setExchangeCardSource(false);
    return true;
  };

  const commitPending = (indexes: number[]) => {
    if (!view.pending) return;
    const key = pendingKey(view.pending);
    if (pendingCommitRef.current === key) return;
    const action = pendingAction(view.pending, indexes, effectiveSignalRow ?? undefined);
    if (action) {
      pendingCommitRef.current = key;
      send(action, 'DECISION TRANSMITTED');
    }
    setPendingChosen([]);
    setPendingPieceId(null);
    if (view.pending.kind === 'signal-sector') scanProjectRowRef.current = null;
    if (pendingSurface.cellIndexes.size > 0 && scanEnergyPieceRef.current) scanEnergyPieceRef.current = null;
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
        <div className="seti-device-agency"><span className="seti-seat-outline" />{me.seat === view.startingSeat && <span className="seti-device-starting" title="starting agency"><img src="/seti/tokens/first-player.webp" alt="starting player token" /></span>}<div><small>AGENCY</small><b>{me.name}</b></div></div>
        <ResourcePiece icon="score" label="VP" value={view.phase === 'ended' ? me.finalScore ?? me.score : me.score} />
        <ResourcePiece icon="publicity" label="PUBLICITY" value={me.publicity} />
        <ResourcePiece icon="credit" label="CREDITS" value={me.credits} tokenSrc={`/seti/tokens/credit-${me.color.toLowerCase()}.webp`} onClick={() => pickResource('credits')} active={exchange?.give === 'credits'} disabled={!canTouch || me.credits < 2} />
        <ResourcePiece icon="energy" label="ENERGY" value={me.energy} tokenSrc={`/seti/tokens/energy-${me.color.toLowerCase()}.webp`} onClick={() => pickResource('energy')} active={exchange?.give === 'energy'} disabled={!canTouch || me.energy < 2} />
        <ResourcePiece icon="data" label="DATA" value={me.dataPool} onClick={() => { if (view.legal.placeDataSlots.length) { setSelection({ kind: 'data' }); setLayer('personal'); } }} active={selection?.kind === 'data'} disabled={!canTouch || view.legal.placeDataSlots.length === 0} />
        <div className="seti-header-actions">
          <button type="button" className="seti-icon-button" onClick={() => { setExchangeCardSource(false); setExchange((current) => current?.give === 'cards' ? null : { give: 'cards', cardIds: [] }); }} disabled={!canTouch || exchangeableCards.length < 2} aria-label="exchange cards"><SetiIcon name="card" /><span>EXCHANGE</span></button>
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
        <button type="button" data-testid="seti-layer-personal" className={layer === 'personal' ? 'is-active' : ''} aria-pressed={layer === 'personal'} onClick={() => setLayer('personal')}>PERSONAL</button>
        <button type="button" data-testid="seti-layer-solar" className={layer === 'solar' ? 'is-active' : ''} aria-pressed={layer === 'solar'} onClick={() => setLayer('solar')}>SOLAR SYSTEM</button>
        <span className={layer} />
      </nav>

      <div className={`seti-turn-line ${myTurn || pendingForMe ? 'is-yours' : ''}`}>
        <span />
        <b>{view.phase === 'ended' ? 'MISSION COMPLETE' : pendingForMe ? 'YOUR DECISION' : myTurn ? 'YOUR TURN' : `${view.players.find((player) => player.seat === view.activeSeat)?.name ?? 'AGENCY'} OPERATING`}</b>
        <small>{view.phase === 'ended' ? finalMessage(view) : pendingForMe ? view.pending!.prompt : myTurn ? view.mainActionTaken ? 'FREE ACTIONS OR END TURN' : 'TOUCH A PIECE OR PRINTED ACTION' : `ROUND ${view.round} OF 5`}</small>
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
                launchOverride={pendingEnergyLaunchIndex >= 0}
                onScan={beginScan}
                onAnalyze={() => send({ type: 'analyze' }, 'ANALYSIS STARTED')}
                onResearch={beginResearch}
                onPlaceData={(slot) => { send({ type: 'place_data', slot }, 'DATA PLACED'); setSelection(null); }}
                computerInstallTargets={computerInstallTargets}
                onInstallComputer={(slot) => {
                  const choice = pendingSurface.computerTechChoices.find((candidate) => candidate.boardSlot === slot);
                  if (choice) commitPending([choice.index]);
                }}
                scanTechChoiceIndexes={scanTechChoiceIndexes}
                onScanTech={(index) => commitPending([index])}
                onIncomeCard={(id) => setCard({ id, origin: 'income' })}
                missionTargets={[...pendingSurface.missionIndexes.keys()]}
                missionChoices={pendingSurface.missionChoices}
                onMissionChoice={(index) => commitPending([index])}
                onMissionCard={(id) => {
                  const index = pendingSurface.missionIndexes.get(id) ?? pendingSurface.cardIndexes.get(id);
                  if (index !== undefined) commitPending([index]);
                  else setCard({ id, origin: 'mission' });
                }}
              />
              <ProjectDock scene={scene} view={view} canBuyDeck={canTouch && !view.pending && me.publicity >= 3} deckTarget={visualDeckTarget} rowTargets={visualRowTargets} onInspect={(id, row) => {
                if (scanProjectRowStepIndex !== undefined) { scanProjectRowRef.current = row; setPendingSignalRow(row); commitPending([scanProjectRowStepIndex]); return; }
                const index = pendingSurface.rowIndexes.get(row);
                if (index !== undefined) commitPending([index]);
                else if (signalRowTargets.includes(row)) setPendingSignalRow(row);
                else if (exchangeRowTargets.includes(row)) completeCardExchange(row);
                else setCard({ id, origin: 'row', row });
              }} onDeckBuy={() => {
                if (pendingSurface.projectDeckIndex !== null) commitPending([pendingSurface.projectDeckIndex]);
                else if (exchangeCardSource) completeCardExchange();
                else send({ type: 'buy_card', source: 'deck' }, 'PROJECT ACQUIRED');
              }} />
            </div>
            <div className={`seti-layer seti-solar-layer ${layer === 'solar' ? 'is-visible' : ''}`} aria-hidden={layer !== 'solar'}>
              <SetiTable
                scene={scene}
                view={view}
                compact
                interactive={canTouch}
                selectedPieceId={selectedPiece?.id ?? pendingPieceId ?? scanEnergyPieceRef.current}
                legalCells={selectedPiece ? legalCells : [...pendingSurface.cellIndexes.keys(), ...pendingMoveCells]}
                orbitTargets={[...orbitTargets, ...pendingOrbitTargets]}
                landTargets={[...landTargets, ...pendingLandTargets]}
                bodyChoiceTargets={pendingRemoveTargets}
                spacecraftTargets={pendingSpacecraftTargets}
                pieceTargets={[...pendingPieceChoices]}
                rowTargets={visualRowTargets}
                deckTarget={visualDeckTarget}
                alienCardTargets={[...pendingSurface.cardIndexes.keys()]}
                alienDeckTarget={pendingSurface.alienDeckIndex !== null ? Number(view.pending?.raw.speciesSlot ?? -1) : null}
                traceTargets={view.legal.traceTargets}
                sampleTargets={pendingSurface.sampleChoices}
                sectorTargets={pendingSignalSectors}
                launchTarget={selection?.kind === 'launch'}
                earthStepTarget={scanEarthStepIndex !== undefined}
                moveCosts={moveCosts}
                orbitCosts={orbitCosts}
                landCosts={landCosts}
                goldTileTargets={view.pending?.kind === 'gold-tile' ? view.pending.options.map(String) : []}
                marsDataTargets={view.pending?.kind === 'mars-first-data' ? view.pending.options.map(Number).filter(Number.isFinite) : []}
                oumuamuaTileTargets={pendingSurface.oumuamuaTileChoices.map((choice) => choice.tileSlot)}
                onPiecePress={preparePieceDrag}
                onPiece={selectPiece}
                onCell={moveSelected}
                onBody={bodySelected}
                onBodyChoice={(body) => {
                  const choice = pendingSurface.bodyChoices.find((candidate) => candidate.action === 'remove' && candidate.body === body);
                  if (choice) commitPending([choice.index]);
                }}
                onSpacecraft={(spacecraftId) => {
                  const direct = pendingSurface.spacecraftIndexes.get(spacecraftId);
                  if (direct !== undefined) { commitPending([direct]); return; }
                  const occupied = pendingBodyChoices.find((choice) => choice.spacecraftId === spacecraftId);
                  if (occupied) commitPending([occupied.index]);
                }}
                onTrace={(spaceId) => {
                  const index = pendingOptionIndex(spaceId);
                  if (index >= 0) commitPending([index]);
                }}
                onDeck={() => {
                  if (pendingSurface.projectDeckIndex !== null) commitPending([pendingSurface.projectDeckIndex]);
                  else if (exchangeCardSource) completeCardExchange();
                }}
                onAlienCard={(cardId) => {
                  const index = pendingSurface.cardIndexes.get(cardId);
                  if (index !== undefined) commitPending([index]);
                }}
                onAlienDeck={() => { if (pendingSurface.alienDeckIndex !== null) commitPending([pendingSurface.alienDeckIndex]); }}
                onSample={(index) => commitPending([index])}
                onSector={(sectorId) => { const index = pendingSurface.sectorIndexes.get(sectorId) ?? pendingOptionIndex(sectorId); if (index >= 0 && (!Array.isArray(view.pending?.raw.rowOptions) || effectiveSignalRow !== null)) commitPending([index]); }}
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
                onEarthStep={() => { if (scanEarthStepIndex !== undefined) commitPending([scanEarthStepIndex]); }}
                onGoldTile={(tileId) => { const index = pendingOptionIndex(tileId); if (index >= 0) commitPending([index]); }}
                onMarsData={(amount) => { const index = view.pending?.options.findIndex((option) => Number(option) === amount) ?? -1; if (index >= 0) commitPending([index]); }}
                onOumuamuaTile={(slot) => { const choice = pendingSurface.oumuamuaTileChoices.find((candidate) => candidate.tileSlot === slot); if (choice) commitPending([choice.index]); }}
                onCard={(id, row) => {
                  if (scanProjectRowStepIndex !== undefined) { scanProjectRowRef.current = row; setPendingSignalRow(row); commitPending([scanProjectRowStepIndex]); return; }
                  const choiceIndex = pendingSurface.rowIndexes.get(row);
                  if (choiceIndex !== undefined) { commitPending([choiceIndex]); return; }
                  if (signalRowTargets.includes(row)) { setPendingSignalRow(row); return; }
                  if (exchangeRowTargets.includes(row)) { completeCardExchange(row); return; }
                  setCard({
                    id,
                    origin: view.pending?.kind === 'signal-sector' && Array.isArray(view.pending.raw.rowOptions) ? 'pending-row' : 'row',
                    row,
                  });
                }}
                onTech={(stackId) => {
                  if (!view.legal.techStackTargets.includes(stackId)) return;
                  if (view.pending?.kind === 'tech-stack') {
                    const index = pendingOptionIndex(stackId);
                    if (index >= 0) commitPending([index]);
                  }
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
        pendingCards={[...pendingSurface.cardIndexes.keys()]}
        pendingSelectedCards={[...pendingSurface.cardIndexes.entries()].filter(([, index]) => pendingChosen.includes(index)).map(([id]) => id)}
        exchange={exchange}
        moveCardId={moveCardId}
        movePaymentCards={movePaymentCardTargets}
        expanded={handExpanded}
        onToggleExpanded={() => setHandExpanded((current) => !current)}
        onCardPress={(id) => { if (selectedPiece && movePaymentCardTargets.includes(id)) armMovementCard(id); }}
        onCard={(id) => {
          if (selectedPiece && movePaymentCardTargets.includes(id)) { armMovementCard(id); return; }
          const pendingIndex = pendingSurface.cardIndexes.get(id);
          if (pendingIndex !== undefined) {
            if (/initial[-_]income/i.test(view.pending?.kind ?? '')) {
              // The setup choice is still a physical tuck, but the player may
              // inspect the full card before committing it to the income lane.
              setCard({ id, origin: 'hand' });
              return;
            }
            const pick = pendingPick(view.pending);
            if (pick === 1) commitPending([pendingIndex]);
            else setPendingChosen((current) => current.includes(pendingIndex) ? current.filter((value) => value !== pendingIndex) : [...current, pendingIndex].slice(-pick));
            return;
          }
          if (exchange?.give === 'cards' && exchangeableCards.includes(id)) pickExchangeCard(id);
          else setCard({ id, origin: 'hand' });
        }}
        onPlayDrop={(id, kind, value) => {
          if (kind === 'mission' && view.legal.playableCards.includes(id)) { send({ type: 'play_card', cardId: id }, 'PROJECT COMMITTED'); return true; }
          if (kind === 'cell' && selectedPiece && rawLegalCells.includes(value) && isProjectMovementCorner(id)) {
            const cost = rawMoveCosts[value] ?? SETI_RULES.moveEnergy;
            const payment = setiMovePaymentForCost(cost, me.energy, id, movementPaymentCards);
            if (!payment) return false;
            send({ type: 'move', pieceId: selectedPiece.id, to: value, payment }, 'TRAJECTORY TRANSMITTED');
            setSelection(null);
            setMoveCardId(null);
            return true;
          }
          return false;
        }}
      />

      <div className="seti-device-controls">
        {view.legal.canPass && <button type="button" className="seti-pass-control" data-testid="seti-pass" onClick={() => send({ type: 'pass' }, 'PASS TRANSMITTED')}><SetiIcon name="pass" /><span>PASS</span></button>}
        <button type="button" className="seti-end-turn" data-testid="seti-end-turn" disabled={!view.legal.canEndTurn} onClick={() => { setSelection(null); send({ type: 'end_turn' }); }}><span>END TURN</span><i /></button>
      </div>

      {exchange && <ExchangeTray exchange={exchange} color={me.color} choosingSource={exchangeCardSource} onReceive={completeExchange} onClose={() => { setExchange(null); setExchangeCardSource(false); }} />}
      {view.pending?.kind === 'solo-objective-task' && view.solo ? (
        <SetiSoloObjectiveDecision
          solo={view.solo}
          options={view.pending.options.map(String)}
          onChoose={(option) => {
            const index = view.pending?.options.findIndex((candidate) => String(candidate) === option) ?? -1;
            if (index >= 0) commitPending([index]);
          }}
        />
      ) : view.pending && (
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
          pendingRow={effectiveSignalRow}
          presentation={pendingSurface}
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
          onCorner={() => {
            if (isProjectMovementCorner(card.id)) {
              setMoveCardId(card.id);
              setSelection(null);
              setLayer('solar');
              setNote('TOUCH A PROBE, THEN ITS DESTINATION');
            } else send({ type: 'discard_for_corner', cardId: card.id }, 'CORNER EFFECT USED');
            setCard(null);
          }}
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
          onCompleteAlien={() => { send({ type: 'complete_alien_mission', cardId: card.id }, 'ALIEN MISSION COMPLETED'); setCard(null); }}
          onDeliverSample={() => { setDeliveryCardId(card.id); setLayer('solar'); setNote('TOUCH THE SAMPLE CAPSULE AT ITS DESTINATION'); setCard(null); }}
          pendingSelected={card.pendingIndex !== undefined && pendingChosen.includes(card.pendingIndex)}
        />
      )}
      {showDeck && scene && <DeckBrowser scene={scene} includePromos={(view.raw.options as { promoCards?: boolean } | undefined)?.promoCards === true} onClose={() => setShowDeck(false)} onInspect={(id) => setCard({ id, origin: 'deck' })} />}
      {showSolo && view.solo && <SetiSoloRivalPanel solo={view.solo} onClose={() => setShowSolo(false)} />}
      {deliveryCardId && <div className="seti-direct-cue seti-glass"><SetiIcon name="probe" /><b>TOUCH THE GLOWING SAMPLE CAPSULE</b></div>}
      {exchangeCardSource && <div className="seti-direct-cue seti-glass"><SetiIcon name="card" /><b>TOUCH THE PROJECT DECK OR A ROW CARD</b></div>}
      {movementCardRequired && <div className="seti-direct-cue seti-glass"><SetiIcon name="card" /><b>TOUCH OR DRAG A GLOWING MOVEMENT CORNER CARD</b></div>}
      {note && <div className="seti-note" role="status">{note}</div>}
      {error && <div className="seti-error" role="alert">{error}</div>}
    </main>
  );
}

function moveCostMap(view: SetiUiView, pieceId: string): Record<string, number> {
  const legal = (view.raw.legal && typeof view.raw.legal === 'object' ? view.raw.legal : {}) as Record<string, unknown>;
  const payments = (legal.moveEnergyCost && typeof legal.moveEnergyCost === 'object' ? legal.moveEnergyCost : {}) as Record<string, unknown>;
  const perPiece = (payments[pieceId] && typeof payments[pieceId] === 'object' ? payments[pieceId] : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(perPiece).flatMap(([cell, value]) => typeof value === 'number' ? [[cell, value]] : []));
}

function isProjectMovementCorner(cardId: string): boolean {
  return SETI_PROJECT_CATALOG_BY_ID[cardId]?.freeCorner === 'move';
}

function ResourcePiece({ icon, label, value, tokenSrc, onClick, active, disabled }: {
  icon: SetiIconName;
  label: string;
  value: number;
  tokenSrc?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const content = <><span className={`seti-resource-icon ${tokenSrc ? 'has-token-art' : ''}`}>{tokenSrc ? <img src={tokenSrc} alt="" /> : <SetiIcon name={icon} />}</span><span><b>{value}</b><small>{label}</small></span></>;
  return onClick ? <button type="button" className={`seti-resource-piece ${active ? 'is-active' : ''}`} aria-label={`${label}: ${value}`} aria-pressed={active} onClick={onClick} disabled={disabled}>{content}</button> : <div className="seti-resource-piece" aria-label={`${label}: ${value}`}>{content}</div>;
}

function PersonalBoard({ scene, view, me, selection, canTouch, onLaunch, launchOverride, onScan, onAnalyze, onResearch, onPlaceData, computerInstallTargets, onInstallComputer, scanTechChoiceIndexes, onScanTech, onIncomeCard, missionTargets, missionChoices, onMissionChoice, onMissionCard }: {
  scene: SetiSceneDef;
  view: SetiUiView;
  me: SetiUiPlayer;
  selection: Selection;
  canTouch: boolean;
  onLaunch: () => void;
  launchOverride: boolean;
  onScan: () => void;
  onAnalyze: () => void;
  onResearch: () => void;
  onPlaceData: (slot: number) => void;
  computerInstallTargets: number[];
  onInstallComputer: (slot: number) => void;
  scanTechChoiceIndexes: ReadonlyMap<string, number>;
  onScanTech: (index: number) => void;
  onIncomeCard: (id: string) => void;
  missionTargets: string[];
  missionChoices: readonly SetiPendingMissionChoice[];
  onMissionChoice: (index: number) => void;
  onMissionCard: (id: string) => void;
}) {
  const probesInSpace = view.pieces.filter((piece) => piece.owner === me.seat && piece.kind === 'probe').length;
  const supplyCount = Math.max(view.legal.canLaunch ? 1 : 0, (me.techs.some((tech) => /probe/i.test(tech.stackId)) ? 2 : 1) - probesInSpace);
  return (
    <div className="seti-personal-board-wrap">
      <img className="seti-personal-board-art" src={setiPlayerBoard(scene, me.color)} alt={`${me.name} player board`} draggable={false} />

      <button type="button" data-testid="seti-action-launch" className={`seti-printed-action seti-action-launch ${view.legal.canLaunch || launchOverride ? 'is-legal' : ''}`} disabled={!canTouch || (!view.legal.canLaunch && !launchOverride)} onClick={onLaunch}>
        <SetiIcon name="probe" /><span>LAUNCH</span><small>2</small>
      </button>
      <button type="button" data-testid="seti-action-scan" className={`seti-printed-action seti-action-scan ${view.legal.scanSectorTargets.length ? 'is-legal' : ''}`} disabled={!canTouch || view.legal.scanSectorTargets.length === 0} onClick={onScan}>
        <SetiIcon name="scan" /><span>SCAN</span>
      </button>
      <button type="button" data-testid="seti-action-analyze" className={`seti-printed-action seti-action-analyze ${view.legal.canAnalyze ? 'is-legal' : ''}`} disabled={!canTouch || !view.legal.canAnalyze} onClick={onAnalyze}>
        <SetiIcon name="analyze" /><span>ANALYZE</span>
      </button>
      <button type="button" data-testid="seti-action-research" className={`seti-printed-action seti-action-research ${view.legal.canResearch ? 'is-legal' : ''}`} disabled={!canTouch || !view.legal.canResearch} onClick={onResearch}>
        <SetiIcon name="research" /><span>RESEARCH</span><small>6</small>
      </button>

      <div className="seti-probe-supply" aria-label="probe supply">
        {Array.from({ length: Math.max(1, supplyCount) }, (_, index) => (
          <TactileSurface key={index} className={`seti-supply-probe ${view.legal.canLaunch || launchOverride ? 'is-legal' : ''}`} disabled={!canTouch || (!view.legal.canLaunch && !launchOverride)} onTap={onLaunch} ariaLabel="take probe from supply">
            <span className="seti-piece-body" />
          </TactileSurface>
        ))}
      </div>

      <div className="seti-computer-track" aria-label="computer data track">
        {Array.from({ length: 6 }, (_, slot) => {
          const filled = !!me.computer.top[slot];
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

      <div className="seti-computer-tech-track" aria-label="computer technology positions">
        {Array.from({ length: 4 }, (_, boardSlot) => {
          const installed = me.computer.tech.find((tech) => tech.boardSlot === boardSlot);
          const owned = installed ? me.techs.find((tech) => tech.stackId === installed.stackId) : null;
          const installable = computerInstallTargets.includes(boardSlot);
          const dataSlot = 6 + boardSlot;
          const canPlaceLower = selection?.kind === 'data' && view.legal.placeDataSlots.includes(dataSlot);
          return (
            <button
              key={boardSlot}
              type="button"
              className={`seti-computer-tech-slot ${installed ? 'is-installed' : ''} ${installable || canPlaceLower ? 'is-legal' : ''}`}
              disabled={!installable && !canPlaceLower}
              data-seti-target="computer-tech"
              data-seti-value={`${boardSlot}`}
              data-testid={`seti-computer-tech-slot-${boardSlot}`}
              onClick={() => installable ? onInstallComputer(boardSlot) : onPlaceData(dataSlot)}
              aria-label={installable ? `install computer technology in position ${boardSlot + 1}` : installed ? `computer technology position ${boardSlot + 1}` : `empty computer technology position ${boardSlot + 1}`}
            >
              {owned && (setiTechAbilityFace(scene, owned.stackId, owned.tileId)
                ? <img src={setiTechAbilityFace(scene, owned.stackId, owned.tileId)} alt="computer technology" />
                : <span>{owned.stackId.replace(/^seti_tech_stack_/, '').replace('_', ' ').toUpperCase()}</span>)}
              {installed?.lower && <i className="seti-data-cube" />}
            </button>
          );
        })}
      </div>

      <div className="seti-installed-tech" aria-label="installed technology">
        {me.techs.filter((tech) => !/computer/i.test(tech.stackId)).map((tech, index) => {
          const scanChoice = scanTechChoiceIndexes.get(tech.stackId);
          return <button key={`${tech.tileId}-${index}`} type="button" title={tech.stackId} className={scanChoice === undefined ? '' : 'is-choice'} disabled={scanChoice === undefined} onClick={() => { if (scanChoice !== undefined) onScanTech(scanChoice); }}><i />{setiTechAbilityFace(scene, tech.stackId, tech.tileId) ? <img src={setiTechAbilityFace(scene, tech.stackId, tech.tileId)} alt="installed technology" /> : tech.stackId.replace(/^seti_tech_stack_/, '').slice(0, 2)}</button>;
        })}
      </div>

      <div className="seti-income-tuck" data-seti-target="income" data-seti-value="income">
        {me.income.map((id, index) => <button key={`${id}-${index}`} type="button" style={{ '--card-index': index } as CSSProperties} onClick={() => onIncomeCard(id)}><SetiCardArt scene={scene} cardId={id} /></button>)}
        <small>INCOME</small>
      </div>

      <div className="seti-mission-strip" data-seti-target="mission" data-seti-value="mission">
        {[...me.missions, ...me.permanentCards, ...me.scoringCards, ...me.completedMissions].map((id, index) => {
          const choices = missionChoices.filter((choice) => choice.cardId === id);
          const claimChoices = choices.filter((choice) => choice.action === 'claim');
          const printedMissionSlots = SETI_PROJECT_CATALOG_BY_ID[id]?.effects.flatMap((effect) => (
            effect.timing === 'triggerable-mission' ? [...effect.slots] : []
          )) ?? [];
          return (
            <div key={`${id}-${index}`} className={`seti-mission-card-wrap ${choices.length ? 'has-hotspots' : ''}`}>
              <button type="button" className={`seti-mission-card ${missionTargets.includes(id) ? 'is-choice' : ''}`} onClick={() => onMissionCard(id)}><SetiCardArt scene={scene} cardId={id} /></button>
              {claimChoices.map((choice, fallbackIndex) => {
                const printedIndex = Math.max(0, printedMissionSlots.findIndex((slot) => slot.id === choice.slotId));
                const slotIndex = printedMissionSlots.length ? printedIndex : fallbackIndex;
                const slotCount = printedMissionSlots.length || claimChoices.length;
                return (
                  <button
                    key={choice.targetId}
                    type="button"
                    className="seti-mission-slot-target"
                    style={{ '--slot-index': slotIndex, '--slot-count': slotCount } as CSSProperties}
                    data-seti-target="mission-slot"
                    data-seti-value={choice.targetId}
                    data-testid={choice.targetId}
                    onClick={() => onMissionChoice(choice.index)}
                    aria-label={`claim printed mission reward ${slotIndex + 1}`}
                  />
                );
              })}
              {choices.filter((choice) => choice.action === 'complete').map((choice) => <button key={choice.targetId} type="button" className="seti-mission-complete-target" data-seti-target="mission-complete" data-seti-value={choice.targetId} data-testid={choice.targetId} onClick={() => onMissionChoice(choice.index)} aria-label="complete this mission" />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectDock({ scene, view, canBuyDeck, deckTarget, rowTargets, onInspect, onDeckBuy }: {
  scene: SetiSceneDef;
  view: SetiUiView;
  canBuyDeck: boolean;
  deckTarget: boolean;
  rowTargets: number[];
  onInspect: (id: string, row: number) => void;
  onDeckBuy: () => void;
}) {
  return (
    <aside className="seti-project-dock seti-glass">
      <div className="seti-dock-label"><span>PROJECT ARRAY</span><small>{view.projectDeckCount} REMAIN</small></div>
      <TactileSurface testId="seti-project-deck" className={`seti-project-deck ${canBuyDeck ? 'is-buyable' : ''} ${deckTarget ? 'is-choice' : ''}`} disabled={!canBuyDeck && !deckTarget} onTap={onDeckBuy} ariaLabel={deckTarget ? 'choose project deck' : 'buy from project deck'}>
        <SetiCardArt scene={scene} cardId="project-back" faceDown />
        <span className="seti-cost-ring">3</span>
      </TactileSurface>
      {view.projectRow.map((id, row) => (
        <TactileSurface key={`${id}-${row}`} className={`seti-dock-card ${view.legal.buyableRow.includes(row) ? 'is-buyable' : ''} ${rowTargets.includes(row) ? 'is-choice' : ''}`} onTap={() => onInspect(id, row)} ariaLabel={rowTargets.includes(row) ? `choose project card ${row + 1}` : `inspect project card ${row + 1}`}>
          <SetiCardArt scene={scene} cardId={id} />
        </TactileSurface>
      ))}
    </aside>
  );
}

function HandRail({ scene, me, playable, cornerCards, pendingCards, pendingSelectedCards, exchange, moveCardId, movePaymentCards, expanded, onToggleExpanded, onCardPress, onCard, onPlayDrop }: {
  scene: SetiSceneDef | null;
  me: SetiUiPlayer;
  playable: string[];
  cornerCards: string[];
  pendingCards: string[];
  pendingSelectedCards: string[];
  exchange: { give: 'credits' | 'energy' | 'cards'; cardIds: string[] } | null;
  moveCardId: string | null;
  movePaymentCards: string[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onCardPress: (id: string) => void;
  onCard: (id: string) => void;
  onPlayDrop: (id: string, kind: string, value: string) => boolean;
}) {
  const cards = [...me.hand, ...me.alienHand, ...me.hiddenExertian];
  const handGroups = [
    { label: 'PROJECT', count: me.hand.length },
    { label: 'ALIEN', count: me.alienHand.length },
    { label: 'EXERTIAN', count: me.hiddenExertian.length },
  ].filter((group) => group.count > 0);
  const groupBreaks = [me.hand.length, me.hand.length + me.alienHand.length].filter((index) => index > 0 && index < cards.length);
  return (
    <footer className={`seti-hand-rail seti-glass ${expanded ? 'is-expanded' : ''}`}>
      <div className="seti-hand-label"><small>MISSION HAND</small><b>{cards.length}</b><button type="button" className="seti-hand-expand" onClick={onToggleExpanded} aria-label={expanded ? 'collapse whole hand' : 'view whole hand'} aria-pressed={expanded}><SetiIcon name="card" /><span>{expanded ? 'CLOSE' : 'FAN'}</span></button></div>
      <div className="seti-hand-cards">
        {expanded && <div className="seti-hand-groups" aria-hidden="true">{handGroups.map((group) => <span key={group.label} style={{ flexGrow: group.count }}><b>{group.count}</b>{group.label}</span>)}</div>}
        {cards.map((id, index) => {
          const offset = index - (cards.length - 1) / 2;
          const cardGap = expanded ? Math.min(92, 760 / Math.max(1, cards.length - 1)) : Math.min(68, 560 / Math.max(1, cards.length - 1));
          const totalGroupGap = expanded ? groupBreaks.length * 28 : 0;
          const groupShift = expanded ? groupBreaks.filter((boundary) => index >= boundary).length * 28 - totalGroupGap / 2 : 0;
          const selected = exchange?.give === 'cards' && exchange.cardIds.includes(id);
          const pendingSelected = pendingSelectedCards.includes(id);
          return (
            <TactileSurface
              key={`${id}-${index}`}
              testId={`seti-hand-card-${index}`}
              className={`seti-hand-card ${me.alienHand.includes(id) || me.hiddenExertian.includes(id) ? 'is-alien' : ''} ${playable.includes(id) ? 'is-playable' : ''} ${cornerCards.includes(id) ? 'has-corner' : ''} ${movePaymentCards.includes(id) ? 'is-move-option' : ''} ${pendingCards.includes(id) ? 'is-choice' : ''} ${pendingSelected ? 'is-pending-selected' : ''} ${selected ? 'is-exchange-selected' : ''} ${moveCardId === id ? 'is-move-payment' : ''}`}
              style={{ '--hand-x': `${offset * cardGap + groupShift}px`, '--hand-r': `${offset * 1.7}deg`, '--hand-z': index } as CSSProperties}
              onPress={() => onCardPress(id)}
              onTap={() => onCard(id)}
              onDrop={(kind, value) => onPlayDrop(id, kind, value)}
              ariaLabel={`inspect hand card ${index + 1}`}
            >
              <span className="seti-hand-transform">
                <SetiCardArt scene={scene} cardId={id} />
                {(selected || pendingSelected) && <i className="seti-selection-notch" />}
              </span>
            </TactileSurface>
          );
        })}
      </div>
    </footer>
  );
}

function ExchangeTray({ exchange, color, choosingSource, onReceive, onClose }: {
  exchange: { give: 'credits' | 'energy' | 'cards'; cardIds: string[] };
  color: string;
  choosingSource: boolean;
  onReceive: (receive: 'card' | 'credit' | 'energy') => void;
  onClose: () => void;
}) {
  const ready = exchange.give !== 'cards' || exchange.cardIds.length === 2;
  return (
    <div className="seti-exchange-tray seti-glass">
      <button type="button" className="seti-close" onClick={onClose} aria-label="cancel exchange"><SetiIcon name="close" /></button>
      <small>{exchange.give === 'cards' ? `${exchange.cardIds.length} / 2 CARDS SELECTED` : `2 ${exchange.give.toUpperCase()} SELECTED`}</small>
      <b>{choosingSource ? 'TOUCH A PHYSICAL CARD SOURCE' : 'TOUCH WHAT YOU NEED'}</b>
      {!choosingSource && <div>
        <button type="button" disabled={!ready} onClick={() => onReceive('card')}><SetiIcon name="card" /><span>CARD</span></button>
        <button type="button" disabled={!ready} onClick={() => onReceive('credit')}><img src={`/seti/tokens/credit-${color.toLowerCase()}.webp`} alt="" /><span>CREDIT</span></button>
        <button type="button" disabled={!ready} onClick={() => onReceive('energy')}><img src={`/seti/tokens/energy-${color.toLowerCase()}.webp`} alt="" /><span>ENERGY</span></button>
      </div>}
    </div>
  );
}

function CardCloseup({ scene, card, view, pending, cornerCards, onClose, onPlay, onCorner, onBuy, onInitialIncome, onPending, onPendingRow, onCompleteAlien, onDeliverSample, pendingSelected }: {
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
  onCompleteAlien: () => void;
  onDeliverSample: () => void;
  pendingSelected: boolean;
}) {
  const canPlay = card.origin === 'hand' && view.legal.playableCards.includes(card.id);
  const canCorner = card.origin === 'hand' && cornerCards.includes(card.id);
  const canBuy = card.origin === 'row' && card.row !== undefined && view.legal.buyableRow.includes(card.row);
  const canIncome = card.origin === 'hand' && /initial[-_]income/i.test(pending?.kind ?? '');
  const canPending = card.origin === 'pending' && card.pendingIndex !== undefined;
  const canPendingRow = card.origin === 'pending-row' && card.row !== undefined;
  const alienMission = SETI_ALIEN_CARDS_BY_ID[card.id]?.mission;
  const canCompleteAlien = card.origin === 'mission' && alienMission?.kind === 'conditional' && !pending;
  const canDeliverSample = card.origin === 'mission' && alienMission?.kind === 'delivery' && !pending;
  return (
    <div className="seti-modal-layer seti-card-modal" onPointerDown={onClose}>
      <section className="seti-card-closeup" data-testid="seti-card-closeup" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="seti-close" onClick={onClose} aria-label="close card"><SetiIcon name="close" /></button>
        <SetiCardArt scene={scene} cardId={card.id} />
        {(canPlay || canCorner || canBuy || canIncome || canPending || canPendingRow || canCompleteAlien || canDeliverSample) && (
          <div className="seti-card-commit seti-glass">
            {canPlay && <button type="button" onClick={onPlay}><SetiIcon name="card" /><span>PLAY MAIN</span></button>}
            {canCorner && <button type="button" onClick={onCorner}><span className="seti-corner-mark" /><span>USE CORNER</span></button>}
            {canBuy && <button type="button" onClick={onBuy}><span className="seti-cost-ring">3</span><span>BUY PROJECT</span></button>}
            {canIncome && <button type="button" onClick={onInitialIncome}><SetiIcon name="card" /><span>TUCK FOR INCOME</span></button>}
            {canPending && <button type="button" onClick={onPending}><SetiIcon name="card" /><span>{pendingSelected ? 'UNMARK CARD' : pendingPick(pending) > 1 ? 'MARK CARD' : 'SELECT CARD'}</span></button>}
            {canPendingRow && <button type="button" onClick={onPendingRow}><SetiIcon name="scan" /><span>USE FOR SIGNAL</span></button>}
            {canCompleteAlien && <button type="button" onClick={onCompleteAlien}><SetiIcon name="analyze" /><span>COMPLETE MISSION</span></button>}
            {canDeliverSample && <button type="button" onClick={onDeliverSample}><SetiIcon name="probe" /><span>SELECT CAPSULE</span></button>}
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

function PendingDecision({ scene, view, me, chosen, onToggle, onCommit, onInspectCard, pendingRow, presentation, onInspectRow, onLayer }: {
  scene: SetiSceneDef | null;
  view: SetiUiView;
  me: SetiUiPlayer;
  chosen: number[];
  onToggle: (index: number, pick: number) => void;
  onCommit: (indexes: number[]) => void;
  onInspectCard: (id: string, index: number) => void;
  pendingRow: number | null;
  presentation: SetiPendingPresentation;
  onInspectRow: (id: string, row: number) => void;
  onLayer: (layer: Layer) => void;
}) {
  const pending = view.pending!;
  const mine = pending.owner < 0 || pending.owner === me.seat;
  const artifactModel = setiPendingArtifactModel(view, pending);
  const pick = pendingPick(pending);
  const cardOptions = pending.options.every((option) => optionCardId(option));
  const rowOptions = Array.isArray(pending.raw.rowOptions) ? pending.raw.rowOptions.map(Number).filter(Number.isInteger) : [];
  const presentationLayer: Layer | null = pending.kind === 'computer-tech-slot' ? 'personal' : /signal|sector|tech|trace|moon|planet|alien-card-source/i.test(pending.kind)
    || presentation.pieceIndexes.size
    || presentation.cellIndexes.size
    || presentation.sectorIndexes.size
    || presentation.rowIndexes.size
    || presentation.bodyChoices.length
    || presentation.moveChoices.length
    || presentation.sampleChoices.length
    || presentation.projectDeckIndex !== null
    || presentation.alienDeckIndex !== null
    ? 'solar'
    : presentation.cardIndexes.size || presentation.missionIndexes.size ? 'personal' : null;
  useEffect(() => {
    if (presentationLayer) onLayer(presentationLayer);
  }, [pending.kind, presentationLayer, onLayer]);
  if (!mine) return <div className="seti-pending-wait seti-glass"><span className="seti-loader-orbits"><i /><i /><i /></span><div><small>AWAITING DECISION</small><b>{view.players.find((player) => player.seat === pending.owner)?.name ?? 'AGENCY'}</b></div></div>;
  if (artifactModel) return <SetiPendingArtifacts scene={scene} view={view} pending={pending} onChoose={(index) => onCommit([index])} />;

  const directCue = pending.kind === 'signal-sector'
    ? rowOptions.length > 0 && pendingRow === null ? 'TOUCH OR DRAG A PROJECT CARD' : 'TOUCH THE GLOWING STAR SECTOR'
    : pending.kind === 'tech-stack' ? 'TOUCH A GLOWING TECH TILE'
    : pending.kind === 'computer-tech-slot' ? 'TOUCH A GLOWING COMPUTER POSITION'
    : pending.kind === 'completed-sector-order' ? 'TOUCH A COMPLETED STAR SECTOR'
    : pending.kind === 'card-effect-choice' && /launch bay|telescope.tech action/i.test(pending.prompt) ? 'TOUCH THE LAUNCH BAY OR ONE OF YOUR PROBES'
    : setiPendingCue(presentation, pending);
  if (directCue) {
    return <div className={`seti-direct-cue seti-glass ${presentation.finishIndexes.length || pick > 1 ? 'has-actions' : ''}`}><SetiIcon name={/tech/i.test(pending.kind) ? 'research' : /card|mission/i.test(directCue) ? 'card' : 'scan'} /><b>{directCue}</b>{pick > 1 && <span>{chosen.length} / {pick}</span>}{presentation.finishIndexes.map((index) => <button key={index} type="button" onClick={() => onCommit([index])}>{optionLabel(pending.options[index], index)}</button>)}{pick > 1 && <button type="button" disabled={chosen.length !== pick} onClick={() => onCommit(chosen)}>CONFIRM</button>}</div>;
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
  return Math.max(1, Number(pending.raw.pick ?? pending.raw.count ?? pending.raw.required ?? pending.raw.max ?? pending.raw.min ?? 1));
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
  if (/computer-tech-slot/.test(kind)) return { kind: 'number', value: Number(firstRecord.value ?? firstRecord.id ?? first) };
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
