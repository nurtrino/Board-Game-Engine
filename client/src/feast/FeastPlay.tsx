import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from 'react';
import type {
  FeastAction,
  FeastActionSpaceView,
  FeastBoardDefinition,
  FeastBoardState,
  FeastDecisionChoice,
  FeastPhase,
  FeastOccupationOperation,
  FeastPlacement,
  FeastPlayerView,
  FeastPrintedEffect,
  FeastSeatColor,
  FeastView,
} from '@bge/shared';
import {
  FEAST_BOARD_BY_ID,
  FEAST_GOOD_BY_ID,
  FEAST_GOODS,
  FEAST_OCCUPATIONS,
  FEAST_OCCUPATION_BY_ID,
  FEAST_OCCUPATION_RULES,
  FEAST_SPECIAL_BY_ID,
  feastIncomeForBoard,
  feastMaskCells,
  feastPieceSpec,
  feastPlacementPreviewError,
  feastRotateMask,
} from '@bge/shared';
import { GameIntro } from '../ttr/GameIntro';
import { FEAST_INTRO } from './FeastIntro';
import { FeastCardDialog, FeastOccupationCard, occupationFaceStyle } from './FeastCard';
import { FeastLessons } from './FeastLessons';
import { useFeastScene, type FeastGridCalibration, type FeastScene } from './FeastScene';
import { FEAST_TUTORIAL, type FeastTutorialMode } from './FeastTutorial';
import { FeastTourOverlay } from './FeastTourOverlay';
import './feast.css';

const SEAT_HEX: Record<FeastSeatColor, string> = {
  Red: '#b64b40',
  Blue: '#3f7998',
  Green: '#5e8963',
  Purple: '#785f8d',
};

const PHASE_LABEL: Record<FeastPhase, string> = {
  new_viking: 'NEW VIKING',
  harvest: 'HARVEST',
  exploration: 'EXPLORATION BOARDS',
  weapon: 'DRAW WEAPON',
  actions: 'VIKING ACTIONS',
  start_player: 'START PLAYER',
  income: 'INCOME',
  breeding: 'ANIMAL BREEDING',
  feast: 'FEAST',
  bonus: 'BONUS',
  mountains: 'MOUNTAIN STRIPS',
  return_vikings: 'RETURN VIKINGS',
  ended: 'SAGA COMPLETE',
};

const PIECE_COLOR: Record<string, string> = {
  orange: '#c99550', red: '#b85e4c', green: '#63836a', blue: '#477c94',
  silver: '#d3d6d2', ore: '#555d60', wood: '#855d3e', stone: '#8b8980',
};

type Mode = FeastTutorialMode;

function titleCase(value: string) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function amountText(item: { kind: string; id?: string; amount: number }) {
  return `${item.amount} ${titleCase(item.id ?? item.kind)}`;
}

function occupationQuantityText(quantity: unknown): string {
  if (typeof quantity === 'number') return String(quantity);
  if (!quantity || typeof quantity !== 'object') return 'dynamic';
  const value = quantity as { kind?: string; metric?: string; field?: string };
  return value.kind === 'round' ? 'round-based'
    : value.kind === 'player-count' ? 'player-count'
      : value.kind === 'event' ? `event ${titleCase(value.field ?? 'amount')}`
        : value.metric ? titleCase(value.metric) : 'dynamic';
}

function occupationItemsText(items: readonly { item: string; id?: string; quantity: unknown }[]): string {
  return items.map((item) => `${occupationQuantityText(item.quantity)} ${titleCase(item.id ?? item.item)}`).join(' + ');
}

function occupationImpact(operations: readonly FeastOccupationOperation[]): { tone: string; label: string; detail: string }[] {
  return operations.flatMap((operation): { tone: string; label: string; detail: string }[] => {
    switch (operation.kind) {
      case 'transfer': return [{ tone: operation.mode === 'gain' ? 'gain' : 'pay', label: operation.mode.toUpperCase(), detail: occupationItemsText(operation.items) }];
      case 'exchange': return [{ tone: 'exchange', label: 'EXCHANGE', detail: `${occupationItemsText(operation.from)} → ${occupationItemsText(operation.to)}` }];
      case 'choice': return [{ tone: 'choice', label: `CHOOSE ${operation.min}-${operation.max}`, detail: operation.options.map((option) => titleCase(option.id)).join(' · ') }];
      case 'grant-action': return [{ tone: 'action', label: 'EXTRA ACTION', detail: titleCase(operation.action) }];
      case 'move': return [{ tone: 'move', label: 'MOVE', detail: `${occupationQuantityText(operation.subject.quantity)} ${titleCase(operation.subject.id ?? operation.subject.item)} · ${titleCase(operation.from)} → ${titleCase(operation.to)}` }];
      case 'draw-weapons': return [{ tone: 'gain', label: 'DRAW', detail: `${occupationQuantityText(operation.quantity)} weapon cards` }];
      case 'phase': return [{ tone: 'action', label: 'PRIVATE PHASE', detail: titleCase(operation.phase) }];
      case 'return-workers': return [{ tone: 'move', label: 'RETURN VIKINGS', detail: occupationQuantityText(operation.quantity) }];
      case 'discount': return [{ tone: 'gain', label: 'DISCOUNT', detail: `${occupationQuantityText(operation.amount)} from ${titleCase(operation.target)}` }];
      case 'modify-die': return [{ tone: 'choice', label: 'DIE MODIFIER', detail: `${operation.delta > 0 ? '+' : ''}${operation.delta} · ${operation.actions.map(titleCase).join(', ')}` }];
      case 'replace': return [{ tone: 'exchange', label: `REPLACE ${titleCase(operation.target)}`, detail: occupationImpact(operation.replacement).map((entry) => `${entry.label} ${entry.detail}`).join(' · ') }];
      case 'modify-rule': return [{ tone: 'choice', label: 'RULE CHANGE', detail: titleCase(operation.rule) }];
      case 'score': return [{ tone: 'gain', label: 'SCORE', detail: `${occupationQuantityText(operation.amount)} ${operation.currency}` }];
    }
  }).slice(0, 6);
}

function decodedOccupationOptionValue(id: string): string {
  const parts = id.split(':');
  if (parts[0] !== 'occ' || parts.length < 5) return id;
  try { return decodeURIComponent(parts.slice(4).join(':')); } catch { return id; }
}

function effectCopy(effect: FeastPrintedEffect): { title: string; detail: string } {
  switch (effect.kind) {
    case 'gain': return { title: 'GAIN', detail: effect.items.map(amountText).join(', ') };
    case 'pay': return { title: effect.optional ? 'MAY PAY' : 'PAY', detail: effect.items.map(amountText).join(', ') };
    case 'build': return { title: 'BUILD', detail: titleCase(effect.building) };
    case 'ship': return { title: effect.mode === 'gain' ? 'BUILD SHIP' : 'EXCHANGE SHIP', detail: titleCase(effect.ship) };
    case 'choose': return { title: `CHOOSE ${effect.min}${effect.max !== effect.min ? `-${effect.max}` : ''}`, detail: effect.options.map((option) => option.label).join(' or ') };
    case 'die': return { title: `${effect.rule.sides}-SIDED ${effect.rule.direction.toUpperCase()} ROLL`, detail: `${titleCase(effect.rule.kind)}; up to ${effect.rule.maxRolls} rolls. The decision panel shows every modifier and failure reward.` };
    case 'mountain': return { title: 'TAKE MOUNTAIN ITEMS', detail: effect.allowances.join(' + ') };
    case 'upgrade': return { title: `${effect.steps === 2 ? 'DOUBLE-' : ''}UPGRADE`, detail: `Up to ${effect.count} good${effect.count === 1 ? '' : 's'}` };
    case 'overseas-trade': return { title: 'OVERSEAS TRADING', detail: 'Flip different green goods to their blue sides.' };
    case 'special-sale': return { title: 'SPECIAL SALE', detail: `Buy up to ${effect.max} available special tiles.` };
    case 'explore': return { title: 'EXPLORE', detail: effect.faces.map(titleCase).join(', ') };
    case 'emigrate': return { title: 'EMIGRATE', detail: effect.exchangeWhaling ? 'You may exchange a whaling boat first.' : 'Pay the round number and retire one large ship.' };
    case 'occupation': return { title: `${effect.mode.toUpperCase()} OCCUPATION`, detail: `${effect.min}-${effect.max} card${effect.max === 1 ? '' : 's'}` };
    case 'draw-weapons': return { title: 'DRAW WEAPONS', detail: `${effect.amount} weapon cards` };
    case 'conditional-production': return { title: 'PRODUCE', detail: `Up to ${effect.max} ${titleCase(effect.good)}, based on ${effect.animal}` };
    case 'weekly-four': return { title: 'WEEKLY MARKET', detail: 'Resolve the four printed livestock-market choices.' };
    case 'forge': return { title: 'FORGE', detail: 'Choose an eligible special tile or jewelry.' };
    case 'plunder': return { title: 'PLUNDER', detail: 'Resolve the printed two-longship plundering action.' };
  }
}

