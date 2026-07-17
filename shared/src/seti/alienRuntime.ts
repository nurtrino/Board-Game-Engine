// Reducer-side execution for the fully transcribed SETI alien catalog.
// This module owns no turn scheduling. It mutates only alien state and uses
// small callbacks for core engine operations that already live in actions.ts.

import {
  SETI_ALIEN_CARDS_BY_ID,
  SETI_ALIEN_DISCOVERY_SLOTS,
  SETI_ALIEN_SPECIES_BY_ID,
  SETI_ANOMALY_TOKENS,
  SETI_CENTAURIAN_MESSAGE_REWARDS,
  SETI_MASCAMITE_SAMPLE_REWARDS,
  type SetiAlienCardDefinition,
  type SetiAlienCondition,
  type SetiAlienEffect,
  type SetiAlienIncome,
  type SetiAlienResearchSpace,
  type SetiAlienReward,
  type SetiExertianScoringCondition,
} from './alienCatalog.js';
import {
  SETI_BODIES,
  SETI_RULES,
  SETI_SECTORS,
  SETI_SECTOR_IDS,
  SETI_TECH_BY_ID,
  SETI_TECH_STACKS,
  adjacentSetiCells,
  parseSetiCell,
  setiCellId,
  type SetiBody,
  type SetiCellId,
  type SetiKnownRewardOp,
  type SetiPrimaryBody,
  type SetiSectorId,
  type SetiTechStackId,
  type SetiTraceColor,
} from './data.js';
import { SETI_PROJECT_CATALOG_BY_ID, type SetiProjectFreeCorner } from './projectCatalog.js';
import {
  bodyAtSetiCell,
  drawSetiProjectCard,
  earthSetiSectorId,
  getSetiBodyCells,
  isSetiAsteroidCell,
  isSetiPublicityCell,
  placeSetiSpacecraft,
  refillSetiProjectRow,
  setiFirstLandingSpaceId,
  setiFirstOrbitSpaceAvailable,
  setiFirstOrbitSpaceId,
  setiMoonLandingSpaceId,
  setiPlayerLanders,
  setiPlayerOrbiters,
  setiPlayerHasAbility,
  setiSupportLayerForCell,
  setiTraceTargets,
  type SetiPendingDecision,
  type SetiPlayer,
  type SetiSolarPiece,
  type SetiSpeciesSlotState,
  type SetiState,
} from './state.js';

export interface SetiAlienRuntimeHooks {
  rotateSolarSystem(s: SetiState): void;
  markSectorSignal(s: SetiState, seat: number, sectorId: SetiSectorId): void;
  settleCompletedSectors(s: SetiState, owner: number): void;
  recordSolarVisit?(s: SetiState, player: SetiPlayer, piece: SetiSolarPiece, from: SetiCellId, to: SetiCellId): void;
  onDiscardFreeCorner?(s: SetiState, player: SetiPlayer, corner: SetiProjectFreeCorner): void;
}

export interface SetiAlienRuntimeResult {
  handled: boolean;
  error?: string;
}

const ok = (): SetiAlienRuntimeResult => ({ handled: true });
const failure = (error: string): SetiAlienRuntimeResult => ({ handled: true, error });

function gainScore(player: SetiPlayer, amount: number): void {
  player.score = Math.max(0, player.score + amount);
}

function gainPublicity(player: SetiPlayer, amount: number): void {
  player.publicity = Math.max(0, Math.min(SETI_RULES.publicityMax, player.publicity + amount));
}

function gainData(player: SetiPlayer, amount: number): void {
  player.dataPool = Math.max(0, Math.min(SETI_RULES.dataMax, player.dataPool + amount));
}

function drawProjects(s: SetiState, player: SetiPlayer, amount: number): void {
  for (let i = 0; i < amount; i++) {
    const card = drawSetiProjectCard(s);
    if (card) player.hand.push(card);
  }
}

function nextEmittedEffectId(s: SetiState): number {
  return s.projectRuntime.nextResolutionId++;
}

function speciesSlot(s: SetiState, species: string): SetiSpeciesSlotState | null {
  return s.species.find((slot) => slot.revealed && slot.speciesId === species) ?? null;
}

function oumuamuaSlot(s: SetiState): SetiSpeciesSlotState | null {
  return speciesSlot(s, 'oumuamua');
}

function anomalySlot(s: SetiState): SetiSpeciesSlotState | null {
  return speciesSlot(s, 'anomalies');
}

function cardSpeciesSlot(s: SetiState, card: SetiAlienCardDefinition): SetiSpeciesSlotState | null {
  return s.species.find((slot) => slot.speciesId === card.species) ?? null;
}

function alienProjectCorner(card: SetiAlienCardDefinition): SetiProjectFreeCorner | null {
  if (card.freeCorner.some((reward) => reward.kind === 'gain' && reward.resource === 'movement')) return 'move';
  if (card.freeCorner.some((reward) => reward.kind === 'gain' && reward.resource === 'publicity')) return 'publicity';
  if (card.freeCorner.some((reward) => reward.kind === 'gain' && reward.resource === 'data')) return 'data';
  return null;
}

function projectSourceOptions(s: SetiState, source: 'row' | 'row-or-deck'): string[] {
  const row = s.projectRow.flatMap((card, index) => card ? [`row:${index}`] : []);
  return source === 'row' ? row : ['deck', ...row];
}

function queueProjectDraw(s: SetiState, player: SetiPlayer, amount: number, source: 'deck' | 'row' | 'row-or-deck'): void {
  if (source === 'deck') {
    drawProjects(s, player, amount);
    return;
  }
  if (source === 'row' && amount >= s.projectRow.filter(Boolean).length) {
    player.hand.push(...s.projectRow.filter((card): card is string => card !== null));
    s.projectRow.fill(null);
    refillSetiProjectRow(s);
    return;
  }
  for (let i = 0; i < amount; i++) {
    s.pending.push({
      kind: 'card-effect-choice',
      owner: player.seat,
      cardId: `seti_alien:draw:${source}`,
      label: source === 'row' ? 'Take a card from the project row' : 'Take a project card from the row or deck',
      min: 1,
      max: 1,
      options: projectSourceOptions(s, source),
    });
  }
}

function oumuamuaSector(s: SetiState): SetiSectorId | null {
  const slot = oumuamuaSlot(s);
  if (!slot || slot.module?.kind !== 'oumuamua') return null;
  return s.sectorOrder[parseSetiCell(slot.module.cell).sector] ?? null;
}

function nextAnomaly(s: SetiState): { slot: SetiSpeciesSlotState; index: number } | null {
  const slot = anomalySlot(s);
  if (!slot || slot.module?.kind !== 'anomalies') return null;
  const earth = parseSetiCell(getSetiBodyCells(s).Earth!).sector;
  const ranked = slot.module.anomalies
    .map((anomaly, index) => ({ index, distance: ((anomaly.sector - earth) % 8 + 8) % 8 || 8 }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index);
  return ranked.length ? { slot, index: ranked[0].index } : null;
}

function sampleReward(sampleId: string): readonly SetiAlienReward[] {
  const number = Number(sampleId.slice(sampleId.lastIndexOf('_') + 1));
  return SETI_MASCAMITE_SAMPLE_REWARDS[number - 1] ?? [];
}

function traceOptionsForSpecies(
  s: SetiState,
  player: SetiPlayer,
  color: SetiTraceColor,
  speciesId?: string,
): string[] {
  const options = setiTraceTargets(s, color, player.seat);
  if (!speciesId) return options;
  const slot = s.species.find((candidate) => candidate.speciesId === speciesId);
  return slot ? options.filter((target) => target.startsWith(`seti_species_${slot.slot}_`)) : [];
}

function applySimpleReward(
  s: SetiState,
  player: SetiPlayer,
  reward: SetiAlienReward,
  hooks: SetiAlienRuntimeHooks,
  speciesId?: string,
): void {
  switch (reward.kind) {
    case 'gain':
      if (reward.resource === 'vp') gainScore(player, reward.amount);
      else if (reward.resource === 'credit') player.credits += reward.amount;
      else if (reward.resource === 'energy') player.energy += reward.amount;
      else if (reward.resource === 'publicity') gainPublicity(player, reward.amount);
      else if (reward.resource === 'data') gainData(player, reward.amount);
      else if (reward.resource === 'movement') queueAlienMovement(s, player, 'reward', reward.amount, false);
      else {
        const slot = oumuamuaSlot(s);
        if (slot?.module?.kind === 'oumuamua') slot.module.exofossils[player.seat] = (slot.module.exofossils[player.seat] ?? 0) + reward.amount;
      }
      break;
    case 'draw-project': queueProjectDraw(s, player, reward.amount, reward.source); break;
    case 'mark-trace': {
      const resolutionId = nextEmittedEffectId(s);
      const colors = reward.color === 'any' ? ['purple', 'orange', 'blue'] as const : [reward.color];
      if (colors.length === 1) {
        const color = colors[0];
        const options = traceOptionsForSpecies(s, player, color, speciesId);
        if (options.length) s.pending.push({ kind: 'trace-space', owner: player.seat, color, options, resolutionId });
      } else {
        s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:any-trace:${speciesId ?? 'any'}:${resolutionId}`, label: 'Choose a life-trace color', min: 1, max: 1, options: [...colors] });
      }
      break;
    }
    case 'mark-signal': {
      if (reward.location === 'one-chosen-sector') {
        s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:signals-together:${reward.amount}`, label: `Mark ${reward.amount} signals in one sector`, min: 1, max: 1, options: [...SETI_SECTOR_IDS] });
        break;
      }
      let options: SetiSectorId[] = [...SETI_SECTOR_IDS];
      if (reward.color) options = options.filter((id) => s.sectors[id] && id && (awaitedSectorColor(id) === reward.color));
      if (reward.location === 'oumuamua-sector') {
        const sector = oumuamuaSector(s);
        if (sector) options = [sector];
      } else if (reward.location === 'next-anomaly-sector') {
        const next = nextAnomaly(s);
        if (next?.slot.module?.kind === 'anomalies') options = [s.sectorOrder[next.slot.module.anomalies[next.index].sector]];
      } else if (reward.location === 'oumuamua-tile') {
        for (let i = 0; i < reward.amount; i++) queueOumuamuaSignalChoice(s, player, true);
        break;
      }
      for (let i = 0; i < reward.amount; i++) s.pending.push({ kind: 'signal-sector', owner: player.seat, source: 'effect', options, signalColor: reward.color ?? null });
      break;
    }
    case 'take-tech': {
      const options = SETI_TECH_STACKS
        .filter((stack) => reward.technology === 'any' || stack.type === reward.technology)
        .filter((stack) => s.techStacks[stack.id]?.tiles.length && !player.techs.some((tech) => tech.stackId === stack.id))
        .map((stack) => stack.id);
      if (options.length) s.pending.push({ kind: 'tech-stack', owner: player.seat, options, free: true, resolutionId: nextEmittedEffectId(s) });
      break;
    }
    case 'rotate-solar-system': hooks.rotateSolarSystem(s); break;
    case 'tuck-income':
      for (let i = 0; i < reward.amount; i++) queueAlienTuck(s, player);
      break;
    case 'resolve-mascamite-sample': break;
    case 'draw-alien-card': {
      const slot = speciesSlot(s, reward.species);
      if (!slot) break;
      for (let i = 0; i < reward.amount; i++) queueAlienCardSource(s, player, slot);
      break;
    }
  }
}

