// The TV. Before the game: room join info with the spinning-pieces backdrop.
// After start: ONLY the main board. Every action flies the camera to where it
// happened and narrates it in a caption, then eases back out.

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom } from '../net';
import { SidePieces } from '../three/FallingPieces';
import { TableScene, useBrassScene, SEAT_HEX, type FocusReq, type SceneDef } from '../brass/TableScene';
import { gameSceneState } from '../brass/gameSceneState';
import { LOCATION_OF, type BrassView, type BrassEvent } from '@bge/shared';
import { playSfx, sfxForKind, sfxEnabled, setSfxEnabled } from '../sfx';
const TtrBoard = lazy(() => import('../ttr/TtrBoard').then((module) => ({ default: module.TtrBoard })));
const TrekBoard = lazy(() => import('../trek/TrekBoard').then((module) => ({ default: module.TrekBoard })));
const DtBoard = lazy(() => import('../darktower/DtBoard').then((module) => ({ default: module.DtBoard })));
const DuneBoard = lazy(() => import('../dune/DuneBoard').then((module) => ({ default: module.DuneBoard })));
const AxisBoard = lazy(() => import('../axis/AxisBoard'));
const PolitikBoard = lazy(() => import('../politik/PolitikBoard').then((module) => ({ default: module.PolitikBoard })));
const DsBoard = lazy(() => import('../darksouls/DsBoard').then((module) => ({ default: module.DsBoard })));
const FeastBoard = lazy(() => import('../feast/FeastBoard').then((module) => ({ default: module.FeastBoard })));
const BbBoard = lazy(() => import('../bloodborne/BbBoard').then((module) => ({ default: module.BbBoard })));
const SetiBoard = lazy(() => import('../seti/SetiBoard').then((module) => ({ default: module.SetiBoard })));

function BoardGameLoading({ game }: { game: string }) {
  return <div className="route-loading" role="status" aria-live="polite"><span />Preparing {game} table…</div>;
}

/** World-space (three) focus point for an event, from the extracted zones. */
export function eventFocus(scene: SceneDef, ev: BrassEvent): FocusReq | undefined {
  const z = ev.square
    ? scene.zones.find((zz) => zz.kind === 'locationSquare' && zz.name === ev.square)
    : ev.link
      ? scene.zones.find((zz) => zz.kind === 'linkZone' && zz.name === ev.link)
      : undefined;
  if (!z) return undefined;
  return { x: z.pos[0], z: -z.pos[2], seq: ev.seq };
}

const seatVar = (color: string) => ({ '--seat': SEAT_HEX[color] } as CSSProperties);

