import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { tokenKey } from '../net';

export function Join() {
  const { roomId = '' } = useParams();
  const nav = useNavigate();
  const [name, setName] = useState(localStorage.getItem('bge-name') ?? '');
  const rejoining = !!localStorage.getItem(tokenKey(roomId));

  const go = () => {
    localStorage.setItem('bge-name', name);
    sessionStorage.setItem('bge-join-name', name);
    nav(`/play/${roomId}`);
  };

  return (
    <div className="page home">
      <h1>Join room {roomId.toUpperCase()}</h1>
      <div className="card">
        <p>What should we call you?</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={16}
          autoFocus
        />
        <button className="big" disabled={!rejoining && name.trim().length === 0} onClick={go}>
          {rejoining ? 'Rejoin game' : 'Join game'}
        </button>
      </div>
    </div>
  );
}