function awaitedSectorColor(id: SetiSectorId): 'yellow' | 'red' | 'blue' | 'black' {
  if (id === 'seti_sector_kepler_22' || id === 'seti_sector_61_virginis') return 'yellow';
  if (id === 'seti_sector_proxima_centauri' || id === 'seti_sector_barnards_star') return 'red';
  if (id === 'seti_sector_sirius_a' || id === 'seti_sector_procyon') return 'blue';
  return 'black';
}

function applyRewards(
  s: SetiState,
  player: SetiPlayer,
  rewards: readonly SetiAlienReward[],
  hooks: SetiAlienRuntimeHooks,
  speciesId?: string,
): void {
  for (const reward of rewards) applySimpleReward(s, player, reward, hooks, speciesId);
}

export function applySetiAlienDiscoverySpaceReward(s: SetiState, player: SetiPlayer, slot: 0 | 1, hooks: SetiAlienRuntimeHooks): void {
  applyRewards(s, player, SETI_ALIEN_DISCOVERY_SLOTS[slot].rewardPerSpace, hooks, s.species[slot].speciesId);
}

function researchDefinition(slot: SetiSpeciesSlotState, target: string): SetiAlienResearchSpace | null {
  const prefix = `seti_species_${slot.slot}_research_`;
  if (!target.startsWith(prefix)) return null;
  const id = target.slice(prefix.length);
  return SETI_ALIEN_SPECIES_BY_ID[slot.speciesId].researchSpaces.find((space) => space.id === id) ?? null;
}

export function resolveSetiAlienResearchSpace(
  s: SetiState,
  player: SetiPlayer,
  slot: SetiSpeciesSlotState,
  target: string,
  hooks: SetiAlienRuntimeHooks,
): string | null {
  const space = researchDefinition(slot, target);
  if (!space) return 'Unknown alien research space';
  if (!space.repeatable && slot.research.some((marker) => marker.spaceId === target)) return 'Alien research space is occupied';
  if (space.dynamic === 'mascamite-sample-token') {
    if (slot.module?.kind !== 'mascamites') return 'Mascamite samples are not set up';
    const index = Number(space.id.slice(space.id.lastIndexOf('_') + 1)) - 1;
    const samples = [slot.module.revealedBlueSample, ...slot.module.capsulesDelivered];
    const sample = samples[index];
    if (!sample) return 'That delivered sample is not available yet';
    applyRewards(s, player, sampleReward(sample), hooks, slot.speciesId);
  } else {
    if (space.payment?.resource === 'data-pool') {
      if (player.dataPool < space.payment.amount) return 'Not enough data in your pool';
      player.dataPool -= space.payment.amount;
    } else if (space.payment?.resource === 'exofossil') {
      if (slot.module?.kind !== 'oumuamua') return 'Exofossils are unavailable';
      const held = slot.module.exofossils[player.seat] ?? 0;
      if (held < space.payment.amount) return 'Not enough exofossils';
      slot.module.exofossils[player.seat] = held - space.payment.amount;
    }
    applyRewards(s, player, space.reward, hooks, slot.speciesId);
  }
  if (space.danger && slot.module?.kind === 'exertians') slot.module.dangerBySeat[player.seat] = (slot.module.dangerBySeat[player.seat] ?? 0) + space.danger;
  return null;
}

function anomalyColumnWinner(slot: SetiSpeciesSlotState, color: 'purple' | 'orange' | 'blue'): number | null {
  const prefix = `seti_species_${slot.slot}_research_anomalies_${color}_`;
  const markers = slot.research.filter((marker) => marker.spaceId.startsWith(prefix));
  if (!markers.length) return null;
  return markers.sort((a, b) => {
    const rowA = Number(a.spaceId.slice(a.spaceId.lastIndexOf('_') + 1));
    const rowB = Number(b.spaceId.slice(b.spaceId.lastIndexOf('_') + 1));
    if (rowA !== rowB) return rowA - rowB;
    return b.sequence - a.sequence;
  })[0].owner;
}

export function resolveSetiAlienRotation(s: SetiState, hooks: SetiAlienRuntimeHooks): void {
  const visitor = oumuamuaSlot(s);
  if (visitor?.module?.kind === 'oumuamua') visitor.module.cell = setiCellId(2, 5 + s.solar.orientations.disc3);
  const slot = anomalySlot(s);
  if (!slot || slot.module?.kind !== 'anomalies') return;
  const module = slot.module;
  const earth = parseSetiCell(getSetiBodyCells(s).Earth!).sector;
  module.anomalies.forEach((anomaly, index) => {
    if (anomaly.sector !== earth) return;
    module.triggerCount++;
    const token = SETI_ANOMALY_TOKENS[index];
    const winner = anomalyColumnWinner(slot, token.color);
    if (winner !== null && s.players[winner]) applyRewards(s, s.players[winner], token.sides[anomaly.side], hooks, 'anomalies');
  });
}

function queueAlienCardSource(s: SetiState, player: SetiPlayer, slot: SetiSpeciesSlotState): void {
  const options = [
    ...(slot.alienFaceUp ? [`face-up:${slot.alienFaceUp}`] : []),
    ...(slot.alienDeck.length ? ['deck'] : []),
  ];
  if (options.length) s.pending.push({ kind: 'alien-card-source', owner: player.seat, speciesSlot: slot.slot, options });
}

function queueAlienTuck(s: SetiState, player: SetiPlayer): void {
  const options = [...player.hand, ...player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species !== 'exertians')];
  if (options.length) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: 'seti_alien:tuck', label: 'Tuck a card for income', min: 1, max: 1, options });
}

function movementOptions(s: SetiState, player: SetiPlayer, remaining: number): string[] {
  const options = ['done'];
  for (const piece of s.solar.pieces.filter((candidate) => candidate.owner === player.seat)) {
    const surcharge = isSetiAsteroidCell(s, piece.cell) && !setiPlayerHasAbility(player, 'asteroid-navigation') ? 1 : 0;
    const cost = 1 + surcharge;
    if (cost > remaining) continue;
    for (const to of adjacentSetiCells(piece.cell)) options.push(`${piece.id}|${to}|${cost}`);
  }
  return options;
}

function queueAlienMovement(s: SetiState, player: SetiPlayer, cardId: string, amount: number, suppressPublicity: boolean): void {
  if (amount <= 0) return;
  if (suppressPublicity) player.suppressProbePublicityThisTurn = true;
  s.pending.push({
    kind: 'card-effect-choice', owner: player.seat,
    cardId: `seti_alien:move:${cardId}:${amount}`,
    label: `Move probes or sample capsules (${amount} movement remaining)`, min: 1, max: 1,
    options: movementOptions(s, player, amount),
  });
}

