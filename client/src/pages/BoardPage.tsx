// The TV. Before the game: room join info with the spinning-pieces backdrop.
// After start: the game's own big-screen view (Brass: brass/TvBoard).

import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom } from '../net';
import { SidePieces } from '../three/FallingPieces';
import { seatHexFor } from '../brass/pieces';

const AxisBoard = lazy(() => import('../axis/AxisBoard'));
const ShBoard = lazy(() => import('../sh/ShBoard').then((module) => ({ default: module.ShBoard })));
const TvBoard = lazy(() => import('../brass/TvBoard').then((module) => ({ default: module.TvBoard })));

function BoardGameLoading({ game }: { game: string }) {
  return <div className="route-loading" role="status" aria-live="polite"><span />Preparing {game} table…</div>;
}

export function BoardPage() {
  const { roomId = '' } = useParams();
  const { room, view } = useRoom(roomId, 'watch');

  if (!room) return <div className="page center"><h2>Connecting</h2></div>;

  if (room.started && view) {
    if (view.game === 'secrethitler') {
      if (view.role !== 'screen') return null;
      return (
        <Suspense fallback={<BoardGameLoading game="Secret Hitler" />}>
          <ShBoard wire={view} room={room} />
        </Suspense>
      );
    }
    if (view.game === 'axis') {
      return (
        <Suspense fallback={<BoardGameLoading game="Axis & Allies" />}>
          <AxisBoard view={view} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<BoardGameLoading game="Brass: Birmingham" />}>
        <TvBoard view={view} />
      </Suspense>
    );
  }

  // ---------- pre-game: join info + spinning pieces ----------
  return (
    <div className="tv-join">
      <div className="join-bg"><SidePieces /></div>
      <div className="tv-join-card">
        <span className="eyebrow">
          {new Date(room.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          {' · Room '}{room.roomId}
        </span>
        <h1>{room.name}</h1>
        <div className="qr-card"><QRCodeSVG value={room.joinUrl} size={260} marginSize={2} /></div>
        <div className="join-url">{room.joinUrl.replace(/^https?:\/\//, '')}</div>
        <div className="tv-intro-players">
          {room.players.length === 0 && <span className="dim">Scan to join</span>}
          {room.players.map((p, i) => (
            <span key={i} className="tv-player-chip">
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: seatHexFor(room.game, p.color), marginRight: 7, verticalAlign: 'baseline',
              }} />
              {p.name}{i === 0 && ' (host)'}{p.isBot && ' (bot)'}
            </span>
          ))}
        </div>
        {room.game === 'secrethitler' && <p className="dim">Five to ten play. Claude takes any empty chair up to five.</p>}
        <p className="dim">The host starts the game from their device.</p>
      </div>
    </div>
  );
}
