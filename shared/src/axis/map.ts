// Map golden schema + loader. games/axis-allies/golden/map.json is produced
// by the board-transcription pass (territories, sea zones, adjacency, canals)
// and validated by tools/tts-extract/fit-axis-map.mjs overlay diagnostics.
// Territory ids are kebab-case names ('bulgaria-romania'); sea zones 'sz-12'.

export interface TerritoryDef {
  id: string;
  name: string;
  ipc: number;
  // original owner at the printed 1941 map baseline; 1942 overlays occupation
  originalOwner: string | null; // power key, 'china', or null for neutral/impassable
  isVictoryCity?: boolean;
  victoryCity?: string; // city name printed on the board
  isCapital?: boolean;
  isImpassable?: boolean; // strict neutrals (Sahara, Himalayas, ...) if printed
  isChinese?: boolean; // inside China's printed border (China unit rules)
  isIsland?: boolean;
  seaZone?: string; // for islands/coastal: the (primary) surrounding sea zone
  center: [number, number]; // art px in the stitched board space
  adj: string[]; // adjacent territory ids (land borders)
  coastTo?: string[]; // adjacent sea zone ids (coastal territories)
}

export interface SeaZoneDef {
  id: string; // 'sz-<n>'
  n: number;
  center: [number, number];
  adj: string[]; // adjacent sea zone ids (including wraparound pairs)
  coastTo?: string[]; // territory ids reachable by offload
}

export interface CanalDef {
  id: string; // 'panama' | 'suez'
  connects: [string, string]; // the two sea zones it joins
  controlledBy: string[]; // territory ids that must ALL be side-controlled
}

export interface AxisMap {
  territories: TerritoryDef[];
  seaZones: SeaZoneDef[];
  canals: CanalDef[];
  // art-space geometry of the stitched board (for clients/fit tools)
  art?: { width: number; height: number };
}

export interface MapIndex {
  map: AxisMap;
  territory: Record<string, TerritoryDef>;
  seaZone: Record<string, SeaZoneDef>;
  // unified space lookup (territory or sea zone)
  space: Record<string, TerritoryDef | SeaZoneDef>;
}

export function indexMap(map: AxisMap): MapIndex {
  const territory = Object.fromEntries(map.territories.map((t) => [t.id, t]));
  const seaZone = Object.fromEntries(map.seaZones.map((z) => [z.id, z]));
  return { map, territory, seaZone, space: { ...territory, ...seaZone } };
}

export const isSeaZoneId = (id: string) => id.startsWith('sz-');

/** Validate structural invariants; returns human-readable problems. */
export function validateMap(map: AxisMap): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const t of map.territories) {
    if (ids.has(t.id)) problems.push(`duplicate id ${t.id}`);
    ids.add(t.id);
  }
  for (const z of map.seaZones) {
    if (ids.has(z.id)) problems.push(`duplicate id ${z.id}`);
    ids.add(z.id);
  }
  const idx = indexMap(map);
  // adjacency symmetry + referential integrity
  for (const t of map.territories) {
    for (const a of t.adj) {
      const other = idx.territory[a];
      if (!other) { problems.push(`${t.id} adj -> missing ${a}`); continue; }
      if (!other.adj.includes(t.id)) problems.push(`${t.id} <-> ${a} asymmetric`);
    }
    for (const z of t.coastTo ?? []) {
      const zone = idx.seaZone[z];
      if (!zone) { problems.push(`${t.id} coastTo -> missing ${z}`); continue; }
      if (!(zone.coastTo ?? []).includes(t.id)) problems.push(`${t.id} <-> ${z} coast asymmetric`);
    }
  }
  for (const z of map.seaZones) {
    for (const a of z.adj) {
      const other = idx.seaZone[a];
      if (!other) { problems.push(`${z.id} adj -> missing ${a}`); continue; }
      if (!other.adj.includes(z.id)) problems.push(`${z.id} <-> ${a} asymmetric`);
    }
  }
  const vcs = map.territories.filter((t) => t.isVictoryCity).length;
  if (vcs !== 18) problems.push(`victory cities ${vcs} != 18`);
  const capitals = map.territories.filter((t) => t.isCapital).length;
  if (capitals !== 6) problems.push(`capitals ${capitals} != 6`);
  for (const c of map.canals) {
    for (const sz of c.connects) if (!idx.seaZone[sz]) problems.push(`canal ${c.id} -> missing ${sz}`);
    for (const t of c.controlledBy) if (!idx.territory[t]) problems.push(`canal ${c.id} control -> missing ${t}`);
  }
  return problems;
}