function queueOumuamuaSignalChoice(s: SetiState, player: SetiPlayer, forceTile = false, sourceCardId = ''): void {
  const sector = oumuamuaSector(s);
  const slot = oumuamuaSlot(s);
  if (!sector || !slot) return;
  const options = forceTile ? [`tile:${slot.slot}`] : [`sector:${sector}`, `tile:${slot.slot}`];
  const decision: SetiPendingDecision = { kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:oumuamua-signal:${sourceCardId}`, label: "Mark a signal in the star sector or on 'Oumuamua", min: 1, max: 1, options };
  // If this is replacing the currently resolving signal placement, its visual
  // destination choice must finish before the scan's next signal.
  if (s.pending[0]?.owner === player.seat && (s.pending[0].kind === 'signal-sector' || s.pending[0].kind === 'card-effect-choice')) s.pending.splice(1, 0, decision);
  else s.pending.push(decision);
}

function freeMainOptions(s: SetiState, player: SetiPlayer, card: SetiAlienCardDefinition, mode: 'land' | 'orbit-or-land'): string[] {
  const options: string[] = [];
  for (const piece of s.solar.pieces.filter((candidate) => candidate.owner === player.seat && candidate.kind === 'probe')) {
    const primary = bodyAtSetiCell(s, piece.cell);
    if (!primary || primary === 'Earth') continue;
    if (mode === 'orbit-or-land') options.push(`orbit|${piece.id}|${primary}`);
    options.push(`land|${piece.id}|${primary}`);
    const permitsMoon = card.cardId === 203808 || card.cardId === 203809;
    if (!permitsMoon) continue;
    for (const body of Object.keys(SETI_BODIES) as SetiBody[]) {
      if (SETI_BODIES[body].parent === primary && s.planets[body].landers.length === 0) options.push(`land|${piece.id}|${body}`);
    }
  }
  return options;
}

function queueFreeScan(s: SetiState, player: SetiPlayer, cardId: string): void {
  const earth = earthSetiSectorId(s);
  s.pending.push({ kind: 'signal-sector', owner: player.seat, source: 'earth', options: [earth], signalColor: null, alienCardId: cardId });
  if (s.projectRow.some(Boolean)) {
    s.pending.push({
      kind: 'signal-sector', owner: player.seat, source: 'project-row', options: [...SETI_SECTOR_IDS], signalColor: null,
      rowOptions: s.projectRow.flatMap((card, index) => card ? [index] : []),
      alienCardId: cardId,
    });
  }
  if (cardId === 'seti_alien_oumuamua_01' || cardId === 'seti_alien_oumuamua_10') {
    player.alienMissionProgress[`scan-source:${cardId}`] = [];
  }
}

function queueSampleChoice(s: SetiState, player: SetiPlayer, cardId: string, primary: string, take: boolean): void {
  const slot = speciesSlot(s, 'mascamites');
  if (!slot || slot.module?.kind !== 'mascamites') return;
  const body = primary === 'Jupiter' || ['Callisto', 'Ganymede', 'Europa'].includes(primary) ? 'Jupiter'
    : primary === 'Saturn' || ['Enceladus', 'Titan'].includes(primary) ? 'Saturn' : null;
  if (!body) return;
  const samples = body === 'Jupiter' ? slot.module.samplesAtJupiter : slot.module.samplesAtSaturn;
  if (!samples.length) return;
  s.pending.push({
    kind: 'card-effect-choice', owner: player.seat,
    cardId: `seti_alien:sample:${take ? 'take' : 'inspect'}:${cardId}:${body}`,
    label: take ? `Pick up a face-down sample at ${body}` : `Inspect a sample reward at ${body}`,
    min: 1, max: 1, options: samples.map((sample) => `sample:${sample}`),
  });
}

function queueSampleInspectChoice(s: SetiState, player: SetiPlayer, cardId: string): void {
  const slot = speciesSlot(s, 'mascamites');
  if (!slot || slot.module?.kind !== 'mascamites') return;
  const options = [
    ...slot.module.samplesAtJupiter.map((sample) => `Jupiter:${sample}`),
    ...slot.module.samplesAtSaturn.map((sample) => `Saturn:${sample}`),
  ];
  if (options.length) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:sample-inspect-any:${cardId}`, label: 'Inspect a sample at Jupiter or Saturn', min: 1, max: 1, options });
}

function rewardKinds(): Set<string> {
  return new Set(['gain', 'draw-project', 'mark-trace', 'mark-signal', 'take-tech', 'rotate-solar-system', 'tuck-income', 'resolve-mascamite-sample', 'draw-alien-card']);
}

function applyAlienEffect(s: SetiState, player: SetiPlayer, card: SetiAlienCardDefinition, effect: SetiAlienEffect, hooks: SetiAlienRuntimeHooks): string | null {
  if (rewardKinds().has(effect.kind)) {
    applySimpleReward(s, player, effect as SetiAlienReward, hooks, card.species);
    return null;
  }
  switch (effect.kind) {
    case 'main-action':
      if (effect.action === 'scan') queueFreeScan(s, player, card.id);
      else {
        const options = freeMainOptions(s, player, card, effect.action);
        if (!options.length) return 'No probe can take the printed spacecraft action';
        s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:main:${card.id}:${effect.action}`, label: effect.action === 'land' ? 'Choose a probe and landing destination' : 'Choose a probe to orbit or land', min: 1, max: 1, options });
      }
      break;
    case 'move': queueAlienMovement(s, player, card.id, effect.amount, effect.probePublicity === 'suppressed-for-turn'); break;
    case 'collect-mascamite-sample': {
      if (effect.location === 'planet-with-your-probe') {
        const options: string[] = [];
        for (const piece of s.solar.pieces.filter((candidate) => candidate.owner === player.seat)) {
          const body = bodyAtSetiCell(s, piece.cell);
          if (body === 'Jupiter' || body === 'Saturn') options.push(`${piece.id}|${body}`);
        }
        if (options.length) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:sample-probe-inspect:${card.id}`, label: 'Choose a probe at Jupiter or Saturn', min: 1, max: 1, options });
      }
      break;
    }
    case 'inspect-mascamite-samples': queueSampleInspectChoice(s, player, card.id); break;
    case 'resolve-next-anomaly-reward': {
      const next = nextAnomaly(s);
      if (next?.slot.module?.kind === 'anomalies') {
        const anomaly = next.slot.module.anomalies[next.index];
        applyRewards(s, player, SETI_ANOMALY_TOKENS[next.index].sides[anomaly.side], hooks, 'anomalies');
      }
      break;
    }
    case 'draw-project-choice': {
      const drawn: string[] = [];
      for (let i = 0; i < effect.draw; i++) {
        const next = drawSetiProjectCard(s);
        if (next) drawn.push(next);
      }
      player.hand.push(...drawn);
      if (drawn.length >= 2) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:everyday:free:${drawn.join(',')}`, label: 'Choose one drawn card for its free-action corner', min: 1, max: 1, options: drawn });
      break;
    }
    case 'spend-exofossil-for-movement': {
      const slot = oumuamuaSlot(s);
      const held = slot?.module?.kind === 'oumuamua' ? slot.module.exofossils[player.seat] ?? 0 : 0;
      if (held > 0) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:exo-move:${card.id}`, label: 'Spend exofossils for 2 movement each', min: 1, max: 1, options: Array.from({ length: held + 1 }, (_, value) => String(value)) });
      break;
    }
    case 'spend-exofossil-for-signal': {
      const slot = oumuamuaSlot(s);
      if (slot?.module?.kind === 'oumuamua' && (slot.module.exofossils[player.seat] ?? 0) >= effect.cost) {
        s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:exo-signal:${card.id}`, label: 'Spend 1 exofossil to mark any signal', min: 1, max: 1, options: ['skip', ...SETI_SECTOR_IDS] });
      }
      break;
    }
    case 'spend-exofossil-for-data': {
      const slot = oumuamuaSlot(s);
      if (slot?.module?.kind === 'oumuamua' && (slot.module.exofossils[player.seat] ?? 0) >= effect.cost) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:exo-data:${card.id}`, label: 'Spend 1 exofossil for 1 data?', min: 1, max: 1, options: ['spend', 'skip'] });
      break;
    }
    case 'spend': {
      const slot = oumuamuaSlot(s);
      if (slot?.module?.kind === 'oumuamua') slot.module.exofossils[player.seat] = Math.max(0, (slot.module.exofossils[player.seat] ?? 0) - effect.amount);
      break;
    }
    case 'score-signals-in-anomaly-sectors': {
      const slot = anomalySlot(s);
      if (slot?.module?.kind === 'anomalies') {
        const sectors = new Set(slot.module.anomalies.map((anomaly) => s.sectorOrder[anomaly.sector]));
        const count = [...sectors].reduce((sum, id) => sum + s.sectors[id].signals.filter((marker) => marker.owner === player.seat).length, 0);
        gainScore(player, count * effect.vpPerSignal);
      }
      break;
    }
    case 'score-oumuamua-signals-from-this-effect':
      player.alienMissionProgress[`oumuamua-scan-vp:${card.id}`] = [String(effect.vpPerSignal)];
      break;
    case 'conditional': break; // Resolved by the preceding action choice or mission evaluator.
    case 'choose':
      s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:effect-choice:${card.id}`, label: 'Choose the printed effect', min: effect.choose, max: effect.choose, options: effect.options.map((_, index) => String(index)) });
      break;
  }
  return null;
}

export function playSetiAlienCard(s: SetiState, player: SetiPlayer, cardId: string, hooks: SetiAlienRuntimeHooks): string | null {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (!card || card.species === 'exertians') return 'That is not a playable alien hand card';
  const index = player.alienHand.indexOf(cardId);
  if (index < 0) return 'Alien card is not in your hand';
  if (!card.playCost) return 'Alien card has no normal play cost';
  if (card.playCost.resource === 'credit') {
    if (player.credits < card.playCost.amount) return 'Not enough credits';
    player.credits -= card.playCost.amount;
  } else {
    if (player.energy < card.playCost.amount) return 'Not enough energy';
    player.energy -= card.playCost.amount;
  }
  player.alienHand.splice(index, 1);

  if (card.message) {
    const slot = cardSpeciesSlot(s, card);
    if (!slot || slot.module?.kind !== 'centaurians') return 'Centaurian module is unavailable';
    slot.module.messageMilestones[player.seat].push(player.score + card.message.milestoneOffset);
    slot.module.messageQueue[player.seat].push(card.id);
    s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:continue:message:${card.id}:0`, label: 'Continue the message effect', min: 1, max: 1, options: ['continue'] });
    return null;
  }

  // Living ruling (2025-11-11): execute one printed effect at a time. The
  // automatic continuation remains behind every visual/nested choice, and the
  // mission enters play only when the entire program has completed.
  s.pending.push({
    kind: 'card-effect-choice', owner: player.seat,
    cardId: `seti_alien:continue:main:${card.id}:0`,
    label: 'Continue resolving the alien card', min: 1, max: 1, options: ['continue'],
  });
  return null;
}

