// Personal device (iPad / laptop). Lobby: pick your color, host starts.
// In game: one board fills the screen (your personal board or the shared
// table) with the OTHER board minimized top-right — click the mini to swap.
// Your hand is splayed at the bottom: hover to lift a card, click to focus it
// center-screen, X (or click away) to dismiss.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { socket, useRoom } from '../net';
import { TableScene, useBrassScene, SEAT_HEX, type SceneDef, type CardSheet, type PickTarget } from '../brass/TableScene';
import { gameSceneState } from './BoardPage';
import { playSfx } from '../sfx';
import {
  buildLocations, freeSquares, buildableLinks, sellableSquares, developableTiles,
  cardIndustries, lowestTile, planBuild,
  type BrassView, type BrassAction, type Card, type Color,
} from '@bge/shared';

const ALL_COLORS: Color[] = ['Orange', 'Purple', 'Teal', 'Yellow'];

const HAND_CSS = `
.hand-fan { position: absolute; left: 50%; bottom: -34px; height: 190px; pointer-events: none; }
.hand-card {
  position: absolute; bottom: 0; left: 0; width: 96px; height: 134px; margin-left: -48px;
  border-radius: 7px; transform-origin: 50% 130%; cursor: pointer; pointer-events: auto;
  box-shadow: 0 3px 10px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.12);
  transition: transform 0.16s ease, box-shadow 0.16s ease;
  animation: dealin 0.45s ease backwards;
}
.hand-card:hover {
  transform: translateX(var(--tx)) translateY(calc(var(--ty) - 46px)) rotate(0deg) scale(1.22) !important;
  box-shadow: 0 10px 26px rgba(0,0,0,0.8); z-index: 40 !important;
}
@keyframes dealin {
  from { opacity: 0; transform: translateX(var(--tx)) translateY(calc(var(--ty) + 130px)) rotate(14deg); }
}
/* a static card (drawn-reveal, discard) — flip-in, no hover growth */
.flip-card {
  border-radius: 10px; box-shadow: 0 8px 26px rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.14);
  background-size: cover; background-position: center; animation: flipin 0.5s ease backwards;
}
@keyframes flipin {
  from { opacity: 0; transform: translateY(64px) rotateX(38deg) scale(0.7); }
}
.card-focus-backdrop {
  position: absolute; inset: 0; background: rgba(4,5,8,0.72); z-index: 60;
  display: flex; align-items: center; justify-content: center;
}
.card-focus { position: relative; }
.card-focus-x {
  position: absolute; top: -16px; right: -16px; width: 36px; height: 36px; border-radius: 50%;
  border: none; cursor: pointer; background: #e8ebf0; color: #0a0c0f;
  display: flex; align-items: center; justify-content: center;
  font: 700 16px/1 Inter, sans-serif; padding: 0;
}
.action-btn {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 9px 14px; border-radius: 9px; border: none; cursor: pointer;
  background: transparent; color: #e8ebf0; font: 600 13px Inter, sans-serif;
  transition: background 0.12s ease;
}
.action-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
.action-btn:disabled { opacity: 0.35; cursor: default; }
.action-btn.selected { background: #e8ebf0; color: #0a0c0f; }

/* foreground card picker */
.picker-backdrop {
  position: absolute; inset: 0; background: rgba(4,5,8,0.82); z-index: 70;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
}
.picker-cards { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; max-width: 82vw; }
.picker-card {
  width: 150px; height: 210px; border-radius: 10px; cursor: pointer; position: relative;
  border: 2px solid rgba(255,255,255,0.14); box-shadow: 0 6px 22px rgba(0,0,0,0.7);
  transition: transform 0.14s ease, border-color 0.14s ease;
}
.picker-card:hover:not(.dim) { transform: translateY(-10px) scale(1.06); z-index: 5; }
.picker-card.sel { border-color: #ffd54a; transform: translateY(-10px); }
.picker-card.sel::after {
  content: 'DISCARD'; position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
  background: #ffd54a; color: #0a0c0f; font: 800 10px Inter, sans-serif; letter-spacing: 1px;
  padding: 3px 8px; border-radius: 5px;
}
.picker-card.dim { opacity: 0.28; cursor: default; }

/* coin chips */
.coin {
  width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center;
  justify-content: center; font: 800 10px Inter, sans-serif; color: #241d0e; flex: 0 0 auto;
  box-shadow: inset 0 -2px 4px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.6);
}
.coin.g { background: radial-gradient(circle at 35% 30%, #ffe9a8 0%, #d4a943 55%, #9c7722 100%); }
.coin.s { background: radial-gradient(circle at 35% 30%, #f3f4f6 0%, #b9bec7 55%, #7e858f 100%); }
.coin.b { background: radial-gradient(circle at 35% 30%, #e8b98a 0%, #b07a45 55%, #7c4f28 100%); }
`;