function boardDefinition(board: FeastBoardState): FeastBoardDefinition {
  const exact = FEAST_BOARD_BY_ID[board.definitionId];
  if (exact) return exact;
  return {
    id: board.definitionId,
    name: titleCase(board.definitionId),
    kind: board.kind,
    faceCode: board.definitionId,
    rows: 9,
    cols: 12,
    layout: Array.from({ length: 9 }, () => '#'.repeat(12)),
    points: 0,
    negativeCells: [], incomeTracks: [], bonuses: [], designatedResources: [],
  };
}

function boardVisual(scene: FeastScene, board: FeastBoardState): { image?: string; imagePx?: [number, number]; grid?: FeastGridCalibration } {
  if (board.kind === 'home') {
    const asset = board.definitionId.includes('short') ? scene.homeBoards.short : scene.homeBoards.long;
    return { image: asset.image, imagePx: asset.imagePx, grid: asset.grid };
  }
  if (board.kind === 'exploration') {
    const asset = scene.exploration[board.definitionId];
    return { image: asset?.image, imagePx: asset?.imagePx ?? [1000, 1000], grid: asset?.grid };
  }
  const asset = scene.buildings[board.definitionId];
  return { image: asset?.front, imagePx: asset?.imagePx, grid: asset?.grid };
}

function placementArt(scene: FeastScene, placement: FeastPlacement) {
  if (placement.pieceKind === 'good') return scene.goods[placement.pieceId]?.front;
  if (placement.pieceKind === 'special') return scene.specials[placement.pieceId]?.image;
  return null;
}

function Piece({ scene, placement, def, grid, ghost, invalid }: { scene: FeastScene; placement: FeastPlacement; def: FeastBoardDefinition; grid?: FeastGridCalibration; ghost?: boolean; invalid?: boolean }) {
  const width = Math.max(...placement.mask.map((row) => row.length));
  const height = placement.mask.length;
  const art = placementArt(scene, placement);
  const origin = grid?.normalizedOrigin ?? [0, 0];
  const cell = grid?.normalizedCell ?? [1 / def.cols, 1 / def.rows];
  const style: CSSProperties = {
    left: `${(origin[0] + placement.x * cell[0]) * 100}%`,
    top: `${(origin[1] + placement.y * cell[1]) * 100}%`,
    width: `${width * cell[0] * 100}%`,
    height: `${height * cell[1] * 100}%`,
    background: art ? undefined : PIECE_COLOR[placement.color],
  };
  const turned = placement.rotation === 90 || placement.rotation === 270;
  return <span className={`ft-placement${art ? '' : ' ft-placement-token'}${ghost ? ' ghost' : ''}${invalid ? ' invalid' : ''}`} style={style} title={titleCase(placement.pieceId)}>
    {art && <img src={art} alt={titleCase(placement.pieceId)} style={turned ? { width: `${(height / width) * 100}%`, height: `${(width / height) * 100}%`, transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)` } : { transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)` }} />}
  </span>;
}

function occupiedCells(board: FeastBoardState) {
  return new Set(board.placements.flatMap((placement) => placement.covered.map((cell) => `${cell.x},${cell.y}`)));
}