function activateResolvedAlienCard(s: SetiState, player: SetiPlayer, cardId: string): void {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (!card) return;
  const slot = cardSpeciesSlot(s, card);
  if (card.mission?.kind === 'endgame') player.alienScoringCards.push(card.id);
  else if (card.mission) player.alienMissions.push(card.id);
  else if (slot) slot.alienDiscard.push(card.id);
}

function isAlienAutomaticDecision(decision: SetiPendingDecision): decision is Extract<SetiPendingDecision, { kind: 'card-effect-choice' }> {
  return decision.kind === 'card-effect-choice'
    && (decision.cardId.startsWith('seti_alien:activate:') || decision.cardId.startsWith('seti_alien:continue:'));
}

function moveAlienActivationsToTail(s: SetiState): void {
  const ordinary = s.pending.filter((decision) => !isAlienAutomaticDecision(decision));
  const activations = s.pending.filter(isAlienAutomaticDecision);
  s.pending = [...ordinary, ...activations];
}

export function settleSetiAlienAutomaticContinuations(s: SetiState, hooks?: SetiAlienRuntimeHooks): void {
  moveAlienActivationsToTail(s);
  while (s.pending[0] && isAlienAutomaticDecision(s.pending[0])) {
    const decision = s.pending.shift() as Extract<SetiPendingDecision, { kind: 'card-effect-choice' }>;
    const player = s.players[decision.owner];
    if (!player) continue;
    if (decision.cardId.startsWith('seti_alien:activate:')) {
      activateResolvedAlienCard(s, player, decision.cardId.slice('seti_alien:activate:'.length));
      moveAlienActivationsToTail(s);
      continue;
    }
    const match = /^seti_alien:continue:(main|message):(.+):(\d+)$/.exec(decision.cardId);
    const card = match ? SETI_ALIEN_CARDS_BY_ID[match[2]] : null;
    const index = match ? Number(match[3]) : -1;
    const effects = match?.[1] === 'message' ? card?.message?.immediate : card?.effects;
    if (!match || !card || !effects || !hooks) {
      s.log.push(`Alien continuation could not resolve ${decision.cardId}.`);
      continue;
    }
    if (index >= effects.length) {
      if (match[1] === 'main') activateResolvedAlienCard(s, player, card.id);
      moveAlienActivationsToTail(s);
      continue;
    }
    // The printed rotation beside "take a tech" is the card's representation
    // of the research rotation; acquireTechnology performs that single turn.
    const skipReminderRotation = effects[index].kind === 'rotate-solar-system' && effects[index + 1]?.kind === 'take-tech';
    const error = skipReminderRotation ? null : applyAlienEffect(s, player, card, effects[index], hooks);
    if (error) s.log.push(`${player.name}: ${card.name} skipped an unavailable effect (${error}).`);
    s.pending.push({
      kind: 'card-effect-choice', owner: player.seat,
      cardId: `seti_alien:continue:${match[1]}:${card.id}:${index + 1}`,
      label: 'Continue resolving the alien card', min: 1, max: 1, options: ['continue'],
    });
    moveAlienActivationsToTail(s);
  }
}

export function discardSetiAlienCardForCorner(s: SetiState, player: SetiPlayer, cardId: string, hooks: SetiAlienRuntimeHooks): string | null {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (!card || card.species === 'exertians') return 'That alien card cannot be discarded';
  const index = player.alienHand.indexOf(cardId);
  if (index < 0) return 'Alien card is not in your hand';
  player.alienHand.splice(index, 1);
  cardSpeciesSlot(s, card)?.alienDiscard.push(card.id);
  applyRewards(s, player, card.freeCorner, hooks, card.species);
  const corner = alienProjectCorner(card);
  if (corner) hooks.onDiscardFreeCorner?.(s, player, corner);
  return null;
}

export function discardSetiAlienCardForSignal(
  s: SetiState,
  player: SetiPlayer,
  cardId: string,
  sectorId: SetiSectorId,
  hooks: SetiAlienRuntimeHooks,
): string | null {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (!card || card.species === 'exertians' || !card.signalCorner) return 'That alien card has no usable signal corner';
  const index = player.alienHand.indexOf(cardId);
  if (index < 0) return 'Alien card is not in your hand';
  if (awaitedSectorColor(sectorId) !== card.signalCorner) return 'The signal sector does not match the card corner';
  player.alienHand.splice(index, 1);
  cardSpeciesSlot(s, card)?.alienDiscard.push(card.id);
  if (!routeSetiSignalThroughOumuamua(s, player, sectorId)) hooks.markSectorSignal(s, player.seat, sectorId);
  return null;
}

function gainAlienIncomeImmediately(s: SetiState, player: SetiPlayer, kind: SetiAlienIncome): void {
  if (kind === 'credit') player.credits++;
  else if (kind === 'energy') player.energy++;
  else if (kind === 'card') drawProjects(s, player, 1);
  else if (kind === 'publicity') gainPublicity(player, 1);
  else gainData(player, 1);
}

function tuckAlienCard(s: SetiState, player: SetiPlayer, cardId: string): string | null {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (!card || card.species === 'exertians' || !card.incomeCorner) return 'That alien card cannot become income';
  const index = player.alienHand.indexOf(cardId);
  if (index < 0) return 'Alien card is not in your hand';
  player.alienHand.splice(index, 1);
  player.alienIncomeCards.push({ cardId, kind: card.incomeCorner });
  gainAlienIncomeImmediately(s, player, card.incomeCorner);
  return null;
}

function gainProjectIncomeImmediately(s: SetiState, player: SetiPlayer, kind: 'credit' | 'energy' | 'card'): void {
  if (kind === 'credit') player.credits++;
  else if (kind === 'energy') player.energy++;
  else drawProjects(s, player, 1);
}

function tuckAnyIncomeCard(s: SetiState, player: SetiPlayer, cardId: string): string | null {
  if (SETI_ALIEN_CARDS_BY_ID[cardId]) return tuckAlienCard(s, player, cardId);
  const definition = SETI_PROJECT_CATALOG_BY_ID[cardId];
  const index = player.hand.indexOf(cardId);
  if (!definition || index < 0) return 'Card is not in your hand';
  player.hand.splice(index, 1);
  player.incomeCards.push({ cardId, kind: definition.income, starting: false });
  gainProjectIncomeImmediately(s, player, definition.income);
  return null;
}

function discardProjectForFreeCorner(s: SetiState, player: SetiPlayer, cardId: string, hooks: SetiAlienRuntimeHooks): string | null {
  const definition = SETI_PROJECT_CATALOG_BY_ID[cardId];
  const index = player.hand.indexOf(cardId);
  if (!definition || index < 0) return 'That project card has no usable free corner';
  player.hand.splice(index, 1);
  s.projectDiscard.push(cardId);
  switch (definition.freeCorner) {
    case 'publicity': gainPublicity(player, 1); break;
    case 'data': gainData(player, 1); break;
    case 'move': queueAlienMovement(s, player, cardId, 1, false); break;
  }
  hooks.onDiscardFreeCorner?.(s, player, definition.freeCorner);
  return null;
}

function discardProjectForIncomeResource(s: SetiState, player: SetiPlayer, cardId: string): string | null {
  const definition = SETI_PROJECT_CATALOG_BY_ID[cardId];
  const index = player.hand.indexOf(cardId);
  if (!definition || index < 0) return 'That project card is not in your hand';
  player.hand.splice(index, 1);
  s.projectDiscard.push(cardId);
  gainProjectIncomeImmediately(s, player, definition.income);
  return null;
}