const ACTIONS = [
  { id: 'build', label: 'Build', hint: 'Play a card, then place an industry from your board' },
  { id: 'network', label: 'Network', hint: 'Discard a card, place a canal or railway' },
  { id: 'develop', label: 'Develop', hint: 'Discard a card, remove a tile from your board' },
  { id: 'sell', label: 'Sell', hint: 'Discard a card, flip cotton, goods or pottery' },
  { id: 'loan', label: 'Loan', hint: 'Discard a card, take £30 — income falls 3 levels' },
  { id: 'scout', label: 'Scout', hint: 'Discard 2 cards + 1 for the action; take the two wilds' },
  { id: 'pass', label: 'Pass', hint: 'Discard a card, do nothing' },
] as const;

function cardBg(sheet: CardSheet, cell: number) {
  const col = cell % sheet.cols;
  const row = Math.floor(cell / sheet.cols);
  return {
    backgroundImage: `url(${sheet.image})`,
    backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
    backgroundPosition: `${(col / (sheet.cols - 1)) * 100}% ${(row / (sheet.rows - 1)) * 100}%`,
  } as const;
}

// Right column width: the board mini + action panel live here.
const RIGHT_W = 'min(42vw, 64vh)';

// Set --seat (a player's colour) plus any extra CSS on an element.
const seatStyle = (color: string, extra: React.CSSProperties = {}): React.CSSProperties =>
  ({ '--seat': SEAT_HEX[color], ...extra } as React.CSSProperties);

type ActionId = typeof ACTIONS[number]['id'];

type Flow =
  | { step: 'idle' }
  | { step: 'pickCard'; action: ActionId; picked: number[] } // foreground picker
  | { step: 'pickTile'; action: 'build' | 'develop'; card: number } // your board: tap a tile
  | { step: 'pickSquare'; card: number; industry: string } // table: tap a location square
  | { step: 'confirmBuild'; card: number; industry: string; square: string } // cost breakdown
  | { step: 'pickLink'; card: number } // table: tap a connection
  | { step: 'pickSell'; card: number }; // table: tap your industry

function coinsFor(amount: number): { g: number; s: number; b: number } {
  const g = Math.floor(amount / 15);
  const s = Math.floor((amount - g * 15) / 5);
  const b = amount - g * 15 - s * 5;
  return { g, s, b };
}

// Real coin art from the mod: each denomination's texture shows two coin
// faces side by side. Scale by the texture's true aspect (no stretching) and
// center the LEFT coin (at 1/4 of the image width) inside the circle.
function CoinRow({ amount, coins, compact }: { amount: number; coins: SceneDef['coins']; compact?: boolean }) {
  const { g, s, b } = coinsFor(Math.max(0, amount));
  const size = compact ? 22 : 27;
  const chip = (denom: 'gold' | 'silver' | 'bronze', n: number) => {
    if (n <= 0) return null;
    const A = coins[denom].aspect ?? 2;
    const drawnW = size * A; // height-fit: displayed image width
    const offsetX = size / 2 - drawnW / 4; // put the left coin's centre in the middle
    return (
      <span key={denom} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <span style={{
          width: size, height: size, borderRadius: '50%', flex: '0 0 auto',
          backgroundImage: `url(${coins[denom].diffuse})`,
          backgroundSize: `auto ${size}px`,
          backgroundPosition: `${offsetX}px 50%`,
          backgroundRepeat: 'no-repeat',
          boxShadow: '0 1px 4px rgba(0,0,0,0.7), inset 0 0 3px rgba(0,0,0,0.4)',
        }} />
        {n > 1 && <span style={{ font: '700 12px Inter, sans-serif', opacity: 0.9 }}>×{n}</span>}
      </span>
    );
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: compact ? 5 : 8 }}>
      {chip('gold', g)}{chip('silver', s)}{chip('bronze', b)}
      {amount <= 0 && <span style={{ opacity: 0.5, font: '12px Inter, sans-serif' }}>—</span>}
    </span>
  );
}

