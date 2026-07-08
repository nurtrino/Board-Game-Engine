// New-game flow on the TV: pick a game, then continue a saved game or start a
// new save (named, dated). Saves are rooms — resuming one reopens its lobby /
// board and every device reconnects into its seat.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../net';
import { FallingPieces } from '../three/FallingPieces';
import { SEAT_HEX } from '../brass/TableScene';
import type { SaveInfo } from '@bge/shared';

const GAMES = [
  {
    id: 'brass',
    name: 'Brass: Birmingham',
    logo: '/brass-logo.webp',
  },
];

const dateOf = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function statusLine(s: SaveInfo): string {
  if (s.status === 'ended') return 'Finished';
  if (s.status === 'lobby') return 'In lobby';
  return `${s.era === 'rail' ? 'Rail' : 'Canal'} era, round ${s.round}/${s.numRounds}`;
}

export function SelectGame() {
  const nav = useNavigate();
  const [game, setGame] = useState<typeof GAMES[number] | null>(null);
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    return socket.on((msg) => {
      if (msg.type === 'room_created') nav(`/board/${msg.roomId}`);
    });
  }, [nav]);

  useEffect(() => {
    if (!game) return;
    setName(`${game.name.split(':')[0]} — ${dateOf(Date.now())}`);
    fetch('/api/saves')
      .then((r) => r.json())
      .then((list: SaveInfo[]) => setSaves(list.filter((s) => s.game === game.id)))
      .catch(() => setSaves([]));
  }, [game]);

  return (
    <>
      <div className="home-bg"><FallingPieces /></div>
      <div className="page select-game">
        <div className="brand">
          <span className="eyebrow">{game ? game.name : 'New game'}</span>
          <h1>{game ? 'Select Save' : 'Select Game'}</h1>
          <div className="rule" />
        </div>

        {!game && (
          <div className="game-grid">
            {GAMES.map((g) => (
              <button key={g.id} className="game-tile" onClick={() => setGame(g)}>
                <img src={g.logo} alt={g.name} />
              </button>
            ))}
          </div>
        )}

        {game && (
          <div className="save-panel">
            <div className="save-new">
              <input
                className="save-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') socket.send({ type: 'create_room', name: name.trim(), game: game.id }); }}
              />
              <button
                className="primary"
                onClick={() => socket.send({ type: 'create_room', name: name.trim(), game: game.id })}
              >New save</button>
            </div>

            {saves === null && <p className="dim">Loading saves</p>}
            {saves && saves.length === 0 && <p className="dim">No saved games yet</p>}
            {saves && saves.length > 0 && (
              <div className="save-list">
                {saves.map((s) => (
                  <button key={s.roomId} className="save-row" onClick={() => nav(`/board/${s.roomId}`)}>
                    <span className="save-row-main">
                      <b>{s.name}</b>
                      <span className="dim">{statusLine(s)}</span>
                    </span>
                    <span className="save-row-side">
                      <span className="save-seats">
                        {s.players.map((p, i) => (
                          <span key={i} className="save-seat" style={{ background: SEAT_HEX[p.color] }} title={p.name} />
                        ))}
                      </span>
                      <span className="dim">{dateOf(s.createdAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button className="save-back" onClick={() => { setGame(null); setSaves(null); }}>Back</button>
          </div>
        )}
      </div>
    </>
  );
}
