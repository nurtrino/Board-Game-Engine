// Dark Souls TV board — asset lookups over the extractor's staged files.
// FACE_ART maps every engine tile-face id to its staged art. The mapping was
// derived from the mod save (golden tiles.json face.image munged URL -> object
// GUID -> ds-manifest staged file) and verified by node-overlay diagnostics
// (nodes sit exactly on the printed rings for fronts AND backs).

import { useEffect, useState } from 'react';

export interface DsFaceArt { image: string; w: number; h: number }

export const DS_FACE_ART: Record<string, DsFaceArt> = {
  room1a: { image: '/dark-souls/room-1f650a.webp', w: 2048, h: 2048 },
  room1b: { image: '/dark-souls/room-1f650a-back.webp', w: 2048, h: 2048 },
  room2a: { image: '/dark-souls/room-3c0ec9.webp', w: 2048, h: 2048 },
  room2b: { image: '/dark-souls/room-3c0ec9-back.webp', w: 2048, h: 2048 },
  room3a: { image: '/dark-souls/room-224900.webp', w: 2048, h: 2048 },
  room3b: { image: '/dark-souls/room-224900-back.webp', w: 2048, h: 2048 },
  room4a: { image: '/dark-souls/room-6abc01.webp', w: 2048, h: 2048 },
  room4b: { image: '/dark-souls/room-6abc01-back.webp', w: 2048, h: 2048 },
  room5a: { image: '/dark-souls/room-4b1835.webp', w: 2048, h: 2048 },
  room5b: { image: '/dark-souls/room-4b1835-back.webp', w: 2048, h: 2048 },
  room6a: { image: '/dark-souls/room-17b532.webp', w: 2048, h: 2048 },
  room6b: { image: '/dark-souls/room-17b532-back.webp', w: 2048, h: 2048 },
  boss1a: { image: '/dark-souls/boss-tile-f482f0.webp', w: 2048, h: 2048 },
  boss1b: { image: '/dark-souls/boss-tile-f482f0-back.webp', w: 2048, h: 2048 },
  boss2a: { image: '/dark-souls/boss-tile-21f5ba.webp', w: 2048, h: 2048 },
  boss2b: { image: '/dark-souls/boss-tile-21f5ba-back.webp', w: 2048, h: 2048 },
  'mega-four-kings-front': { image: '/dark-souls/arena-four-kings.webp', w: 2039, h: 2048 },
  'mega-four-kings-back': { image: '/dark-souls/arena-four-kings-back.webp', w: 1825, h: 1831 },
  'mega-old-iron-king-front': { image: '/dark-souls/arena-old-iron-king.webp', w: 2048, h: 2039 },
  'mega-old-iron-king-back': { image: '/dark-souls/arena-old-iron-king-back.webp', w: 1014, h: 1014 },
  'mega-black-dragon-kalameet-front': { image: '/dark-souls/arena-black-dragon-kalameet.webp', w: 1015, h: 1015 },
  'mega-black-dragon-kalameet-back': { image: '/dark-souls/arena-black-dragon-kalameet-back.webp', w: 2048, h: 2014 },
};

/** The mod's double-sided bonfire tile (dial-notecard guid 7cb5fc): the front
 * face is the core bonfire camp with Andre and the Firekeeper printed on it. */
