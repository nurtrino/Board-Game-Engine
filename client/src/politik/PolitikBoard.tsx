import { useEffect, useMemo, useRef, useState } from 'react';
import { SEAT_HEX } from '../brass/TableScene';
import { playSfx } from '../sfx';
import {
  PolitikTable,
  politikBoardPoint,
  politikPxToWorld,
  type PolitikBoardToken,
  type PolitikCardRef,
  type PolitikSceneDef,
  usePolitikScene,
} from './PolitikScene';

interface PolitikBoardPlayer {
  seat: number;
  color: string;
  name: string;
  nation?: string | null;
  capital?: number;
  carbon?: number;
  food?: number;
  corruption?: number;
  support?: number | Record<string, number>;
  leaders?: number | Record<string, number>;
  companies?: unknown[];
  nationalUsed?: string[] | Record<string, boolean>;
  powerGrabs?: string[] | Record<string, boolean | number>;
  handCount?: number;
}

export interface PolitikBoardView {
  game: 'politik';
  phase: 'setup' | 'playing' | 'ended';
  options?: { longWar?: boolean; trifecta?: boolean; ragingImperials?: boolean };
  turn: number;
  first?: number;
  actionsTaken?: number;
  actionsAllowed?: number;
  players: PolitikBoardPlayer[];
  prices?: Record<string, number>;
  locations?: unknown;
  councilSupport?: unknown;
  marketSupply?: unknown;
  marketReserve?: unknown;
  landscape?: { active?: unknown; upcoming?: unknown; deckCount?: number };
  politicsDeckCount?: number;
  obligationDeckCount?: number;
  pending?: unknown;
  finalSay?: number;
  winners?: number[] | null;
  winner?: number | null;
  eventSeq?: number;
  lastEvent?: unknown;
}

export type PolitikCardLike = PolitikCardRef | string | { id?: string; sheet?: number | string; cell?: number } | null | undefined;

export function politikCardRef(card: PolitikCardLike): PolitikCardRef | null {
  if (!card) return null;
  if (typeof card === 'object' && card.sheet !== undefined && card.cell !== undefined) {
    return { sheet: card.sheet, cell: card.cell };
  }
  const id = typeof card === 'string' ? card : 'id' in card ? card.id : undefined;
  if (!id || !/^\d+:\d+$/.test(id)) return null;
  const [sheet, cell] = id.split(':').map(Number);
  return { sheet, cell };
}

export function PolitikCard({ scene, card, className, label, hidden = false }: {
  scene: PolitikSceneDef;
  card: PolitikCardLike;
  className?: string;
  label?: string;
  hidden?: boolean;
}) {
  const ref = politikCardRef(card);
  const sheet = ref ? scene.sheets[String(ref.sheet)] : null;
  const col = ref && sheet ? ref.cell % sheet.cols : 0;
  const row = ref && sheet ? Math.floor(ref.cell / sheet.cols) : 0;
  const image = hidden ? sheet?.back : sheet?.face;
  const style = image ? {
    backgroundImage: `url(${image})`,
    backgroundSize: `${(hidden ? 1 : sheet?.cols ?? 1) * 100}% ${(hidden ? 1 : sheet?.rows ?? 1) * 100}%`,
    backgroundPosition: hidden
      ? 'center'
      : `${(sheet?.cols ?? 1) > 1 ? col / ((sheet?.cols ?? 1) - 1) * 100 : 0}% ${(sheet?.rows ?? 1) > 1 ? row / ((sheet?.rows ?? 1) - 1) * 100 : 0}%`,
  } : undefined;
  return (
    <div className={`pk-card-art ${className ?? ''}${hidden ? ' hidden' : ''}`} style={style} role="img" aria-label={label ?? 'Politik card'}>
      {!image && <span>{label ?? 'CARD'}</span>}
    </div>
  );
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const countOf = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length;
  const record = asRecord(value);
  return record ? Object.values(record).reduce<number>((sum, item) => sum + (typeof item === 'number' ? item : 0), 0) : 0;
};