function PendingDecision({ view, scene, act }: { view: FeastView; scene: FeastScene; act: (action: FeastAction) => void }) {
  const pending = view.pending;
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState(0);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [allocationOrder, setAllocationOrder] = useState<string[]>([]);
  const pendingResetKey = pending ? JSON.stringify({
    id: pending.id,
    kind: pending.kind,
    min: pending.min,
    max: pending.max,
    options: pending.options.map((option) => [option.id, option.label, option.disabled, option.value]),
    stage: pending.meta?.stage,
    result: pending.meta?.result,
    repeatMax: pending.meta?.repeatMax,
    requirement: pending.meta?.requirement,
    requiredCount: pending.meta?.requiredCount,
    count: pending.meta?.count,
    allocationOptionIds: pending.meta?.allocationOptionIds,
  }) : 'none';
  useEffect(() => {
    const repeatEffect = pending?.kind === 'card-effect' && typeof pending.meta?.repeatMax === 'number' && pending.meta.repeatMax > 0;
    const requiredEffect = String(pending?.meta?.requirement ?? 'mandatory') === 'mandatory';
    setSelected([]);
    setAllocations({});
    setAllocationOrder([]);
    setAmount(pending?.min ?? (repeatEffect && requiredEffect ? 1 : 0));
  }, [pendingResetKey]);
  if (!pending || pending.seat !== view.you || pending.kind === 'feast' || pending.kind === 'final-placement') return null;
  const min = pending.min ?? (pending.options.length ? 1 : 0);
  const max = pending.max ?? (pending.options.length ? 1 : 0);
  const mode = String(pending.meta?.mode ?? '');
  const cardEffect = pending.kind === 'card-effect';
  const sourceCardId = cardEffect && typeof pending.meta?.cardId === 'string' ? pending.meta.cardId : null;
  const sourceCard = sourceCardId ? FEAST_OCCUPATION_BY_ID[sourceCardId] : undefined;
  const sourceRule = sourceCardId && sourceCardId in FEAST_OCCUPATION_RULES
    ? FEAST_OCCUPATION_RULES[sourceCardId as keyof typeof FEAST_OCCUPATION_RULES] : undefined;
  const sourceClause = sourceRule?.clauses.find((clause) => clause.id === pending.meta?.clauseId);
  const impact = sourceClause ? occupationImpact(sourceClause.operations) : [];
  const targetKind = String(pending.meta?.targetKind ?? '');
  const visualTargetBoards = cardEffect && (targetKind === 'board' || targetKind === 'placement')
    ? view.players[view.you!].boards.filter((board) => pending.options.some((option) => {
      const value = decodedOccupationOptionValue(option.id);
      return value.includes(board.id) || option.label.toLocaleLowerCase().includes(boardDefinition(board).name.toLocaleLowerCase());
    })) : [];
  const requirement = cardEffect ? String(pending.meta?.requirement ?? (min === 0 ? 'optional' : 'mandatory')) : 'mandatory';
  const mandatoryEffect = !cardEffect || requirement === 'mandatory';
  const requirementLabel = mandatoryEffect
    ? 'MANDATORY EFFECT'
    : requirement === 'choice' ? 'OPTIONAL CHOICE'
      : requirement === 'replacement' ? 'OPTIONAL REPLACEMENT'
        : 'OPTIONAL EFFECT';
  const rawRepeatMax = cardEffect && typeof pending.meta?.repeatMax === 'number' ? pending.meta.repeatMax : 0;
  const repeatMax = rawRepeatMax > 0 ? rawRepeatMax : null;
  const repeatMin = repeatMax === null ? null : mandatoryEffect ? Math.min(1, repeatMax) : 0;
  const mountain = pending.kind === 'mountain';
  const upgrade = pending.kind === 'goods' && mode === 'upgrade';
  const dieSpend = pending.kind === 'die' && pending.meta?.stage === 'spend';
  const splitLoot = pending.kind === 'die-spend' && Number(pending.meta?.lootSplit ?? 1) > 1;
  const lowDie = dieSpend && /HUNT|SNARE|WHAL/i.test(pending.label);
  const paidOccupation = pending.kind === 'occupation' && Array.isArray(pending.meta?.payment);
  const occupationAllocationIds = cardEffect && Array.isArray(pending.meta?.allocationOptionIds)
    ? pending.meta.allocationOptionIds.filter((id): id is string => typeof id === 'string') : [];
  const occupationAllocationIdSet = new Set(occupationAllocationIds);
  const occupationAllocation = occupationAllocationIds.length > 0;
  const occupationRequiredCount = occupationAllocation && typeof pending.meta?.requiredCount === 'number'
    ? Math.max(0, pending.meta.requiredCount) : 0;
  const occupationAllocationLimit = occupationRequiredCount > 0 ? occupationRequiredCount : max;
  const allocationChoice = mountain || upgrade || occupationAllocation || splitLoot;
  const allocationEntries = Object.entries(allocations).filter(([, value]) => value > 0).map(([id, value]) => ({ id, amount: value }));
  const allocationTotal = allocationEntries.reduce((total, entry) => total + entry.amount, 0);
  const toggle = (id: string) => {
    setSelected((current) => current.includes(id)
      ? current.filter((entry) => entry !== id)
      : max === 1 ? [id] : [...current, id].slice(-max));
  };
  const setAllocation = (id: string, next: number, cap: number) => {
    const value = Math.max(0, Math.min(cap, next));
    setAllocations((current) => ({ ...current, [id]: value }));
    setAllocationOrder((current) => value > 0 ? (current.includes(id) ? current : [...current, id]) : current.filter((entry) => entry !== id));
  };
  const command = selected[0];
  const allocationFor = (id: string) => allocations[id] ?? 0;
  const lowWeaponId = /SNARE/i.test(pending.label) ? 'snare' : /WHAL/i.test(pending.label) ? 'spear' : 'bow';
  const weightedPayment = lowDie
    ? allocationFor('wood') + allocationFor(lowWeaponId) * Number(pending.meta?.weaponValue ?? 1)
    : allocationFor('stone') * Number(pending.meta?.stoneValue ?? 1)
      + allocationFor('long-sword') + allocationFor('spear');
  const diePaymentValid = !dieSpend || command !== 'resolve' || !lowDie || weightedPayment === Number(pending.meta?.result ?? 0);
  const battleResultValid = !dieSpend || command !== 'resolve' || lowDie || Number(pending.meta?.result ?? 0) + weightedPayment > 5;
  const occupationPaymentValid = !paidOccupation || selected.length === 0 || allocationTotal === 1;
  const allocationValid = mountain ? allocationTotal >= min && allocationTotal <= max && allocationEntries.length <= ((pending.meta?.allowances as number[] | undefined)?.length ?? 0)
    : upgrade ? allocationTotal >= min && allocationTotal <= Number(pending.meta?.count ?? max)
      : splitLoot ? allocationTotal >= 1 && allocationTotal <= max
        && allocationEntries.reduce((sum, entry) => sum + Number(pending.options.find((option) => option.id === entry.id)?.value ?? Infinity) * entry.amount, 0) <= Number(pending.meta?.result ?? 0)
      : occupationAllocation ? occupationRequiredCount > 0
        ? allocationTotal === 1 || allocationTotal === occupationRequiredCount
        : allocationTotal >= min && allocationTotal <= max
      : true;
  const amountOnly = pending.options.length === 0 && max > 0;
  const optionValid = allocationChoice
    ? allocationValid
    : amountOnly ? amount >= min && amount <= max
      : selected.length >= min && selected.length <= max && diePaymentValid && battleResultValid && occupationPaymentValid;
  const repeatValid = repeatMax === null || (amount >= (repeatMin ?? 0) && amount <= repeatMax);
  const valid = optionValid && repeatValid;
  const submit = (choice?: FeastDecisionChoice) => act({
    type: 'resolve_decision',
    decisionId: pending.id,
    choice: choice ?? {
      optionIds: occupationAllocation ? [] : allocationChoice ? allocationEntries.map((entry) => entry.id) : selected,
      allocations: allocationEntries,
      amount,
      ...(cardEffect ? { accepted: true } : {}),
    },
  });
  const diePaymentOptions = lowDie
    ? [{ id: 'wood', label: 'WOOD', cap: Number(pending.meta?.wood ?? 0), value: 1 }, {
      id: lowWeaponId, label: /SNARE/i.test(pending.label) ? 'SNARES' : /WHAL/i.test(pending.label) ? 'SPEARS' : 'BOWS',
      cap: Number(pending.meta?.weapon ?? 0), value: Number(pending.meta?.weaponValue ?? 1),
    }]
    : [
      { id: 'stone', label: 'STONE', cap: Number(pending.meta?.stone ?? 0), value: Number(pending.meta?.stoneValue ?? 1) },
      { id: 'long-sword', label: 'LONG SWORDS', cap: Number(pending.meta?.weapon ?? 0), value: 1 },
      ...(pending.meta?.spearSubstitution === true
        ? [{ id: 'spear', label: 'SPEARS (MELEE FIGHTER)', cap: Number(pending.meta?.spears ?? 0), value: 1 }]
        : []),
    ];
  const allocationControl = (id: string, label: string, cap: number, detail?: string, disabled = false, incrementDisabled = false) => {
    const value = allocations[id] ?? 0;
    return <div className="ft-allocation" key={id} role="group" aria-label={`${label} allocation`}><div><b>{label}</b><span>{detail ?? `${cap} available`}</span></div><div><button type="button" aria-label={`Remove one ${label}`} disabled={disabled || value <= 0} onClick={() => setAllocation(id, value - 1, cap)}>−</button><strong><output aria-label={`${label} allocated`} aria-live="polite">{value}</output></strong><button type="button" aria-label={`Add one ${label}`} disabled={disabled || value >= cap || incrementDisabled} onClick={() => setAllocation(id, value + 1, cap)}>+</button></div></div>;
  };
  return (
    <div className="ft-decision-backdrop" data-testid="feast-decision" data-feast-tour="decision" role="dialog" aria-modal="true" aria-label={pending.label}>
      <section className={`ft-decision${cardEffect && sourceCard ? ' ft-card-effect-decision' : ''}`}>
        {sourceCard && <aside className="ft-card-effect-source" data-testid="feast-card-effect-source" data-card-id={sourceCard.id}>
          <div className="ft-card-effect-art"><i style={occupationFaceStyle(scene, sourceCard)} role="img" aria-label={`${sourceCard.name} occupation card`} /></div>
          <div className="ft-card-effect-copy">
            <span className="ft-kicker">AUTHENTIC OCCUPATION · CARD {sourceCard.number}</span>
            <h3>{sourceCard.name}</h3>
            <span className={`ft-card-type ${sourceCard.type}`}>{sourceCard.type.replaceAll('-', ' ').toUpperCase()}</span>
            <div><b>OFFICIAL CLARIFICATION</b><p>{sourceCard.clarification}</p></div>
            {typeof pending.meta?.clauseId === 'string' && <small>RULE: {titleCase(pending.meta.clauseId)}</small>}
          </div>
        </aside>}
        <div className="ft-decision-body">
          <span className={`ft-kicker${cardEffect ? mandatoryEffect ? ' mandatory' : ' optional' : ''}`}>{cardEffect ? `OCCUPATION EFFECT · ${requirementLabel}` : `${titleCase(pending.kind)} · REQUIRED DECISION`}</span>
          <h2>{pending.label}</h2>
          <p>{pending.prompt}</p>
          {impact.length > 0 && <div className="ft-effect-impact" aria-label="Visual before and after effect summary"><span>THIS CARD WILL</span><div>{impact.map((entry, index) => <article className={entry.tone} key={`${entry.label}-${index}`}><b>{entry.label}</b><strong>{entry.detail}</strong></article>)}</div></div>}
          {visualTargetBoards.length > 0 && <div className="ft-decision-board-targets"><span>HIGHLIGHTED LEGAL BOARDS</span><div>{visualTargetBoards.map((board) => { const visual = boardVisual(scene, board); return <article key={board.id}><div>{visual.image && <img src={visual.image} alt={boardDefinition(board).name} />}</div><b>{boardDefinition(board).name}</b><small>{board.placements.length} PLACED TILES</small></article>; })}</div></div>}
          {typeof pending.meta?.result === 'number' && (
            <div className="ft-die-result"><span>DIE RESULT</span><b>{pending.meta.result}</b><small>{pending.meta.sides ? `D${pending.meta.sides}` : ''}</small></div>
          )}
          {occupationAllocation && <div className="ft-allocation-guide" role="status" aria-live="polite"><b>ALLOCATE THE CARD EFFECT</b><span>{occupationRequiredCount > 1 ? `Choose 1 of one type to use it for all ${occupationRequiredCount}, or allocate exactly ${occupationRequiredCount} individual items.` : `Allocated ${allocationTotal} of ${occupationAllocationLimit}.`}</span><strong>{allocationTotal}/{occupationAllocationLimit}</strong></div>}
          <div className={`ft-decision-options${allocationChoice ? ' allocations' : ''}${pending.kind === 'occupation' || pending.kind === 'setup-occupation' ? ' cards' : ''}`}>
            {pending.options.map((option) => {
              const on = selected.includes(option.id);
              if (mountain) {
                const order = allocationOrder.indexOf(option.id);
                const allowances = (pending.meta?.allowances as number[] | undefined) ?? [];
                const cap = order >= 0 ? allowances[order] ?? 0 : allowances[allocationOrder.length] ?? 0;
                return allocationControl(option.id, option.label, Math.min(cap, Number(option.detail?.split(',').length ?? cap)), order >= 0 ? `ALLOWANCE ${order + 1} · UP TO ${cap}` : option.detail);
              }
              if (upgrade) {
                const available = Number(option.detail?.match(/\d+/)?.[0] ?? pending.max ?? 1);
                const remaining = Math.max(0, Number(pending.meta?.count ?? max) - allocationTotal + (allocations[option.id] ?? 0));
                return allocationControl(option.id, option.label, Math.min(available, remaining), option.detail);
              }
              if (splitLoot) {
                const cap = option.id.startsWith('special:') ? 1 : max;
                const remaining = Math.max(0, max - allocationTotal + (allocations[option.id] ?? 0));
                return allocationControl(option.id, option.label, Math.min(cap, remaining), option.detail);
              }
              if (occupationAllocation && occupationAllocationIdSet.has(option.id)) {
                const cap = Number.isSafeInteger(option.value) ? Math.max(0, Number(option.value)) : 1;
                const detail = option.disabled
                  ? option.reason ?? 'Unavailable'
                  : `${option.detail ? `${option.detail} · ` : ''}${cap} available`;
                return allocationControl(option.id, option.label, cap, detail, option.disabled, allocationTotal >= occupationAllocationLimit);
              }
              const occupation = (pending.kind === 'occupation' || pending.kind === 'setup-occupation') ? FEAST_OCCUPATION_BY_ID[option.id] : undefined;
              if (occupation) return (
                <button key={option.id} className={`ft-decision-card${on ? ' on' : ''}`} disabled={option.disabled} onClick={() => toggle(option.id)} aria-label={`Select ${occupation.name}`}>
                  <i style={occupationFaceStyle(scene, occupation)} />
                  <span><b>{occupation.name}</b><small>DECK {occupation.deck} · {occupation.points} VP · {occupation.type.replaceAll('-', ' ')}</small></span>
                </button>
              );
              return (
                <button key={option.id} className={`ft-choice${on ? ' on' : ''}`} disabled={option.disabled} onClick={() => toggle(option.id)}>
                  <b>{option.label}</b>
                  <span>{option.disabled ? option.reason ?? 'Unavailable' : option.detail ?? (on ? 'Selected' : 'Select')}</span>
                </button>
              );
            })}
          </div>
          {dieSpend && command === 'resolve' && <div className="ft-allocation-panel"><div className="ft-section-heading"><h3>{lowDie ? `PAY EXACTLY ${pending.meta?.result ?? 0}` : 'OPTIONAL BATTLE MODIFIERS'}</h3><span>{lowDie ? `${weightedPayment}/${pending.meta?.result ?? 0}` : `FINAL RESULT ${Number(pending.meta?.result ?? 0) + weightedPayment}`}</span></div>{diePaymentOptions.map((entry) => allocationControl(entry.id, entry.label, entry.cap, (entry.value ?? 1) > 1 ? `Worth ${entry.value} each with occupation` : undefined))}</div>}
          {paidOccupation && selected.length > 0 && <div className="ft-allocation-panel"><div className="ft-section-heading"><h3>PAY TO PLAY</h3><span>CHOOSE EXACTLY 1</span></div>{(pending.meta?.payment as string[]).map((id) => allocationControl(id, titleCase(id), 1))}</div>}
          {repeatMax !== null && (
            <label className="ft-number-choice"><span>EFFECT REPEATS <small>{mandatoryEffect ? 'Choose how many times to resolve this effect.' : 'Choose zero to decline it.'}</small></span><input type="number" min={repeatMin ?? 0} max={repeatMax} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
          )}
          {repeatMax === null && pending.options.length === 0 && max > 0 && (
            <label className="ft-number-choice"><span>AMOUNT</span><input type="number" min={min} max={max} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
          )}
          <footer className="ft-decision-actions">
            <button className="ft-button primary" disabled={!valid} onClick={() => submit()}>{cardEffect ? 'RESOLVE OCCUPATION' : 'CONFIRM CHOICE'}</button>
            {(min === 0 || (cardEffect && !mandatoryEffect)) && <button className="ft-button" onClick={() => submit({ optionIds: [], accepted: false, amount: 0 })}>SKIP OPTIONAL EFFECT</button>}
            {pending.kind === 'die' && pending.options.length === 0 && <button className="ft-button" onClick={() => submit({ accepted: true })}>ROLL</button>}
          </footer>
        </div>
      </section>
    </div>
  );
}