function TvBoard({ view }: { view: BrassView }) {
  const scene = useBrassScene();
  const [caption, setCaption] = useState<BrassEvent | null>(null);
  const [statsSeat, setStatsSeat] = useState<number | null>(null);
  const queue = useRef<BrassEvent[]>([]);
  const lastSeq = useRef(0);
  const presenting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Present one event at a time, each for a readable beat. New events wait in
  // the queue instead of cutting the current caption off, so however fast
  // players act, the table still sees every turn explained in order.
  const advance = useCallback(() => {
    const next = queue.current.shift();
    if (!next) { presenting.current = false; setCaption(null); return; }
    presenting.current = true;
    setCaption(next);
    playSfx(sfxForKind(next.kind)); // the TV is the table: it voices each action
    // Match the camera fly-to round trip (~4.8s); the draw needs a touch more.
    const dwell = 4800 + (next.drew ? 1500 : 0);
    timer.current = setTimeout(advance, dwell);
  }, []);

  useEffect(() => {
    const ev = view.lastEvent;
    if (!ev || ev.seq <= lastSeq.current) return;
    lastSeq.current = ev.seq;
    queue.current.push(ev);
    if (!presenting.current) advance();
  }, [view.lastEvent?.seq, advance]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // turn chime on each turnover, win sting once at the end
  const prevColor = useRef(view.currentColor);
  useEffect(() => {
    if (view.phase === 'playing' && prevColor.current !== view.currentColor) {
      prevColor.current = view.currentColor;
      playSfx('turn');
    }
  }, [view.currentColor, view.phase]);
  const ended = useRef(false);
  useEffect(() => {
    if (view.phase === 'ended' && !ended.current) { ended.current = true; playSfx('win'); }
  }, [view.phase]);

  const [muted, setMuted] = useState(!sfxEnabled());
  const toggleMute = () => { const next = !muted; setMuted(next); setSfxEnabled(!next); };

  const focus = useMemo(
    () => (scene && caption ? eventFocus(scene, caption) : undefined),
    [scene, caption],
  );

  if (!scene) return <div className="page center"><h2>Loading board</h2></div>;

  const income = caption?.incomeDelta;
  const winner = view.players.find((p) => p.color === view.winner);

  return (
    <div className="ig">
      <TableScene scene={scene} filter={(g) => g === 'board'} frame="board" game={gameSceneState(view)} focus={focus} />

      {/* era / round plate */}
      <div className="ig-era ig-glass">
        {view.phase === 'ended' ? (
          <>
            <div className="ig-lab">Game over</div>
            <div className="ig-era-v"><b>{winner?.name ?? view.winner}</b> wins</div>
          </>
        ) : (
          <>
            <div className="ig-lab">{view.era === 'canal' ? 'Canal Era' : 'Rail Era'}</div>
            <div className="ig-era-v">Round {view.round} / {view.numRounds}</div>
            <div className="ig-era-rule" />
          </>
        )}
      </div>

      {/* whose-turn — always shown, pops on every turnover */}
      {view.phase === 'playing' && (
        <div className="ig-turn ig-glass" key={view.currentColor} style={seatVar(view.currentColor)}>
          <span className="ig-prompt-ring" />
          <span><b>{view.players.find((p) => p.color === view.currentColor)?.name}</b> to act</span>
        </div>
      )}

      {/* score chips — name + VP (the winning metric) then cash; tap for full stats */}
      <div className="ig-scores">
        {view.players.map((p) => (
          <button
            key={p.seat}
            className={`ig-chip${view.currentColor === p.color ? ' on' : ''}`}
            style={seatVar(p.color)}
            onClick={() => setStatsSeat(p.seat)}
          >
            <span className="nm">{p.name}</span>
            <span className="vp" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.vp} VP</span>
            <span className="mn">£{p.money}</span>
          </button>
        ))}
      </div>

      {/* turn narration — a card: who, where, what (tile name or action), cost + income */}
      {caption ? (
        <div className="ig-banner ig-glass" key={caption.seq} style={seatVar(caption.color)}>
          <div className="ig-banner-head">
            {scene.turnTokens[caption.color] && (
              <img className="ig-por" src={scene.turnTokens[caption.color].image} alt={caption.player} />
            )}
            <div>
              <div className="ig-who">{caption.player}</div>
              {caption.location && <div className="ig-loc">{caption.location}</div>}
            </div>
          </div>
          <div className="ig-subject">{caption.tile ?? caption.title}</div>
          {(caption.cost || (income !== undefined && income !== 0)) && (
            <div className="ig-banner-foot">
              <div>
                <div className="ig-lab">Cost</div>
                <div className="ig-stat-v">{caption.cost ?? '—'}</div>
              </div>
              {income !== undefined && income !== 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div className="ig-lab">Income</div>
                  <div className={`ig-stat-v ${income > 0 ? 'ig-up' : 'ig-down'}`}>{income > 0 ? `+${income}` : income}</div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* sound toggle */}
      <button
        className="ig-glass"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        style={{
          position: 'absolute', left: '1rem', bottom: '1rem', zIndex: 6, width: 40, height: 40,
          borderRadius: 999, color: 'var(--ink)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H2v6h4l5 4z" />
          {muted
            ? <><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>
            : <><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M18.5 5.5a9 9 0 0 1 0 13" /></>}
        </svg>
      </button>

      {/* player stats — VP, income, buildings and the rest */}
      {statsSeat !== null && view.players[statsSeat] && (() => {
        const p = view.players[statsSeat];
        const builds = Object.entries(view.board.industries).filter(([, b]) => b.color === p.color);
        return (
          <div className="ig-modal" onClick={() => setStatsSeat(null)}>
            <div className="ig-modal-card ig-glass" style={seatVar(p.color)} onClick={(e) => e.stopPropagation()}>
              <div className="ig-modal-head">
                <span className="ig-prompt-ring" />
                <b>{p.name}</b>
                <button className="ig-modal-x" onClick={() => setStatsSeat(null)}>✕</button>
              </div>
              <div className="ig-hold" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div><div className="ig-lab">VP</div><div className="ig-stat-v ig-num">{p.vp}</div></div>
                <div><div className="ig-lab">Income</div><div className={`ig-stat-v ig-num ${p.income < 0 ? 'ig-down' : 'ig-up'}`}>£{p.income}</div></div>
                <div><div className="ig-lab">Cash</div><div className="ig-stat-v ig-num">£{p.money}</div></div>
                <div><div className="ig-lab">Links</div><div className="ig-stat-v ig-num">{p.links}</div></div>
                <div><div className="ig-lab">Beer</div><div className="ig-stat-v ig-num">{p.beer}</div></div>
                <div><div className="ig-lab">Cards</div><div className="ig-stat-v ig-num">{p.handCount}</div></div>
              </div>
              <div className="ig-build-head">
                <span className="ig-lab">Buildings</span>
                <span className="ig-lab">{builds.length}</span>
              </div>
              {builds.length === 0 ? (
                <div style={{ color: 'var(--ink-3)', fontSize: '.85rem' }}>None built yet</div>
              ) : builds.map(([sq, b]) => (
                <div key={sq} className={`ig-build-row${b.flipped ? ' flipped' : ''}`}>
                  <span>{b.tile}</span>
                  <span className="loc">{LOCATION_OF[sq] ?? sq}{b.flipped ? ' · sold' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export function BoardPage() {
  const { roomId = '' } = useParams();
  const { room, view, signalBattleVisualReady } = useRoom(roomId, 'watch');

  if (!room) return <div className="page center"><h2>Connecting</h2></div>;

  if (room.started && view) {
    if (view.game === 'ttr') return (
      <Suspense fallback={<BoardGameLoading game="Ticket to Ride" />}>
        <TtrBoard view={view} />
      </Suspense>
    );
    if (view.game === 'trek') return (
      <Suspense fallback={<BoardGameLoading game="Trekking the National Parks" />}>
        <TrekBoard view={view} />
      </Suspense>
    );
    if (view.game === 'darktower') return (
      <Suspense fallback={<BoardGameLoading game="Return to Dark Tower" />}>
        <DtBoard view={view} />
      </Suspense>
    );
    if (view.game === 'dune') return (
      <Suspense fallback={<BoardGameLoading game="Dune: Imperium" />}>
        <DuneBoard view={view} />
      </Suspense>
    );
    if (view.game === 'axis') return (
      <Suspense fallback={<BoardGameLoading game="Axis & Allies" />}>
        <AxisBoard view={view} onBattleVisualReady={signalBattleVisualReady} />
      </Suspense>
    );
    if (view.game === 'politik') return (
      <Suspense fallback={<BoardGameLoading game="Politik" />}>
        <PolitikBoard view={view} />
      </Suspense>
    );
    if (view.game === 'darksouls') return (
      <Suspense fallback={<BoardGameLoading game="Dark Souls" />}>
        <DsBoard view={view} />
      </Suspense>
    );
    if (view.game === 'feast') return (
      <Suspense fallback={<BoardGameLoading game="A Feast for Odin" />}>
        <FeastBoard view={view} />
      </Suspense>
    );
    if (view.game === 'bloodborne') return (
      <Suspense fallback={<BoardGameLoading game="Bloodborne" />}>
        <BbBoard view={view} />
      </Suspense>
    );
    if (view.game === 'seti') return (
      <Suspense fallback={<BoardGameLoading game="SETI" />}>
        <SetiBoard view={view} />
      </Suspense>
    );
    return <TvBoard view={view} />;
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
                background: SEAT_HEX[p.color], marginRight: 7, verticalAlign: 'baseline',
              }} />
              {p.name}{i === 0 && ' (host)'}{p.isBot && ' (bot)'}
            </span>
          ))}
        </div>
        <p className="dim">The host starts the game from their device.</p>
      </div>
    </div>
  );
}
