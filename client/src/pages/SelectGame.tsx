// New-game flow on the TV: pick a game, then continue a saved game or start a
// new save (named, dated). Saves are rooms — resuming one reopens its lobby /
// board and every device reconnects into its seat.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../net';
import {
  deleteCredentialCandidates,
  deleteSavedGame,
  playerTokenKey,
  saveOwnerTokenKey,
} from '../saveDeletion';
import { FallingPieces } from '../three/FallingPieces';
import { seatHexFor } from '../brass/TableScene';
import type { SaveInfo, GameOptions } from '@bge/shared';

const GAMES = [
  {
    id: 'secrethitler',
    name: 'Secret Hitler',
    logo: '/sh/box.jpg',
  },
  {
    id: 'brass',
    name: 'Brass: Birmingham',
    logo: '/brass-logo.webp',
  },
  {
    id: 'axis',
    name: 'Axis & Allies',
    logo: '/axis-box.webp',
  },
];

const AXIS_OPTION_DEFS = [
  { key: 'scenario', label: 'Scenario', values: [{ v: '1941', label: '1941' }, { v: '1942', label: '1942' }] },
  { key: 'winCondition', label: 'Victory cities', values: [{ v: 'short', label: '13' }, { v: 'standard', label: '15' }, { v: 'total', label: '18' }] },
  { key: 'nationalObjectives', label: 'National objectives', values: [{ v: true, label: 'On' }, { v: false, label: 'Off' }] },
  { key: 'rnd', label: 'Research', values: [{ v: false, label: 'Off' }, { v: true, label: 'On' }] },
] as const;
const AXIS_DEFAULTS = { scenario: '1941', winCondition: 'standard', nationalObjectives: true, rnd: false };

// Create-screen options per game (surfaced above the save name).
const SH_OPTION_DEFS = [
  { key: 'claudeSeats', label: 'Claude seats', values: [
    { v: 0, label: 'Fill to five' },
    { v: 1, label: 'One' },
    { v: 2, label: 'Two' },
    { v: 3, label: 'Three' },
  ] },
] as const;

const dateOf = (t: number) =>
  new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

interface CreateOptionChoice {
  readonly v: string | number | boolean;
  readonly label: string;
}