const FEAST_TABLE_DEF: FeastBoardDefinition = {
  id: 'banquet-table', name: 'Banquet Table', kind: 'home', faceCode: null,
  rows: 4, cols: 12, layout: Array.from({ length: 4 }, () => '#'.repeat(12)), points: 0,
  negativeCells: [], incomeTracks: [], bonuses: [], designatedResources: [],
};

function BanquetTable({ me, scene, length, selectedPiece, rotation, place }: {
  me: FeastPlayerView;
  scene: FeastScene;
  length: 'short' | 'long';
  selectedPiece: string | null;
  rotation: 0 | 90 | 180 | 270;
  place: (x: number, y: number) => void;
}) {
  const required = Math.min(12, me.workersTotal);
  const emigrated = Math.min(required, me.ships.filter((ship) => ship.emigrated).length);
  const covered = new Set(me.feastPlacements.flatMap((placement) => placement.covered.filter((cell) => cell.y === 0).map((cell) => cell.x)));
  const click = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectedPiece) return;
    const rect = event.currentTarget.getBoundingClientRect();
    place(
      Math.max(0, Math.min(11, Math.floor(((event.clientX - rect.left) / rect.width) * 12))),
      3 - Math.max(0, Math.min(3, Math.floor(((event.clientY - rect.top) / rect.height) * 4))),
    );
  };
  const banquetArt = scene.banquetTables?.[length]?.image ?? scene.banquetTables?.default.image;
  return (
    <div className="ft-banquet-shell" data-testid="feast-banquet-table" data-feast-tour="feast">
      <div className="ft-banquet-heading"><span className="ft-kicker">PHASE 9 · THE FEAST</span><h2>FEED THE GREAT HALL</h2><p>Orange may not touch orange. Red may not touch red. Silver separates food. Every open top-row cell becomes a −3 Thing Penalty.</p></div>
      <div className="ft-banquet-table" onClick={click} role="button" tabIndex={0} aria-label="Banquet Table placement grid">
        {banquetArt && <img className="ft-banquet-art" src={banquetArt} alt="Authentic printed Banquet Table" />}
        {Array.from({ length: 48 }, (_, index) => {
          const x = index % 12;
          const visualY = Math.floor(index / 12);
          const requiredRow = visualY === 3;
          const closed = requiredRow && x >= required;
          const ship = requiredRow && x < emigrated;
          const done = requiredRow && covered.has(x);
          return <i key={index} className={`${closed ? 'closed' : ''}${ship ? ' ship' : ''}${done ? ' covered' : ''}`}><span>{requiredRow ? x + 1 : ''}</span></i>;
        })}
        <div className="ft-placement-layer">{me.feastPlacements.map((placement) => {
          const height = placement.mask.length;
          const visualPlacement = { ...placement, y: 3 - placement.y - (height - 1) };
          return <Piece key={placement.id} scene={scene} placement={visualPlacement} def={FEAST_TABLE_DEF} />;
        })}</div>
      </div>
      <div className="ft-banquet-meter"><b>{Math.max(0, required - emigrated - covered.size)} OPEN CELLS</b><span>{me.thingPenalties} EXISTING THING PENALTIES</span>{selectedPiece && <strong>PLACE {titleCase(selectedPiece)} · {rotation}°</strong>}</div>
    </div>
  );
}