function playerFor(view: PolitikBoardView, key: unknown): PolitikBoardPlayer | null {
  if (typeof key === 'number') return view.players.find((player) => player.seat === key) ?? view.players[key] ?? null;
  if (typeof key !== 'string') return null;
  return view.players.find((player) => String(player.seat) === key || player.color === key || player.name === key) ?? null;
}

function tokenColor(view: PolitikBoardView, seat: unknown): string {
  const player = playerFor(view, seat);
  return player ? SEAT_HEX[player.color] ?? player.color : '#ece3c7';
}

function placementEntries(view: PolitikBoardView, value: unknown): { seat: unknown; count: number }[] {
  if (typeof value === 'number') return value > 0 ? [{ seat: null, count: value }] : [];
  if (typeof value === 'string') return [{ seat: value, count: 1 }];
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'number')) {
      return value.map((count, seat) => ({ seat, count })).filter((entry) => entry.count > 0);
    }
    const grouped = new Map<unknown, number>();
    for (const item of value) {
      const itemRecord = asRecord(item);
      const seat = itemRecord?.seat ?? itemRecord?.owner ?? itemRecord?.player ?? item;
      grouped.set(seat, (grouped.get(seat) ?? 0) + Number(itemRecord?.count ?? 1));
    }
    return [...grouped].map(([seat, count]) => ({ seat, count }));
  }
  const record = asRecord(value);
  if (!record) return [];
  for (const nested of ['influence', 'support', 'players', 'seats', 'tokens']) {
    if (record[nested] !== undefined) return placementEntries(view, record[nested]);
  }
  const result: { seat: unknown; count: number }[] = [];
  if (record.owner !== undefined || record.controller !== undefined) {
    result.push({ seat: record.owner ?? record.controller, count: Number(record.count ?? 1) });
  }
  for (const [seat, raw] of Object.entries(record)) {
    if (!playerFor(view, seat) || typeof raw !== 'number' || raw <= 0) continue;
    result.push({ seat, count: raw });
  }
  return result;
}

