import type { SetiUiPending, SetiUiView } from './setiView';

export interface SetiPendingBodyChoice {
  index: number;
  pieceId: string | null;
  spacecraftId: string | null;
  body: string;
  action: 'orbit' | 'land' | 'remove';
}

export interface SetiPendingMoveChoice {
  index: number;
  pieceId: string;
  cell: string;
}

export interface SetiPendingSampleChoice {
  index: number;
  body: 'Jupiter' | 'Saturn';
  order: number;
}

export const SETI_COMPUTER_TECH_TRACK_SLOTS = [0, 1, 3, 5] as const;

export type SetiPendingScanStepKey =
  | 'earth'
  | 'project-row'
  | 'discard-extra-signal'
  | 'mercury-publicity-signal'
  | 'energy-launch-or-move'
  | 'done';

export type SetiPendingScanStepSurface =
  | 'earth-body'
  | 'project-row'
  | 'telescope-tech-discard'
  | 'telescope-tech-mercury'
  | 'telescope-tech-energy'
  | 'finish';

export interface SetiPendingComputerTechChoice {
  index: number;
  /** Exact option as emitted by the engine. Commit this choice by `index`. */
  rawOption: unknown;
  boardSlot: 0 | 1 | 2 | 3;
  /** Printed top-space index on the six-space computer track. */
  trackSlot: 0 | 1 | 3 | 5;
  stackId: string | null;
  tileId: string | null;
  targetId: string;
}

export interface SetiPendingScanStepChoice {
  index: number;
  /** Exact option as emitted by the engine. Commit this choice by `index`. */
  rawOption: unknown;
  key: SetiPendingScanStepKey;
  surface: SetiPendingScanStepSurface;
  targetId: string;
}

export interface SetiPendingMissionChoice {
  index: number;
  /** Exact `claim|...` or `complete|...` engine option. */
  rawOption: unknown;
  action: 'claim' | 'complete';
  cardId: string;
  slotId: string | null;
  /** Stable per-hotspot identity; unlike a card ID, this cannot collapse slots. */
  targetId: string;
}

export interface SetiPendingOumuamuaTileChoice {
  index: number;
  tileSlot: number;
  rawOption: unknown;
  targetId: string;
}

export interface SetiPendingPresentation {
  pieceIndexes: ReadonlyMap<string, number>;
  spacecraftIndexes: ReadonlyMap<string, number>;
  cellIndexes: ReadonlyMap<string, number>;
  sectorIndexes: ReadonlyMap<string, number>;
  rowIndexes: ReadonlyMap<number, number>;
  cardIndexes: ReadonlyMap<string, number>;
  /** Legacy whole-card targets, populated only when a card has one choice. */
  missionIndexes: ReadonlyMap<string, number>;
  /** Exact mission hotspot target ID to reducer option index. */
  missionTargetIndexes: ReadonlyMap<string, number>;
  missionChoices: readonly SetiPendingMissionChoice[];
  computerTechChoices: readonly SetiPendingComputerTechChoice[];
  scanStepChoices: readonly SetiPendingScanStepChoice[];
  oumuamuaTileChoices: readonly SetiPendingOumuamuaTileChoice[];
  bodyChoices: readonly SetiPendingBodyChoice[];
  moveChoices: readonly SetiPendingMoveChoice[];
  sampleChoices: readonly SetiPendingSampleChoice[];
  projectDeckIndex: number | null;
  alienDeckIndex: number | null;
  finishIndexes: readonly number[];
  /** Every reducer option index represented by an exact physical target. */
  mappedIndexes: ReadonlySet<number>;
  /** Non-finish options which still require a specialized renderer. */
  unmappedIndexes: readonly number[];
  direct: boolean;
}

const CELL = /^(?:seti_cell_)?r[0-2]s[0-7]$/i;
const BODY_NAMES = new Set([
  'Earth', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Oumuamua',
  'Phobos', 'Deimos', 'Callisto', 'Ganymede', 'Europa', 'Enceladus', 'Titan', 'Titania', 'Triton',
]);

const SCAN_STEP_SURFACES: Readonly<Record<SetiPendingScanStepKey, SetiPendingScanStepSurface>> = {
  earth: 'earth-body',
  'project-row': 'project-row',
  'discard-extra-signal': 'telescope-tech-discard',
  'mercury-publicity-signal': 'telescope-tech-mercury',
  'energy-launch-or-move': 'telescope-tech-energy',
  done: 'finish',
};

const SCAN_STEP_KEYS = new Set<string>(Object.keys(SCAN_STEP_SURFACES));

function isScanStepKey(value: string): value is SetiPendingScanStepKey {
  return SCAN_STEP_KEYS.has(value);
}