function ActionBoard({ view, scene, selected, setSelected, act }: {
  view: FeastView;
  scene: FeastScene;
  selected: string | null;
  setSelected: (id: string) => void;
  act: (action: FeastAction) => void;
}) {
  const space = view.actionSpaces.find((entry) => entry.id === selected) ?? view.actionSpaces.find((entry) => entry.legal) ?? view.actionSpaces[0];
  const canAct = view.you !== null && view.actingSeat === view.you && view.phase === 'actions' && !!space?.legal && !view.pending;
  const imitation = space as (FeastActionSpaceView & { imitationLegal?: boolean; imitationReason?: string }) | undefined;
  const canImitate = view.you !== null && view.actingSeat === view.you && view.phase === 'actions' && !!imitation?.imitationLegal && !view.pending;
  const imitationArt = space ? Object.values(scene.extensions).flatMap((extension) => extension.faces).find((face) => face.column === space.column)?.image : undefined;
  return (
    <div className="ft-panel ft-action-layout">
      <div className="ft-action-board-stage">
        <div className="ft-action-board" data-testid="feast-action-board" data-feast-tour="solo-blockers">
          <img src={scene.actionBoard.image} alt="Authentic A Feast for Odin action board" />
          {view.actionSpaces.map((entry) => (
            <button
              key={entry.id}
              className={`ft-action-hotspot${entry.id === space?.id ? ' selected' : ''}${entry.legal ? '' : ' disabled'}`}
              style={{ left: `${entry.bounds.x * 100}%`, top: `${entry.bounds.y * 100}%`, width: `${entry.bounds.width * 100}%`, height: `${entry.bounds.height * 100}%` }}
              onClick={() => setSelected(entry.id)}
              title={`${entry.name}${entry.reason ? `: ${entry.reason}` : ''}`}
              aria-label={`${entry.name}, ${entry.effectiveWorkers} Vikings${entry.legal ? '' : `, unavailable: ${entry.reason}`}`}
            >
              <span className="ft-worker-stack">
                {entry.occupants.filter((occupant) => occupant.copiedFrom === null).flatMap((occupant) => Array.from({ length: occupant.workers }, (_, worker) => (
                  <i key={`${occupant.seat}-${worker}`} style={{ '--worker': SEAT_HEX[occupant.workerColor] } as CSSProperties} />
                )))}
              </span>
            </button>
          ))}
        </div>
      </div>
      <section className="ft-action-detail" data-feast-tour="action-detail">
        {space && <>
          <span className="ft-action-meta">COLUMN {space.column} · {space.effectiveWorkers} VIKING{space.effectiveWorkers === 1 ? '' : 'S'}{space.effectiveWorkers !== space.workers ? ` (PRINTED ${space.workers})` : ''} · {space.group.toUpperCase()}</span>
          <h2>{space.name}</h2>
          <p>Effects resolve from top to bottom. Any choice, die roll, payment, or card timing will pause here with a visual decision panel.</p>
          <div className="ft-action-reference-row">
            <span data-feast-tour="decision"><b>DICE AND CHOICES</b> open as guided, blocking decisions.</span>
            <span data-feast-tour="mountains"><b>MOUNTAINS</b> are taken from the arrow end and split across different strips.</span>
          </div>
          <div className="ft-effect-list">
            {space.effects.map((effect, index) => {
              const copy = effectCopy(effect);
              return <div className="ft-effect" key={`${effect.kind}-${index}`}><b>{index + 1}</b><div><strong>{copy.title}</strong><span>{copy.detail}</span></div></div>;
            })}
          </div>
          {space.requirements.length > 0 && <div className="ft-requirements"><b>REQUIRES</b>{space.requirements.map((requirement) => <span key={requirement}>{requirement}</span>)}</div>}
           {view.imitationColumns.includes(space.column) && <div className="ft-imitation-note">{imitationArt && <img src={imitationArt} alt={`Column ${space.column} imitation extension tile`} />}<div><b>FOUR-PLAYER EXTENSION · COLUMN {space.column}</b><span>{space.occupiedBy === null ? 'This printed space must be occupied before another player can imitate it.' : imitation?.imitationReason ?? 'The grey extension space can copy this occupied action.'}</span>{space.occupants.filter((occupant) => occupant.copiedFrom !== null).map((occupant) => <em key={`${occupant.seat}-${occupant.copiedFrom}`} style={{ '--worker': SEAT_HEX[occupant.workerColor] } as CSSProperties}><i />{view.players[occupant.seat]?.name ?? `PLAYER ${occupant.seat + 1}`} · {occupant.workers} VIKINGS ON EXTENSION</em>)}</div></div>}
          {!space.legal && <div className="ft-disabled-reason">{space.reason ?? 'This space is not currently available.'}</div>}
          <button className="ft-button primary ft-place-workers" disabled={!canAct} onClick={() => act({ type: 'place_workers', spaceId: space.id })}>
            PLACE {space.effectiveWorkers} VIKING{space.effectiveWorkers === 1 ? '' : 'S'}
          </button>
          {view.imitationColumns.includes(space.column) && <button className="ft-button ft-place-workers" disabled={!canImitate} onClick={() => act({ type: 'place_workers', spaceId: space.id, imitateSpaceId: space.id })}>IMITATE THIS SPACE · {space.effectiveWorkers} VIKING{space.effectiveWorkers === 1 ? '' : 'S'}</button>}
        </>}
      </section>
    </div>
  );
}

function BoardStage({ board, scene, selectedPiece, rotation, place, preview, previewError }: {
  board: FeastBoardState;
  scene: FeastScene;
  selectedPiece: string | null;
  rotation: 0 | 90 | 180 | 270;
  place: (board: FeastBoardState, x: number, y: number) => void;
  preview?: { boardId: string; x: number; y: number; pieceId: string } | null;
  previewError?: string | null;
}) {
  const def = boardDefinition(board);
  const visual = boardVisual(scene, board);
  const grid = visual.grid;
  const stageAt = (clientX: number, clientY: number, target: HTMLDivElement) => {
    if (!selectedPiece) return;
    const rect = target.getBoundingClientRect();
    const nx = (clientX - rect.left) / rect.width;
    const ny = (clientY - rect.top) / rect.height;
    const gridX = (nx - (grid?.normalizedOrigin[0] ?? 0)) / (grid?.normalizedCell[0] ?? 1 / def.cols);
    const gridY = (ny - (grid?.normalizedOrigin[1] ?? 0)) / (grid?.normalizedCell[1] ?? 1 / def.rows);
    if (gridX < 0 || gridX >= def.cols || gridY < 0 || gridY >= def.rows) return;
    const x = Math.floor(gridX);
    const y = Math.floor(gridY);
    place(board, x, y);
  };
  const click = (event: MouseEvent<HTMLDivElement>) => stageAt(event.clientX, event.clientY, event.currentTarget);
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); stageAt(event.clientX, event.clientY, event.currentTarget); };
  const aspect = visual.imagePx ? visual.imagePx[0] / visual.imagePx[1] : def.cols / def.rows;
  const gridStyle: CSSProperties = grid ? {
    left: `${grid.normalizedOrigin[0] * 100}%`, top: `${grid.normalizedOrigin[1] * 100}%`,
    width: `${grid.normalizedCell[0] * def.cols * 100}%`, height: `${grid.normalizedCell[1] * def.rows * 100}%`,
  } : {};
  return (
    <div className="ft-home-board" style={{ aspectRatio: `${aspect}` }} onClick={click} onDragOver={(event) => event.preventDefault()} onDrop={drop} data-testid="feast-home-board" role="button" tabIndex={0} aria-label={`${def.name} placement grid`}>
      {visual.image ? <img src={visual.image} alt={def.name} /> : <div className="ft-board-fallback">{def.name}</div>}
      <div className="ft-board-grid" style={{ ...gridStyle, gridTemplateColumns: `repeat(${def.cols}, 1fr)`, gridTemplateRows: `repeat(${def.rows}, 1fr)` }} aria-hidden="true">
        {def.layout.flatMap((row, y) => [...row].map((cell, x) => <i key={`${x}-${y}`} className={cell === '#' ? '' : 'outside'} />))}
      </div>
      <div className="ft-placement-layer">
        {board.placements.map((placement) => <Piece key={placement.id} scene={scene} placement={placement} def={def} grid={grid} />)}
        {preview?.boardId === board.id && (() => {
          const spec = feastPieceSpec(preview.pieceId);
          if (!spec) return null;
          const mask = feastRotateMask(spec.mask, rotation);
          const ghost: FeastPlacement = { id: 'preview', pieceKind: spec.pieceKind, pieceId: spec.pieceId, color: spec.color, x: preview.x, y: preview.y, rotation, mask, covered: feastMaskCells(mask, preview.x, preview.y) };
          return <Piece scene={scene} placement={ghost} def={def} grid={grid} ghost invalid={!!previewError} />;
        })()}
      </div>
      {selectedPiece && <div className="ft-board-cursor">CLICK A CELL TO PLACE · ROTATION {rotation}°</div>}
    </div>
  );
}

