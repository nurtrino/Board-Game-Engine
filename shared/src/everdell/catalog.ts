// Everdell base-game catalog: typed access to cards.json (transcribed from
// mod 1929354615's reworked card sheets, verified against The Archive
// appendix; see docs/specs/everdell.md).

import raw from './cards.json';

export type EvResource = 'twig' | 'resin' | 'pebble' | 'berry';
export const EV_RESOURCES: readonly EvResource[] = ['twig', 'resin', 'pebble', 'berry'];
export type EvResMap = Partial<Record<EvResource, number>>;

export type EvColor = 'production' | 'traveler' | 'destination' | 'governance' | 'prosperity';
export type EvKind = 'critter' | 'construction';

export interface EvCardDef {
  id: string;
  cell: number;
  copies: number;
  name: string;
  kind: EvKind;
  rarity: 'common' | 'unique';
  color: EvColor;
  cost: Record<EvResource, number>;
  points: number;
  open: boolean;
  openPoints?: number;
  link: string; // linked construction/critter id ('any' for Ever Tree, 'harvester-gatherer' for Farm)
  text: string;
  destinationSpot?: boolean; // Storehouse: green card with a worker spot
  permanentSpot?: boolean;   // Monastery/Cemetery: visiting workers stay forever
  noSpace?: boolean;         // Wanderer
  costToOpponent?: boolean;  // Shepherd
}

export interface EvForestDef { id: string; cell: number; text: string }

export interface EvSpecialEventDef {
  id: string;
  cell: number;
  name: string;
  requiresCards?: string[];
  requiresColors?: Partial<Record<EvColor, number>>;
  points?: number;
  cost?: EvResMap;
  onAchieve?: string;
  pointsPer?: {
    what: string;
    each?: number;
    berryTwigEach?: number;
    resinPebbleEach?: number;
  };
}

export interface EvBasicEventDef { id: string; name: string; requiresColor: EvColor; count: number; points: number; img: string }
export interface EvBasicLocationDef { id: string; gain: Partial<Record<EvResource | 'card' | 'point', number>>; shared: boolean; px: [number, number] }
export interface EvJourneyDef { id: string; points: number; shared: boolean; px: [number, number] }

interface CatalogFile {
  cards: EvCardDef[];
  forest: EvForestDef[];
  specialEvents: EvSpecialEventDef[];
  basicEvents: EvBasicEventDef[];
  basicLocations: EvBasicLocationDef[];
  journey: EvJourneyDef[];
  haven: { px: [number, number] };
}

const data = raw as unknown as CatalogFile;

export const EV_CARDS: EvCardDef[] = data.cards;
export const EV_CARD_BY_ID: Record<string, EvCardDef> = Object.fromEntries(data.cards.map((c) => [c.id, c]));
export const EV_FOREST: EvForestDef[] = data.forest;
export const EV_FOREST_BY_ID: Record<string, EvForestDef> = Object.fromEntries(data.forest.map((f) => [f.id, f]));
export const EV_SPECIAL_EVENTS: EvSpecialEventDef[] = data.specialEvents;
export const EV_SPECIAL_BY_ID: Record<string, EvSpecialEventDef> = Object.fromEntries(data.specialEvents.map((e) => [e.id, e]));
export const EV_BASIC_EVENTS: EvBasicEventDef[] = data.basicEvents;
export const EV_BASIC_EVENT_BY_ID: Record<string, EvBasicEventDef> = Object.fromEntries(data.basicEvents.map((e) => [e.id, e]));
export const EV_BASIC_LOCATIONS: EvBasicLocationDef[] = data.basicLocations;
export const EV_BASIC_LOC_BY_ID: Record<string, EvBasicLocationDef> = Object.fromEntries(data.basicLocations.map((l) => [l.id, l]));
export const EV_JOURNEY: EvJourneyDef[] = data.journey;
export const EV_JOURNEY_BY_ID: Record<string, EvJourneyDef> = Object.fromEntries(data.journey.map((j) => [j.id, j]));
export const EV_HAVEN_PX: [number, number] = data.haven.px;

/** The 128-card main deck as a flat list of card ids. */
export function everdellDeckList(): string[] {
  const out: string[] = [];
  for (const c of EV_CARDS) for (let i = 0; i < c.copies; i++) out.push(c.id);
  return out;
}