function bodySector(s: SetiState, body: SetiPrimaryBody): SetiSectorId | null {
  const cell = getSetiBodyCells(s)[body];
  return cell ? s.sectorOrder[parseSetiCell(cell).sector] ?? null : null;
}

function applyKnownBodyRewards(s: SetiState, player: SetiPlayer, rewards: readonly SetiKnownRewardOp[]): void {
  for (const reward of rewards) {
    switch (reward.kind) {
      case 'vp': gainScore(player, reward.amount); break;
      case 'credit': player.credits += reward.amount; break;
      case 'energy': player.energy += reward.amount; break;
      case 'data': gainData(player, reward.amount); break;
      case 'publicity': gainPublicity(player, reward.amount); break;
      case 'trace': {
        const resolutionId = nextEmittedEffectId(s);
        for (let i = 0; i < reward.amount; i++) {
          const options = setiTraceTargets(s, reward.color, player.seat);
          if (options.length) s.pending.push({ kind: 'trace-space', owner: player.seat, color: reward.color, options, resolutionId });
        }
        break;
      }
      case 'signal': {
        const options = SETI_SECTOR_IDS.filter((id) => awaitedSectorColor(id) === reward.color);
        for (let i = 0; i < reward.amount; i++) s.pending.push({ kind: 'signal-sector', owner: player.seat, source: 'effect', options, signalColor: reward.color });
        break;
      }
      case 'signal-at-body-sector': {
        const sector = bodySector(s, reward.body);
        if (sector) for (let i = 0; i < reward.amount; i++) s.pending.push({ kind: 'signal-sector', owner: player.seat, source: 'effect', options: [sector], signalColor: null });
        break;
      }
      case 'draw-project': queueProjectDraw(s, player, reward.amount, reward.source); break;
      case 'tuck-income': for (let i = 0; i < reward.amount; i++) queueAlienTuck(s, player); break;
    }
  }
}

function removeSolarPiece(s: SetiState, pieceId: string): void {
  const index = s.solar.pieces.findIndex((piece) => piece.id === pieceId);
  if (index >= 0) s.solar.pieces.splice(index, 1);
}

function markOumuamuaTileSignal(s: SetiState, player: SetiPlayer, sourceCardId: string): string | null {
  const slot = oumuamuaSlot(s);
  if (!slot || slot.module?.kind !== 'oumuamua') return "'Oumuamua is not in play";
  const module = slot.module;
  const ordinaryBefore = module.signals.length;
  s.markerSequence++;
  module.signals.push({ owner: player.seat, sequence: s.markerSequence, excess: false });
  module.dataRemaining = Math.max(0, module.dataRemaining - 1);
  gainData(player, 1);
  if (ordinaryBefore === 0) gainScore(player, 1);
  if (ordinaryBefore === 2) gainScore(player, 2);

  if (sourceCardId) {
    const key = `oumuamua-signals:${sourceCardId}`;
    player.alienMissionProgress[key] = [...(player.alienMissionProgress[key] ?? []), String(s.markerSequence)];
    if (sourceCardId === 'seti_alien_oumuamua_01' && player.alienMissionProgress[`oumuamua-bonus:${sourceCardId}`]?.length !== 1) {
      module.exofossils[player.seat] = (module.exofossils[player.seat] ?? 0) + 1;
      player.alienMissionProgress[`oumuamua-bonus:${sourceCardId}`] = ['resolved'];
    }
    if (sourceCardId === 'seti_alien_oumuamua_10') gainScore(player, 2);
  }

  if (module.dataRemaining === 0) {
    for (const owner of new Set(module.signals.map((signal) => signal.owner))) {
      module.exofossils[owner] = (module.exofossils[owner] ?? 0) + 1;
    }
    module.signals = [];
    module.dataRemaining = 3;
  }
  return null;
}

export function routeSetiSignalThroughOumuamua(
  s: SetiState,
  player: SetiPlayer,
  sectorId: SetiSectorId,
  sourceCardId = '',
): boolean {
  const sector = oumuamuaSector(s);
  if (!sector || sector !== sectorId) return false;
  queueOumuamuaSignalChoice(s, player, false, sourceCardId);
  moveAlienActivationsToTail(s);
  return true;
}

export function applySetiOumuamuaOrbitReward(s: SetiState, player: SetiPlayer): void {
  if (!oumuamuaSlot(s)) return;
  queueOumuamuaSignalChoice(s, player);
  queueAlienTuck(s, player);
  moveAlienActivationsToTail(s);
}

export function applySetiOumuamuaLandingReward(s: SetiState, player: SetiPlayer): void {
  const slot = oumuamuaSlot(s);
  if (slot?.module?.kind !== 'oumuamua') return;
  gainScore(player, 10);
  slot.module.exofossils[player.seat] = (slot.module.exofossils[player.seat] ?? 0) + 1;
}

function resolveFreeSpacecraftAction(
  s: SetiState,
  player: SetiPlayer,
  card: SetiAlienCardDefinition,
  option: string,
): string | null {
  const [action, pieceId, bodyText] = option.split('|');
  const body = bodyText as SetiBody;
  const piece = s.solar.pieces.find((candidate) => candidate.id === pieceId && candidate.owner === player.seat && candidate.kind === 'probe');
  const definition = SETI_BODIES[body];
  if (!piece || !definition || (action !== 'orbit' && action !== 'land')) return 'That spacecraft action is no longer legal';
  const primary = bodyAtSetiCell(s, piece.cell);
  if (!primary || primary === 'Earth') return 'The probe is no longer visiting that body';

  if (action === 'orbit') {
    if (definition.moon || body !== primary) return 'Only a visited planet can be orbited';
    removeSolarPiece(s, piece.id);
    const planet = s.planets[body];
    const first = setiFirstOrbitSpaceAvailable(s, body);
    placeSetiSpacecraft(s, {
      owner: player.seat,
      kind: 'orbiter',
      body,
      ...(first ? { spaceId: setiFirstOrbitSpaceId(body), coveredReward: { kind: 'first-orbit-vp' as const, amount: 3 as const } } : { coveredReward: null }),
    });
    if (first) gainScore(player, 3);
    if (body === 'Oumuamua') {
      applySetiOumuamuaOrbitReward(s, player);
    } else if (definition.orbitReward.status === 'typed') {
      applyKnownBodyRewards(s, player, definition.orbitReward.ops);
    }
    return null;
  }

  if (definition.moon ? definition.parent !== primary : body !== primary) return 'The probe is no longer visiting that landing destination';
  removeSolarPiece(s, piece.id);
  let coveredReward: { kind: 'first-landing-data'; amount: number } | { kind: 'moon-landing' } | null = definition.moon ? { kind: 'moon-landing' } : null;
  let coveredSpaceId = definition.moon ? setiMoonLandingSpaceId(body) : undefined;
  if (body !== 'Mars' && !definition.moon && s.planets[body].firstLandingBonuses.length) {
    const amount = s.planets[body].firstLandingBonuses.shift()!;
    coveredReward = { kind: 'first-landing-data', amount };
    coveredSpaceId = setiFirstLandingSpaceId(body, amount);
    gainData(player, amount);
  }
  const spacecraft = placeSetiSpacecraft(s, {
    owner: player.seat,
    kind: 'lander',
    body,
    ...(coveredSpaceId ? { spaceId: coveredSpaceId } : {}),
    coveredReward,
  });
  if (body === 'Mars' && s.planets.Mars.firstLandingBonuses.length) {
    s.pending.push({ kind: 'mars-first-data', owner: player.seat, spacecraftId: spacecraft.id, options: [...s.planets.Mars.firstLandingBonuses] });
  }
  if (body === 'Oumuamua') {
    applySetiOumuamuaLandingReward(s, player);
  } else {
    applyKnownBodyRewards(s, player, definition.landingRewards);
  }

  if (card.cardId === 203703 && body === 'Oumuamua') gainScore(player, 3);
  if (card.cardId === 203909) {
    const sector = bodySector(s, definition.moon ? definition.parent! : body as SetiPrimaryBody);
    const anomalies = anomalySlot(s);
    if (sector && anomalies?.module?.kind === 'anomalies') {
      const sectorIndex = s.sectorOrder.indexOf(sector);
      if (anomalies.module.anomalies.some((anomaly) => anomaly.sector === sectorIndex)) queueAlienMovement(s, player, card.id, 1, false);
    }
  }
  if (card.effects.some((effect) => effect.kind === 'collect-mascamite-sample' && effect.location === 'landed-body')) {
    queueSampleChoice(s, player, card.id, body, true);
  }
  return null;
}

function takeProjectSource(s: SetiState, player: SetiPlayer, option: string): string | null {
  if (option === 'deck') {
    drawProjects(s, player, 1);
    return null;
  }
  if (!option.startsWith('row:')) return 'Unknown project-card source';
  const row = Number(option.slice(4));
  const card = s.projectRow[row];
  if (!Number.isInteger(row) || !card) return 'That project-row card is unavailable';
  player.hand.push(card);
  s.projectRow[row] = null;
  refillSetiProjectRow(s);
  return null;
}

function sampleArray(slot: SetiSpeciesSlotState, body: string): string[] | null {
  if (slot.module?.kind !== 'mascamites') return null;
  if (body === 'Jupiter') return slot.module.samplesAtJupiter;
  if (body === 'Saturn') return slot.module.samplesAtSaturn;
  return null;
}

