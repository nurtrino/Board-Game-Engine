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
  {
    id: 'ttr',
    name: 'Ticket to Ride: Rails & Sails',
    logo: '/ttr-logo.jpg',
  },
  {
    id: 'trek',
    name: 'Trekking the National Parks',
    logo: '/trek-logo.jpg',
  },
];

const dateOf = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function statusLine(s: SaveInfo): string {
  if (s.status === 'ended') return 'Finished';
  if (s.status === 'lobby') return 'In lobby';
  if (s.era) return `${s.era === 'rail' ? 'Rail' : 'Canal'} era, round ${s.round}/${s.numRounds}`;
  return 'In play';
}

export function SelectGame() {
  const nav = useNavigate();
  const [game, setGame] = useState<typeof GAMES[number] | null>(null);
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const deleteSave = (roomId: string) => {
    setSaves((list) => (list ? list.filter((s) => s.roomId !== roomId) : list));
    setConfirming(null);
    fetch(`/api/saves/${roomId}`, { method: 'DELETE' }).catch(() => { /* already gone */ });
  };

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
                  <div key={s.roomId} className="save-row">
                    <button className="save-row-open" onClick={() => nav(`/board/${s.roomId}`)}>
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
                    {confirming === s.roomId ? (
                      <div className="save-confirm">
                        <button className="save-confirm-yes" onClick={() => deleteSave(s.roomId)}>Delete</button>
                        <button className="save-confirm-no" onClick={() => setConfirming(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="save-del" aria-label={`Delete ${s.name}`} title="Delete save" onClick={() => setConfirming(s.roomId)}>✕</button>
                    )}
                  </div>
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