export function buildPolitikBoardTokens(scene: PolitikSceneDef, view: PolitikBoardView): PolitikBoardToken[] {
  const tokens: PolitikBoardToken[] = [];
  const addPlacements = (source: unknown, prefix: string, shape: PolitikBoardToken['shape']) => {
    const record = asRecord(source);
    if (!record) return;
    for (const [id, value] of Object.entries(record)) {
      const px = politikBoardPoint(scene, id);
      if (!px) continue;
      placementEntries(view, value).forEach((entry, index) => {
        const seat = playerFor(view, entry.seat)?.seat ?? index;
        const spread = (Number(seat) % 6) - 2.5;
        tokens.push({
          id: `${prefix}-${id}-${String(entry.seat)}-${index}`,
          px: [px[0] + spread * 34, px[1] + (index % 2 ? 28 : -18)],
          color: tokenColor(view, entry.seat),
          shape,
          count: Math.max(1, Math.min(4, entry.count)),
          label: entry.count > 4 ? String(entry.count) : undefined,
        });
      });
    }
  };
  addPlacements(view.locations, 'location', 'marker');
  const locations = asRecord(view.locations);
  for (const [id, raw] of Object.entries(locations ?? {})) {
    const location = asRecord(raw);
    const imperial = Number(location?.imperialInfluence ?? 0);
    const px = politikBoardPoint(scene, id);
    if (!px || imperial <= 0) continue;
    tokens.push({ id: `imperial-${id}`, px: [px[0] - 46, px[1] + 32], color: '#d8d1b9', shape: 'marker', count: Math.min(4, imperial), label: `I ${imperial}` });
  }
  addPlacements(view.councilSupport, 'council', 'disc');
  const supply = asRecord(view.marketSupply);
  for (const industry of scene.boardData.industries) {
    const available = Number(supply?.[industry.id] ?? 0);
    if (available > 0) tokens.push({
      id: `market-supply-${industry.id}`,
      px: [industry.px[0] - 65, industry.px[1]],
      color: industry.color,
      shape: 'cube',
      count: Math.min(4, available),
      label: String(available),
    });
    view.players.forEach((player) => {
      const control = (player.companies ?? []).reduce<number>((total, company) => {
        const markets = asRecord(asRecord(company)?.markets);
        return total + Number(markets?.[industry.id] ?? 0);
      }, 0);
      if (control <= 0) return;
      tokens.push({
        id: `market-control-${industry.id}-${player.seat}`,
        px: [industry.px[0] + 45 + player.seat * 28, industry.px[1]],
        color: SEAT_HEX[player.color] ?? player.color,
        shape: 'disc',
        count: Math.min(3, control),
        label: String(control),
        lift: 0.06,
      });
    });
  }

  for (const row of scene.boardData.priceRows) {
    const value = Math.max(row.min, Math.min(row.max, view.prices?.[row.id] ?? row.start));
    const px = row.slots[value - row.min] ?? row.px;
    tokens.push({ id: `price-${row.id}`, px, color: '#eee5c9', shape: 'cube', label: String(value) });
  }

  view.players.forEach((player) => {
    const grabs = Array.isArray(player.powerGrabs)
      ? player.powerGrabs.map((kind) => ({ kind, count: 1 }))
      : Object.entries(player.powerGrabs ?? {}).filter(([, active]) => active).map(([kind, active]) => ({ kind, count: Number(active) || 1 }));
    grabs.forEach(({ kind, count }, index) => {
      const px = scene.boardData.powerGrabs[kind];
      if (px) tokens.push({
        id: `grab-${player.seat}-${kind}`,
        px: [px[0] + (player.seat - 2.5) * 42, px[1] + index * 26],
        color: SEAT_HEX[player.color] ?? player.color,
        shape: kind === 'military' ? 'marker' : kind === 'corporate' ? 'cube' : 'disc',
        count: Math.min(4, count),
        label: count > 1 ? String(count) : undefined,
      });
    });
    const used = Array.isArray(player.nationalUsed)
      ? player.nationalUsed
      : Object.entries(player.nationalUsed ?? {}).filter(([, active]) => active).map(([kind]) => kind);
    used.forEach((kind) => {
      const px = scene.boardData.nationalActions[kind];
      if (px) tokens.push({
        id: `national-${player.seat}-${kind}`,
        px: [px[0] + (player.seat - 2.5) * 30, px[1]],
        color: SEAT_HEX[player.color] ?? player.color,
        shape: 'disc',
      });
    });
  });
  return tokens;
}

const eventText = (event: unknown): { title: string; detail: string; seq: number } | null => {
  const record = asRecord(event);
  if (!record) return null;
  const title = String(record.title ?? record.action ?? record.kind ?? 'TABLE UPDATE').replaceAll('_', ' ');
  const detail = String(record.detail ?? record.text ?? record.message ?? 'The shared board has been updated.');
  return { title, detail, seq: Number(record.seq ?? record.id ?? 0) };
};

const playerTotal = (player: PolitikBoardPlayer, field: 'support' | 'leaders') => countOf(player[field]);

const BOARD_GUIDE = [
  { title: 'STATES', text: 'Military influence controls states and regions, creating the path to a military power grab.' },
  { title: 'BROADCAST STATIONS', text: 'Stations sit between Regions, count as States, grant 1 Support when captured or produced, and provide a controllable ready ability.' },
  { title: 'INDUSTRIES', text: 'Companies compete in six markets. Market position, assets, margin, and capital drive corporate power.' },
  { title: 'COUNCIL', text: 'Campaign support into the six council seats to shape the political contest and gain access to office abilities.' },
  { title: 'IDEOLOGY BASES', text: 'Support begins in the four bases at the right. Campaign actions move it from permitted bases into one council seat.' },
  { title: 'PRICES', text: 'The six price tracks change what resources and main actions cost. Read them before committing an action.' },
  { title: 'POWER GRABS', text: 'Military, political, and corporate power grabs are the three routes to victory.' },
];