function resolveSampleSelection(
  s: SetiState,
  player: SetiPlayer,
  body: string,
  sampleId: string,
  take: boolean,
  hooks: SetiAlienRuntimeHooks,
): string | null {
  const slot = speciesSlot(s, 'mascamites');
  if (!slot) return 'Mascamites are not in play';
  const samples = sampleArray(slot, body);
  const index = samples?.indexOf(sampleId) ?? -1;
  if (!samples || index < 0) return 'That sample is no longer available';
  if (!take) {
    applyRewards(s, player, sampleReward(sampleId), hooks, 'mascamites');
    return null;
  }
  const cell = getSetiBodyCells(s)[body as SetiPrimaryBody];
  if (!cell) return 'The sample body is not on the solar board';
  samples.splice(index, 1);
  const id = `seti_piece_${s.solar.nextPieceId++}`;
  s.solar.pieces.push({ id, owner: player.seat, kind: 'capsule', cell, supportLayer: setiSupportLayerForCell(s, cell), sampleId });
  return null;
}

function resolveAlienCardSource(s: SetiState, player: SetiPlayer, slot: SetiSpeciesSlotState, option: string): string | null {
  let card: string | null = null;
  if (option === 'deck') card = slot.alienDeck.shift() ?? null;
  else if (option.startsWith('face-up:')) {
    const selected = option.slice('face-up:'.length);
    if (slot.alienFaceUp !== selected) return 'The face-up alien card has changed';
    card = selected;
    slot.alienFaceUp = slot.alienDeck.shift() ?? null;
  }
  if (!card) return 'That alien card source is empty';
  player.alienHand.push(card);
  return null;
}

