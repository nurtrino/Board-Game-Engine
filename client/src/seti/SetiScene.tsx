import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { boardWorldToPercent, nestedDiscAngles, parseSetiCell, setiCellPoint, unwrapSector } from './setiGeometry';
import { setiSeatColor, type SetiUiPiece, type SetiUiView } from './setiView';

type UnknownRecord = Record<string, unknown>;

export interface SetiImageRecord {
  id?: string;
  name?: string;
  image: string;
  imagePx?: number[];
  tts?: { pos?: number[]; position?: number[]; rot?: number[]; rotation?: number[]; scale?: number[] };
  footprint?: { world?: number[]; local?: number[] };
  mapping?: {
    orientedSize?: number[];
    worldAabbSize?: number[];
    artToWorld?: { matrix?: number[][]; imagePx?: number[] };
    worldToArt?: { matrix?: number[][] };
  };
  artToWorld?: { matrix?: number[][]; px?: number[] };
  snapPoints?: { index: number; position?: number[]; world?: number[]; tags?: string[] }[];
  [key: string]: unknown;
}

export interface SetiCardDef {
  id: string;
  name: string;
  image?: string;
  back?: string;
  sheet?: string;
  cell: number;
  cols: number;
  rows: number;
  deckId?: string;
}

export interface SetiSceneDef {
  schemaVersion?: number;
  assets?: Record<string, unknown>;
  board: SetiImageRecord & {
    artToWorld?: { input?: string; matrix?: number[][]; px?: number[] };
  };
  solarSystem: {
    center?: number[];
    centerArt?: number[];
    rotationDegrees?: number;
    earthCell?: string;
    discs?: (SetiImageRecord & { id?: string })[];
    base?: SetiImageRecord | string;
  };
  sectors?: SetiImageRecord[] | Record<string, SetiImageRecord>;
  playerBoards?: SetiImageRecord[] | Record<string, SetiImageRecord | string>;
  alienBoards?: SetiImageRecord[] | Record<string, SetiImageRecord | string>;
  decks?: Record<string, unknown>;
  pieces?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
  solo?: Record<string, unknown>;
  pdfs?: Record<string, string>;
  inventory?: Record<string, unknown>;
}

let sceneCache: SetiSceneDef | null = null;
let scenePromise: Promise<SetiSceneDef> | null = null;

