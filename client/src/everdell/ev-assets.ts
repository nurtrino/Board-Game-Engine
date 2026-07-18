// Everdell client asset helpers: staged mod art lookups + resource icons.

import {
  EV_CARD_BY_ID, EV_FOREST_BY_ID, EV_SPECIAL_BY_ID, EVERDELL_SEAT_HEX,
  type EvResource,
} from '@bge/shared';

export { EVERDELL_SEAT_HEX };

/** Card face image (main-deck card by catalog id). */
export const cardImg = (id: string): string => {
  const def = EV_CARD_BY_ID[id];
  return def ? `/everdell/cards/card-${def.cell}.webp` : '/everdell/back-main.webp';
};

export const forestImg = (id: string): string => {
  const def = EV_FOREST_BY_ID[id];
  return def ? `/everdell/cards/card-${def.cell}.webp` : '/everdell/back-forest.webp';
};

export const specialEventImg = (id: string): string => {
  const def = EV_SPECIAL_BY_ID[id];
  return def ? `/everdell/cards/card-${def.cell}.webp` : '/everdell/back-event.webp';
};

export const BACK_MAIN = '/everdell/back-main.webp';
export const BACK_FOREST = '/everdell/back-forest.webp';
export const BACK_EVENT = '/everdell/back-event.webp';

export type EvIconKind = EvResource | 'card' | 'point' | 'any';

export const RES_COLOR: Record<string, string> = {
  twig: '#a4703c',
  resin: '#e8a33c',
  pebble: '#b9c0c9',
  berry: '#d4568f',
  card: '#c9b58f',
  point: '#e8c33c',
  any: '#9fd0a8',
};

export const RES_LABEL: Record<string, string> = {
  twig: 'TWIG', resin: 'RESIN', pebble: 'PEBBLE', berry: 'BERRY',
  card: 'CARD', point: 'POINT', any: 'ANY',
};
