import { useEffect, useState } from 'react';

export interface FeastSceneAsset {
  guid?: string;
  image: string;
  sourceUrl?: string;
  imagePx?: [number, number];
  grid?: FeastGridCalibration;
  tts?: { pos: [number, number, number]; rot: [number, number, number]; scale: [number, number, number] };
}

export interface FeastGridCalibration {
  originPx: [number, number];
  cellPx: [number, number];
  rows: number;
  cols: number;
  normalizedOrigin: [number, number];
  normalizedCell: [number, number];
}

export interface FeastScene {
  source: { workshopId: string; saveSha256: string; edition: string };
  actionBoard: FeastSceneAsset;
  homeBoards: {
    long: FeastSceneAsset & { side: string };
    short: FeastSceneAsset & { side: string };
  };
  extensions: Record<string, { guid: string; faces: { id: string; column?: number; image: string; sourceUrl?: string }[] }>;
  exploration: Record<string, FeastSceneAsset & { pair: string; face: string }>;
  buildings: Record<string, { guid: string; front: string; alternateFront?: string; back: string; count: number; imagePx?: [number, number]; grid?: FeastGridCalibration }>;
  ships: Record<string, { front: string; back?: string | null; count: number }>;
  goods: Record<string, { front: string; back: string; shape: [number, number]; count: number }>;
  resources?: Record<string, { id: string; image: string; count: number; sourceUrl?: string }>;
  specials: Record<string, FeastSceneAsset & { mask: string[]; area: number }>;
  mountains: { id: string; guid: string; image: string; items: string[] }[];
  decks: {
    sheets: Record<string, { image?: string; face?: string; back: string; cols: number; rows: number; sheetId: number }>;
    occupationGroups: Record<string, unknown>;
    weapons: Record<string, unknown>;
  };
  roundOverview: FeastSceneAsset;
  banquetTables?: {
    short: { image: string; sourceUrl?: string; cropPx?: [number, number, number, number] };
    long: { image: string; sourceUrl?: string; cropPx?: [number, number, number, number] };
    default: { image: string; sourceUrl?: string; cropPx?: [number, number, number, number] };
  };
  box: FeastSceneAsset;
  logo: string;
  models?: Record<string, { model: string; diffuse?: string; guid?: string }>;
  rules: { rulebook: string; appendix: string };
}

type FeastSceneSpecial = FeastSceneAsset & { mask: string[]; area: number };

/** Normalize the extractor's ordered special-tile array for keyed consumers. */
export function normalizeFeastScene(payload: unknown): FeastScene {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('FEAST SCENE FAILED: scene.json must contain an object');
  }
  const raw = payload as Record<string, unknown>;
  const sourceSpecials = raw.specials;
  if (!sourceSpecials || typeof sourceSpecials !== 'object') {
    throw new Error('FEAST SCENE FAILED: scene.json is missing special tiles');
  }

  let specials: Record<string, FeastSceneSpecial>;
  if (Array.isArray(sourceSpecials)) {
    specials = {};
    for (const entry of sourceSpecials) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error('FEAST SCENE FAILED: every special tile must be an object');
      }
      const id = (entry as Record<string, unknown>).id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('FEAST SCENE FAILED: every special tile needs a stable id');
      }
      if (specials[id]) throw new Error(`FEAST SCENE FAILED: duplicate special tile ${id}`);
      specials[id] = entry as FeastSceneSpecial;
    }
  } else {
    specials = sourceSpecials as Record<string, FeastSceneSpecial>;
  }

  return { ...(raw as unknown as FeastScene), specials };
}

let cached: FeastScene | null = null;
let pending: Promise<FeastScene> | null = null;

export function loadFeastScene(): Promise<FeastScene> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetch('/feast/scene.json')
      .then((response) => {
        if (!response.ok) throw new Error(`FEAST SCENE FAILED · ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(normalizeFeastScene)
      .then((scene) => {
        cached = scene;
        return scene;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

export function useFeastScene(): FeastScene | null {
  const [scene, setScene] = useState<FeastScene | null>(cached);
  useEffect(() => {
    let live = true;
    void loadFeastScene().then((next) => { if (live) setScene(next); });
    return () => { live = false; };
  }, []);
  return scene;
}
