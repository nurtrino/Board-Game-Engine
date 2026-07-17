import { useMemo, type CSSProperties } from 'react';
import {
  SETI_RIVAL_ACTION_BY_ID,
  SETI_SOLO_OBJECTIVE_BY_ID,
  type SetiSoloObjectiveTask,
} from '@bge/shared';
import { SetiIcon } from './SetiIcons';
import './setiSolo.css';

export interface SetiSoloObjectiveDisplay {
  objectiveId: string;
  marked: boolean[];
}

export interface SetiSoloDisplay {
  difficulty: 1 | 2 | 3 | 4 | 5;
  rivalScore: number;
  rivalPublicity: number;
  progress: number;
  progressLoops: number;
  activeObjectives: SetiSoloObjectiveDisplay[];
  completedObjectives: string[];
  objectiveDeckCount: number;
  actionDeckCount: number;
  actionDiscardCount: number;
  currentActionCard: string | null;
  lastActionCard: string | null;
  lastActionStep: number | null;
  techs: { probe: number; telescope: number; computer: number };
  computer: boolean[];
  dataPool: number;
  rivalStartsRound: boolean;
  passed: boolean;
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asNumber = (value: unknown, fallback = 0): number => Number.isFinite(Number(value)) ? Number(value) : fallback;
const asString = (value: unknown): string | null => typeof value === 'string' && value ? value : null;

export function normalizeSetiSoloDisplay(value: unknown): SetiSoloDisplay {
  const solo = asRecord(value);
  const active = Array.isArray(solo.activeObjectives) ? solo.activeObjectives : [];
  const techs = asRecord(solo.techs);
  const legacyTechTotal = asNumber(solo.techTokens);
  return {
    difficulty: Math.max(1, Math.min(5, asNumber(solo.difficulty, 1))) as SetiSoloDisplay['difficulty'],
    rivalScore: asNumber(solo.rivalScore),
    rivalPublicity: asNumber(solo.rivalPublicity, 4),
    progress: ((asNumber(solo.progress) % 12) + 12) % 12,
    progressLoops: asNumber(solo.progressLoops),
    activeObjectives: active.flatMap((entry): SetiSoloObjectiveDisplay[] => {
      if (typeof entry === 'string') {
        const tasks = SETI_SOLO_OBJECTIVE_BY_ID[entry]?.tasks.length ?? 1;
        return [{ objectiveId: entry, marked: Array(tasks).fill(false) }];
      }
      const objective = asRecord(entry);
      const objectiveId = asString(objective.objectiveId);
      if (!objectiveId) return [];
      const tasks = SETI_SOLO_OBJECTIVE_BY_ID[objectiveId]?.tasks.length ?? 1;
      const marked = Array.isArray(objective.marked) ? objective.marked.map(Boolean) : [];
      return [{ objectiveId, marked: Array.from({ length: tasks }, (_, index) => marked[index] ?? false) }];
    }),
    completedObjectives: Array.isArray(solo.completedObjectives) ? solo.completedObjectives.filter((entry): entry is string => typeof entry === 'string') : [],
    objectiveDeckCount: asNumber(solo.objectiveDeckCount),
    actionDeckCount: asNumber(solo.actionDeckCount),
    actionDiscardCount: asNumber(solo.actionDiscardCount),
    currentActionCard: asString(solo.currentActionCard),
    lastActionCard: asString(solo.lastActionCard),
    lastActionStep: solo.lastActionStep === null || solo.lastActionStep === undefined ? null : asNumber(solo.lastActionStep),
    techs: {
      probe: asNumber(techs.probe, legacyTechTotal),
      telescope: asNumber(techs.telescope),
      computer: asNumber(techs.computer),
    },
    computer: Array.from({ length: 6 }, (_, index) => Array.isArray(solo.computer) && Boolean(solo.computer[index])),
    dataPool: asNumber(solo.dataPool),
    rivalStartsRound: Boolean(solo.rivalStartsRound),
    passed: Boolean(solo.passed),
  };
}

function rivalBoardArt(difficulty: number): string {
  return difficulty <= 2 ? '/seti/solo/rival-board-1-2.webp' : `/seti/solo/rival-board-${difficulty}.webp`;
}

function taskLabel(task: SetiSoloObjectiveTask | undefined): string {
  if (!task) return 'objective task';
  if (task.kind === 'threshold') return `${task.atLeast} ${task.stat}`;
  if (task.kind === 'main-action') return task.action;
  if (task.kind === 'research-tech') return `research ${task.technology}`;
  if (task.kind === 'complete-mission') return 'complete mission';
  if (task.kind === 'visit-feature') return `visit ${task.feature}`;
  if (task.kind === 'play-project-for-effect') return 'play a 3-credit project';
  if (task.kind === 'orbit-or-land') return `orbit or land at ${task.bodies.join(' or ')}`;
  if (task.kind === 'win-sector') return `win ${task.colors.join(' or ')} sector`;
  return 'either printed task';
}

const TASK_POSITIONS: Readonly<Record<number, readonly { x: number; y: number }[]>> = {
  1: [{ x: 50, y: 72 }],
  2: [{ x: 31, y: 73 }, { x: 69, y: 73 }],
  3: [{ x: 50, y: 44 }, { x: 29, y: 79 }, { x: 71, y: 79 }],
};

function ObjectiveTile({ objective, eligibleOptions = [], onChoose, compact = false }: {
  objective: SetiSoloObjectiveDisplay;
  eligibleOptions?: readonly string[];
  onChoose?: (option: string) => void;
  compact?: boolean;
}) {
  const definition = SETI_SOLO_OBJECTIVE_BY_ID[objective.objectiveId];
  if (!definition) return null;
  const positions = TASK_POSITIONS[definition.tasks.length] ?? TASK_POSITIONS[1];
  return (
    <figure className={`seti-solo-objective ${compact ? 'is-compact' : ''}`} data-objective-id={objective.objectiveId}>
      <img src={definition.art} alt={`${definition.printedId} solo objective`} />
      {definition.tasks.map((task, taskIndex) => {
        const option = `${objective.objectiveId}|${taskIndex}`;
        const eligible = eligibleOptions.includes(option);
        const marked = objective.marked[taskIndex];
        const position = positions[taskIndex] ?? positions[positions.length - 1];
        const style = { '--task-x': `${position.x}%`, '--task-y': `${position.y}%` } as CSSProperties;
        if (eligible && onChoose) {
          return <button key={option} type="button" className="seti-solo-task is-eligible" style={style} aria-label={`mark ${taskLabel(task)}`} onClick={() => onChoose(option)}><span /></button>;
        }
        return <span key={option} className={`seti-solo-task ${marked ? 'is-marked' : ''}`} style={style} aria-label={marked ? `${taskLabel(task)} marked` : taskLabel(task)}><span /></span>;
      })}
    </figure>
  );
}

function RivalActionCard({ cardId, selectedStep = null, compact = false }: { cardId: string | null; selectedStep?: number | null; compact?: boolean }) {
  const card = cardId ? SETI_RIVAL_ACTION_BY_ID[cardId] : null;
  if (!card) return <div className={`seti-rival-action-card is-back ${compact ? 'is-compact' : ''}`}><span>RIVAL</span></div>;
  const style = {
    '--card-x': `${card.art.column / Math.max(1, card.art.columns - 1) * 100}%`,
    '--card-y': `${card.art.row / Math.max(1, card.art.rows - 1) * 100}%`,
  } as CSSProperties;
  return <div className={`seti-rival-action-card ${compact ? 'is-compact' : ''}`} style={style} aria-label={`${card.printedId} rival action${selectedStep === null ? '' : `, resolved step ${selectedStep + 1}`}`}><span>{card.printedId}</span><div className={`seti-rival-step-track is-${card.arrow}`} aria-hidden="true">{card.steps.map((_step, index) => <i key={index} className={index === selectedStep ? 'is-selected' : ''}>{index + 1}</i>)}</div></div>;
}

function RivalBoardGraphic({ solo, compact = false }: { solo: SetiSoloDisplay; compact?: boolean }) {
  const marker = useMemo(() => {
    // The printed path begins at the upper-right node and proceeds clockwise.
    const angle = (-60 + solo.progress * 30) * Math.PI / 180;
    return { left: `${79.5 + 13.5 * Math.cos(angle)}%`, top: `${50 + 39.5 * Math.sin(angle)}%` };
  }, [solo.progress]);
  return (
    <div className={`seti-rival-board-graphic ${compact ? 'is-compact' : ''}`}>
      <img src={rivalBoardArt(solo.difficulty)} alt={`official rival board difficulty ${solo.difficulty}`} />
      <span className="seti-rival-progress-marker" style={marker}><i>{solo.progress}</i></span>
      <span className="seti-rival-publicity-marker"><SetiIcon name="publicity" /><b>{solo.rivalPublicity}</b></span>
      <span className="seti-rival-data-pool"><SetiIcon name="data" /><b>{solo.dataPool}</b></span>
      {solo.computer.map((filled, index) => <span key={index} className={`seti-rival-computer-token ${filled ? 'is-filled' : ''}`} style={{ left: `${26.3 + index * 5.25}%` }} />)}
      {(['probe', 'telescope', 'computer'] as const).map((type, index) => (
        <span key={type} className={`seti-rival-tech-count tech-${type}`} style={{ left: `${17.7 + index * 15}%` }}><b>{solo.techs[type]}</b></span>
      ))}
    </div>
  );
}

export function SetiSoloRivalPanel({ solo: rawSolo, onClose }: { solo: unknown; onClose: () => void }) {
  const solo = normalizeSetiSoloDisplay(rawSolo);
  const shownAction = solo.currentActionCard ?? solo.lastActionCard;
  return (
    <div className="seti-modal-layer seti-solo-modal" onPointerDown={onClose}>
      <section className="seti-solo-panel seti-glass" data-testid="seti-solo-panel" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" className="seti-close" onClick={onClose} aria-label="close rival board"><SetiIcon name="close" /></button>
        <header className="seti-solo-panel-header">
          <div><small>OFFICIAL SOLO RIVAL</small><h2>DIFFICULTY {solo.difficulty}</h2><p>{solo.rivalStartsRound ? 'RIVAL STARTS THIS ROUND' : 'YOU START THIS ROUND'} · {solo.passed ? 'PASSED' : 'ACTIVE'}</p></div>
          <div className="seti-solo-metrics"><span><b>{solo.rivalScore}</b><small>VP</small></span><span><b>{solo.rivalPublicity}</b><small>PUBLICITY</small></span><span><b>{solo.progress}</b><small>PROGRESS</small></span></div>
        </header>
        <div className="seti-solo-board-row">
          <RivalBoardGraphic solo={solo} />
          <aside className="seti-solo-action-stack">
            <small>{solo.currentActionCard ? 'RESOLVING' : solo.lastActionStep === null ? 'LAST RIVAL ACTION' : `LAST RIVAL ACTION · STEP ${solo.lastActionStep + 1}`}</small>
            <RivalActionCard cardId={shownAction} selectedStep={solo.lastActionStep} />
            <div><span><b>{solo.actionDeckCount}</b> DRAW</span><span><b>{solo.actionDiscardCount}</b> PLAYED</span></div>
          </aside>
        </div>
        <div className="seti-rival-objective-row">
          <div className="seti-rival-objective-label"><small>ACTIVE OBJECTIVES</small><b>{solo.activeObjectives.length}</b><span>{solo.objectiveDeckCount} REMAIN</span></div>
          {solo.activeObjectives.map((objective) => <ObjectiveTile key={objective.objectiveId} objective={objective} />)}
          {solo.completedObjectives.slice(-2).map((objectiveId) => (
            <ObjectiveTile key={`complete-${objectiveId}`} objective={{ objectiveId, marked: Array(SETI_SOLO_OBJECTIVE_BY_ID[objectiveId]?.tasks.length ?? 1).fill(true) }} compact />
          ))}
        </div>
      </section>
    </div>
  );
}

export function SetiSoloObjectiveDecision({ solo: rawSolo, options, onChoose }: {
  solo: unknown;
  options: readonly string[];
  onChoose: (option: string) => void;
}) {
  const solo = normalizeSetiSoloDisplay(rawSolo);
  return (
    <section className="seti-solo-objective-decision seti-glass" data-testid="seti-solo-objective-decision">
      <header><SetiIcon name="score" /><div><small>OBJECTIVE TRIGGERED</small><b>TOUCH ONE GLOWING TASK</b></div></header>
      <div>
        {solo.activeObjectives.map((objective) => <ObjectiveTile key={objective.objectiveId} objective={objective} eligibleOptions={options} onChoose={onChoose} />)}
      </div>
    </section>
  );
}

export function SetiSoloTvHud({ solo: rawSolo }: { solo: unknown }) {
  const solo = normalizeSetiSoloDisplay(rawSolo);
  return (
    <aside className="seti-tv-solo seti-glass" aria-label="solo rival status">
      <header><span><small>SOLO RIVAL</small><b>{solo.rivalScore} VP</b></span><span><SetiIcon name="publicity" />{solo.rivalPublicity}</span></header>
      <RivalBoardGraphic solo={solo} compact />
      <div className="seti-tv-solo-bottom">
        <RivalActionCard cardId={solo.currentActionCard ?? solo.lastActionCard} selectedStep={solo.lastActionStep} compact />
        <div className="seti-tv-solo-objectives">{solo.activeObjectives.map((objective) => <ObjectiveTile key={objective.objectiveId} objective={objective} compact />)}</div>
      </div>
    </aside>
  );
}