function Home({ view, me, scene, act }: { view: FeastView; me: FeastPlayerView; scene: FeastScene; act: (action: FeastAction) => void }) {
  const [boardId, setBoardId] = useState(me.boards[0]?.id ?? '');
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [preview, setPreview] = useState<{ boardId: string; x: number; y: number; pieceId: string } | null>(null);
  const [feastEstateMode, setFeastEstateMode] = useState(false);
  const [preplaceFeastMode, setPreplaceFeastMode] = useState(false);
  const board = me.boards.find((entry) => entry.id === boardId) ?? me.boards[0];
  const isFeast = view.phase === 'feast' && view.pending?.kind === 'feast' && view.pending.seat === view.you;
  const canUseFeastEstate = isFeast && me.playedOccupations.includes('occupation-40') && me.resources.wood > 0;
  const canPreplaceFeast = view.phase === 'actions' && !view.pending;
  const showBanquet = (isFeast && !feastEstateMode) || (canPreplaceFeast && preplaceFeastMode);
  const isFinalPlacement = view.pending?.kind === 'final-placement' && view.pending.seat === view.you;
  const canPlace = view.phase !== 'ended' && (view.pending?.kind !== 'final-placement' || isFinalPlacement);
  const canBuy = view.phase !== 'ended' && (!view.pending || (view.pending.seat === view.you && view.pending.kind !== 'die' && view.pending.kind !== 'final-placement'));
  const canArm = view.phase !== 'ended' && !view.pending;
  const currentIncome = me.boards.reduce((total, entry) => total + feastIncomeForBoard(entry), 0);
  const inventory = (showBanquet ? [
    ...FEAST_GOODS.filter((good) => me.goods[good.id] > 0 && (good.color === 'orange' || good.color === 'red'))
      .map((good) => ({ id: good.id, name: good.name, count: me.goods[good.id], image: scene.goods[good.id]?.front, color: good.color })),
    { id: 'silver', name: 'Silver', count: me.silver, image: undefined, color: 'silver' },
  ] : isFeast ? [
    { id: 'wood', name: 'Wood as House Silver', count: me.resources.wood, image: scene.resources?.wood?.image, color: 'wood' },
  ] : [
    ...FEAST_GOODS.filter((good) => me.goods[good.id] > 0).map((good) => ({ id: good.id, name: good.name, count: me.goods[good.id], image: scene.goods[good.id]?.front, color: good.color })),
    ...me.specials.map((id) => ({ id: `special:${id}`, name: FEAST_SPECIAL_BY_ID[id]?.name ?? titleCase(id), count: 1, image: scene.specials[id]?.image, color: 'blue' })),
    { id: 'silver', name: 'Silver', count: me.silver, image: undefined, color: 'silver' },
    { id: 'ore', name: 'Ore', count: me.resources.ore, image: undefined, color: 'ore' },
    ...(isFinalPlacement ? [{ id: 'wood', name: 'Wood', count: me.resources.wood, image: scene.resources?.wood?.image, color: 'wood' }, { id: 'stone', name: 'Stone', count: me.resources.stone, image: scene.resources?.stone?.image, color: 'stone' }] : []),
  ]).filter((piece) => piece.count > 0);
  const place = (target: FeastBoardState, x: number, y: number) => {
    if (!selectedPiece || !canPlace) return;
    setPreview({ boardId: target.id, x, y, pieceId: selectedPiece });
  };
  const previewBoard = preview ? me.boards.find((entry) => entry.id === preview.boardId) : undefined;
  const placementReason = preview && previewBoard ? feastPlacementPreviewError(me, previewBoard.id, preview.pieceId, preview.x, preview.y, rotation, isFinalPlacement) : null;
  const confirmPlacement = () => {
    if (!preview || placementReason) return;
    act({ type: 'place_tile', pieceId: preview.pieceId, boardId: preview.boardId, x: preview.x, y: preview.y, rotation });
    setPreview(null);
  };
  return (
    <div className="ft-panel ft-home-layout">
      <section className="ft-home-stage">
        {isFinalPlacement && <div className="ft-final-placement-banner"><b>FINAL PLACEMENT BEFORE SCORING</b><span>Commit remaining board tiles now. Wood and stone may finally cover their matching printed building pastures.</span></div>}
        {!isFeast && canPreplaceFeast && <div className="ft-final-placement-banner"><b>PLAN THE NEXT FEAST</b><span>Food and silver may be placed on the Banquet Table now. Animal and meat occupation rewards resolve once when the Feast begins.</span><button className="ft-button" onClick={() => { setPreplaceFeastMode((value) => !value); setSelectedPiece(null); setPreview(null); }}>{showBanquet ? 'RETURN TO ESTATE' : 'PRE-PLACE BANQUET'}</button></div>}
        {isFeast && canUseFeastEstate && <div className="ft-final-placement-banner"><b>HOUSE CARPENTER · ANYTIME</b><span>Switch between your Banquet and estate to place Wood as silver in a Stone House or Long House.</span><button className="ft-button" onClick={() => { setFeastEstateMode((value) => !value); setSelectedPiece(null); setPreview(null); }}>{showBanquet ? 'OPEN ESTATE' : 'RETURN TO BANQUET'}</button></div>}
        {showBanquet
          ? <BanquetTable me={me} scene={scene} length={view.options.length} selectedPiece={selectedPiece} rotation={rotation} place={(x, y) => { if (selectedPiece) act({ type: 'feast_place', pieceId: selectedPiece, x, y, rotation }); }} />
          : board ? <BoardStage board={board} scene={scene} selectedPiece={selectedPiece} rotation={rotation} place={place} preview={preview} previewError={placementReason} /> : <p>No puzzle board is available.</p>}
      </section>
      <aside className="ft-home-side">
        <div className="ft-side-scroll">
          <div className="ft-section-heading"><h3>{showBanquet ? 'BANQUET SUPPLY' : isFinalPlacement ? 'FINAL SCORING SUPPLY' : 'YOUR ESTATE'}</h3><span>{showBanquet ? 'FOOD AND SILVER ONLY' : isFinalPlacement ? 'NOTHING MAY MOVE AFTER CONFIRMING' : `${me.boards.length} BOARDS`}</span></div>
          {!showBanquet && <select className="ft-select" data-feast-tour="boards" value={board?.id ?? ''} onChange={(event) => { setBoardId(event.target.value); setPreview(null); }}>{me.boards.map((entry) => <option key={entry.id} value={entry.id}>{boardDefinition(entry).name}</option>)}</select>}
          <div className="ft-resource-grid" data-feast-tour="income">
            <div className="ft-resource"><span>SILVER</span><b>{me.silver}</b></div>
            <div className="ft-resource"><span>WOOD</span><b>{me.resources.wood}</b></div>
            <div className="ft-resource"><span>STONE</span><b>{me.resources.stone}</b></div>
            <div className="ft-resource"><span>ORE</span><b>{me.resources.ore}</b></div>
            <div className="ft-resource"><span>{view.phase === 'ended' ? 'FINAL INCOME' : 'CURRENT INCOME'}</span><b>{view.phase === 'ended' ? me.finalIncome : currentIncome}</b></div>
            <div className="ft-resource"><span>PENALTIES</span><b>{me.thingPenalties}</b></div>
          </div>
          <div className="ft-section-heading" data-feast-tour="bonuses"><h3>PLACE GOODS</h3><span>{selectedPiece ? titleCase(selectedPiece.replace('special:', '')) : 'SELECT A TILE'}</span></div>
          <div className="ft-goods-grid" data-feast-tour="goods">
            {inventory.map((piece) => <button key={piece.id} draggable={!showBanquet} className={`ft-good-button${selectedPiece === piece.id ? ' on' : ''}`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', piece.id); setPreview(null); setSelectedPiece(piece.id); }} onClick={() => { setPreview(null); setSelectedPiece((current) => current === piece.id ? null : piece.id); }}>
              {piece.image ? <img src={piece.image} alt={piece.name} /> : <i style={{ background: PIECE_COLOR[piece.color] }} />}
              <b>{piece.count}</b><span>{piece.name}</span>
            </button>)}
          </div>
          <div className="ft-inline-actions"><button className="ft-button" onClick={() => setRotation((value) => ((value + 90) % 360) as 0 | 90 | 180 | 270)}>ROTATE {rotation}°</button><button className="ft-button quiet" onClick={() => { setSelectedPiece(null); setPreview(null); }}>CLEAR</button></div>
          {preview && !showBanquet && <div className={`ft-placement-confirm${placementReason ? ' invalid' : ''}`}><span>{placementReason ?? `PLACE ${titleCase(preview.pieceId.replace('special:', ''))} AT ${preview.x + 1}, ${preview.y + 1}`}</span><button className="ft-button primary" disabled={!!placementReason} onClick={confirmPlacement}>CONFIRM PLACEMENT</button><button className="ft-button quiet" onClick={() => setPreview(null)}>CANCEL</button></div>}
          {isFinalPlacement && board && boardDefinition(board).designatedResources.length > 0 && <><div className="ft-section-heading"><h3>PRINTED RESOURCE PASTURES</h3><span>FINAL SCORING ONLY</span></div><div className="ft-designated-resources">{boardDefinition(board).designatedResources.map((entry, index) => <button key={`${entry.resource}-${entry.cell.x}-${entry.cell.y}-${index}`} className="ft-button" disabled={!canPlace || me.resources[entry.resource] < 1 || board.placements.some((placement) => placement.covered.some((cell) => cell.x === entry.cell.x && cell.y === entry.cell.y))} onClick={() => act({ type: 'place_tile', pieceId: entry.resource, boardId: board.id, x: entry.cell.x, y: entry.cell.y, rotation: 0 })}>PLACE {entry.resource.toUpperCase()} · PASTURE {index + 1}</button>)}</div></>}
          <div className="ft-section-heading" data-feast-tour="ships"><h3>SHIPS</h3><span>ARM BEFORE SAILING</span></div>
          <div className="ft-ship-list">
            {me.ships.map((ship) => <div key={ship.id}><span>{titleCase(ship.type)}{ship.emigrated ? ' · EMIGRATED' : ''}</span><b>{ship.ore} ORE</b>{!ship.emigrated && ship.type !== 'knarr' && <button disabled={me.resources.ore < 1 || !canArm} onClick={() => act({ type: 'place_ore', shipId: ship.id })}>+ ORE</button>}</div>)}
          </div>
          <div className="ft-inline-actions"><button className="ft-button" disabled={!canBuy || me.silver < 3} onClick={() => act({ type: 'buy_ship', ship: 'whaling-boat' })}>BUY WHALING BOAT · 3 SILVER</button><button className="ft-button" disabled={!canBuy || me.silver < 5} onClick={() => act({ type: 'buy_ship', ship: 'knarr' })}>BUY KNARR · 5 SILVER</button><button className="ft-button" disabled={!canBuy || me.silver < 8} onClick={() => act({ type: 'buy_ship', ship: 'longship' })}>BUY LONGSHIP · 8 SILVER</button></div>
          <div className="ft-home-rule-references">
            <div data-feast-tour="animals"><b>ANIMAL BREEDING</b><span>{me.goods.sheep + me.goods['pregnant-sheep']} sheep · {me.goods.cattle + me.goods['pregnant-cattle']} cattle</span><small>Pregnancy and birth alternate automatically in phase 8.</small></div>
            <div data-feast-tour="feast"><b>BANQUET TABLE</b><span>{Math.min(12, me.workersTotal)} required places · {me.ships.filter((ship) => ship.emigrated).length} emigrated</span><small>Food and silver are placed visually during phase 9.</small></div>
          </div>
          <div className="ft-section-heading"><h3>PUBLIC SPECIAL TILES</h3><span>{view.specialSupply.length} AVAILABLE</span></div>
          <div className="ft-special-reference">{view.specialSupply.map((id) => { const special = FEAST_SPECIAL_BY_ID[id]; return <div key={id} title={`${special?.name ?? titleCase(id)} · ${special?.silverCost ?? 'not for sale'} silver · sword ${special?.swordValue ?? 0}`}><img src={scene.specials[id]?.image} alt={special?.name ?? titleCase(id)} /><span>{special?.name ?? titleCase(id)}</span><b>{special?.silverCost === null ? 'LOOT' : `${special?.silverCost ?? 0}S`}</b></div>; })}</div>
        </div>
      </aside>
    </div>
  );
}

function Cards({ view, me, scene, act }: { view: FeastView; me: FeastPlayerView; scene: FeastScene; act: (action: FeastAction) => void }) {
  const [cardId, setCardId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<'occupations' | 'weapons' | null>(null);
  const hand = (me.occupationHand ?? []).map((id) => FEAST_OCCUPATION_BY_ID[id]).filter(Boolean);
  const played = me.playedOccupations.map((id) => FEAST_OCCUPATION_BY_ID[id]).filter(Boolean);
  const card = cardId ? FEAST_OCCUPATION_BY_ID[cardId] : undefined;
  const canPlay = view.you === view.actingSeat && !!view.pending && view.pending.kind === 'occupation';
  const stableAnytimeWindow = (view.phase === 'actions' && !view.pending)
    || (!!view.pending && view.pending.seat === view.you
      && (view.pending.kind === 'feast' || view.pending.kind === 'final-placement'));
  const directPlacementCard = card?.id === 'occupation-40';
  return (
    <div className="ft-panel ft-cards-layout">
      <div className="ft-card-scroll">
        <section className="ft-card-section"><div className="ft-section-heading"><h3>PRIVATE OCCUPATION HAND</h3><span>{me.occupationHandCount} CARDS</span></div><div className="ft-card-row" data-feast-tour="cards">
          {hand.map((occupation) => <FeastOccupationCard key={occupation.id} scene={scene} card={occupation} onClick={() => setCardId(occupation.id)} />)}
          {hand.length === 0 && <div className="ft-empty-state">YOUR HAND IS EMPTY</div>}
        </div></section>
        <section className="ft-card-section"><div className="ft-section-heading"><h3>PLAYED OCCUPATIONS</h3><span>{played.length} ACTIVE</span></div><div className="ft-card-row">
          {played.map((occupation) => <FeastOccupationCard key={occupation.id} scene={scene} card={occupation} played onClick={() => setCardId(occupation.id)} />)}
          {played.length === 0 && <div className="ft-empty-state">NO OCCUPATIONS PLAYED</div>}
        </div></section>
        <div className="ft-card-automation-note"><b>SERVER-GUIDED OCCUPATIONS</b><span>Immediate, each-time, and as-soon-as effects appear automatically with the authentic card and legal choices. Open a played anytime card when you want to use it.</span></div>
      </div>
      <footer className="ft-card-reference">
        <div><span>WEAPONS</span>{Object.entries(me.weapons).map(([weapon, amount]) => <b key={weapon}>{titleCase(weapon)} {amount}</b>)}</div>
        <div><span>FACE-UP DISCARD</span>{Object.entries(Object.fromEntries(['bow', 'snare', 'spear', 'long-sword'].map((weapon) => [weapon, view.weaponDiscard.filter((entry) => entry === weapon).length]))).map(([weapon, amount]) => <b key={weapon}>{titleCase(weapon)} {String(amount)}</b>)}</div>
        <div><span>DECK</span><b>{view.occupationDeckCount} REMAIN</b><b>{view.occupationDiscardCount} DISCARDED</b></div>
        <button className="ft-button" onClick={() => setCatalog('occupations')}>SHOW ALL OCCUPATIONS</button>
        <button className="ft-button" onClick={() => setCatalog('weapons')}>SHOW WEAPONS</button>
        <a className="ft-button" href="/feast/appendix.pdf" target="_blank" rel="noreferrer">OPEN CARD APPENDIX</a>
      </footer>
      {catalog && <div className="ft-catalog-backdrop" role="dialog" aria-modal="true" aria-label={catalog === 'occupations' ? 'All occupation cards' : 'Weapon card reference'}>
        <section className="ft-catalog">
          <header><div><span className="ft-kicker">COMPLETE AUTHENTIC REFERENCE</span><h2>{catalog === 'occupations' ? 'ALL 190 OCCUPATIONS' : 'WEAPON DECK'}</h2></div><button className="ft-button" onClick={() => setCatalog(null)}>CLOSE</button></header>
          {catalog === 'occupations' ? <div className="ft-catalog-grid">{FEAST_OCCUPATIONS.map((occupation) => <FeastOccupationCard key={occupation.id} scene={scene} card={occupation} played={played.some((entry) => entry.id === occupation.id)} onClick={() => { setCatalog(null); setCardId(occupation.id); }} />)}</div>
            : <div className="ft-weapon-catalog"><img src={scene.decks.sheets.weapons.image ?? scene.decks.sheets.weapons.face} alt="Authentic weapon card sheet" /><div><h3>47-CARD DRAW DECK</h3><p>12 bows · 12 snares · 12 spears · 11 long swords. Each player receives three face-up starting weapons; those cards are removed from the draw deck.</p><dl>{Object.entries(me.weapons).map(([weapon, amount]) => <div key={weapon}><dt>{titleCase(weapon)}</dt><dd>{amount} HELD</dd></div>)}</dl><p>The public face-up discard and remaining deck counts stay visible below your card area.</p></div></div>}
        </section>
      </div>}
      {card && <FeastCardDialog
        scene={scene}
        card={card}
        close={() => setCardId(null)}
        canPlay={canPlay}
        onPlay={hand.some((entry) => entry.id === card.id) ? () => { act({ type: 'play_occupation', cardId: card.id }); setCardId(null); } : undefined}
        onResolve={played.some((entry) => entry.id === card.id) && card.type === 'anytime' && stableAnytimeWindow && !directPlacementCard
          ? () => { act({ type: 'activate_occupation', cardId: card.id }); setCardId(null); }
          : undefined}
        resolveLabel="USE ANYTIME EFFECT"
        usageHint={directPlacementCard
          ? 'Open HOME, select Wood in your inventory, then place it directly on any legal empty cell of a Stone House or Long House. Each placement spends one Wood and covers that cell as silver would.'
          : card.type === 'anytime' && !stableAnytimeWindow
            ? 'Finish the current decision first. Anytime effects are available between actions, during your Feast, and before final scoring.'
            : undefined}
      />}
    </div>
  );
}

function FeastRail({ view, me, mode, setMode, act }: { view: FeastView; me: FeastPlayerView; mode: Mode; setMode: (mode: Mode) => void; act: (action: FeastAction) => void }) {
  const myTurn = view.actingSeat === view.you;
  const canEnd = myTurn && me.turnMayEnd && !view.pending;
  const liveScore = view.scorePreview.find((entry) => entry.seat === me.seat)?.total ?? 0;
  return (
    <aside className="ft-rail">
      <nav className="ft-mode-tabs" data-feast-tour="modes">
        <button className={mode === 'home' ? 'on' : ''} onClick={() => setMode('home')}>HOME <span>{me.boards.length}</span></button>
        <button className={mode === 'actions' ? 'on' : ''} onClick={() => setMode('actions')}>ACTION BOARD <span>{view.actionSpaces.filter((space) => space.legal).length}</span></button>
        <button className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>CARDS · WHOLE HAND <span>{me.occupationHandCount}</span></button>
      </nav>
      <section className="ft-rail-section"><h3>YOUR VIKINGS</h3><dl><dt>Available</dt><dd>{me.workersAvailable}</dd><dt>On board</dt><dd>{me.workersWaiting}</dd><dt>Total</dt><dd>{me.workersTotal}</dd></dl></section>
      <section className="ft-rail-section"><h3>ROUND POSITION</h3><dl><dt>First player</dt><dd>{view.players[view.firstPlayer]?.name ?? 'NONE'}</dd><dt>Action taken</dt><dd>{me.turnActionTaken ? 'YES' : 'NO'}</dd><dt>Status</dt><dd>{me.passed ? 'PASSED' : myTurn ? 'ACTING' : 'WAITING'}</dd></dl></section>
      <section className="ft-rail-section" data-feast-tour="decision"><h3>CURRENT DECISION</h3><dl><dt>Next</dt><dd>{view.pending?.seat === view.you ? view.pending.label : view.pending ? `${view.players[view.pending.seat]?.name ?? 'PLAYER'}` : 'NONE'}</dd><dt>Phase</dt><dd>{PHASE_LABEL[view.phase]}</dd></dl></section>
      <section className="ft-rail-section ft-live-score" data-feast-tour="score"><h3>LIVE ESTATE VALUE</h3><strong>{liveScore}</strong><span>POINTS IF SCORED NOW</span>{view.players.length === 1 && <small className={liveScore >= 100 ? 'met' : ''}>{liveScore >= 100 ? '100-POINT SOLO BENCHMARK MET' : `${100 - liveScore} TO THE 100-POINT SOLO BENCHMARK`}</small>}</section>
      <div className="ft-rail-spacer" />
      {view.phase === 'actions' && !me.passed && <button className="ft-button" disabled={!myTurn || !!view.pending || me.turnActionTaken} onClick={() => act({ type: 'pass' })}>PASS FOR ROUND</button>}
      {view.phase === 'feast' && myTurn && <button className="ft-button primary" disabled={!!view.pending && view.pending.kind !== 'feast'} onClick={() => act({ type: 'feast_finish' })}>FINISH FEAST</button>}
      {view.pending?.kind === 'final-placement' && view.pending.seat === view.you && <button className="ft-button primary ft-end-turn ready" onClick={() => act({ type: 'resolve_decision', decisionId: view.pending!.id, choice: { optionIds: ['confirm'] } })}>LOCK BOARDS AND SCORE</button>}
      <button className={`ft-button primary ft-end-turn${canEnd ? ' ready' : ''}`} data-feast-tour="end-turn" disabled={!canEnd} onClick={() => act({ type: 'end_turn' })}>{canEnd ? 'END TURN' : myTurn ? 'COMPLETE THE ACTION' : 'WAITING FOR PLAYER'}</button>
    </aside>
  );
}

function ScoreBoardAudit({ board, scene }: { board: FeastBoardState; scene: FeastScene }) {
  const def = boardDefinition(board);
  const visual = boardVisual(scene, board);
  const grid = visual.grid;
  const occupied = occupiedCells(board);
  const uncovered = def.negativeCells.filter((negative) => !occupied.has(`${negative.cell.x},${negative.cell.y}`));
  const uncoveredValue = uncovered.reduce((total, negative) => total + negative.value, 0);
  const origin = grid?.normalizedOrigin ?? [0, 0];
  const cell = grid?.normalizedCell ?? [1 / def.cols, 1 / def.rows];
  const aspect = visual.imagePx ? visual.imagePx[0] / visual.imagePx[1] : def.cols / def.rows;
  return <article className="ft-score-board-audit"><header><b>{def.name}</b><span>−{uncoveredValue} FROM {uncovered.length} OPEN CELL{uncovered.length === 1 ? '' : 'S'}</span></header><div style={{ aspectRatio: `${aspect}` }}>
    {visual.image ? <img src={visual.image} alt={`${def.name} final scoring board`} /> : <span>{def.name}</span>}
    <div className="ft-placement-layer">{board.placements.map((placement) => <Piece key={placement.id} scene={scene} placement={placement} def={def} grid={grid} />)}</div>
    {uncovered.map((negative) => <i key={`${negative.cell.x}-${negative.cell.y}`} style={{ left: `${(origin[0] + negative.cell.x * cell[0]) * 100}%`, top: `${(origin[1] + negative.cell.y * cell[1]) * 100}%`, width: `${cell[0] * 100}%`, height: `${cell[1] * 100}%` }}>−{negative.value}</i>)}
  </div></article>;
}

function FinalScore({ view, scene }: { view: FeastView; scene: FeastScene }) {
  if (view.phase !== 'ended' || !view.scores) return null;
  const score = view.scores.find((entry) => entry.seat === view.you);
  if (!score) return null;
  const player = view.players[score.seat];
  const occupationScoringSilver = score.silver - player.silver;
  const rows: [string, number][] = [
    ['Ships', score.ships], ['Emigrations', score.emigrations], ['Exploration boards', score.explorations],
    ['Buildings', score.buildings], ['Animals', score.animals], ['Occupations', score.occupations],
    ['Silver on hand', player.silver],
    ...(occupationScoringSilver ? [[player.playedOccupations.includes('occupation-189')
      ? 'Seafarer · exploration scoring silver' : 'Occupation scoring silver', occupationScoringSilver] as [string, number]] : []),
    ['Final income', score.finalIncome], ['English Crown', score.englishCrown],
    ['Occupation adjustments', score.cardAdjustments], ['Uncovered negative spaces', score.boardNegatives], ['Thing penalties', score.thingPenalties],
  ];
  const won = view.winners?.includes(view.players[score.seat].color);
  return (
    <div className="ft-final-score" role="dialog" aria-modal="true" data-testid="feast-final-score">
      <section>
        <span className="ft-kicker">THE SAGA IS COMPLETE</span><h2>{won ? 'YOUR ESTATE PREVAILS' : 'FINAL ESTATE VALUE'}</h2>
        <div className="ft-score-total"><b>{score.total}</b><span>VICTORY POINTS</span></div>
        <div className="ft-score-lines">{rows.map(([label, value]) => <div key={label}><span>{label}</span><b className={value < 0 ? 'negative' : ''}>{value > 0 ? '+' : ''}{value}</b></div>)}</div>
        <div className="ft-score-board-grid">{player.boards.map((board) => <ScoreBoardAudit key={board.id} board={board} scene={scene} />)}</div>
        <p>{view.winners?.length === 1 ? `${view.players.find((player) => player.color === view.winners?.[0])?.name ?? view.winners[0]} wins.` : `${view.winners?.map((color) => view.players.find((player) => player.color === color)?.name ?? color).join(' and ')} share the victory. A Feast for Odin has no tiebreaker.`}</p>
      </section>
    </div>
  );
}

export function FeastPlay({ view, act, error }: { view: FeastView; act: (action: FeastAction) => void; error: string | null }) {
  const scene = useFeastScene();
  const [mode, setMode] = useState<Mode>('home');
  const [intro, setIntro] = useState(true);
  const [lessons, setLessons] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const me = view.you === null ? null : view.players[view.you];
  const active = view.actingSeat === null ? null : view.players[view.actingSeat];
  const startTour = useCallback((step = 0) => { setIntro(false); setLessons(false); setTourStep(step); }, []);
  useEffect(() => {
    if (view.phase === 'actions' && view.actingSeat === view.you) setMode('actions');
    if (view.phase === 'feast' && view.actingSeat === view.you) setMode('home');
    if (view.pending?.kind === 'occupation' || view.pending?.kind === 'setup-occupation' || view.pending?.kind === 'card-effect') setMode('cards');
  }, [view.actingSeat, view.pending?.kind, view.phase, view.you]);
  if (!scene || !me) return <div className="page center"><h2>{!scene ? 'PREPARING THE GREAT HALL' : 'JOIN A SEAT TO PLAY'}</h2></div>;
  const seat = SEAT_HEX[me.color];
  return (
    <div className="ft-root" style={{ '--ft-seat': seat } as CSSProperties} data-testid="feast-device">
      <header className="ft-topbar">
        <div className="ft-brand"><img src={scene.logo} alt="A Feast for Odin" /><div><span>{view.edition}</span><b>A FEAST FOR ODIN</b></div></div>
        <div className={`ft-status${view.actingSeat === view.you ? ' you' : ''}`} data-feast-tour="status"><span className="ft-turn-outline" /><div><strong>ROUND {view.round}/{view.rounds} · {PHASE_LABEL[view.phase]}</strong><span>{view.phase === 'ended' ? 'FINAL SCORE COMPLETE' : active ? `${active.name} IS ACTING` : 'RESOLVING THE TABLE'}</span></div></div>
        <div className="ft-header-actions"><button className="ft-icon-button" onClick={() => setLessons(true)}>VISUAL LESSONS</button><button className="ft-icon-button" onClick={() => startTour()}>LIVE TOUR</button><a className="ft-icon-button ft-help-link" href="/feast/rulebook.pdf" target="_blank" rel="noreferrer">RULES</a></div>
      </header>
      <div className="ft-device-body">
        <FeastRail view={view} me={me} mode={mode} setMode={setMode} act={act} />
        <main className="ft-main">
          {mode === 'home' && <Home view={view} me={me} scene={scene} act={act} />}
          {mode === 'actions' && <ActionBoard view={view} scene={scene} selected={selectedSpace} setSelected={setSelectedSpace} act={act} />}
          {mode === 'cards' && <Cards view={view} me={me} scene={scene} act={act} />}
        </main>
      </div>
      {intro && <GameIntro intro={FEAST_INTRO} onClose={() => setIntro(false)} onWalkthrough={() => startTour()} />}
      {lessons && <FeastLessons close={() => setLessons(false)} startTour={startTour} />}
      {tourStep !== null && <FeastTourOverlay steps={FEAST_TUTORIAL} step={tourStep} mode={mode} setStep={setTourStep} setMode={setMode} close={() => setTourStep(null)} />}
      <PendingDecision view={view} scene={scene} act={act} />
      <FinalScore view={view} scene={scene} />
      {error && <div className="ft-toast" role="alert">{error}</div>}
    </div>
  );
}

export default FeastPlay;
