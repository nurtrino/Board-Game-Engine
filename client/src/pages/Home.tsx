import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FallingPieces } from '../three/FallingPieces';

export function Home() {
  const nav = useNavigate();
  const [code, setCode] = useState('');

  return (
    <>
      <div className="home-bg"><FallingPieces /></div>
      <div className="page home">
      <div className="brand">
        <span className="eyebrow">Tabletop, together</span>
        <h1>Board Game Engine</h1>
        <div className="rule" />
        <p className="tagline">The board on your TV · your hand on your phone</p>
      </div>

      <div className="card">
        <span className="eyebrow">On the big screen</span>
        <h2>Host a table</h2>
        <p className="dim">Pick a game here, then everyone scans the QR code to join from their phone.</p>
        <button className="big primary" onClick={() => nav('/new')}>
          New game
        </button>
      </div>

      <div className="card">
        <span className="eyebrow">On your phone</span>
        <h2>Join a table</h2>
        <p className="dim">Enter the 4-letter room code shown on the TV.</p>
        <div className="row">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={4}
            className="code-input"
          />
          <button className="big" disabled={code.length !== 4} onClick={() => nav(`/join/${code}`)}>
            Join
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