export function PolitikBoard({ view }: { view: PolitikBoardView }) {
  const scene = usePolitikScene();
  const [guide, setGuide] = useState(view.phase === 'setup');
  const [guideIndex, setGuideIndex] = useState(0);
  const tokens = useMemo(() => scene ? buildPolitikBoardTokens(scene, view) : [], [scene, view]);
  const current = playerFor(view, view.turn);
  const lastEvent = eventText(view.lastEvent);
  const eventLocation = asRecord(view.lastEvent)?.location;
  const focusPx = scene && typeof eventLocation === 'string' ? politikBoardPoint(scene, eventLocation) : null;
  const focusWorld = scene && focusPx ? politikPxToWorld(scene, focusPx) : null;
  const lastSeq = useRef(0);
  const previousTurn = useRef(view.turn);
  const announcedEnd = useRef(false);

  useEffect(() => {
    if (!lastEvent || lastEvent.seq <= lastSeq.current) return;
    lastSeq.current = lastEvent.seq;
    playSfx(/capital|income|exchange/i.test(lastEvent.title) ? 'coins' : /card|research/i.test(lastEvent.title) ? null : 'link');
  }, [lastEvent?.seq]);
  useEffect(() => {
    if (view.phase === 'playing' && previousTurn.current !== view.turn) {
      previousTurn.current = view.turn;
      playSfx('turn');
    }
  }, [view.phase, view.turn]);
  useEffect(() => {
    if (view.phase === 'ended' && !announcedEnd.current) {
      announcedEnd.current = true;
      playSfx('win');
    }
  }, [view.phase]);

  if (!scene) return <div className="page center"><h2>Opening the chamber</h2></div>;

  const activeLandscape = politikCardRef(view.landscape?.active as PolitikCardLike);
  const upcomingLandscape = politikCardRef(view.landscape?.upcoming as PolitikCardLike);
  const marketSupply = asRecord(view.marketSupply);
  const marketReserve = asRecord(view.marketReserve);
  const winners = view.winners?.length ? view.winners : view.winner !== null && view.winner !== undefined ? [view.winner] : [];
  return (
    <div className="pk-tv">
      <PolitikTable scene={scene} tokens={tokens} camera="tv" className="pk-tv-table" focus={focusWorld} />

      <div className="pk-tv-brand ig-glass">
        <img src={scene.logo} alt="Politik" />
        <div>
          <span className="ig-lab">{view.phase === 'setup' ? 'NATION FORMATION' : view.phase === 'ended' ? 'FINAL ORDER' : 'GOVERNING SESSION'}</span>
          <b>{view.phase === 'playing' ? `ACTION ${(view.actionsTaken ?? 0) + 1} OF ${view.actionsAllowed ?? 2}` : view.phase.toUpperCase()}</b>
          {(view.options?.longWar || view.options?.trifecta || view.options?.ragingImperials) && <small>{[view.options.longWar && 'LONG WAR', view.options.trifecta && 'TRIFECTA', view.options.ragingImperials && 'RAGING IMPERIALS'].filter(Boolean).join(' / ')}</small>}
        </div>
      </div>

      {current && (
        <div className="pk-tv-turn ig-glass" style={{ '--seat': SEAT_HEX[current.color] ?? current.color } as React.CSSProperties}>
          <span className="pk-seat-mark" />
          <span><small>NOW ACTING</small><b>{current.name}</b></span>
          {current.nation && <em>{current.nation}</em>}
        </div>
      )}

      <div className="pk-tv-players">
        {view.players.map((player) => (
          <div key={player.seat} className={`pk-tv-player ig-glass${player.seat === view.turn ? ' on' : ''}`} style={{ '--seat': SEAT_HEX[player.color] ?? player.color } as React.CSSProperties}>
            <span className="pk-seat-mark" />
            <div className="pk-tv-player-id"><b>{player.name}</b><small>{player.nation ?? 'FORMING NATION'}{view.finalSay === player.seat ? ' / FINAL SAY' : ''}</small></div>
            <span><small>CAP</small><b>{player.capital ?? 0}</b></span>
            <span><small>SUP</small><b>{playerTotal(player, 'support')}</b></span>
            <span><small>LDR</small><b>{playerTotal(player, 'leaders')}</b></span>
            <span><small>COR</small><b>{player.corruption ?? 0}</b></span>
            <span><small>HAND</small><b>{player.handCount ?? 0}</b></span>
          </div>
        ))}
      </div>

      <div className="pk-tv-market ig-glass">
        <div className="pk-tv-panel-head"><span className="ig-lab">CURRENT PRICES</span><span>PUBLIC MARKET</span></div>
        <div className="pk-price-grid">
          {scene.boardData.priceRows.map((row) => <span key={row.id}><small>{row.id}</small><b>{view.prices?.[row.id] ?? row.start}</b></span>)}
        </div>
        <div className="pk-tv-market-head"><span>PHYSICAL MARKET POOLS</span><small>15 TOKENS PER INDUSTRY</small></div>
        <div className="pk-tv-market-grid">
          {scene.boardData.industries.map((industry) => <span key={industry.id} style={{ borderTopColor: industry.color }}>
            <small>{industry.id}</small>
            <b>{Number(marketSupply?.[industry.id] ?? 0)}<em>ON BOARD</em></b>
            <b>{Number(marketReserve?.[industry.id] ?? 0)}<em>RESERVE</em></b>
          </span>)}
        </div>
      </div>

      <div className="pk-tv-landscape ig-glass">
        <div className="pk-tv-panel-head"><span className="ig-lab">LANDSCAPE</span><span>{view.landscape?.deckCount ?? 0} REMAIN</span></div>
        <div className="pk-landscape-cards">
          <div><small>ACTIVE</small>{activeLandscape ? <PolitikCard scene={scene} card={activeLandscape} /> : <span className="pk-empty-card">NO ACTIVE LANDSCAPE</span>}</div>
          <div><small>UPCOMING</small>{upcomingLandscape ? <PolitikCard scene={scene} card={upcomingLandscape} /> : <span className="pk-empty-card">NOT REVEALED</span>}</div>
        </div>
      </div>

      <button className={`pk-explain-btn${guide ? ' on' : ''}`} onClick={() => setGuide((open) => !open)}>
        {guide ? 'CLOSE GUIDE' : 'EXPLAIN BOARD'}
      </button>

      {guide && (
        <div className="pk-tv-guide ig-glass">
          <span className="ig-lab">BOARD GUIDE {guideIndex + 1} / {BOARD_GUIDE.length}</span>
          <b>{BOARD_GUIDE[guideIndex].title}</b>
          <p>{BOARD_GUIDE[guideIndex].text}</p>
          <div>
            <button disabled={guideIndex === 0} onClick={() => setGuideIndex((index) => Math.max(0, index - 1))}>BACK</button>
            <button onClick={() => guideIndex === BOARD_GUIDE.length - 1 ? setGuide(false) : setGuideIndex((index) => index + 1)}>{guideIndex === BOARD_GUIDE.length - 1 ? 'DONE' : 'NEXT'}</button>
          </div>
        </div>
      )}

      {lastEvent && (
        <div className="pk-tv-event ig-glass" key={lastEvent.seq}>
          <span className="ig-lab">TABLE UPDATE</span>
          <b>{lastEvent.title}</b>
          <p>{lastEvent.detail}</p>
        </div>
      )}

      {view.phase === 'ended' && (
        <div className="pk-end-screen">
          <div className="pk-end-card ig-glass">
            <img src={scene.logo} alt="Politik" />
            <span className="ig-lab">NEW WORLD ORDER</span>
            <h1>{winners.map((seat) => playerFor(view, seat)?.name).filter(Boolean).join(' AND ') || 'SESSION COMPLETE'}</h1>
            <p>{winners.length > 1 ? 'The final order is shared.' : 'The final order has been established.'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