function CreateOption({
  id,
  label,
  help,
  values,
  current,
  onSelect,
}: {
  id: string;
  label: string;
  help?: string;
  values: readonly CreateOptionChoice[];
  current: string | number | boolean;
  onSelect: (value: string | number | boolean) => void;
}) {
  const labelId = `${id}-label`;
  return (
    <div className="create-option" role="group" aria-labelledby={labelId}>
      <div className="create-option-copy">
        <span id={labelId} className="create-option-label">{label}</span>
        {help && <span className="pk-create-help">{help}</span>}
      </div>
      <div className="create-option-values">
        {values.map((value) => {
          const selected = current === value.v;
          return (
            <button
              type="button"
              key={String(value.v)}
              className={selected ? 'opt on' : 'opt'}
              aria-pressed={selected}
              onClick={() => onSelect(value.v)}
            >{value.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function statusLine(s: SaveInfo): string {
  if (!s.compatible) return 'Incompatible old save · delete and start fresh';
  if (s.status === 'ended') return 'Finished';
  if (s.status === 'lobby') return 'In lobby';
  if (s.game === 'brass' && s.era) return `${s.era === 'rail' ? 'Rail' : 'Canal'} era, round ${s.round}/${s.numRounds}`;
  if (s.round !== null && s.numRounds !== null) return `Round ${s.round}/${s.numRounds}`;
  if (s.round !== null) return `Round ${s.round}`;
  return 'In play';
}

export function SelectGame() {
  const nav = useNavigate();
  const [game, setGame] = useState<typeof GAMES[number] | null>(null);
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ roomId: string; message: string } | null>(null);
  const [options, setOptions] = useState<GameOptions>({});

  const createRoom = () => {
    if (!game) return;
    const opts = game.id === 'secrethitler' ? { claudeSeats: 0, ...options }
      : game.id === 'axis' ? { ...AXIS_DEFAULTS, ...options } : undefined;
    socket.send({ type: 'create_room', name: name.trim(), game: game.id, options: opts });
  };

  const deleteSave = async (roomId: string) => {
    if (deleting) return;
    setDeleting(roomId);
    setDeleteError(null);
    try {
      const credentials = deleteCredentialCandidates(roomId, localStorage);
      await deleteSavedGame(roomId, credentials);
      // Never hide the save optimistically: remove it only after the durable
      // delete succeeds (or the server confirms it is already absent).
      setSaves((list) => (list ? list.filter((s) => s.roomId !== roomId) : list));
      setConfirming(null);
      try {
        localStorage.removeItem(saveOwnerTokenKey(roomId));
        localStorage.removeItem(playerTokenKey(roomId));
      } catch { /* deletion already succeeded; storage cleanup is best-effort */ }
    } catch (err) {
      setDeleteError({
        roomId,
        message: err instanceof Error ? err.message : 'The save could not be deleted.',
      });
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    return socket.on((msg) => {
      if (msg.type === 'room_created') {
        if (msg.ownerToken) {
          try { localStorage.setItem(saveOwnerTokenKey(msg.roomId), msg.ownerToken); } catch { /* storage may be unavailable */ }
        }
        nav(`/board/${msg.roomId}`);
      }
    });
  }, [nav]);

  useEffect(() => {
    if (!game) return;
    setOptions({});
    setName(`${game.name.split(':')[0]} - ${dateOf(Date.now())}`);
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
          <div className="game-grid" role="group" aria-label="Available games">
            {GAMES.map((g) => (
              <button
                type="button"
                key={g.id}
                className={`game-tile game-tile-${g.id}`}
                aria-label={`Choose ${g.name}`}
                onClick={() => setGame(g)}
              >
                <span className="game-tile-art" aria-hidden="true">
                  <img src={g.logo} alt="" />
                </span>
              </button>
            ))}
          </div>
        )}

        {game && (
          <div className="save-panel">
            <div className="save-new">
              <label className="save-name-field" htmlFor="new-save-name">
                <span>Save name</span>
                <input
                  id="new-save-name"
                  className="save-name"
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createRoom(); }}
                />
              </label>
              <button
                type="button"
                className="primary"
                onClick={createRoom}
              >New save</button>
            </div>

            {game.id === 'secrethitler' && (
              <div className="create-options">
                <div className="create-option">
                  <span className="create-option-label">5 to 10 players</span>
                  <span className="dim">Claude plays any chair nobody takes</span>
                </div>
                {SH_OPTION_DEFS.map((def) => {
                  const current = options[def.key] ?? def.values[0].v;
                  return (
                    <CreateOption
                      key={def.key}
                      id={`sh-${def.key}`}
                      label={def.label}
                      values={def.values}
                      current={current}
                      onSelect={(value) => setOptions((state) => ({ ...state, [def.key]: value }))}
                    />
                  );
                })}
              </div>
            )}

            {game.id === 'axis' && (
              <div className="create-options">
                <div className="create-option">
                  <span className="create-option-label">1 to 6 players</span>
                  <span className="dim">The host commands any power nobody takes</span>
                </div>
                {AXIS_OPTION_DEFS.map((def) => (
                  <CreateOption
                    key={def.key}
                    id={`axis-${def.key}`}
                    label={def.label}
                    values={def.values}
                    current={options[def.key] ?? AXIS_DEFAULTS[def.key]}
                    onSelect={(value) => setOptions((state) => ({ ...state, [def.key]: value }))}
                  />
                ))}
              </div>
            )}

            {saves === null && <p className="dim">Loading saves</p>}
            {saves && saves.length === 0 && <p className="dim">No saved games yet</p>}
            {saves && saves.length > 0 && (
              <div className="save-list">
                {saves.map((s) => (
                  <div key={s.roomId} className="save-row">
                    <button
                      type="button"
                      className="save-row-open"
                      disabled={deleting !== null || !s.compatible}
                      title={!s.compatible ? 'This old save contains state from a different game engine and cannot be resumed.' : undefined}
                      onClick={() => nav(`/board/${s.roomId}`)}
                    >
                      <span className="save-row-main">
                        <b>{s.name}</b>
                        <span className="dim">{statusLine(s)}</span>
                      </span>
                      <span className="save-row-side">
                        <span className="save-seats">
                          {s.players.map((p, i) => (
                            <span key={i} className="save-seat" style={{ background: seatHexFor(s.game, p.color) }} title={p.name} />
                          ))}
                        </span>
                        <span className="dim">{dateOf(s.createdAt)}</span>
                      </span>
                    </button>
                    {confirming === s.roomId ? (
                      <div className="save-confirm">
                        <button type="button" className="save-confirm-yes" disabled={deleting !== null} onClick={() => void deleteSave(s.roomId)}>
                          {deleting === s.roomId ? 'Deleting…' : 'Delete'}
                        </button>
                        <button type="button" className="save-confirm-no" disabled={deleting !== null} onClick={() => { setConfirming(null); setDeleteError(null); }}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="save-del" disabled={deleting !== null} aria-label={`Delete ${s.name}`} title="Delete save" onClick={() => { setConfirming(s.roomId); setDeleteError(null); }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {deleteError && (
              <div className="save-delete-error" role="alert">
                <span>{deleteError.message}</span>
                <button type="button" onClick={() => setDeleteError(null)} aria-label="Dismiss deletion error">Dismiss</button>
              </div>
            )}

            <button type="button" className="save-back" disabled={deleting !== null} onClick={() => { setGame(null); setSaves(null); setDeleteError(null); }}>Back</button>
          </div>
        )}
      </div>
    </>
  );
}