function optionValue(option: unknown): string {
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  if (!option || typeof option !== 'object') return '';
  const item = option as Record<string, unknown>;
  const choice = item.choice && typeof item.choice === 'object' ? item.choice as Record<string, unknown> : null;
  const value = choice?.option ?? choice?.value ?? choice?.id
    ?? item.option ?? item.value ?? item.id ?? item.cardId ?? item.sectorId ?? item.spaceId ?? item.stackId;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function normalizeCell(value: string): string {
  return value.startsWith('seti_cell_') ? value : `seti_cell_${value.toLowerCase()}`;
}

/**
 * Resolve engine choices back to the physical component that represents them.
 * The view remains the authority: this helper only changes presentation and
 * always returns the original option index for the reducer action.
 */
export function setiPendingPresentation(pending: SetiUiPending | null, view: SetiUiView): SetiPendingPresentation {
  const pieceIndexes = new Map<string, number>();
  const spacecraftIndexes = new Map<string, number>();
  const cellIndexes = new Map<string, number>();
  const sectorIndexes = new Map<string, number>();
  const rowIndexes = new Map<number, number>();
  const cardIndexes = new Map<string, number>();
  const missionIndexes = new Map<string, number>();
  const missionTargetIndexes = new Map<string, number>();
  const missionChoices: SetiPendingMissionChoice[] = [];
  const computerTechChoices: SetiPendingComputerTechChoice[] = [];
  const scanStepChoices: SetiPendingScanStepChoice[] = [];
  const oumuamuaTileChoices: SetiPendingOumuamuaTileChoice[] = [];
  const bodyChoices: SetiPendingBodyChoice[] = [];
  const moveChoices: SetiPendingMoveChoice[] = [];
  const sampleChoices: SetiPendingSampleChoice[] = [];
  let projectDeckIndex: number | null = null;
  let alienDeckIndex: number | null = null;
  const finishIndexes: number[] = [];
  if (!pending) return { pieceIndexes, spacecraftIndexes, cellIndexes, sectorIndexes, rowIndexes, cardIndexes, missionIndexes, missionTargetIndexes, missionChoices, computerTechChoices, scanStepChoices, oumuamuaTileChoices, bodyChoices, moveChoices, sampleChoices, projectDeckIndex, alienDeckIndex, finishIndexes, mappedIndexes: new Set(), unmappedIndexes: [], direct: false };

  const pieces = new Set(view.pieces.map((piece) => piece.id));
  const spacecraft = new Set((view.placedSpacecraft ?? []).map((piece) => piece.id));
  const sectors = new Set(view.sectors.map((sector) => sector.id));
  const cards = new Set([
    ...view.projectRow,
    ...view.players.flatMap((player) => [...player.hand, ...player.alienHand, ...player.hiddenExertian, ...player.missions, ...player.income]),
    ...view.species.map((species) => species.faceUp),
  ].filter(Boolean));

  const serializedScanSteps = pending.kind === 'card-effect-choice' && (
    /\bScan element\b/i.test(pending.prompt)
    || pending.raw.cardId === 'seti_main_scan'
    || pending.options.some((option) => {
      const value = optionValue(option);
      return value !== 'done' && isScanStepKey(value);
    })
  );

  pending.options.forEach((raw, index) => {
    const value = optionValue(raw);
    if (!value) return;
    if (pending.kind === 'computer-tech-slot') {
      const boardSlot = Number(value);
      if (Number.isInteger(boardSlot) && boardSlot >= 0 && boardSlot < SETI_COMPUTER_TECH_TRACK_SLOTS.length) {
        const typedBoardSlot = boardSlot as SetiPendingComputerTechChoice['boardSlot'];
        computerTechChoices.push({
          index,
          rawOption: raw,
          boardSlot: typedBoardSlot,
          trackSlot: SETI_COMPUTER_TECH_TRACK_SLOTS[typedBoardSlot],
          stackId: typeof pending.raw.stackId === 'string' ? pending.raw.stackId : null,
          tileId: typeof pending.raw.tileId === 'string' ? pending.raw.tileId : null,
          targetId: `computer-tech-slot:${typedBoardSlot}`,
        });
        return;
      }
    }
    if (serializedScanSteps && isScanStepKey(value)) {
      scanStepChoices.push({
        index,
        rawOption: raw,
        key: value,
        surface: SCAN_STEP_SURFACES[value],
        targetId: `scan-step:${value}`,
      });
      if (value === 'done') finishIndexes.push(index);
      return;
    }
    if (/^(?:skip|done|continue)$/i.test(value)) {
      finishIndexes.push(index);
      return;
    }
    const sampleBodyFromCard = /seti_alien:sample:(?:take|inspect):.+:(Jupiter|Saturn)$/.exec(String(pending.raw.cardId ?? ''))?.[1] as 'Jupiter' | 'Saturn' | undefined;
    const sample = /^sample:seti_mascamite_sample_\d+$/i.exec(value);
    const anySample = /^(Jupiter|Saturn):seti_mascamite_sample_\d+$/i.exec(value);
    const sampleBody = sample ? sampleBodyFromCard : anySample?.[1] as 'Jupiter' | 'Saturn' | undefined;
    if ((sample || anySample) && sampleBody) {
      sampleChoices.push({ index, body: sampleBody, order: sampleChoices.filter((choice) => choice.body === sampleBody).length });
      return;
    }
    if (value === 'deck') {
      if (pending.kind === 'alien-card-source') alienDeckIndex = index;
      else projectDeckIndex = index;
      return;
    }
    const prefixedFaceUp = /^face-up:(.+)$/.exec(value);
    if (prefixedFaceUp && cards.has(prefixedFaceUp[1])) {
      cardIndexes.set(prefixedFaceUp[1], index);
      return;
    }
    const prefixedSector = /^sector:(.+)$/.exec(value);
    if (prefixedSector && sectors.has(prefixedSector[1])) {
      sectorIndexes.set(prefixedSector[1], index);
      return;
    }
    const oumuamuaTile = /^tile:(\d+)$/.exec(value);
    if (oumuamuaTile && view.bodyCells.Oumuamua) {
      const tileSlot = Number(oumuamuaTile[1]);
      oumuamuaTileChoices.push({ index, tileSlot, rawOption: raw, targetId: `oumuamua-tile:${tileSlot}` });
      return;
    }
    const movement = /^([^|]+)\|((?:seti_cell_)?r[0-2]s[0-7])\|\d+$/i.exec(value);
    if (movement && pieces.has(movement[1])) {
      moveChoices.push({ index, pieceId: movement[1], cell: normalizeCell(movement[2]) });
      return;
    }
    if (pieces.has(value)) {
      pieceIndexes.set(value, index);
      return;
    }
    if (spacecraft.has(value)) {
      spacecraftIndexes.set(value, index);
      return;
    }
    if (CELL.test(value)) {
      cellIndexes.set(normalizeCell(value), index);
      return;
    }
    if (sectors.has(value)) {
      sectorIndexes.set(value, index);
      return;
    }
    const row = /^row:(\d+)$/.exec(value);
    if (row) {
      rowIndexes.set(Number(row[1]), index);
      return;
    }
    if (cards.has(value)) {
      cardIndexes.set(value, index);
      return;
    }

    const missionClaim = /^claim\|([^|]+)\|([^|]+)$/.exec(value);
    const missionComplete = /^complete\|([^|]+)$/.exec(value);
    if (pending.kind === 'manual-trigger-choice' && (missionClaim || missionComplete)) {
      const action = missionClaim ? 'claim' as const : 'complete' as const;
      const cardId = (missionClaim ?? missionComplete)![1];
      const slotId = missionClaim?.[2] ?? null;
      const targetId = `mission:${cardId}:${slotId === null ? 'complete' : `slot:${slotId}`}`;
      const choice: SetiPendingMissionChoice = { index, rawOption: raw, action, cardId, slotId, targetId };
      missionChoices.push(choice);
      missionTargetIndexes.set(targetId, index);
      return;
    }
    const exertian = /^\d+\|(seti_alien_[^|]+)$/i.exec(value);
    if (exertian) {
      cardIndexes.set(exertian[1], index);
      return;
    }

    const actionBody = /^(orbit|land)\|([^|]+)\|([^|]+)(?:\|occupied:([^|]+))?$/.exec(value);
    if (actionBody && pieces.has(actionBody[2]) && BODY_NAMES.has(actionBody[3])) {
      bodyChoices.push({ index, action: actionBody[1] as 'orbit' | 'land', pieceId: actionBody[2], spacecraftId: actionBody[4] ?? null, body: actionBody[3] });
      return;
    }
    const occupiedLanding = /^([^|]+)\|([^|]+)\|occupied:([^|]+)$/.exec(value);
    if (occupiedLanding && pieces.has(occupiedLanding[1]) && BODY_NAMES.has(occupiedLanding[2]) && spacecraft.has(occupiedLanding[3])) {
      bodyChoices.push({ index, action: 'land', pieceId: occupiedLanding[1], spacecraftId: occupiedLanding[3], body: occupiedLanding[2] });
      return;
    }
    const pieceBody = /^([^|]+)\|([^|]+)$/.exec(value);
    if (pieceBody && pieces.has(pieceBody[1]) && BODY_NAMES.has(pieceBody[2])) {
      bodyChoices.push({ index, action: 'land', pieceId: pieceBody[1], spacecraftId: null, body: pieceBody[2] });
      return;
    }
    if (BODY_NAMES.has(value)) {
      bodyChoices.push({ index, action: 'remove', pieceId: null, spacecraftId: null, body: value });
    }
  });

  // Preserve the existing whole-card gesture only where it is lossless. A
  // card with two reward circles deliberately falls back until its renderer
  // consumes `missionChoices` and exposes the individual printed hotspots.
  for (const choice of missionChoices) {
    if (missionChoices.filter((candidate) => candidate.cardId === choice.cardId).length === 1) {
      missionIndexes.set(choice.cardId, choice.index);
    }
  }

  const mappedIndexes = new Set<number>([
    ...pieceIndexes.values(),
    ...spacecraftIndexes.values(),
    ...cellIndexes.values(),
    ...sectorIndexes.values(),
    ...rowIndexes.values(),
    ...cardIndexes.values(),
    ...missionTargetIndexes.values(),
    ...computerTechChoices.map((choice) => choice.index),
    ...scanStepChoices.map((choice) => choice.index),
    ...oumuamuaTileChoices.map((choice) => choice.index),
    ...bodyChoices.map((choice) => choice.index),
    ...moveChoices.map((choice) => choice.index),
    ...sampleChoices.map((choice) => choice.index),
    ...finishIndexes,
    ...(projectDeckIndex === null ? [] : [projectDeckIndex]),
    ...(alienDeckIndex === null ? [] : [alienDeckIndex]),
  ]);
  if (pending.kind === 'tech-stack' || pending.kind === 'trace-space' || pending.kind === 'signal-sector' || pending.kind === 'completed-sector-order' || pending.kind === 'gold-tile' || pending.kind === 'mars-first-data') {
    pending.options.forEach((_, index) => mappedIndexes.add(index));
  }
  const unmappedIndexes = pending.options.map((_, index) => index).filter((index) => !mappedIndexes.has(index) && !finishIndexes.includes(index));
  const direct = pending.options.length > 0 && unmappedIndexes.length === 0;
  return { pieceIndexes, spacecraftIndexes, cellIndexes, sectorIndexes, rowIndexes, cardIndexes, missionIndexes, missionTargetIndexes, missionChoices, computerTechChoices, scanStepChoices, oumuamuaTileChoices, bodyChoices, moveChoices, sampleChoices, projectDeckIndex, alienDeckIndex, finishIndexes, mappedIndexes, unmappedIndexes, direct };
}

export function setiPendingCue(presentation: SetiPendingPresentation, pending: SetiUiPending): string | null {
  if (!presentation.direct) return null;
  if (presentation.cellIndexes.size) return 'TOUCH THE GLOWING DESTINATION';
  if (presentation.moveChoices.length) return 'TOUCH A PROBE, THEN ITS DESTINATION';
  if (presentation.sampleChoices.length) return 'TOUCH A SAMPLE TOKEN';
  if (presentation.oumuamuaTileChoices.length) return "TOUCH THE GLOWING 'OUMUAMUA SIGNAL SOCKET";
  if (presentation.bodyChoices.length) return presentation.bodyChoices.some((choice) => choice.pieceId)
    ? 'TOUCH A PROBE, THEN ITS DESTINATION'
    : 'TOUCH THE GLOWING SPACECRAFT';
  if (presentation.spacecraftIndexes.size) return 'TOUCH THE GLOWING SPACECRAFT';
  if (presentation.pieceIndexes.size) return 'TOUCH A GLOWING PROBE';
  if (presentation.rowIndexes.size || presentation.projectDeckIndex !== null) return 'TOUCH A GLOWING PROJECT SOURCE';
  if (presentation.alienDeckIndex !== null) return 'TOUCH THE ALIEN CARD SOURCE';
  if (presentation.computerTechChoices.length) return 'TOUCH A GLOWING COMPUTER SPACE';
  if (presentation.missionChoices.length || presentation.missionIndexes.size) return 'TOUCH A GLOWING MISSION CIRCLE';
  if (presentation.scanStepChoices.length) return 'TOUCH THE NEXT PRINTED SCAN ELEMENT';
  if (presentation.cardIndexes.size) return 'TOUCH A GLOWING CARD';
  if (presentation.sectorIndexes.size || pending.kind === 'signal-sector' || pending.kind === 'completed-sector-order') return 'TOUCH A GLOWING STAR SECTOR';
  if (pending.kind === 'gold-tile') return 'TOUCH A GLOWING GOLD TILE';
  if (pending.kind === 'mars-first-data') return 'TOUCH A PRINTED MARS DATA TOKEN';
  if (pending.kind === 'tech-stack') return 'TOUCH A GLOWING TECH TILE';
  if (pending.kind === 'trace-space') return 'TOUCH A GLOWING ALIEN SPACE';
  return null;
}