export function useSetiScene(): SetiSceneDef | null {
  const [scene, setScene] = useState<SetiSceneDef | null>(sceneCache);
  useEffect(() => {
    let mounted = true;
    if (!scenePromise) {
      scenePromise = fetch('/seti/scene.json')
        .then((response) => {
          if (!response.ok) throw new Error(`SETI scene ${response.status}`);
          return response.json() as Promise<SetiSceneDef>;
        })
        .then((loaded) => {
          sceneCache = loaded;
          return loaded;
        });
    }
    scenePromise.then((loaded) => { if (mounted) setScene(loaded); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  return scene;
}

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function imagePath(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  const item = record(value);
  const path = item.image ?? item.path ?? item.face ?? item.front ?? item.diffuse;
  return typeof path === 'string' ? path : undefined;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildSetiCardCatalog(scene: SetiSceneDef): SetiCardDef[] {
  const cards: SetiCardDef[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, context: { sheet?: string; cols?: number; rows?: number; deckId?: string } = {}) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, context));
      return;
    }
    const item = value as UnknownRecord;
    const next = {
      sheet: imagePath(item.sheet) ?? imagePath(item.face) ?? context.sheet,
      cols: numberValue(item.cols ?? item.width, context.cols ?? 10),
      rows: numberValue(item.rows ?? item.height, context.rows ?? 7),
      deckId: typeof item.deckId === 'string' ? item.deckId : context.deckId,
    };
    const idValue = item.id ?? item.stableId ?? item.cardKey;
    const cellValue = item.cell ?? item.cellIndex ?? item.index;
    const cellRecord = record(cellValue);
    const looksLikeCard = typeof idValue === 'string' && (cellValue !== undefined || imagePath(item.art) || imagePath(item.image));
    if (looksLikeCard) {
      cards.push({
        id: idValue as string,
        name: typeof item.name === 'string' ? item.name : (idValue as string).replace(/[-_]/g, ' '),
        image: imagePath(item.art) ?? imagePath(item.image),
        back: imagePath(item.back),
        sheet: typeof item.sheet === 'string' ? item.sheet : next.sheet,
        cell: numberValue(cellRecord.index ?? cellValue, 0),
        cols: numberValue(cellRecord.columns, next.cols ?? 10),
        rows: numberValue(cellRecord.rows, next.rows ?? 7),
        deckId: next.deckId,
      });
    }
    for (const [key, child] of Object.entries(item)) {
      const childContext = key === 'cards'
        ? { ...next, deckId: next.deckId ?? (typeof item.id === 'string' ? item.id : undefined) }
        : next;
      visit(child, childContext);
    }
  };
  visit(scene.decks ?? {});
  return cards;
}

export function useSetiCardCatalog(scene: SetiSceneDef | null): SetiCardDef[] {
  return useMemo(() => scene ? buildSetiCardCatalog(scene) : [], [scene]);
}

export function findSetiCard(catalog: SetiCardDef[], id: string): SetiCardDef | undefined {
  return catalog.find((card) => card.id === id)
    ?? catalog.find((card) => card.id.endsWith(id) || id.endsWith(card.id))
    ?? (() => {
      const match = /^seti_(?:project|promo)_(\d+)$/.exec(id);
      if (!match) return undefined;
      return catalog.find((card) => card.id === `project-${match[1]}`);
    })()
    ?? (() => {
      const match = /^seti_alien_(mascamites|anomalies|oumuamua|centaurians|exertians)_(\d+)$/.exec(id);
      if (!match) return undefined;
      return catalog.filter((card) => card.id.startsWith(`${match[1]}-`)).sort((a, b) => a.cell - b.cell)[Number(match[2]) - 1];
    })()
    ?? inferredSetiCard(id);
}

function inferredSetiCard(id: string): SetiCardDef | undefined {
  const project = /^seti_(?:project|promo)_(\d+)$/.exec(id);
  if (project) {
    const source = Number(project[1]);
    const deckId = Math.floor(source / 100);
    const cell = source % 100;
    const dimensions: Record<number, [number, number]> = { 415: [1, 1], 2044: [1, 1], 2045: [10, 7], 2046: [10, 7], 2047: [1, 1] };
    const [cols, rows] = dimensions[deckId] ?? [10, 7];
    return { id, name: id.replace(/[-_]/g, ' '), sheet: `/seti/cards/project-${deckId}.webp`, cell, cols, rows, deckId: `${deckId}` };
  }
  const alien = /^seti_alien_(mascamites|anomalies|oumuamua|centaurians|exertians)_(\d+)$/.exec(id);
  if (alien) {
    const sheets: Record<string, [number, number, number]> = {
      mascamites: [2038, 5, 2], anomalies: [2039, 5, 2], oumuamua: [2037, 5, 2], centaurians: [2035, 5, 2], exertians: [2036, 5, 3],
    };
    const [deckId, cols, rows] = sheets[alien[1]];
    return { id, name: id.replace(/[-_]/g, ' '), sheet: `/seti/cards/alien-${alien[1]}.webp`, cell: Math.max(0, Number(alien[2]) - 1), cols, rows, deckId: `${deckId}` };
  }
  return undefined;
}

export function SetiCardArt({ scene, cardId, faceDown = false, className = '', label }: {
  scene: SetiSceneDef | null;
  cardId: string;
  faceDown?: boolean;
  className?: string;
  label?: string;
}) {
  const catalog = useSetiCardCatalog(scene);
  const card = findSetiCard(catalog, cardId);
  const fallbackBack = imagePath(record(scene?.decks).projectBack)
    ?? imagePath(record(record(scene?.decks).project).back)
    ?? '/seti/cards/project-back.webp';
  const direct = faceDown ? card?.back ?? fallbackBack : card?.image;
  const sheet = faceDown ? undefined : card?.sheet;
  const cols = Math.max(1, card?.cols ?? 1);
  const rows = Math.max(1, card?.rows ?? 1);
  const cell = Math.max(0, card?.cell ?? 0);
  const col = cell % cols;
  const row = Math.floor(cell / cols);
  const style: CSSProperties = direct
    ? { backgroundImage: `url("${direct}")` }
    : sheet
      ? {
          backgroundImage: `url("${sheet}")`,
          backgroundSize: `${cols * 100}% ${rows * 100}%`,
          backgroundPosition: `${cols === 1 ? 0 : col / (cols - 1) * 100}% ${rows === 1 ? 0 : row / (rows - 1) * 100}%`,
        }
      : {};
  return (
    <div
      className={`seti-card-art ${!direct && !sheet ? 'is-fallback' : ''} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={label ?? card?.name ?? cardId.replace(/[-_]/g, ' ')}
    >
      {!direct && !sheet && <span>{(label ?? card?.name ?? 'PROJECT').toUpperCase()}</span>}
    </div>
  );
}

export function SetiStarfield({ density = 1 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    let width = 1;
    let height = 1;
    let stars: { x: number; y: number; size: number; alpha: number; speed: number; hue: number }[] = [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const build = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      let seed = 741932;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      stars = Array.from({ length: Math.round(width * height / 4300 * density) }, () => ({
        x: random() * width,
        y: random() * height,
        size: 0.35 + random() * 1.45,
        alpha: 0.2 + random() * 0.7,
        speed: 0.3 + random() * 1.2,
        hue: random() > 0.84 ? 196 : random() > 0.9 ? 35 : 220,
      }));
    };
    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      const gradient = context.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, Math.max(width, height) * 0.76);
      gradient.addColorStop(0, '#13233b');
      gradient.addColorStop(0.45, '#07111f');
      gradient.addColorStop(1, '#02060d');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      for (const star of stars) {
        const pulse = reduced ? 0 : Math.sin(time * 0.0005 * star.speed + star.x) * 0.18;
        context.beginPath();
        context.fillStyle = `hsla(${star.hue}, 80%, 92%, ${Math.max(0.08, star.alpha + pulse)})`;
        context.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        context.fill();
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(build);
    observer.observe(canvas);
    build();
    draw(0);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [density]);
  return <canvas className="seti-starfield" ref={canvasRef} aria-hidden="true" />;
}

export function TactileSurface({ children, className = '', style, testId, disabled = false, onTap, onDrop, ariaLabel }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  disabled?: boolean;
  onTap?: () => void;
  onDrop?: (kind: string, value: string) => boolean | void;
  ariaLabel: string;
}) {
  const [drag, setDrag] = useState<{ id: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null);
  const [spring, setSpring] = useState(false);
  const down = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false });
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    setDrag((current) => current && current.id === event.pointerId ? {
      ...current,
      x: event.clientX,
      y: event.clientY,
      moved: current.moved || Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 6,
    } : current);
  };
  const up = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.id !== event.pointerId) return;
    const wasMoved = drag.moved;
    setDrag(null);
    if (!wasMoved) {
      onTap?.();
      return;
    }
    const target = document.elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest<HTMLElement>('[data-seti-target]'))
      .find((element): element is HTMLElement => !!element && element !== event.currentTarget && !event.currentTarget.contains(element));
    const kind = target?.dataset.setiTarget ?? '';
    const value = target?.dataset.setiValue ?? '';
    const accepted = kind && onDrop?.(kind, value);
    if (!accepted) {
      setSpring(true);
      window.setTimeout(() => setSpring(false), 330);
    }
  };
  const dragStyle = drag ? {
    '--seti-drag-x': `${drag.x - drag.startX}px`,
    '--seti-drag-y': `${drag.y - drag.startY - 10}px`,
  } as CSSProperties : undefined;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-testid={testId}
      disabled={disabled}
      className={`seti-tactile ${className} ${drag ? 'is-held' : ''} ${spring ? 'is-springing' : ''}`.trim()}
      style={{ ...style, ...dragStyle }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      {children}
    </button>
  );
}

function sceneArray(value: SetiImageRecord[] | Record<string, SetiImageRecord> | undefined): SetiImageRecord[] {
  if (Array.isArray(value)) return value;
  return Object.entries(value ?? {}).map(([id, item]) => ({ id, ...item }));
}

function boardMatrix(scene: SetiSceneDef): number[][] | undefined {
  return scene.board.artToWorld?.matrix ?? scene.board.mapping?.artToWorld?.matrix;
}

function tileSectorSide(tileId: string, sectorId: string): 'left' | 'right' | null {
  const pairs: Record<string, [string, string]> = {
    'kepler-proxima': ['kepler', 'proxima'],
    'sirius-barnard': ['sirius', 'barnard'],
    'procyon-vega': ['procyon', 'vega'],
    'virginis-beta-pictoris': ['virginis', 'beta'],
  };
  const normalizedSector = sectorId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const pair = pairs[tileId] ?? Object.entries(pairs).find(([key]) => tileId.includes(key))?.[1];
  if (!pair) return null;
  if (normalizedSector.includes(pair[0])) return 'left';
  if (normalizedSector.includes(pair[1])) return 'right';
  return null;
}

function tileSlotPoint(tile: SetiImageRecord, world: number[]): { x: number; y: number } | null {
  const matrix = tile.mapping?.worldToArt?.matrix;
  if (!matrix || matrix.length < 2 || world.length < 3) return null;
  return {
    x: (matrix[0][0] * world[0] + matrix[0][1] * world[2] + matrix[0][2]) * 100,
    y: (matrix[1][0] * world[0] + matrix[1][1] * world[2] + matrix[1][2]) * 100,
  };
}

function SectorArray({ scene, view, targets, onSector }: { scene: SetiSceneDef; view: SetiUiView; targets: string[]; onSector?: (sectorId: string) => void }) {
  const sourceTiles = sceneArray(scene.sectors);
  const ordered = (view.sectorBoardOrder.length ? view.sectorBoardOrder : sourceTiles.map((tile) => tile.id ?? '')).map((id) => sourceTiles.find((tile) => tile.id === id || tile.guid === id)).filter((tile): tile is SetiImageRecord => !!tile);
  return (
    <div className="seti-sector-array" aria-label="nearby star sectors">
      {ordered.map((tile) => {
        return (
          <div key={tile.id} className="seti-sector-tile">
            <img src={tile.image} alt={typeof tile.name === 'string' ? tile.name : tile.id ?? 'nearby stars'} draggable={false} />
            {(Array.isArray(tile.slots) ? tile.slots : []).map((raw, slotIndex) => {
              const slot = record(raw);
              const side = slot.side === 'right' ? 'right' : 'left';
              const sector = view.sectors.find((entry) => tileSectorSide(tile.id ?? '', entry.id) === side);
              if (!sector) return null;
              const world = Array.isArray(slot.world) ? slot.world as number[] : [];
              const point = tileSlotPoint(tile, world);
              if (!point) return null;
              const sideIndex = numberValue(slot.sideIndex, slotIndex);
              const marker = sector.markers[sideIndex];
              const data = !marker && sideIndex < sector.data + sector.markers.length;
              if (!marker && !data) return null;
              return (
                <span
                  key={`${tile.id}-${slotIndex}`}
                  className={`seti-sector-slot-token ${marker ? 'is-marker' : 'is-data'}`}
                  style={{ left: `${point.x}%`, top: `${point.y}%`, '--seat': marker ? setiSeatColor(view.players[marker.owner]?.color) : '#b8dce6' } as CSSProperties}
                  aria-label={marker ? `${view.players[marker.owner]?.name ?? 'agency'} signal` : 'data'}
                />
              );
            })}
            {(['left', 'right'] as const).flatMap((side) => {
              const sector = view.sectors.find((entry) => tileSectorSide(tile.id ?? '', entry.id) === side);
              return (sector?.wins ?? []).map((owner, index) => (
                <span
                  key={`${side}-win-${index}`}
                  className="seti-sector-win"
                  style={{ left: side === 'left' ? `${43 + index * 5}%` : `${80 + index * 5}%`, top: side === 'left' ? '30%' : '70%', '--seat': setiSeatColor(view.players[owner]?.color) } as CSSProperties}
                  aria-label={`${view.players[owner]?.name ?? 'agency'} sector win`}
                />
              ));
            })}
            {(['left', 'right'] as const).map((side) => {
              const sector = view.sectors.find((entry) => tileSectorSide(tile.id ?? '', entry.id) === side);
              if (!sector || !targets.includes(sector.id)) return null;
              return (
                <button
                  key={`${side}-target`}
                  type="button"
                  className={`seti-sector-target is-${side}`}
                  data-seti-target="sector"
                  data-seti-value={sector.id}
                  data-testid={`seti-sector-target-${sector.id}`}
                  onClick={() => onSector?.(sector.id)}
                  aria-label={`mark signal in ${sector.id.replace(/[-_]/g, ' ')}`}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const PLANET_ART_POINTS: Record<string, [number, number]> = {
  Mercury: [12, 30], Venus: [14, 18], Mars: [31, 22], Phobos: [28.5, 25.2], Deimos: [34, 25.2],
  Jupiter: [47, 10.5], Callisto: [44.5, 15.8], Ganymede: [50, 16.5], Europa: [56, 12.7],
  Saturn: [68.5, 14], Enceladus: [76, 16.8], Titan: [70.5, 20.5], Uranus: [87.5, 18.5], Titania: [92, 20.5],
  Neptune: [86.5, 30], Triton: [91, 33],
};

function PlanetPieces({ view }: { view: SetiUiView }) {
  return (
    <div className="seti-planet-pieces" aria-label="orbiters and landers">
      {view.planets.flatMap((planet) => {
        const point = PLANET_ART_POINTS[planet.body];
        if (!point) return [];
        return [
          ...planet.firstLandingBonuses.map((amount, index) => (
            <span key={`${planet.body}-data-${index}`} className="seti-planet-data" style={{ left: `${point[0] + 3 + index * 2}%`, top: `${point[1] + 1}%` }} aria-label={`${amount} first landing data`}>{amount}</span>
          )),
          ...planet.orbiters.map((owner, index) => (
            <span key={`${planet.body}-orbit-${index}`} className="seti-planet-marker is-orbiter" style={{ left: `${point[0] - 3 + index * 1.7}%`, top: `${point[1] - 2.5}%`, '--seat': setiSeatColor(view.players[owner]?.color) } as CSSProperties} aria-label={`${view.players[owner]?.name ?? 'agency'} orbiter at ${planet.body}`} />
          )),
          ...planet.landers.map((owner, index) => (
            <span key={`${planet.body}-land-${index}`} className="seti-planet-marker is-lander" style={{ left: `${point[0] + index * 1.7}%`, top: `${point[1] + 2.2}%`, '--seat': setiSeatColor(view.players[owner]?.color) } as CSSProperties} aria-label={`${view.players[owner]?.name ?? 'agency'} lander at ${planet.body}`} />
          )),
        ];
      })}
    </div>
  );
}

function PlanetActionTargets({ orbitTargets, landTargets, onBody }: {
  orbitTargets: string[];
  landTargets: string[];
  onBody?: (kind: 'orbit' | 'land', body: string) => void;
}) {
  return (
    <div className="seti-planet-action-targets">
      {orbitTargets.map((body) => {
        const point = PLANET_ART_POINTS[body];
        if (!point) return null;
        return <button key={`orbit-${body}`} type="button" className="seti-planet-target is-orbit" style={{ left: `${point[0] - 2}%`, top: `${point[1] - 2}%` }} data-seti-target="orbit" data-seti-value={body} data-testid={`seti-orbit-target-${body}`} onClick={() => onBody?.('orbit', body)} aria-label={`orbit ${body}`}><span className="seti-orbit-mark" /></button>;
      })}
      {landTargets.map((body) => {
        const point = PLANET_ART_POINTS[body];
        if (!point) return null;
        return <button key={`land-${body}`} type="button" className="seti-planet-target is-land" style={{ left: `${point[0] + 2}%`, top: `${point[1] + 2}%` }} data-seti-target="land" data-seti-value={body} data-testid={`seti-land-target-${body}`} onClick={() => onBody?.('land', body)} aria-label={`land on ${body}`}><span className="seti-lander-mark" /></button>;
      })}
    </div>
  );
}

export function setiGoldTile(scene: SetiSceneDef, tileId: string, side: string): string | undefined {
  const id = tileId.replace(/^seti_gold_/, '');
  const tiles = Array.isArray(scene.tokens?.goldTiles) ? scene.tokens.goldTiles as unknown[] : [];
  const tile = tiles.map(record).find((entry) => entry.id === id);
  const sides = Array.isArray(tile?.sides) ? tile.sides.map(record) : [];
  return imagePath(sides[side.toUpperCase() === 'B' ? 1 : 0]?.image);
}

function GoldTiles({ scene, view }: { scene: SetiSceneDef; view: SetiUiView }) {
  return (
    <div className="seti-gold-rack" aria-label="gold milestones">
      {view.goldTiles.map((tile) => (
        <figure key={tile.id}>
          {setiGoldTile(scene, tile.id, tile.side) && <img src={setiGoldTile(scene, tile.id, tile.side)} alt={`${tile.id.replace(/[-_]/g, ' ')} side ${tile.side}`} />}
          {view.players.flatMap((player) => player.goldClaims.filter((claim) => claim === tile.id).map((_, index) => <i key={`${player.seat}-${index}`} style={{ '--seat': setiSeatColor(player.color) } as CSSProperties} />))}
        </figure>
      ))}
    </div>
  );
}

function AnimatedSolarPiece({ piece, view, selected, enabled, onTap, onDrop }: {
  piece: SetiUiPiece;
  view: SetiUiView;
  selected: boolean;
  enabled: boolean;
  onTap?: () => void;
  onDrop?: (kind: string, value: string) => boolean | void;
}) {
  const parsed = parseSetiCell(piece.cell) ?? { ring: 1, sector: 0 };
  const previous = useRef(parsed.sector);
  const [sector, setSector] = useState(parsed.sector);
  useEffect(() => {
    const unwrapped = unwrapSector(previous.current, parsed.sector);
    previous.current = unwrapped;
    setSector(unwrapped);
  }, [parsed.sector]);
  const color = setiSeatColor(view.players[piece.owner]?.color);
  return (
    <div
      className="seti-piece-orbit"
      style={{ '--piece-angle': `${sector * 45}deg`, '--piece-radius': `${[19.5, 31.5, 43][parsed.ring]}%` } as CSSProperties}
    >
      <div className="seti-piece-counter" style={{ '--piece-angle': `${-(sector * 45)}deg` } as CSSProperties}>
        <TactileSurface
          className={`seti-space-piece is-${piece.kind} ${selected ? 'is-selected' : ''}`}
          disabled={!enabled}
          testId={`seti-piece-${piece.id}`}
          onTap={onTap}
          onDrop={onDrop}
          ariaLabel={`${view.players[piece.owner]?.name ?? 'agency'} ${piece.kind}`}
        >
          <span className="seti-piece-shadow" />
          <span className="seti-piece-body" style={{ '--seat': color } as CSSProperties} />
        </TactileSurface>
      </div>
    </div>
  );
}

export interface SetiTableProps {
  scene: SetiSceneDef;
  view: SetiUiView;
  interactive?: boolean;
  selectedPieceId?: string | null;
  legalCells?: string[];
  orbitTargets?: string[];
  landTargets?: string[];
  sectorTargets?: string[];
  launchTarget?: boolean;
  onPiece?: (piece: SetiUiPiece) => void;
  onCell?: (cell: string) => void;
  onBody?: (kind: 'orbit' | 'land', body: string) => void;
  onSector?: (sectorId: string) => void;
  onCardDrop?: (cardId: string, row: number, kind: string, value: string) => boolean | void;
  onLaunch?: () => void;
  onCard?: (cardId: string, row: number) => void;
  onTech?: (stackId: string) => void;
  compact?: boolean;
}

export function SetiTable({
  scene,
  view,
  interactive = false,
  selectedPieceId,
  legalCells = [],
  orbitTargets = [],
  landTargets = [],
  sectorTargets = [],
  launchTarget = false,
  onPiece,
  onCell,
  onBody,
  onSector,
  onCardDrop,
  onLaunch,
  onCard,
  onTech,
  compact = false,
}: SetiTableProps) {
  const center = scene.solarSystem.center ?? [-1.38, -0.06];
  const solarPoint = scene.solarSystem.centerArt?.length === 2
    ? { x: scene.solarSystem.centerArt[0] * 100, y: scene.solarSystem.centerArt[1] * 100 }
    : boardWorldToPercent(boardMatrix(scene), [numberValue(center[0], -1.38), numberValue(center[1], -0.06)]) ?? { x: 49.65, y: 54.99 };
  const discs = scene.solarSystem.discs ?? [];
  const orientations = view.orientations.length >= 3 ? view.orientations : [0, 0, 0];
  // State stores the absolute orientation index. A physical -45 degree turn
  // decrements that index, so the render angle per stored step is +45.
  const stateStepDegrees = -numberValue(scene.solarSystem.rotationDegrees, -45);
  const [oneRelative, twoRelative, threeAbsolute] = nestedDiscAngles(orientations, stateStepDegrees);
  const boardHorizontalWorld = Math.hypot(boardMatrix(scene)?.[0]?.[0] ?? 0, boardMatrix(scene)?.[1]?.[0] ?? 17.3015);
  const outerWorldSize = scene.solarSystem.discs?.[2]?.mapping?.orientedSize?.[0] ?? 9.9;
  const middleWorldSize = scene.solarSystem.discs?.[1]?.mapping?.orientedSize?.[0] ?? 7.240834;
  const innerWorldSize = scene.solarSystem.discs?.[0]?.mapping?.orientedSize?.[0] ?? 4.840114;
  const solarStyle = { left: `${solarPoint.x}%`, top: `${solarPoint.y}%`, width: `${outerWorldSize / boardHorizontalWorld * 100}%` } as CSSProperties;
  const boardImage = imagePath(scene.board) ?? '/seti/board/main-board.webp';
  const baseImage = imagePath(scene.solarSystem.base);
  const earthCell = view.bodyCells.Earth ?? scene.solarSystem.earthCell;
  return (
    <div className={`seti-table ${compact ? 'is-compact' : ''}`} data-testid="seti-table">
      <div className="seti-board-stage" data-testid="seti-board-stage" style={{ aspectRatio: `${scene.board.imagePx?.[0] ?? 3507} / ${scene.board.imagePx?.[1] ?? 5612}` }}>
        <img className="seti-main-board" src={boardImage} alt="SETI main board" draggable={false} />
        <SectorArray scene={scene} view={view} targets={sectorTargets} onSector={onSector} />
        <PlanetPieces view={view} />
        <PlanetActionTargets orbitTargets={orbitTargets} landTargets={landTargets} onBody={onBody} />
        <GoldTiles scene={scene} view={view} />
        <div className="seti-solar-system" style={solarStyle} data-testid="seti-solar-system">
          <div className="seti-solar-base">
            {baseImage && <img src={baseImage} alt="" draggable={false} />}
          </div>
          <div className="seti-disc seti-disc-3" data-testid="seti-disc-3" style={{ transform: `rotate(${threeAbsolute}deg)` }}>
            <img src={discs[2]?.image ?? '/seti/solar/disc-3.webp'} alt="" draggable={false} />
            <div className="seti-disc seti-disc-2" data-testid="seti-disc-2" style={{ width: `${middleWorldSize / outerWorldSize * 100}%`, transform: `translate(-50%, -50%) rotate(${twoRelative}deg)` }}>
              <img src={discs[1]?.image ?? '/seti/solar/disc-2.webp'} alt="" draggable={false} />
              <div className="seti-disc seti-disc-1" data-testid="seti-disc-1" style={{ width: `${innerWorldSize / middleWorldSize * 100}%`, transform: `translate(-50%, -50%) rotate(${oneRelative}deg)` }}>
                <img src={discs[0]?.image ?? '/seti/solar/disc-1.webp'} alt="" draggable={false} />
              </div>
            </div>
          </div>
          <span className={`seti-rotation-pointer points-${Math.max(1, Math.min(3, view.rotationPointer))}`} aria-label={`disc ${view.rotationPointer} rotates next`} />
          {Array.from({ length: 24 }, (_, index) => {
            const ring = Math.floor(index / 8);
            const sector = index % 8;
            const id = `r${ring}s${sector}`;
            const legal = legalCells.some((cell) => {
              const parsed = parseSetiCell(cell);
              return parsed?.ring === ring && parsed.sector === sector;
            });
            const legalCell = legalCells.find((cell) => {
              const parsed = parseSetiCell(cell);
              return parsed?.ring === ring && parsed.sector === sector;
            });
            const launch = launchTarget && !!earthCell && (() => {
              const parsed = parseSetiCell(earthCell);
              return parsed?.ring === ring && parsed.sector === sector;
            })();
            if (!interactive && !legal && !launch) return null;
            const point = setiCellPoint(id);
            return (
              <button
                key={id}
                type="button"
                className={`seti-cell-target ${legal || launch ? 'is-legal' : ''} ${launch ? 'is-earth' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                data-seti-target={launch ? 'launch' : 'cell'}
                data-seti-value={launch ? earthCell : legalCell ?? id}
                data-testid={launch ? 'seti-launch-earth-target' : legal ? `seti-cell-target-${id}` : undefined}
                disabled={!legal && !launch}
                onClick={() => launch ? onLaunch?.() : onCell?.(legalCell ?? id)}
                aria-label={launch ? 'launch at Earth' : `move to ring ${ring + 1} sector ${sector + 1}`}
              />
            );
          })}
          {view.pieces.filter((piece) => piece.cell).map((piece) => {
            const ownPiece = view.you === piece.owner;
            const enabled = interactive && ownPiece && (view.legal.moveTargets[piece.id]?.length > 0 || view.legal.orbitTargets[piece.id]?.length > 0 || view.legal.landTargets[piece.id]?.length > 0);
            return (
              <AnimatedSolarPiece
                key={piece.id}
                piece={piece}
                view={view}
                selected={selectedPieceId === piece.id}
                enabled={enabled}
                onTap={() => onPiece?.(piece)}
                onDrop={(kind, value) => {
                  if (kind === 'cell' && view.legal.moveTargets[piece.id]?.includes(value)) { onCell?.(value); return true; }
                  if (kind === 'orbit' && view.legal.orbitTargets[piece.id]?.includes(value)) { onBody?.('orbit', value); return true; }
                  if (kind === 'land' && view.legal.landTargets[piece.id]?.includes(value)) { onBody?.('land', value); return true; }
                  return false;
                }}
              />
            );
          })}
        </div>

        <div className="seti-tech-rack" aria-label="technology stacks">
          {view.techStacks.map((stack, index) => {
            const legal = view.legal.techStackTargets.includes(stack.id);
            return (
              <button
                key={stack.id}
                type="button"
                className={`seti-tech-stack tech-${index % 4} ${legal ? 'is-legal' : ''}`}
                disabled={interactive && !legal}
                onClick={() => onTech?.(stack.id)}
                data-seti-target="tech"
                data-seti-value={stack.id}
                data-testid={`seti-tech-stack-${stack.id}`}
                aria-label={`${stack.type} technology, ${stack.count} remaining`}
              >
                {setiTechBack(scene, stack.id) && <img className="seti-tech-art" src={setiTechBack(scene, stack.id)} alt="" draggable={false} />}
                <span className="seti-tech-lines" />
                <b>{stack.type.slice(0, 2).toUpperCase()}</b>
                {stack.bonus && <small>2</small>}
              </button>
            );
          })}
        </div>

        <div className="seti-project-row" aria-label="project row">
          {view.projectRow.map((card, row) => (
            <TactileSurface key={`${card}-${row}`} testId={`seti-project-row-${row}`} className={`seti-row-card ${view.legal.buyableRow.includes(row) ? 'is-buyable' : ''}`} onTap={() => onCard?.(card, row)} onDrop={(kind, value) => onCardDrop?.(card, row, kind, value)} ariaLabel={`inspect project row card ${row + 1}`}>
              <SetiCardArt scene={scene} cardId={card} />
            </TactileSurface>
          ))}
        </div>
      </div>
    </div>
  );
}