export const DS_BONFIRE_TILE = { image: '/dark-souls/boss-dial.webp', w: 2048, h: 2048 };
/** The mod's boss-health-dial wheel (a notched disc the knob rotates). */
export const DS_DIAL_WHEEL = '/dark-souls/token-ref-705789.png';
/** The Four Kings dial name mats (KING ONE .. KING FOUR crescents). */
export const DS_KING_MATS = [
  '/dark-souls/token-ref-620396.png',
  '/dark-souls/token-ref-da7df6.png',
  '/dark-souls/token-ref-b420ea.png',
  '/dark-souls/token-ref-bd1449.png',
];
export const DS_FOG_WALL = '/dark-souls/token-fog-wall.png';
export const DS_TRAP_TOKEN = '/dark-souls/token-trap.png';
export const DS_AGGRO_TOKEN = '/dark-souls/token-aggro-token.png';
export const DS_FIRST_ACT_TOKEN = '/dark-souls/token-first-activation-token.png';
export const DS_SOULS_TOKEN = '/dark-souls/token-souls-5.png';
export const DS_BONFIRE_TOKEN = '/dark-souls/token-bonfire.png';
export const DS_EMBER_TOKEN = '/dark-souls/token-ember.png';
export const DS_CONDITION_TOKENS: Record<string, string> = {
  bleed: '/dark-souls/token-bleed-token.png',
  poison: '/dark-souls/token-poison-token.png',
  frostbite: '/dark-souls/token-frostbite-token.png',
  stagger: '/dark-souls/token-stagger-token.png',
  calamity: '/dark-souls/token-calamity-token.png',
};

/** Physical world width (TTS units) of each face's tile object: room and boss
 * tiles are scale-12.78 Custom_Tiles (width 2*scale); the mega boards are
 * scale-30. Piece world size = OBJ bbox * mod scale, so one render factor
 * keeps every mini the same size on every board. */
export const dsFaceWorldWidth = (faceId: string): number =>
  faceId.startsWith('mega-') ? 60 : 25.56;

/** render units per TTS world unit: a room tile spans 12 render units. */
export const DS_K = 12 / 25.56;

// ---------- per-class healthbar art (HUD chips) ----------

export const DS_HEALTHBAR: Record<string, string> = {
  warrior: '/dark-souls/healthbar-warrior.jpg',
  knight: '/dark-souls/healthbar-knight.png',
  herald: '/dark-souls/healthbar-herald.png',
  assassin: '/dark-souls/healthbar-assassin.png',
  sorcerer: '/dark-souls/healthbar-sorcerer.jpg',
  thief: '/dark-souls/healthbar-thief.jpg',
  deprived: '/dark-souls/healthbar-deprived.jpg',
  cleric: '/dark-souls/healthbar-cleric.jpg',
  mercenary: '/dark-souls/healthbar-mercenary.jpg',
  pyromancer: '/dark-souls/healthbar-pyromancer.jpg',
};

// ---------- seat colours (coop: identity outline only) ----------

export const DS_SEAT_HEX = ['#e8b450', '#7fb4e0', '#8fce8f', '#c98fce'];

// ---------- mini lookups ----------

export interface DsMiniDef {
  id: string;
  name: string | null;
  kind: string;
  scale: number;
  mesh: string | null;
  flat?: boolean;
  texture: string | null;
  textureBack?: string | null;
  tint?: number[];
}

export interface DsSheetDef {
  image: string; w: number; h: number; cols: number; rows: number; back?: string;
}
export interface DsDeckDef {
  id: string;
  sheets: Record<string, DsSheetDef>;
  cards: { id: string; cardID: number; sheet: string; cell: number }[];
}

export interface DsManifest {
  minis: DsMiniDef[];
  decks: DsDeckDef[];
  tokens: { id: string; image: string; scale: number }[];
}

let cachedManifest: DsManifest | null = null;
export function useDsManifest(): DsManifest | null {
  const [m, setM] = useState<DsManifest | null>(cachedManifest);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (cachedManifest) return;
    const controller = new AbortController();
    let retry: number | undefined;
    fetch('/dark-souls/ds-manifest.json', { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error(`ds-manifest failed (${r.status})`); return r.json(); })
      .then((j: DsManifest) => { cachedManifest = j; setM(j); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        console.warn('Dark Souls assets did not load; retrying.', error);
        retry = window.setTimeout(() => setAttempt((n) => n + 1), 2500);
      });
    return () => { controller.abort(); if (retry !== undefined) window.clearTimeout(retry); };
  }, [attempt]);
  return m;
}

/** Class -> mini id. Five expansion classes have no dedicated sculpt in the
 * mod's staged set; the two unnamed class sculpts stand in (seat ring under
 * every character keeps identity readable). */
