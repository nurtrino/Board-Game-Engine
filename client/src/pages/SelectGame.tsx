import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../net';
import { FallingPieces } from '../three/FallingPieces';

const GAMES = [
  {
    id: 'brass',
    name: 'Brass: Birmingham',
    logo: '/brass-logo.webp',
  },
];

export function SelectGame() {
  const nav = useNavigate();

  useEffect(() => {
    return socket.on((msg) => {
      if (msg.type === 'room_created') nav(`/board/${msg.roomId}`);
    });
  }, [nav]);

  return (
    <>
      <div className="home-bg"><FallingPieces /></div>
      <div className="page select-game">
        <div className="brand">
          <span className="eyebrow">New game</span>
          <h1>Select Game</h1>
          <div className="rule" />
        </div>

        <div className="game-grid">
          {GAMES.map((g) => (
            <button
              key={g.id}
              className="game-tile"
              onClick={() => socket.send({ type: 'create_room' })}
            >
              <img src={g.logo} alt={g.name} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
