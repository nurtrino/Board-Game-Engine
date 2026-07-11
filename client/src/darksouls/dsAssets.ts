// Dark Souls device assets: the extractor manifest (ds-manifest.json) plus
// card-art lookups. Cards render as sheet-cell crops (CSS background), the
// AxisPlay billStyle pattern. Class boards are the mod's real board scans.

import { useEffect, useState, type CSSProperties } from 'react';

export interface DsSheetArt {
  image: string;
  w: number;
  h: number;
  cols: number;
  rows: number;
  back?: string;
}

export interface DsDeckArt {
  id: string;
  name: string | null;
  sheets: Record<string, DsSheetArt>;
  cards: { id: string; cardID: number; sheet: string; cell: number }[];
}

export interface DsManifest {
  boards: { id: string; image: string; w: number; h: number }[];
  decks: DsDeckArt[];
  dice: Record<string, { image: string; w: number; h: number }>;
  healthDials: { id: string; image: string; w: number; h: number }[];
}

export interface DsCardArt {
  sheet: DsSheetArt;
  cell: number;
}

let cached: DsManifest | null = null;
let cardIndex: Map<string, DsCardArt> | null = null;
let pending: Promise<DsManifest> | null = null;

function indexCards(m: DsManifest): Map<string, DsCardArt> {
  const map = new Map<string, DsCardArt>();
  for (const deck of m.decks) {
    for (const card of deck.cards) {
      if (map.has(card.id)) continue;
      const sheet = deck.sheets[card.sheet];
      if (sheet) map.set(card.id, { sheet, cell: card.cell });
    }
  }
  return map;
}

async function loadManifest(): Promise<DsManifest> {
  if (cached) return cached;
  pending ??= fetch('/dark-souls/ds-manifest.json').then(async (r) => {
    const m = (await r.json()) as DsManifest;
    cached = m;
    cardIndex = indexCards(m);
    return m;
  });
  return pending;
}

export function useDsManifest(): DsManifest | null {
  const [m, setM] = useState<DsManifest | null>(cached);
  useEffect(() => {
    if (!m) void loadManifest().then(setM);
  }, [m]);
  return m;
}

/** Sheet-cell crop for a golden card id (cell = CardID % 100, 10-wide grids). */
export function dsCardArt(cardId: string): DsCardArt | null {
  return cardIndex?.get(cardId) ?? null;
}

export function dsCardStyle(cardId: string): CSSProperties {
  const art = dsCardArt(cardId);
  if (!art) return { background: '#15181d' };
  const { sheet, cell } = art;
  const col = cell % sheet.cols;
  const row = Math.floor(cell / sheet.cols);
  return {
    backgroundImage: `url(${sheet.image})`,
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${(col / (sheet.cols - 1)) * 100}% ${(row / (sheet.rows - 1)) * 100}%`,
  };
}

/** Class board scans, identified visually from the staged art (extractor
 * numbers them 01-10 without names). */
export const DS_CLASS_BOARD: Record<string, string> = {
  pyromancer: '/dark-souls/class-board-01.webp',
  mercenary: '/dark-souls/class-board-02.webp',
  thief: '/dark-souls/class-board-03.webp',
  deprived: '/dark-souls/class-board-04.webp',
  cleric: '/dark-souls/class-board-05.webp',
  knight: '/dark-souls/class-board-06.webp',
  herald: '/dark-souls/class-board-07.webp',
  assassin: '/dark-souls/class-board-08.webp',
  sorcerer: '/dark-souls/class-board-09.webp',
  warrior: '/dark-souls/class-board-10.webp',
};

/** Printed slot regions on the class boards (fractions of the board image).
 * The ten boards share one layout; measured on the staged scans. */
export const DS_MAT_RECTS = {
  heroic: { x: 0.015, y: 0.02, w: 0.158, h: 0.23 },
  handL: { x: 0.015, y: 0.257, w: 0.158, h: 0.325 },
  backup: { x: 0.18, y: 0.02, w: 0.157, h: 0.325 },
  armour: { x: 0.18, y: 0.51, w: 0.157, h: 0.325 },
  handR: { x: 0.345, y: 0.257, w: 0.157, h: 0.325 },
  luck: { x: 0.373, y: 0.057, w: 0.093, h: 0.125 },
  estus: { x: 0.373, y: 0.787, w: 0.093, h: 0.125 },
  ember: { x: 0.923, y: 0.427, w: 0.072, h: 0.1 },
} as const;

/** Seat accent colours (outline style, per the in-game UI system). */
export const DS_SEAT_HEX = ['#e8b450', '#6fb3e0', '#8fce8f', '#c98fd6'];

export const DS_DIE_HEX: Record<string, string> = {
  black: '#26262c',
  blue: '#2b5fb8',
  orange: '#c06f24',
  dodge: '#3e8f86',
};