export function setiPlayerBoard(scene: SetiSceneDef, color: string): string {
  const boards = scene.playerBoards;
  const fallback = `/seti/player/player-${color.toLowerCase()}.webp`;
  if (Array.isArray(boards)) {
    const match = boards.find((board) => `${board.id ?? board.name ?? ''}`.toLowerCase().includes(color.toLowerCase()));
    return match?.image ?? fallback;
  }
  return imagePath(boards?.[color] ?? boards?.[color.toLowerCase()]) ?? fallback;
}

export function setiAlienBoard(scene: SetiSceneDef, id: string, revealed: boolean): string {
  if (!revealed) return '/seti/aliens/alien-back.webp';
  const boards = scene.alienBoards;
  if (Array.isArray(boards)) {
    const match = boards.find((board) => `${board.id ?? board.name ?? ''}`.toLowerCase().includes(id.toLowerCase()));
    return match?.image ?? `/seti/aliens/${id.toLowerCase()}.webp`;
  }
  return imagePath(boards?.[id] ?? boards?.[id.toLowerCase()]) ?? `/seti/aliens/${id.toLowerCase()}.webp`;
}

export function setiTechBack(scene: SetiSceneDef, stackId: string): string | undefined {
  const sourceByStack: Record<string, string> = {
    probe_1: '5065ac', probe_2: 'b71fb9', probe_3: 'c0c391', probe_4: '00d8a2',
    telescope_1: '82eb24', telescope_2: '93c0f5', telescope_3: '0fb79c', telescope_4: '9b40d4',
    computer_1: '00df2d', computer_2: 'b26ea5', computer_3: '84fb8c', computer_4: '9dceb9',
  };
  const suffix = stackId.replace(/^seti_tech_stack_/, '');
  const stacks = Array.isArray(record(scene.decks).technologyStacks) ? record(scene.decks).technologyStacks as unknown[] : [];
  const sourceGuid = sourceByStack[suffix];
  const stack = stacks.map(record).find((entry) => entry.guid === sourceGuid);
  const tile = record(listValue(stack?.tiles)[0]);
  return imagePath(tile.back) ?? imagePath(tile.sheet);
}

function listValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
