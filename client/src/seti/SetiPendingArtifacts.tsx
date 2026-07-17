import type { CSSProperties, ReactNode } from 'react';
import { SetiIcon } from './SetiIcons';
import { SetiCardArt, type SetiSceneDef } from './SetiScene';
import type { SetiUiPending, SetiUiView } from './setiView';

if (typeof document !== 'undefined') void import('./setiPendingArtifacts.css');

type UnknownRecord = Record<string, unknown>;
type TraceColor = 'purple' | 'orange' | 'blue';

export interface SetiPendingArtifactProps {
  scene: SetiSceneDef | null;
  view: SetiUiView;
  pending: SetiUiPending | null;
  /** Commit the original reducer option at this exact array index. */
  onChoose: (index: number) => void;
  className?: string;
}

interface IndexedChoice {
  index: number;
  rawOption: unknown;
  value: string;
}

export type SetiPendingArtifactModel =
  | { kind: 'end-round-card'; choices: readonly (IndexedChoice & { cardId: string })[] }
  | { kind: 'project-visit-reward'; cardId: string; publicity: IndexedChoice; move: IndexedChoice }
  | { kind: 'tuck-income'; cardId: string; tuck: IndexedChoice; skip: IndexedChoice }
  | { kind: 'trace-color'; choices: readonly (IndexedChoice & { color: TraceColor })[] }
  | { kind: 'exofossil-quantity'; held: number; choices: readonly (IndexedChoice & { amount: number })[] }
  | { kind: 'exofossil-spend'; choices: readonly (IndexedChoice & { action: 'spend' | 'skip' })[] }
  | { kind: 'centaurian-reward'; choices: readonly (IndexedChoice & { rewardIndex: 0 | 1 | 2 | 3 })[] }
  | { kind: 'alien-mission-reward'; cardId: string; choices: readonly (IndexedChoice & { rewardIndex: number })[] }
  | { kind: 'alien-effect-region'; cardId: string; choices: readonly (IndexedChoice & { effectIndex: number })[] };

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function optionValue(option: unknown): string {
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  const item = record(option);
  const choice = record(item.choice);
  const value = choice.option ?? choice.value ?? choice.id
    ?? item.option ?? item.value ?? item.id ?? item.cardId ?? item.card;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function indexedChoices(pending: SetiUiPending): IndexedChoice[] {
  return pending.options.map((rawOption, index) => ({ index, rawOption, value: optionValue(rawOption) }));
}

function rawText(pending: SetiUiPending, key: string): string {
  const value = pending.raw[key];
  return typeof value === 'string' ? value : '';
}

function alienCardId(pending: SetiUiPending): string | null {
  const candidates = [
    rawText(pending, 'cardId'),
    rawText(pending, 'sourceCardId'),
    rawText(pending, 'alienCardId'),
    rawText(pending, 'card'),
  ];
  for (const candidate of candidates) {
    const match = /seti_alien_(?:mascamites|anomalies|oumuamua|centaurians|exertians)_\d+/i.exec(candidate);
    if (match) return match[0].toLowerCase();
  }
  return null;
}

function oumuamuaHeld(view: SetiUiView, pending: SetiUiPending): number {
  const module = view.species.find((species) => species.id === 'oumuamua' || species.module.kind === 'oumuamua')?.module;
  const exofossils = record(module?.exofossils);
  const amount = Number(exofossils[String(pending.owner)] ?? exofossils[pending.owner]);
  return Number.isInteger(amount) && amount >= 0 ? amount : 0;
}

/**
 * Recognize only pending grammars with a dedicated physical renderer. Unknown
 * decisions deliberately return null so the existing generic lane remains the
 * fallback. Every model keeps the original reducer option index.
 */
export function setiPendingArtifactModel(view: SetiUiView, pending: SetiUiPending | null): SetiPendingArtifactModel | null {
  if (!pending || pending.options.length === 0) return null;
  const choices = indexedChoices(pending);
  if (choices.some((choice) => !choice.value)) return null;

  if (pending.kind === 'end-round-card') {
    return {
      kind: 'end-round-card',
      choices: choices.map((choice) => ({ ...choice, cardId: choice.value })),
    };
  }

  if (pending.kind === 'project-visit-reward') {
    const cardId = rawText(pending, 'sourceCardId');
    const publicity = choices.find((choice) => choice.value === 'publicity');
    const move = choices.find((choice) => choice.value === 'move');
    if (cardId && publicity && move && choices.length === 2) {
      return { kind: 'project-visit-reward', cardId, publicity, move };
    }
    return null;
  }

  const rawCardId = rawText(pending, 'cardId');
  if (pending.kind === 'card-effect-choice' && rawCardId && /tuck this card/i.test(pending.prompt)) {
    const tuck = choices.find((choice) => choice.value === rawCardId);
    const skip = choices.find((choice) => choice.value === 'skip');
    if (tuck && skip && choices.length === 2) return { kind: 'tuck-income', cardId: rawCardId, tuck, skip };
    return null;
  }
  const traceColors = choices.filter((choice): choice is IndexedChoice & { color: TraceColor } => (
    choice.value === 'purple' || choice.value === 'orange' || choice.value === 'blue'
  ));
  if (pending.kind === 'card-effect-choice'
    && traceColors.length === choices.length
    && (rawCardId.startsWith('seti_alien:any-trace:') || /life[ -]?trace.*colou?r/i.test(pending.prompt))) {
    return { kind: 'trace-color', choices: traceColors.map((choice) => ({ ...choice, color: choice.value as TraceColor })) };
  }

  if (pending.kind === 'card-effect-choice'
    && (rawCardId.includes('seti_alien:exo-') || /exofossil/i.test(pending.prompt))) {
    const quantities = choices.map((choice) => ({ ...choice, amount: Number(choice.value) }));
    if (quantities.every((choice) => Number.isInteger(choice.amount) && choice.amount >= 0)) {
      const amountSet = new Set(quantities.map((choice) => choice.amount));
      const optionMaximum = Math.max(...amountSet);
      const isZeroThroughHeld = amountSet.size === optionMaximum + 1
        && Array.from({ length: optionMaximum + 1 }, (_, amount) => amountSet.has(amount)).every(Boolean);
      if (isZeroThroughHeld) {
        return { kind: 'exofossil-quantity', held: Math.max(optionMaximum, oumuamuaHeld(view, pending)), choices: quantities };
      }
    }
    const actions = choices.filter((choice): choice is IndexedChoice & { action: 'spend' | 'skip' } => (
      choice.value === 'spend' || choice.value === 'skip'
    ));
    if (actions.length === choices.length && new Set(actions.map((choice) => choice.value)).size === 2) {
      return { kind: 'exofossil-spend', choices: actions.map((choice) => ({ ...choice, action: choice.value as 'spend' | 'skip' })) };
    }
  }

  if (pending.kind === 'centaurian-reward') {
    const rewards = choices.flatMap((choice) => {
      const match = /^reward:([0-3])$/.exec(choice.value);
      return match ? [{ ...choice, rewardIndex: Number(match[1]) as 0 | 1 | 2 | 3 }] : [];
    });
    return rewards.length === choices.length ? { kind: 'centaurian-reward', choices: rewards } : null;
  }

  const sourceCardId = alienCardId(pending);
  if (pending.kind === 'card-effect-choice' && sourceCardId) {
    const rewards = choices.flatMap((choice) => {
      const match = /^reward:(\d+)$/.exec(choice.value);
      return match ? [{ ...choice, rewardIndex: Number(match[1]) }] : [];
    });
    if (rewards.length === choices.length) return { kind: 'alien-mission-reward', cardId: sourceCardId, choices: rewards };

    if (rawCardId.includes('seti_alien:effect-choice:')) {
      const effects = choices.flatMap((choice) => {
        const effectIndex = Number(choice.value);
        return Number.isInteger(effectIndex) && effectIndex >= 0 ? [{ ...choice, effectIndex }] : [];
      });
      if (effects.length === choices.length) return { kind: 'alien-effect-region', cardId: sourceCardId, choices: effects };
    }
  }

  return null;
}

function imagePath(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const item = record(value);
  const image = item.front ?? item.image ?? item.face ?? item.path;
  return typeof image === 'string' ? image : null;
}

export function setiAlienBoardArt(scene: SetiSceneDef | null, speciesId: string): string | null {
  if (!scene) return null;
  const boards: UnknownRecord[] = Array.isArray(scene.alienBoards)
    ? scene.alienBoards.map(record)
    : Object.entries(scene.alienBoards ?? {}).map(([id, board]) => ({ id, ...record(board) } as UnknownRecord));
  const board = boards.find((candidate) => String(candidate.id) === speciesId);
  return imagePath(board?.front ?? board?.image ?? board);
}

function Root({ model, className, children }: { model: SetiPendingArtifactModel; className?: string; children: ReactNode }) {
  return (
    <aside
      className={`seti-pending-artifacts is-${model.kind} ${className ?? ''}`.trim()}
      data-seti-pending-artifact={model.kind}
      aria-label="visual decision"
    >
      {children}
    </aside>
  );
}

function indexedButtonProps(choice: IndexedChoice, onChoose: (index: number) => void, enabled: boolean) {
  return {
    type: 'button' as const,
    disabled: !enabled,
    'data-seti-option-index': choice.index,
    onClick: () => onChoose(choice.index),
  };
}

function ProjectFan({ scene, model, onChoose, enabled }: {
  scene: SetiSceneDef | null;
  model: Extract<SetiPendingArtifactModel, { kind: 'end-round-card' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  const middle = (model.choices.length - 1) / 2;
  return <div className="seti-pending-artifact-fan">
    {model.choices.map((choice, position) => (
      <button
        key={`${choice.index}-${choice.cardId}`}
        {...indexedButtonProps(choice, onChoose, enabled)}
        style={{ '--seti-fan-offset': position - middle } as CSSProperties}
        aria-label={`keep end-of-round project card ${position + 1}`}
      >
        <SetiCardArt scene={scene} cardId={choice.cardId} />
      </button>
    ))}
  </div>;
}

function VisitReward({ scene, model, onChoose, enabled }: {
  scene: SetiSceneDef | null;
  model: Extract<SetiPendingArtifactModel, { kind: 'project-visit-reward' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  return <div className="seti-pending-artifact-visit">
    <div className="seti-pending-artifact-source-card"><SetiCardArt scene={scene} cardId={model.cardId} /></div>
    <div className="seti-pending-artifact-visit-path" aria-hidden="true" />
    <button {...indexedButtonProps(model.publicity, onChoose, enabled)} className="is-publicity" aria-label="take the printed visit publicity">
      <span className="seti-pending-artifact-icon-disc"><SetiIcon name="publicity" /><b>+1</b></span>
    </button>
    <button {...indexedButtonProps(model.move, onChoose, enabled)} className="is-move" aria-label="move a probe instead of taking publicity">
      <span className="seti-pending-artifact-move"><SetiIcon name="probe" /><i /></span>
    </button>
  </div>;
}

function TraceColors({ model, onChoose, enabled }: {
  model: Extract<SetiPendingArtifactModel, { kind: 'trace-color' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  return <div className="seti-pending-artifact-traces">
    {model.choices.map((choice) => <button
      key={`${choice.index}-${choice.color}`}
      {...indexedButtonProps(choice, onChoose, enabled)}
      className={`is-${choice.color}`}
      aria-label={`mark a ${choice.color} life trace`}
    >
      <span className="seti-pending-artifact-trace-token" aria-hidden="true"><i /><i /><i /></span>
      <span className="seti-pending-artifact-trace-lane" aria-hidden="true" />
    </button>)}
  </div>;
}

function TuckIncome({ scene, model, onChoose, enabled }: {
  scene: SetiSceneDef | null;
  model: Extract<SetiPendingArtifactModel, { kind: 'tuck-income' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  return <div className="seti-pending-artifact-tuck">
    <button {...indexedButtonProps(model.tuck, onChoose, enabled)} className="is-tuck" aria-label="tuck this physical card into income">
      <SetiCardArt scene={scene} cardId={model.cardId} />
      <span aria-hidden="true"><SetiIcon name="card" /><i /></span>
    </button>
    <div className="seti-pending-artifact-tuck-path" aria-hidden="true" />
    <button {...indexedButtonProps(model.skip, onChoose, enabled)} className="is-skip" aria-label="leave this card where it is">
      <span className="seti-pending-artifact-zero" aria-hidden="true">0</span>
    </button>
  </div>;
}

function ExofossilQuantity({ model, onChoose, enabled }: {
  model: Extract<SetiPendingArtifactModel, { kind: 'exofossil-quantity' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  return <div className="seti-pending-artifact-exofossils" style={{ '--seti-exofossil-held': model.held } as CSSProperties}>
    {model.choices.map((choice) => <button
      key={`${choice.index}-${choice.amount}`}
      {...indexedButtonProps(choice, onChoose, enabled)}
      className={choice.amount === 0 ? 'is-zero' : ''}
      aria-label={choice.amount === 0 ? 'spend zero exofossils' : `spend ${choice.amount} exofossils`}
    >
      {choice.amount === 0
        ? <span className="seti-pending-artifact-zero" aria-hidden="true">0</span>
        : <span className="seti-pending-artifact-token-stack" aria-hidden="true">
            {Array.from({ length: Math.min(4, choice.amount) }, (_, token) => <img key={token} src="/seti/tokens/exofossil.webp" alt="" />)}
            <b>{choice.amount}</b>
          </span>}
    </button>)}
  </div>;
}

function ExofossilSpend({ model, onChoose, enabled }: {
  model: Extract<SetiPendingArtifactModel, { kind: 'exofossil-spend' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  return <div className="seti-pending-artifact-exofossil-spend">
    {model.choices.map((choice) => <button
      key={`${choice.index}-${choice.action}`}
      {...indexedButtonProps(choice, onChoose, enabled)}
      className={`is-${choice.action}`}
      aria-label={choice.action === 'spend' ? 'spend one exofossil' : 'skip spending an exofossil'}
    >
      {choice.action === 'spend'
        ? <><img src="/seti/tokens/exofossil.webp" alt="" /><i aria-hidden="true" /></>
        : <span className="seti-pending-artifact-zero" aria-hidden="true">0</span>}
    </button>)}
  </div>;
}

const CENTAURIAN_REWARD_X = [26.96, 42.58, 57.88, 73.05] as const;

function CentaurianRewards({ scene, model, onChoose, enabled }: {
  scene: SetiSceneDef | null;
  model: Extract<SetiPendingArtifactModel, { kind: 'centaurian-reward' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  const art = setiAlienBoardArt(scene, 'centaurians') ?? '/seti/aliens/centaurians.webp';
  return <figure className="seti-pending-artifact-centaurian">
    <img src={art} alt="Centaurian research board" draggable={false} />
    {model.choices.map((choice) => <button
      key={`${choice.index}-${choice.rewardIndex}`}
      {...indexedButtonProps(choice, onChoose, enabled)}
      style={{ '--seti-socket-x': `${CENTAURIAN_REWARD_X[choice.rewardIndex]}%` } as CSSProperties}
      aria-label={`take Centaurian message reward ${choice.rewardIndex + 1}`}
    ><i aria-hidden="true" /></button>)}
  </figure>;
}

function choicePoint(index: number, slots: number): CSSProperties {
  const boundedSlots = Math.max(1, slots);
  return {
    '--seti-choice-x': `${(index + 0.5) / boundedSlots * 100}%`,
    '--seti-choice-width': `${100 / boundedSlots}%`,
  } as CSSProperties;
}

function AlienCardRewards({ scene, model, onChoose, enabled }: {
  scene: SetiSceneDef | null;
  model: Extract<SetiPendingArtifactModel, { kind: 'alien-mission-reward' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  const slots = Math.max(3, ...model.choices.map((choice) => choice.rewardIndex + 1));
  return <figure className="seti-pending-artifact-alien-card is-mission">
    <SetiCardArt scene={scene} cardId={model.cardId} />
    {model.choices.map((choice) => <button
      key={`${choice.index}-${choice.rewardIndex}`}
      {...indexedButtonProps(choice, onChoose, enabled)}
      style={choicePoint(choice.rewardIndex, slots)}
      aria-label={`take printed alien mission reward ${choice.rewardIndex + 1}`}
    ><i aria-hidden="true" /></button>)}
  </figure>;
}

function AlienEffectRegions({ scene, model, onChoose, enabled }: {
  scene: SetiSceneDef | null;
  model: Extract<SetiPendingArtifactModel, { kind: 'alien-effect-region' }>;
  onChoose: (index: number) => void;
  enabled: boolean;
}) {
  const slots = Math.max(1, ...model.choices.map((choice) => choice.effectIndex + 1));
  return <figure className="seti-pending-artifact-alien-card is-effects">
    <SetiCardArt scene={scene} cardId={model.cardId} />
    {model.choices.map((choice) => <button
      key={`${choice.index}-${choice.effectIndex}`}
      {...indexedButtonProps(choice, onChoose, enabled)}
      style={choicePoint(choice.effectIndex, slots)}
      aria-label={`use printed alien effect ${choice.effectIndex + 1}`}
    ><i aria-hidden="true" /></button>)}
  </figure>;
}

export function SetiPendingArtifacts({ scene, view, pending, onChoose, className }: SetiPendingArtifactProps) {
  const model = setiPendingArtifactModel(view, pending);
  if (!model || !pending) return null;
  const enabled = view.you !== null && (pending.owner < 0 || pending.owner === view.you);
  let content: ReactNode;
  switch (model.kind) {
    case 'end-round-card': content = <ProjectFan scene={scene} model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'project-visit-reward': content = <VisitReward scene={scene} model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'tuck-income': content = <TuckIncome scene={scene} model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'trace-color': content = <TraceColors model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'exofossil-quantity': content = <ExofossilQuantity model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'exofossil-spend': content = <ExofossilSpend model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'centaurian-reward': content = <CentaurianRewards scene={scene} model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'alien-mission-reward': content = <AlienCardRewards scene={scene} model={model} onChoose={onChoose} enabled={enabled} />; break;
    case 'alien-effect-region': content = <AlienEffectRegions scene={scene} model={model} onChoose={onChoose} enabled={enabled} />; break;
  }
  return <Root model={model} className={className}>{content}</Root>;
}