function GameView({ scene, view, act, error }: {
  scene: SceneDef; view: BrassView; act: (a: BrassAction) => void; error: string | null;
}) {
  const [tableIsMain, setTableIsMain] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [flow, setFlow] = useState<Flow>({ step: 'idle' });
  const [sheetTab, setSheetTab] = useState<'actions' | 'cards'>('actions');
  const [notice, setNotice] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<{ cards: Card[]; seq: number } | null>(null);
  const noticeFor = (msg: string) => {
    playSfx('error');
    setNotice(msg);
    window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 4200);
  };
  const me = view.you ?? 0;
  const mine = view.players[me];
  const color = mine.color;
  const sheet = scene.cardSheet;
  const isMyTurn = view.currentColor === color && view.phase === 'playing';
  const hand = mine.hand ?? [];
  const n = hand.length;

  // reset the flow when the action resolves (hand changed) or the turn moves on
  useEffect(() => { setFlow({ step: 'idle' }); setFocus(null); }, [mine.handCount, color, view.currentColor, view.actionsLeft]);

  // some steps need a specific board on screen
  useEffect(() => {
    if (flow.step === 'pickTile') setTableIsMain(false);
    if (flow.step === 'pickSquare' || flow.step === 'pickLink' || flow.step === 'pickSell') setTableIsMain(true);
  }, [flow.step]);

  // when YOUR turn ends with a draw, lift the drawn cards off the deck and
  // show them front and center (dismiss to continue)
  useEffect(() => {
    const ev = view.lastEvent;
    if (ev?.drew && ev.color === color && mine.hand && ev.seq !== drawn?.seq) {
      setDrawn({ cards: mine.hand.slice(-ev.drew), seq: ev.seq });
      playSfx('cardDraw');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.lastEvent?.seq]);

  // the server rejected an action
  useEffect(() => { if (error) playSfx('error'); }, [error]);

  const board = view.board;

  // ---- legality (same shared helpers the server validates with) ----

  /** industries this card+mat can build somewhere, with an affordable plan */
  const buildableIndustries = (card: Card): { industry: string; tile: string; squares: string[]; quote: string }[] => {
    const out: { industry: string; tile: string; squares: string[]; quote: string }[] = [];
    for (const industry of cardIndustries(card)) {
      const tile = lowestTile(mine.tiles, industry, view.era);
      if (!tile) continue;
      const squares: string[] = [];
      let quote = '';
      for (const loc of buildLocations(board, color, card)) {
        for (const sq of freeSquares(board, color, loc, view.era)) {
          const plan = planBuild(board, view.markets, view.merchants, mine.tiles, view.era, industry, sq);
          if (!('error' in plan) && mine.money >= plan.total) {
            squares.push(sq);
            if (!quote) quote = `£${plan.total}`;
          }
        }
      }
      if (squares.length) out.push({ industry, tile, squares, quote });
    }
    return out;
  };

  const cardUsable = (card: Card, action: ActionId): boolean => {
    if (action === 'build') return buildableIndustries(card).length > 0;
    return true;
  };

  // ---- pick targets on the two boards ----

  const zoneOf = (kind: string, name: string) => scene.zones.find((z) => z.kind === kind && z.name === name);
  const matTilePos = (tileName: string) =>
    scene.objects.find((o) => o.group === `mat:${color}` && o.t === 'tile' && o.name === `${color} ${tileName}`);

  const tableTargets: PickTarget[] = useMemo(() => {
    const squareTarget = (sq: string): PickTarget[] => {
      const z = zoneOf('locationSquare', sq);
      return z ? [{
        id: sq, x: z.pos[0], z: -z.pos[2], r: 0.5,
        w: z.scale[0] * 1.04, d: z.scale[2] * 1.04, rotY: z.rot?.[1] ?? 0,
      }] : [];
    };
    if (flow.step === 'pickSquare') {
      const card = hand[flow.card];
      if (!card) return [];
      const opts = buildableIndustries(card).find((o) => o.industry === flow.industry);
      return (opts?.squares ?? []).flatMap(squareTarget);
    }
    if (flow.step === 'pickLink') {
      return buildableLinks(board, color, view.era).flatMap((link) => {
        const z = zoneOf('linkZone', link);
        return z ? [{
          id: link, x: z.pos[0], z: -z.pos[2], r: 0.5,
          w: (z.scale[0] ?? 1) * 0.85, d: (z.scale[2] ?? 1) * 0.85, rotY: z.rot?.[1] ?? 0,
        }] : [];
      });
    }
    if (flow.step === 'pickSell') {
      return sellableSquares(board, view.merchants, color).flatMap(squareTarget);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, board, color, view.era, view.merchants, view.markets, mine.tiles, mine.money, n]);

  const matTargets: PickTarget[] = useMemo(() => {
    if (flow.step !== 'pickTile') return [];
    if (flow.action === 'build') {
      const card = hand[flow.card];
      if (!card) return [];
      return buildableIndustries(card).flatMap(({ industry, tile }) => {
        const o = matTilePos(tile);
        return o ? [{ id: industry, x: o.place.pos[0], z: -o.place.pos[2], y: o.place.pos[1] + 0.28, r: 0.5, w: 1.0, d: 1.0 }] : [];
      });
    }
    return developableTiles(mine.tiles).flatMap((tile) => {
      const o = matTilePos(tile);
      return o ? [{ id: tile, x: o.place.pos[0], z: -o.place.pos[2], y: o.place.pos[1] + 0.28, r: 0.5, w: 1.0, d: 1.0 }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, mine.tiles, view.era, board, view.markets, mine.money, n]);

  const onTablePick = (id: string) => {
    if (flow.step === 'pickSquare') setFlow({ step: 'confirmBuild', card: flow.card, industry: flow.industry, square: id });
    if (flow.step === 'pickLink') act({ type: 'network', card: flow.card, link: id });
    if (flow.step === 'pickSell') act({ type: 'sell', card: flow.card, square: id });
  };
  const onMatPick = (id: string) => {
    if (flow.step !== 'pickTile') return;
    if (flow.action === 'build') setFlow({ step: 'pickSquare', card: flow.card, industry: id });
    else act({ type: 'develop', card: flow.card, tile: id });
  };

  // ---- flow transitions ----

  const armAction = (id: ActionId) => {
    if (!isMyTurn) return;
    // guard actions that can't possibly succeed right now, with plain answers
    if (id === 'sell' && sellableSquares(board, view.merchants, color).length === 0) {
      noticeFor('You have nothing to sell — you need an unflipped cotton mill, goods or pottery connected to a merchant that buys it.');
      return;
    }
    if (id === 'develop' && developableTiles(mine.tiles).length === 0) {
      noticeFor('Nothing on your board can be developed.');
      return;
    }
    if (id === 'network' && (mine.links <= 0 || buildableLinks(board, color, view.era).length === 0)) {
      noticeFor(mine.links <= 0 ? 'You have no link tiles left this era.' : 'No connection is available to you right now.');
      return;
    }
    if (id === 'scout') {
      if (hand.length < 3) { noticeFor('Scout needs 3 cards to discard.'); return; }
      if (hand.some((c) => c.kind === 'wild')) { noticeFor('You already hold a wild card — scout is not allowed.'); return; }
    }
    playSfx('click');
    setFlow((f) => ('action' in f && (f as { action?: string }).action === id ? { step: 'idle' } : { step: 'pickCard', action: id, picked: [] }));
  };

  const onPickerCard = (i: number) => {
    if (flow.step !== 'pickCard') return;
    if (flow.action === 'scout') {
      const picked = flow.picked.includes(i) ? flow.picked.filter((c) => c !== i) : [...flow.picked, i].slice(0, 3);
      setFlow({ ...flow, picked });
      return;
    }
    if (!cardUsable(hand[i], flow.action)) return;
    // single-card actions: toggle selection; confirm commits
    setFlow({ ...flow, picked: flow.picked[0] === i ? [] : [i] });
  };

  const confirmPicker = () => {
    if (flow.step !== 'pickCard') return;
    const a = flow.action;
    if (a === 'scout') { if (flow.picked.length === 3) act({ type: 'scout', cards: flow.picked }); return; }
    const card = flow.picked[0];
    if (card === undefined) return;
    if (a === 'build') setFlow({ step: 'pickTile', action: 'build', card });
    else if (a === 'develop') setFlow({ step: 'pickTile', action: 'develop', card });
    else if (a === 'network') setFlow({ step: 'pickLink', card });
    else if (a === 'sell') setFlow({ step: 'pickSell', card });
    else if (a === 'loan') act({ type: 'loan', card });
    else if (a === 'pass') act({ type: 'pass', card });
  };

  const totalActions = view.era === 'canal' && view.round === 1 ? 1 : 2;
  const actionNo = totalActions - view.actionsLeft + 1;

  const prompt = ((): string => {
    if (view.phase === 'ended') return `${view.players.find((p) => p.color === view.winner)?.name ?? ''} wins`;
    if (!isMyTurn) return `${view.currentColor} is acting`;
    switch (flow.step) {
      case 'idle': return `Your turn · action ${actionNo} of ${totalActions}`;
      case 'pickCard': return 'Choose the card to play';
      case 'pickTile': return flow.action === 'build' ? 'Tap the industry on your board to build' : 'Tap the tile on your board to develop';
      case 'pickSquare': return 'Tap a glowing spot on the map';
      case 'confirmBuild': return 'Confirm the build';
      case 'pickLink': return `Tap a connection · £${view.era === 'canal' ? 3 : '5 + coal'}`;
      case 'pickSell': return 'Tap one of your industries to sell';
    }
  })();

  const armedAction: string | null = 'action' in flow ? (flow as { action: string }).action
    : flow.step === 'pickLink' ? 'network'
    : flow.step === 'pickSell' ? 'sell'
    : flow.step === 'pickSquare' || flow.step === 'confirmBuild' ? 'build'
    : null;

  const pickerCopy: Record<ActionId, string> = {
    build: 'This card is played and discarded. Location cards build in their city; industry cards build inside your network.',
    network: 'This card is discarded, any card works. Then place a link.',
    develop: 'This card is discarded, any card works. Then remove a tile from your board (costs 1 iron).',
    sell: 'This card is discarded, any card works. Then flip a connected industry.',
    loan: 'This card is discarded. You take £30 and your income falls 3 levels.',
    scout: 'Scout discards 3 cards total: 2 of your choice plus 1 for the action itself. You take the Wild Location and Wild Industry cards.',
    pass: 'This card is discarded and your action ends.',
  };

  // ---- the two persistent scenes (never unmounted -> seamless swap) ----

  const mainStyle = (active: boolean): React.CSSProperties => active
    ? { position: 'absolute', top: 0, left: 0, bottom: 0, right: RIGHT_W, zIndex: 10 }
    : { position: 'absolute', top: 0, right: 0, width: RIGHT_W, height: '62vh', zIndex: 20 };

  const tableScene = (
    <TableScene
      scene={scene} filter={(g) => g === 'board'} frame="board" game={gameSceneState(view)}
      interactive={tableIsMain}
      pickTargets={tableIsMain ? tableTargets : undefined}
      onPick={onTablePick}
    />
  );
  const matScene = (
    <TableScene
      scene={scene} filter={(g) => g === `mat:${color}`} showBoard={false} frame="fit"
      interactive={!tableIsMain}
      pickTargets={!tableIsMain ? matTargets : undefined}
      onPick={onMatPick}
    />
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#08090c', color: '#e8ebf0', font: '14px Inter, sans-serif' }}>
      <style>{HAND_CSS}</style>

      {/* both boards stay mounted; styles swap them between main and mini */}
      <div style={mainStyle(tableIsMain)} onClick={tableIsMain ? undefined : () => setTableIsMain(true)}
        title={tableIsMain ? undefined : 'Show the table'}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: tableIsMain ? 'auto' : 'none' }}>{tableScene}</div>
      </div>
      <div style={mainStyle(!tableIsMain)} onClick={!tableIsMain ? undefined : () => setTableIsMain(false)}
        title={!tableIsMain ? undefined : 'Show my board'}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: !tableIsMain ? 'auto' : 'none' }}>{matScene}</div>
      </div>

      {/* clear whose-turn indicator — pops on every turnover */}
      {view.phase === 'playing' && (
        <div
          className={`ig-turn ig-glass${isMyTurn ? ' mine' : ''}`}
          key={view.currentColor}
          style={seatStyle(view.currentColor, { zIndex: 40 })}
        >
          <span className="ig-prompt-ring" />
          {isMyTurn
            ? <span><b>Your turn</b></span>
            : <span><b>{view.players.find((p) => p.color === view.currentColor)?.name}</b> is playing</span>}
        </div>
      )}

      {/* right column, bottom: actions */}
      <div style={{
        position: 'absolute', right: 0, top: '62vh', bottom: 0, width: RIGHT_W,
        display: 'flex', flexDirection: 'column', padding: '10px 22px 16px', zIndex: 25,
      }}>
        <div className="ig-prompt ig-glass" style={seatStyle(view.currentColor, { marginBottom: 10, opacity: isMyTurn ? 1 : 0.6 })}>
          <span className="ig-prompt-ring" />
          <span className="who" style={{ letterSpacing: '.04em' }}>{prompt}</span>
          {flow.step !== 'idle' && (
            <button
              className="step"
              onClick={() => setFlow({ step: 'idle' })}
              style={{
                border: '1px solid var(--brd-2)', background: 'transparent', color: 'var(--ink)',
                borderRadius: 8, padding: '3px 11px', cursor: 'pointer', font: '600 11px Inter, sans-serif',
              }}
            >Cancel</button>
          )}
        </div>

        <div className="ig-acts" style={{ alignContent: 'start' }}>
          {ACTIONS.map((a) => (
            <button
              key={a.id}
              className={`ig-act${a.id === 'build' ? ' primary' : ''}${armedAction === a.id ? ' on' : ''}`}
              disabled={!isMyTurn}
              onClick={() => armAction(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', textAlign: 'center',
          color: 'var(--ink-3)', font: '12px/1.5 Inter, sans-serif', padding: '9px 6px 0',
        }}>
          {armedAction ? ACTIONS.find((a) => a.id === armedAction)?.hint : ''}
        </div>

        {/* your portrait with this round's spending on it */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, justifyContent: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '600 11px Inter, sans-serif', letterSpacing: 1, textTransform: 'uppercase', opacity: 0.6 }}>
              Spent this round
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <CoinRow amount={mine.spent} coins={scene.coins} compact />
            </div>
          </div>
          {scene.turnTokens[color] && (
            <img
              src={scene.turnTokens[color].image}
              alt={color}
              style={{
                width: 62, height: 62, borderRadius: '50%', objectFit: 'cover',
                boxShadow: `0 0 0 3px ${SEAT_HEX[color]}, 0 6px 18px rgba(0,0,0,0.6)`,
              }}
            />
          )}
        </div>
      </div>

      {/* top-left: reference sheet */}
      {scene.cheatSheet && (
        <button
          onClick={() => setFocus(-1)}
          title="Reference: costs, counts and card distribution"
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 30,
            width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(10,12,15,0.85)', color: '#e8ebf0', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 17px/1 Inter, sans-serif',
          }}
        >?</button>
      )}

      {/* holdings: labelled tabular stats */}
      <div className="ig-glass" style={{
        position: 'absolute', top: 60, left: 12, zIndex: 30, width: 258,
        padding: '12px 14px', borderRadius: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingBottom: 11 }}>
          <span className="ig-prompt-ring" style={seatStyle(color)} />
          <b style={{ fontSize: 15 }}>{mine.name}</b>
        </div>
        <div className="ig-hold">
          <div><div className="ig-lab">Cash</div><div className="ig-stat-v ig-num">£{mine.money}</div></div>
          <div><div className="ig-lab">Income</div><div className={`ig-stat-v ig-num ${mine.income < 0 ? 'ig-down' : 'ig-up'}`}>£{mine.income}</div></div>
          <div><div className="ig-lab">VP</div><div className="ig-stat-v ig-num">{mine.vp}</div></div>
          <div><div className="ig-lab">Links</div><div className="ig-stat-v ig-num">{mine.links}</div></div>
        </div>
        {mine.discardTop && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ ...cardBg(sheet, mine.discardTop.cell), width: 34, height: 48, borderRadius: 4, border: '1px solid rgba(255,255,255,0.18)', flex: '0 0 auto' }} />
            <div>
              <div className="ig-lab">Discard pile</div>
              <div style={{ font: '600 12px Inter, sans-serif', opacity: 0.85 }}>{mine.discardTop.name}{mine.discardCount > 1 ? ` · ${mine.discardCount} cards` : ''}</div>
            </div>
          </div>
        )}
      </div>

      {/* the hand, splayed and centered within the main view */}
      <div className="hand-fan" style={{ zIndex: 30, left: `calc((100vw - ${RIGHT_W}) / 2)` }}>
        {hand.map((c, i) => {
          const off = i - (n - 1) / 2;
          const tx = off * 64;
          const ty = Math.abs(off) * Math.abs(off) * 4.2;
          const rot = off * 6.5;
          return (
            <div
              key={`${i}-${c.cell}-${c.name}`}
              className="hand-card"
              onClick={() => setFocus(i)}
              title={c.name}
              style={{
                ...cardBg(sheet, c.cell),
                ['--tx' as string]: `${tx}px`,
                ['--ty' as string]: `${ty}px`,
                transform: `translateX(${tx}px) translateY(${ty}px) rotate(${rot}deg)`,
                zIndex: 10 + i,
                animationDelay: `${i * 0.04}s`,
              }}
            />
          );
        })}
      </div>
      {!mine.hand && (
        <div style={{ position: 'absolute', left: '50%', bottom: 40, transform: 'translateX(-50%)', opacity: 0.6, zIndex: 30 }}>
          Hand hidden
        </div>
      )}

      {/* foreground card picker */}
      {flow.step === 'pickCard' && (
        <div className="picker-backdrop" onClick={() => setFlow({ step: 'idle' })}>
          <div style={{ textAlign: 'center', maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: '700 21px Inter, sans-serif', marginBottom: 6 }}>
              {ACTIONS.find((a) => a.id === flow.action)?.label}
              {flow.action === 'scout' && ` — ${flow.picked.length}/3 selected`}
            </div>
            <div style={{ font: '13.5px/1.55 Inter, sans-serif', opacity: 0.78 }}>{pickerCopy[flow.action]}</div>
          </div>
          <div className="picker-cards" onClick={(e) => e.stopPropagation()}>
            {hand.map((c, i) => {
              const dim = flow.action !== 'scout' && !cardUsable(c, flow.action);
              const sel = flow.picked.includes(i);
              return (
                <div key={`${i}-${c.cell}`} style={{ textAlign: 'center' }}>
                  <div
                    className={`picker-card${sel ? ' sel' : ''}${dim ? ' dim' : ''}`}
                    style={cardBg(sheet, c.cell)}
                    onClick={() => !dim && onPickerCard(i)}
                    title={c.name}
                  />
                  <div style={{ font: '12px Inter, sans-serif', opacity: 0.75, paddingTop: 6, maxWidth: 150 }}>{c.name}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={confirmPicker}
              disabled={flow.action === 'scout' ? flow.picked.length !== 3 : flow.picked.length !== 1}
              style={{
                padding: '12px 30px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#e8ebf0', color: '#0a0c0f', font: '700 15px Inter, sans-serif',
                opacity: (flow.action === 'scout' ? flow.picked.length === 3 : flow.picked.length === 1) ? 1 : 0.35,
              }}
            >
              {flow.action === 'loan' ? 'Discard & take the loan'
                : flow.action === 'pass' ? 'Discard & pass'
                : flow.action === 'scout' ? 'Discard 3 & take the wilds'
                : flow.action === 'build' ? 'Play this card'
                : 'Discard & continue'}
            </button>
            <button
              onClick={() => setFlow({ step: 'idle' })}
              style={{
                padding: '12px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)',
                background: 'transparent', color: '#e8ebf0', cursor: 'pointer', font: '600 14px Inter, sans-serif',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* build confirmation: exactly what you're spending, before you commit */}
      {flow.step === 'confirmBuild' && (() => {
        const plan = planBuild(board, view.markets, view.merchants, mine.tiles, view.era, flow.industry, flow.square);
        if ('error' in plan) {
          return (
            <div className="picker-backdrop" onClick={() => setFlow({ step: 'idle' })}>
              <div style={{ font: '600 16px Inter, sans-serif' }}>{plan.error}</div>
            </div>
          );
        }
        const art = scene.objects.find((o) => o.group === `mat:${color}` && o.t === 'tile' && o.name === `${color} ${plan.tile}`);
        const location = flow.square.replace(/ \(.+\)$/, '');
        const row = (label: string, value: string, dim?: boolean) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', gap: 26, padding: '5px 0',
            font: '14px Inter, sans-serif', opacity: dim ? 0.65 : 1,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span>{label}</span><b>{value}</b>
          </div>
        );
        return (
          <div className="picker-backdrop" onClick={() => setFlow({ step: 'pickSquare', card: flow.card, industry: flow.industry })}>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 400, padding: '22px 26px', borderRadius: 16, background: 'rgba(12,14,18,0.97)',
                border: '1px solid rgba(255,255,255,0.16)', boxShadow: '0 24px 70px rgba(0,0,0,0.8)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 14 }}>
                {art && 'image' in art && (
                  <div style={{
                    width: 62, height: 62, borderRadius: 8, flex: '0 0 auto',
                    backgroundImage: `url(${(art as { image: string }).image})`, backgroundSize: 'cover', backgroundPosition: 'center',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }} />
                )}
                <div>
                  <div style={{ font: '700 18px Inter, sans-serif' }}>{plan.tile}</div>
                  <div style={{ font: '13px Inter, sans-serif', opacity: 0.7 }}>{location} · {flow.square.match(/\((.+)\)$/)?.[1] ?? ''}</div>
                </div>
              </div>

              {row('Tile cost', `£${plan.money}`)}
              {plan.coalFromMines.length > 0 && row(
                `Coal × ${plan.coalFromMines.length} — from connected mine${new Set(plan.coalFromMines.map((sq) => sq)).size > 1 ? 's' : ''}`,
                'free', true,
              )}
              {plan.coalFromMarket > 0 && row(`Coal × ${plan.coalFromMarket} — from the market`, `£${plan.coalMarketCost}`)}
              {plan.ironFromWorks.length > 0 && row(`Iron × ${plan.ironFromWorks.length} — from iron works`, 'free', true)}
              {plan.ironFromMarket > 0 && row(`Iron × ${plan.ironFromMarket} — from the market`, `£${plan.ironMarketCost}`)}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', font: '800 17px Inter, sans-serif' }}>
                <span>Total</span>
                <span>£{plan.total}<span style={{ font: '400 12.5px Inter, sans-serif', opacity: 0.6 }}> — you have £{mine.money}</span></span>
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 16 }}>
                <button
                  onClick={() => act({ type: 'build', card: flow.card, industry: flow.industry, square: flow.square })}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: '#e8ebf0', color: '#0a0c0f', font: '700 15px Inter, sans-serif',
                  }}
                >Build — £{plan.total}</button>
                <button
                  onClick={() => setFlow({ step: 'pickSquare', card: flow.card, industry: flow.industry })}
                  style={{
                    padding: '12px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)',
                    background: 'transparent', color: '#e8ebf0', cursor: 'pointer', font: '600 14px Inter, sans-serif',
                  }}
                >Back</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* you drew — the cards lift off the deck into the foreground */}
      {drawn && (
        <div className="card-focus-backdrop" onClick={() => setDrawn(null)}>
          <div style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ font: '700 21px Inter, sans-serif', marginBottom: 4 }}>
              You drew {drawn.cards.length} card{drawn.cards.length === 1 ? '' : 's'}
            </div>
            <div style={{ font: '13px Inter, sans-serif', opacity: 0.7, marginBottom: 18 }}>Back up to a hand of 8</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              {drawn.cards.map((c, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div
                    className="flip-card"
                    style={{ ...cardBg(sheet, c.cell), width: 190, height: 266, animationDelay: `${i * 0.14}s` }}
                  />
                  <div style={{ font: '600 13px Inter, sans-serif', opacity: 0.8, paddingTop: 8 }}>{c.name}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setDrawn(null)}
              style={{
                marginTop: 22, padding: '11px 30px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#e8ebf0', color: '#0a0c0f', font: '700 14px Inter, sans-serif',
              }}
            >Continue</button>
          </div>
        </div>
      )}

      {/* error / notice toast */}
      {(error || notice) && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 210, transform: 'translateX(-50%)', zIndex: 80,
          maxWidth: 520, textAlign: 'center',
          padding: '10px 18px', borderRadius: 10,
          background: error ? 'rgba(120,28,28,0.92)' : 'rgba(24,30,40,0.95)',
          border: error ? 'none' : '1px solid rgba(255,255,255,0.18)',
          font: '600 13px/1.5 Inter, sans-serif', boxShadow: '0 8px 26px rgba(0,0,0,0.6)',
        }}>
          {error ?? notice}
        </div>
      )}

      {/* focused card (focus === -1 shows the reference sheets) */}
      {focus !== null && (focus === -1 ? (scene.actionsSheet ?? scene.cheatSheet) : hand[focus]) && (
        <div className="card-focus-backdrop" onClick={() => setFocus(null)}>
          <div className="card-focus" onClick={(e) => e.stopPropagation()}>
            {focus === -1 ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', gap: 6, padding: 5, borderRadius: 10, background: 'rgba(20,24,30,0.95)', marginBottom: 10 }}>
                  {([['actions', 'How the actions work'], ['cards', 'Card distribution']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setSheetTab(id)}
                      style={{
                        padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
                        background: sheetTab === id ? '#e8ebf0' : 'transparent',
                        color: sheetTab === id ? '#0a0c0f' : '#e8ebf0', font: '600 13px Inter, sans-serif',
                      }}
                    >{label}</button>
                  ))}
                </div>
                <img
                  src={sheetTab === 'actions' ? (scene.actionsSheet?.image ?? scene.cheatSheet!.image) : scene.cheatSheet!.image}
                  alt="Reference sheet"
                  style={{ display: 'block', height: '84vh', width: 'auto', borderRadius: 12, boxShadow: '0 18px 60px rgba(0,0,0,0.85)', margin: '0 auto' }}
                />
              </div>
            ) : (
              <>
                <div style={{
                  ...cardBg(sheet, hand[focus].cell),
                  width: 336, height: 470, borderRadius: 16,
                  boxShadow: '0 18px 60px rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.2)',
                }} />
                <div style={{ textAlign: 'center', marginTop: 12, font: '600 16px Inter, sans-serif' }}>
                  {hand[focus].name}
                </div>
              </>
            )}
            <button className="card-focus-x" onClick={() => setFocus(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayPage() {
  const { roomId = '' } = useParams();
  const name = sessionStorage.getItem('bge-join-name') ?? '';
  const { room, view, playerIndex, error, start, act } = useRoom(roomId, 'play', name);
  const scene = useBrassScene();
  const me = playerIndex;

  if (!room) return <div className="page center"><h2>Connecting</h2></div>;

  if (room.started) {
    if (!view || !scene) return <div className="page center"><h2>Dealing…</h2></div>;
    return <GameView scene={scene} view={view} act={act} error={error} />;
  }

  const myColor = me !== null ? room.players[me]?.color : undefined;
  const takenBy = (c: Color) => room.players.findIndex((p) => p.color === c);

  return (
    <div className="page phone-lobby">
      <div className="pl-head">
        <span className="eyebrow">Room {room.roomId}</span>
        <h1>{me === 0 ? "You're the host" : "You're in"}</h1>
      </div>

      <div className="card">
        <div className="pl-players-label">Pick your color</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', padding: '6px 0 2px' }}>
          {ALL_COLORS.map((c) => {
            const owner = takenBy(c);
            const isMine = c === myColor;
            const taken = owner >= 0 && !isMine;
            const tok = scene?.turnTokens?.[c];
            return (
              <button
                key={c}
                disabled={taken}
                onClick={() => socket.send({ type: 'pick_color', color: c })}
                title={taken ? `${room.players[owner].name} has ${c}` : c}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: 8, borderRadius: 12, cursor: taken ? 'default' : 'pointer',
                  border: isMine ? `3px solid ${SEAT_HEX[c]}` : '3px solid transparent',
                  background: 'rgba(255,255,255,0.05)', opacity: taken ? 0.35 : 1,
                }}
              >
                {tok ? (
                  <img
                    src={tok.image}
                    alt={c}
                    style={{
                      width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                      boxShadow: `0 0 0 3px ${SEAT_HEX[c]}`,
                    }}
                  />
                ) : (
                  <span style={{ width: 56, height: 56, borderRadius: '50%', background: SEAT_HEX[c] }} />
                )}
                <span style={{ font: '600 12px Inter, sans-serif', color: '#e8ebf0' }}>{c}</span>
              </button>
            );
          })}
        </div>
        <p className="dim" style={{ textAlign: 'center' }}>
          Your piece goes on the board's turn-order track and marks your income.
        </p>
      </div>

      <div className="card">
        <div className="pl-players-label">Players</div>
        <ul className="player-list">
          {room.players.map((p, i) => (
            <li key={i}>
              <span className="swatch" style={{ background: SEAT_HEX[p.color] }} />
              {p.name}{i === 0 && <span className="tag">host</span>}{p.isBot && <span className="tag">bot</span>}
            </li>
          ))}
        </ul>
      </div>

      {me === 0 ? (
        <button className="big primary" onClick={start}>Start Brass: Birmingham</button>
      ) : (
        <p className="dim">Waiting for the host to start.</p>
      )}
      {error && <div className="toast">{error}</div>}
    </div>
  );
}