export function resolveSetiAlienChoice(
  s: SetiState,
  player: SetiPlayer,
  decision: SetiPendingDecision,
  option: string,
  hooks: SetiAlienRuntimeHooks,
): SetiAlienRuntimeResult {
  if (decision.kind === 'alien-card-source') {
    const error = resolveAlienCardSource(s, player, s.species[decision.speciesSlot], option);
    return error ? failure(error) : ok();
  }
  if (decision.kind === 'centaurian-reward') {
    const slot = speciesSlot(s, 'centaurians');
    const index = Number(option.replace('reward:', ''));
    if (!slot || slot.module?.kind !== 'centaurians' || !Number.isInteger(index) || !SETI_CENTAURIAN_MESSAGE_REWARDS[index]) return failure('That Centaurian reward is unavailable');
    const rewardId = `reward:${index}`;
    if (slot.module.claimedRewards.includes(rewardId)) return failure('That Centaurian reward is already covered');
    slot.module.claimedRewards.push(rewardId);
    applyRewards(s, player, SETI_CENTAURIAN_MESSAGE_REWARDS[index], hooks, 'centaurians');
    moveAlienActivationsToTail(s);
    return ok();
  }
  if (decision.kind === 'exertian-card') {
    if (option === 'skip') return ok();
    const [costText, cardId] = option.split('|');
    const cost = Number(costText);
    const card = SETI_ALIEN_CARDS_BY_ID[cardId];
    const index = player.alienHand.indexOf(cardId);
    if (!card?.exertian || index < 0 || !Number.isInteger(cost) || cost < 0) return failure('That hidden Exertian card is unavailable');
    if (player.credits < cost) return failure('Not enough credits to play that Exertian card');
    player.credits -= cost;
    player.alienHand.splice(index, 1);
    player.hiddenExertian.push(cardId);
    return ok();
  }
  if (decision.kind !== 'card-effect-choice' || !decision.cardId.startsWith('seti_alien:') || decision.cardId.startsWith('seti_alien:activate:')) {
    return { handled: false };
  }

  const id = decision.cardId;
  let error: string | null = null;
  if (id.startsWith('seti_alien:draw:')) {
    error = takeProjectSource(s, player, option);
  } else if (id === 'seti_alien:tuck') {
    error = tuckAnyIncomeCard(s, player, option);
  } else if (id.startsWith('seti_alien:any-trace:')) {
    const color = option as SetiTraceColor;
    const payload = id.slice('seti_alien:any-trace:'.length).split(':');
    const speciesId = payload[0];
    const resolutionId = Number(payload[1]);
    const options = traceOptionsForSpecies(s, player, color, speciesId === 'any' ? undefined : speciesId);
    if (!options.length) error = 'No legal trace space remains';
    else s.pending.push({ kind: 'trace-space', owner: player.seat, color, options, ...(Number.isInteger(resolutionId) ? { resolutionId } : {}) });
  } else if (id.startsWith('seti_alien:signals-together:')) {
    const amount = Number(id.slice('seti_alien:signals-together:'.length));
    const sector = option as SetiSectorId;
    if (!s.sectors[sector] || !Number.isInteger(amount)) error = 'Unknown signal sector';
    else for (let i = 0; i < amount; i++) {
      if (!routeSetiSignalThroughOumuamua(s, player, sector)) hooks.markSectorSignal(s, player.seat, sector);
    }
  } else if (id.startsWith('seti_alien:move:')) {
    const match = /^seti_alien:move:(.+):(\d+)$/.exec(id);
    if (!match) error = 'Malformed alien movement choice';
    else if (option !== 'done') {
      const [pieceId, to, costText] = option.split('|');
      const remaining = Number(match[2]);
      const cost = Number(costText);
      const piece = s.solar.pieces.find((candidate) => candidate.id === pieceId && candidate.owner === player.seat);
      if (!piece || !adjacentSetiCells(piece.cell).includes(to as never) || !Number.isInteger(cost) || cost > remaining) error = 'That movement is no longer legal';
      else {
        const from = piece.cell;
        piece.cell = to as typeof piece.cell;
        if (hooks.recordSolarVisit) hooks.recordSolarVisit(s, player, piece, from, piece.cell);
        else {
          piece.supportLayer = setiSupportLayerForCell(s, piece.cell);
          if (!player.suppressProbePublicityThisTurn && (isSetiPublicityCell(s, piece.cell) || bodyAtSetiCell(s, piece.cell) === 'Oumuamua')) gainPublicity(player, 1);
        }
        const sourceCard = SETI_ALIEN_CARDS_BY_ID[match[1]];
        if (sourceCard?.cardId === 203705 && bodyAtSetiCell(s, piece.cell) === 'Oumuamua') {
          const key = `visited:${sourceCard.id}`;
          if (!player.alienMissionProgress[key]?.length) {
            const slot = oumuamuaSlot(s);
            if (slot?.module?.kind === 'oumuamua') slot.module.exofossils[player.seat] = (slot.module.exofossils[player.seat] ?? 0) + 1;
            player.alienMissionProgress[key] = ['resolved'];
          }
        }
        queueAlienMovement(s, player, match[1], remaining - cost, false);
      }
    }
  } else if (id.startsWith('seti_alien:oumuamua-signal:')) {
    const sourceCardId = id.slice('seti_alien:oumuamua-signal:'.length);
    if (option.startsWith('sector:')) hooks.markSectorSignal(s, player.seat, option.slice('sector:'.length) as SetiSectorId);
    else if (option.startsWith('tile:')) error = markOumuamuaTileSignal(s, player, sourceCardId);
    else error = 'Unknown Oumuamua signal destination';
  } else if (id.startsWith('seti_alien:main:')) {
    const match = /^seti_alien:main:(.+):(land|orbit-or-land)$/.exec(id);
    const card = match ? SETI_ALIEN_CARDS_BY_ID[match[1]] : null;
    error = card ? resolveFreeSpacecraftAction(s, player, card, option) : 'Unknown alien spacecraft effect';
  } else if (id.startsWith('seti_alien:sample:')) {
    const match = /^seti_alien:sample:(take|inspect):(.+):(Jupiter|Saturn)$/.exec(id);
    const sampleId = option.startsWith('sample:') ? option.slice('sample:'.length) : '';
    error = match ? resolveSampleSelection(s, player, match[3], sampleId, match[1] === 'take', hooks) : 'Malformed Mascamite sample choice';
  } else if (id.startsWith('seti_alien:sample-inspect-any:')) {
    const [body, sampleId] = option.split(':');
    error = resolveSampleSelection(s, player, body, sampleId, false, hooks);
  } else if (id.startsWith('seti_alien:sample-probe-inspect:')) {
    const [, body] = option.split('|');
    queueSampleChoice(s, player, id.slice('seti_alien:sample-probe-inspect:'.length), body, false);
  } else if (id.startsWith('seti_alien:everyday:free:')) {
    const cards = id.slice('seti_alien:everyday:free:'.length).split(',');
    error = discardProjectForFreeCorner(s, player, option, hooks);
    const remaining = cards.filter((card) => card !== option && player.hand.includes(card));
    if (!error && remaining.length) s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:everyday:income:${remaining.join(',')}`, label: 'Choose a different card for its income resource', min: 1, max: 1, options: remaining });
  } else if (id.startsWith('seti_alien:everyday:income:')) {
    error = discardProjectForIncomeResource(s, player, option);
  } else if (id.startsWith('seti_alien:exo-move:')) {
    const amount = Number(option);
    const slot = oumuamuaSlot(s);
    if (!slot || slot.module?.kind !== 'oumuamua' || !Number.isInteger(amount) || amount < 0 || (slot.module.exofossils[player.seat] ?? 0) < amount) error = 'That exofossil spend is unavailable';
    else {
      slot.module.exofossils[player.seat] -= amount;
      queueAlienMovement(s, player, id.slice('seti_alien:exo-move:'.length), amount * 2, false);
    }
  } else if (id.startsWith('seti_alien:exo-signal:')) {
    if (option !== 'skip') {
      const slot = oumuamuaSlot(s);
      if (!slot || slot.module?.kind !== 'oumuamua' || (slot.module.exofossils[player.seat] ?? 0) < 1) error = 'No exofossil is available';
      else {
        slot.module.exofossils[player.seat]--;
        if (!routeSetiSignalThroughOumuamua(s, player, option as SetiSectorId)) hooks.markSectorSignal(s, player.seat, option as SetiSectorId);
      }
    }
  } else if (id.startsWith('seti_alien:exo-data:')) {
    if (option === 'spend') {
      const slot = oumuamuaSlot(s);
      if (!slot || slot.module?.kind !== 'oumuamua' || (slot.module.exofossils[player.seat] ?? 0) < 1) error = 'No exofossil is available';
      else { slot.module.exofossils[player.seat]--; gainData(player, 1); }
    }
  } else if (id.startsWith('seti_alien:effect-choice:')) {
    const card = SETI_ALIEN_CARDS_BY_ID[id.slice('seti_alien:effect-choice:'.length)];
    const effect = card?.effects.find((candidate) => candidate.kind === 'choose');
    const selected = effect?.kind === 'choose' ? effect.options[Number(option)] : null;
    if (!card || !selected) error = 'That alien effect option is unavailable';
    else for (const nested of selected) {
      error = applyAlienEffect(s, player, card, nested, hooks);
      if (error) break;
    }
  } else if (id.startsWith('seti_alien:trigger:')) {
    const card = SETI_ALIEN_CARDS_BY_ID[id.slice('seti_alien:trigger:'.length)];
    const mission = card?.mission;
    const rewardIndex = Number(option.replace('reward:', ''));
    if (!card || mission?.kind !== 'triggerable' || !mission.rewards[rewardIndex]) error = 'That mission reward is unavailable';
    else {
      const progress = player.alienMissionProgress[card.id] ?? [];
      if (progress.includes(String(rewardIndex))) error = 'That mission reward was already taken';
      else {
        applyRewards(s, player, mission.rewards[rewardIndex], hooks, card.species);
        player.alienMissionProgress[card.id] = [...progress, String(rewardIndex)];
        if (player.alienMissionProgress[card.id].length === mission.rewards.length) {
          player.alienMissions = player.alienMissions.filter((candidate) => candidate !== card.id);
          player.completedAlienMissions.push(card.id);
        }
      }
    }
  } else {
    return { handled: false };
  }

  moveAlienActivationsToTail(s);
  return error ? failure(error) : ok();
}

function traceMarkersForSpecies(s: SetiState, player: SetiPlayer, speciesId: string): typeof player.traceMarkers {
  const slot = s.species.find((candidate) => candidate.speciesId === speciesId);
  return slot ? player.traceMarkers.filter((marker) => marker.speciesSlot === slot.slot) : [];
}

export function setiAlienConditionSatisfied(
  s: SetiState,
  player: SetiPlayer,
  card: SetiAlienCardDefinition,
  condition: SetiAlienCondition,
): boolean {
  const own = traceMarkersForSpecies(s, player, card.species);
  switch (condition.kind) {
    case 'trace-count': {
      const markers = condition.species === 'this'
        ? own
        : player.traceMarkers.filter((marker) => !own.includes(marker));
      if (condition.color === 'same') {
        return (['purple', 'orange', 'blue'] as const).some((color) => markers.filter((marker) => marker.color === color).length >= condition.atLeast);
      }
      return markers.filter((marker) => condition.color === 'any' || marker.color === condition.color).length >= condition.atLeast;
    }
    case 'trace-set': return condition.colors.every((color) => own.some((marker) => marker.color === color));
    case 'exofossils-held': {
      const slot = oumuamuaSlot(s);
      return slot?.module?.kind === 'oumuamua' && (slot.module.exofossils[player.seat] ?? 0) >= condition.atLeast;
    }
    case 'lander-at': return s.planets.Oumuamua.landers.includes(player.seat);
    case 'signal-count': {
      const slot = oumuamuaSlot(s);
      return slot?.module?.kind === 'oumuamua' && slot.module.signals.filter((signal) => signal.owner === player.seat).length >= condition.atLeast;
    }
    case 'paid-oumuamua-space': {
      const slot = oumuamuaSlot(s);
      if (!slot) return false;
      return player.traceMarkers.some((marker) => {
        if (marker.speciesSlot !== slot.slot) return false;
        const space = researchDefinition(slot, marker.spaceId);
        return space?.payment?.resource === 'exofossil' && condition.acceptedCosts.includes(space.payment.amount);
      });
    }
    case 'event':
    case 'prior-action-result': return false;
  }
}

export function completeSetiAlienMission(
  s: SetiState,
  player: SetiPlayer,
  cardId: string,
  hooks: SetiAlienRuntimeHooks,
): string | null {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  if (!card || !player.alienMissions.includes(cardId) || card.mission?.kind !== 'conditional') return 'That alien mission is not available to complete';
  if (!setiAlienConditionSatisfied(s, player, card, card.mission.condition)) return 'The alien mission condition is not fulfilled';
  for (const effect of card.mission.reward) {
    const error = applyAlienEffect(s, player, card, effect, hooks);
    if (error) return error;
  }
  player.alienMissions.splice(player.alienMissions.indexOf(cardId), 1);
  player.completedAlienMissions.push(cardId);
  moveAlienActivationsToTail(s);
  return null;
}

export function deliverSetiMascamiteSample(
  s: SetiState,
  player: SetiPlayer,
  pieceId: string,
  cardId: string,
  hooks: SetiAlienRuntimeHooks,
): string | null {
  const card = SETI_ALIEN_CARDS_BY_ID[cardId];
  const mission = card?.mission;
  if (!card || !player.alienMissions.includes(cardId) || mission?.kind !== 'delivery') return 'That sample-delivery mission is not active';
  const capsule = s.solar.pieces.find((piece) => piece.id === pieceId && piece.owner === player.seat && piece.kind === 'capsule' && piece.sampleId);
  if (!capsule?.sampleId || bodyAtSetiCell(s, capsule.cell) !== mission.destination) return `Move a sample capsule to ${mission.destination} first`;
  const slot = speciesSlot(s, 'mascamites');
  if (!slot || slot.module?.kind !== 'mascamites') return 'Mascamite samples are unavailable';
  removeSolarPiece(s, capsule.id);
  slot.module.capsulesDelivered.push(capsule.sampleId);
  for (const reward of mission.reward) {
    if (reward.kind === 'resolve-mascamite-sample') {
      for (let i = 0; i < reward.multiplier; i++) applyRewards(s, player, sampleReward(capsule.sampleId), hooks, 'mascamites');
    } else applySimpleReward(s, player, reward, hooks, 'mascamites');
  }
  player.alienMissions.splice(player.alienMissions.indexOf(cardId), 1);
  player.completedAlienMissions.push(cardId);
  return null;
}

function triggerSetiAlienMissionEvent(
  s: SetiState,
  player: SetiPlayer,
  event: 'mark-any-trace' | 'research-any-tech',
  emittedEffectId?: number,
): boolean {
  const eventKey = emittedEffectId === undefined ? null : `trigger-event:${event}:${emittedEffectId}`;
  if (eventKey && player.alienMissionProgress[eventKey]?.length) return false;
  for (const cardId of player.alienMissions) {
    const card = SETI_ALIEN_CARDS_BY_ID[cardId];
    const mission = card?.mission;
    if (!card || mission?.kind !== 'triggerable' || mission.trigger.kind !== 'event' || mission.trigger.event !== event) continue;
    const progress = player.alienMissionProgress[cardId] ?? [];
    const options = mission.rewards.map((_, index) => index).filter((index) => !progress.includes(String(index))).map((index) => `reward:${index}`);
    if (!options.length) continue;
    if (eventKey) player.alienMissionProgress[eventKey] = [cardId];
    s.pending.push({ kind: 'card-effect-choice', owner: player.seat, cardId: `seti_alien:trigger:${cardId}`, label: 'Choose one remaining mission reward', min: 1, max: 1, options });
    return true;
  }
  return false;
}

export function onSetiAlienTraceMarked(s: SetiState, player: SetiPlayer, emittedEffectId?: number): boolean {
  return triggerSetiAlienMissionEvent(s, player, 'mark-any-trace', emittedEffectId);
}

export function onSetiAlienTechnologyResearched(s: SetiState, player: SetiPlayer, emittedEffectId?: number): boolean {
  return triggerSetiAlienMissionEvent(s, player, 'research-any-tech', emittedEffectId);
}

function discoveryOwners(s: SetiState, slot: SetiSpeciesSlotState): number[] {
  return Object.values(slot.discovery)
    .filter((marker): marker is NonNullable<typeof marker> => marker !== null && marker.owner !== null && !!s.players[marker.owner])
    .sort((a, b) => a.sequence - b.sequence)
    .map((marker) => marker.owner!);
}

export function onSetiAlienSpeciesRevealed(s: SetiState, slot: SetiSpeciesSlotState): void {
  const owners = discoveryOwners(s, slot);
  if (slot.speciesId === 'exertians') {
    for (const player of s.players) {
      const opportunities = owners.filter((owner) => owner === player.seat).length;
      const count = 3 + opportunities;
      for (let i = 0; i < count; i++) {
        const card = slot.alienDeck.shift();
        if (card) player.alienHand.push(card);
      }
      for (let i = 0; i < opportunities; i++) {
        const cards = player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species === 'exertians');
        if (cards.length) s.pending.push({ kind: 'exertian-card', owner: player.seat, options: ['skip', ...cards.map((id) => `0|${id}`)] });
      }
    }
    // In solo the remaining face-down cards are retained for S.19. In a
    // multiplayer game the unused deck is returned to the box as printed.
    if (!s.solo) slot.alienDeck = [];
    slot.alienFaceUp = null;
    return;
  }

  for (const owner of owners) {
    const card = slot.alienDeck.shift();
    if (card) s.players[owner].alienHand.push(card);
  }
  slot.alienFaceUp = slot.alienDeck.shift() ?? null;
  if (slot.module?.kind === 'centaurians') {
    for (const player of s.players) {
      if (!slot.module.messageQueue[player.seat]?.length) slot.module.messageQueue[player.seat] = ['seti_centaurian_board_message'];
    }
  }
  if (slot.module?.kind === 'oumuamua') {
    const cell = slot.module.cell;
    for (const piece of s.solar.pieces.filter((candidate) => candidate.kind === 'probe' && candidate.cell === cell)) {
      const player = s.players[piece.owner];
      if (player) gainPublicity(player, 1);
    }
  }
}

function resolveCentaurianMessage(
  s: SetiState,
  player: SetiPlayer,
  slot: SetiSpeciesSlotState,
  hooks: SetiAlienRuntimeHooks,
): boolean {
  if (slot.module?.kind !== 'centaurians') return false;
  const module = slot.module;
  const milestones = module.messageMilestones[player.seat] ?? [];
  const queue = module.messageQueue[player.seat] ?? [];
  if (!milestones.length || milestones[0] > player.score) return false;
  milestones.shift();
  const cardId = queue.shift() ?? 'seti_centaurian_board_message';
  if (cardId !== 'seti_centaurian_board_message') {
    const card = SETI_ALIEN_CARDS_BY_ID[cardId];
    if (card?.message) {
      let tucked = false;
      for (const effect of card.message.delayed) {
        if (effect.kind === 'tuck-income') {
          if (card.incomeCorner) {
            player.alienIncomeCards.push({ cardId: card.id, kind: card.incomeCorner });
            gainAlienIncomeImmediately(s, player, card.incomeCorner);
            tucked = true;
          }
        } else applyAlienEffect(s, player, card, effect, hooks);
      }
      if (!tucked) slot.alienDiscard.push(card.id);
    }
  }
  const options = SETI_CENTAURIAN_MESSAGE_REWARDS
    .map((_, index) => `reward:${index}`)
    .filter((id) => !module.claimedRewards.includes(id));
  if (options.length) s.pending.push({ kind: 'centaurian-reward', owner: player.seat, options });
  return true;
}

function queueExertianMilestone(s: SetiState, player: SetiPlayer, slot: SetiSpeciesSlotState): boolean {
  if (slot.module?.kind !== 'exertians' || s.solo) return false;
  const resolved = slot.module.resolvedMilestones[player.seat] ?? [false, false];
  slot.module.resolvedMilestones[player.seat] = resolved;
  for (const index of [0, 1] as const) {
    if (resolved[index] || player.score < slot.module.milestones[index]) continue;
    resolved[index] = true;
    const cost = index === 0 ? 0 : 1;
    if (player.credits < cost) return true; // the paid opportunity is missed permanently
    const cards = player.alienHand.filter((id) => SETI_ALIEN_CARDS_BY_ID[id]?.species === 'exertians');
    if (cards.length) s.pending.push({ kind: 'exertian-card', owner: player.seat, options: ['skip', ...cards.map((id) => `${cost}|${id}`)] });
    return true;
  }
  return false;
}

export function queueSetiAlienMilestone(
  s: SetiState,
  turnSeat: number,
  hooks: SetiAlienRuntimeHooks,
): boolean {
  if (s.pending.length) return false;
  for (let offset = 0; offset < s.players.length; offset++) {
    const player = s.players[(turnSeat + offset) % s.players.length];
    for (const slot of s.species) {
      if (!slot.revealed) continue;
      if (slot.module?.kind === 'centaurians' && resolveCentaurianMessage(s, player, slot, hooks)) return true;
      if (slot.module?.kind === 'exertians' && queueExertianMilestone(s, player, slot)) return true;
    }
  }
  return false;
}

export function applySetiAlienIncome(s: SetiState): void {
  for (const player of s.players) {
    for (const income of player.alienIncomeCards) {
      if (income.kind === 'credit') player.credits++;
      else if (income.kind === 'energy') player.energy++;
      else if (income.kind === 'card') drawProjects(s, player, 1);
      else if (income.kind === 'publicity') gainPublicity(player, 1);
      else gainData(player, 1);
    }
  }
}

function exertianConditionSatisfied(
  s: SetiState,
  player: SetiPlayer,
  condition: SetiExertianScoringCondition,
): boolean {
  const slot = speciesSlot(s, 'exertians');
  const exertianTraces = slot ? player.traceMarkers.filter((marker) => marker.speciesSlot === slot.slot) : [];
  switch (condition.kind) {
    case 'trace-count': {
      const count = condition.species === 'this' ? exertianTraces.length : player.traceMarkers.length - exertianTraces.length;
      return count >= condition.atLeast;
    }
    case 'spacecraft-at-one-planet-family': {
      return (Object.keys(SETI_BODIES) as SetiBody[])
        .filter((body) => !SETI_BODIES[body].moon && body !== 'Earth')
        .some((body) => {
          const family = [body, ...(Object.keys(SETI_BODIES) as SetiBody[]).filter((candidate) => SETI_BODIES[candidate].parent === body)];
          const count = family.reduce((sum, member) => sum
            + s.planets[member].orbiters.filter((owner) => owner === player.seat).length
            + s.planets[member].landers.filter((owner) => owner === player.seat).length, 0);
          return count >= condition.atLeast;
        });
    }
    case 'sector-wins': {
      const sectors = SETI_SECTORS.filter((sector) => sector.printedSignalColor === condition.color).map((sector) => sector.id);
      return sectors.reduce((sum, id) => sum + s.sectors[id].wins.filter((marker) => marker.owner === player.seat).length, 0) >= condition.atLeast;
    }
    case 'technology-count':
      return player.techs.filter((tech) => SETI_TECH_BY_ID[tech.stackId]?.type === condition.technology).length >= condition.atLeast;
    case 'income-cards': return player.incomeCards.length + player.alienIncomeCards.length >= condition.atLeast;
    case 'lander-count': return setiPlayerLanders(s, player.seat) >= condition.atLeast;
    case 'same-color-traces':
      return (['purple', 'orange', 'blue'] as const).some((color) => player.traceMarkers.filter((marker) => marker.color === color).length >= condition.atLeast);
    case 'orbiter-count': return setiPlayerOrbiters(s, player.seat) >= condition.atLeast;
    case 'completed-missions': return player.completedMissions.length + player.completedAlienMissions.length >= condition.atLeast;
  }
}

export function scoreSetiAlienEndgame(s: SetiState): void {
  for (const player of s.players) {
    let final = player.finalScore ?? player.score;
    for (const cardId of player.alienScoringCards) {
      const card = SETI_ALIEN_CARDS_BY_ID[cardId];
      if (card?.mission?.kind !== 'endgame') continue;
      final += traceMarkersForSpecies(s, player, card.species).length * card.mission.vpPerMatchingMarker;
    }
    for (const cardId of player.hiddenExertian) {
      const card = SETI_ALIEN_CARDS_BY_ID[cardId];
      if (card?.exertian && exertianConditionSatisfied(s, player, card.exertian.condition)) final += card.exertian.victoryPoints;
    }
    player.finalScore = final;
  }

  const slot = speciesSlot(s, 'exertians');
  if (slot?.module?.kind !== 'exertians') return;
  if (s.solo) return; // soloRuntime compares human and rival danger together
  const module = slot.module;
  const danger = s.players.map((player) => ({
    player,
    amount: (module.dangerBySeat[player.seat] ?? 0)
      + player.hiddenExertian.reduce((sum, id) => sum + (SETI_ALIEN_CARDS_BY_ID[id]?.exertian?.danger ?? 0), 0),
  }));
  const greatest = Math.max(...danger.map((entry) => entry.amount));
  for (const entry of danger.filter((candidate) => candidate.amount === greatest)) {
    entry.player.finalScore! -= Math.floor(entry.player.finalScore! / 10);
  }
}