const CLASS_MINI: Record<string, string> = {
  warrior: 'warrior', knight: 'knight', herald: 'herald', assassin: 'assassin',
  sorcerer: 'sorcerer',
  thief: 'class-unknown-1', deprived: 'class-unknown-2',
  cleric: 'class-unknown-2', mercenary: 'class-unknown-1',
  pyromancer: 'class-unknown-1',
};

export function dsMiniOf(manifest: DsManifest, id: string): DsMiniDef | null {
  return manifest.minis.find((m) => m.id === id) ?? null;
}

export function dsClassMini(manifest: DsManifest, classId: string): DsMiniDef | null {
  return dsMiniOf(manifest, CLASS_MINI[classId] ?? classId);
}

/** Boss run unit -> mini id. */
export function dsBossUnitMini(manifest: DsManifest, bossId: string, unitKey: string): DsMiniDef | null {
  let id = bossId;
  if (unitKey === 'ornstein') id = 'dragon-slayer-ornstein';
  else if (unitKey === 'smough') id = 'executioner-smough';
  else if (unitKey.startsWith('king')) id = `four-kings-${unitKey.slice(4)}`;
  else if (bossId === 'old-iron-king') id = 'megaboss-standee';
  return dsMiniOf(manifest, id);
}

/** Terrain piece -> mini id (the chest model doubles for mimic-marked chests). */
export const DS_TERRAIN_MINI: Record<string, string> = {
  gravestone: 'tombstone', barrel: 'barrel', chest: 'chest-mimic', 'mimic-chest': 'chest-mimic',
};

// ---------- behaviour card art (boss turn banner) ----------

const BOSS_DECKS: Record<string, string[]> = {
  'winged-knight': ['winged-knight-behaviour'],
  'titanite-demon': ['titanite-demon-behaviour'],
  gargoyle: ['gargoyle-behaviour'],
  'boreal-outrider-knight': ['boreal-outrider-knight-behaviour'],
  'dancer-of-the-boreal-valley': ['dancer-of-the-boreal-valley-behaviour'],
  'ornstein-and-smough': ['smough-ornstein-behaviour', 'smough-ornstein-behaviour-2', 'smough-ornstein-behaviour-3'],
  'old-dragonslayer': ['old-dragonslayer-behaviour'],
  'hungry-mimic': ['hungry-mimic-behaviour'],
  'voracious-mimic': ['voracious-mimic-behaviour'],
  'smelter-demon': ['smelter-demon-behaviour'],
  artorias: ['artorias-behaviour'],
  'great-grey-wolf-sif': ['great-grey-wolf-sif-behaviour'],
  'four-kings': ['king-one-behaviour-cards', 'king-two-behaviour-cards', 'king-three-behaviour-cards', 'king-four-behaviour-cards'],
  'old-iron-king': ['old-iron-king-behaviour-cards', 'heat-beam'],
  'black-dragon-kalameet': ['black-dragon-kalameet-behaviour-cards', 'strafe-cards'],
};

export interface DsCardArt { image: string; cols: number; rows: number; col: number; row: number }

/** Resolve a behaviour-deck cell key (engine discard entry, e.g. 6 or
 * "sifart:13") to its card art crop in the staged sheets. */
export function dsBossCardArt(manifest: DsManifest, bossId: string, cellKey: string | number): DsCardArt | null {
  const raw = String(cellKey);
  const n = Number(raw.includes(':') ? raw.slice(raw.lastIndexOf(':') + 1) : raw);
  if (!Number.isFinite(n)) return null;
  for (const deckId of BOSS_DECKS[bossId] ?? []) {
    const deck = manifest.decks.find((d) => d.id === deckId);
    if (!deck) continue;
    const card = deck.cards.find((c) => c.cell === n);
    if (!card) continue;
    const sheet = deck.sheets[card.sheet];
    if (!sheet) continue;
    return {
      image: sheet.image, cols: sheet.cols, rows: sheet.rows,
      col: card.cell % sheet.cols, row: Math.floor(card.cell / sheet.cols),
    };
  }
  return null;
}
