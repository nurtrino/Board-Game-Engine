// Player device for Axis & Allies Anniversary — the expanded turn portal.
// Board-first: the interactive world map fills the screen; every legal tap
// pulses on the board AND is mirrored as a labelled chip below (Kanban
// pattern — chips complete multi-part choices and drive the DOM smoke).
// Phases: research -> purchase -> combat moves (each resolved immediately
// through the battle view) -> noncombat -> mobilize -> income.

import { useMemo, useState } from 'react';
import {
  AXIS_MAP, POWERS, UNITS, TECHS, RESEARCH_DIE_COST, CHINA_COLOR, WIN_CONDITIONS,
  type AxisView, type AxisAction, type PowerKey, type UnitKey, type UnitStack,
} from '@bge/shared';
import { AxisTable, useAxisManifest, SPACE_CENTER, px2r, type FocusTarget, type SpacePick } from './AxisScene';

type Act = (a: AxisAction & { asPower?: PowerKey }) => void;

const powerHex = (p: PowerKey | 'china') => (p === 'china' ? CHINA_COLOR : POWERS[p].color);

const TERR = Object.fromEntries(AXIS_MAP.territories.map((t) => [t.id, t]));
const ZONE = Object.fromEntries(AXIS_MAP.seaZones.map((z) => [z.id, z]));
const isSz = (id: string) => id.startsWith('sz-');
const spaceName = (id: string) => TERR[id]?.name ?? (ZONE[id] ? `Sea Zone ${ZONE[id].n}` : id);
const SEA_KEYS: UnitKey[] = ['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];
const AIR_KEYS: UnitKey[] = ['fighter', 'bomber'];
const BUYABLE: UnitKey[] = ['infantry', 'artillery', 'tank', 'aaGun', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport', 'factory'];

function neighborsOf(id: string): string[] {
  const t = TERR[id];
  if (t) return [...t.adj, ...(t.coastTo ?? [])];
  const z = ZONE[id];
  if (z) return [...z.adj, ...(z.coastTo ?? [])];
  return [];
}

// ---------- shared bits ----------

function Chip({ label, onTap, tone, disabled, title }: {
  label: string; onTap?: () => void; tone?: 'gold' | 'plain' | 'danger'; disabled?: boolean; title?: string;
}) {
  return (
    <button
      className="ax-chip"
      data-tone={tone ?? 'plain'}
      onClick={onTap}
      disabled={disabled}
      title={title}
    >{label}</button>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="ax-step">
      <button onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0}>−</button>
      <b className="ig-num">{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </span>
  );
}

// ---------- per-phase sheets ----------

function ResearchSheet({ view, act }: { view: AxisView; act: Act }) {
  const [dice, setDice] = useState(1);
  const p = view.powers[view.active];
  if (view.awaitingChart) {
    return (
      <div className="ax-sheet">
        <div className="ig-lab">Breakthrough — choose a chart</div>
        <div className="ax-row">
          {[1, 2].map((chart) => (
            <button key={chart} className="ax-big" onClick={() => act({ type: 'chooseChart', chart: chart as 1 | 2 })}>
              <b>Chart {chart}</b>
              <span>{TECHS.filter((t) => t.chart === chart).map((t) => t.name).join(' · ')}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const cost = dice * RESEARCH_DIE_COST;
  return (
    <div className="ax-sheet">
      <div className="ig-lab">Research & Development</div>
      <div className="ax-row" style={{ alignItems: 'center', gap: 14 }}>
        <Stepper value={dice} max={Math.floor(p.ipcs / RESEARCH_DIE_COST)} onChange={setDice} />
        <span style={{ opacity: 0.75, fontSize: 13 }}>{cost} IPCs — any 6 is a breakthrough. Failed researchers stay for future turns{p.researchTokens ? ` (${p.researchTokens} standing by)` : ''}.</span>
      </div>
      <div className="ax-row">
        <Chip label={`Roll ${dice} research ${dice === 1 ? 'die' : 'dice'}`} tone="gold" disabled={cost > p.ipcs || dice < 1} title={cost > p.ipcs ? 'Not enough IPCs' : undefined} onTap={() => act({ type: 'buyResearch', dice })} />
        <Chip label="Skip research" onTap={() => act({ type: 'endPhase' })} />
      </div>
    </div>
  );
}

function PurchaseSheet({ view, act }: { view: AxisView; act: Act }) {
  const p = view.powers[view.active];
  const shipyards = p.techs.includes('improvedShipyards');
  const costOf = (k: UnitKey) => (shipyards && { battleship: 17, carrier: 11, cruiser: 10, destroyer: 7, transport: 6, submarine: 5 }[k as string]) || UNITS[k].cost;
  const staged = Object.entries(p.staging) as [UnitKey, number][];
  return (
    <div className="ax-sheet">
      <div className="ig-lab">Purchase units — {p.ipcs} IPCs</div>
      <div className="ax-buy-grid">
        {BUYABLE.map((k) => {
          const cost = costOf(k);
          const afford = p.ipcs >= cost;
          return (
            <button
              key={k}
              className="ax-buy"
              disabled={!afford}
              title={afford ? undefined : `Costs ${cost} IPCs — you have ${p.ipcs}`}
              onClick={() => act({ type: 'buy', key: k, count: 1 })}
            >
              <b>{UNITS[k].name}</b>
              <span className="ig-num">{cost}</span>
            </button>
          );
        })}
      </div>
      {staged.length > 0 && (
        <div>
          <div className="ig-lab" style={{ margin: '8px 0 4px' }}>Staging area — mobilizes after combat</div>
          <div className="ax-row">
            {staged.map(([k, n]) => (
              <Chip key={k} label={`${n} ${UNITS[k].name} — return`} onTap={() => act({ type: 'unbuy', key: k, count: 1 })} />
            ))}
          </div>
        </div>
      )}
      <div className="ax-row">
        <Chip label="Done purchasing" tone="gold" onTap={() => act({ type: 'endPhase' })} />
      </div>
    </div>
  );
}

// movement flow shared by combat + noncombat move phases
function MoveFlow({ view, act, mode }: { view: AxisView; act: Act; mode: 'combat' | 'noncombat' }) {
  const me = view.active;
  const [origin, setOrigin] = useState<string | null>(null);
  const [take, setTake] = useState<Record<string, number>>({});

  const myStacksAt = (id: string): UnitStack[] =>
    (view.board[id] ?? []).filter((s) => s.power === me || (me === 'usa' && s.power === 'china'));

  const origins = useMemo(
    () => Object.keys(view.board).filter((id) => myStacksAt(id).some((s) => s.key !== 'factory')),
    [view.board, me],
  );

  const enemyAt = (id: string) => (view.board[id] ?? []).some((s) => {
    const side = (p: string) => (p === 'china' ? 'allies' : POWERS[p as PowerKey].coalition);
    return side(s.power) !== POWERS[me].coalition;
  });
  const hostileControl = (id: string) => {
    const h = view.control[id];
    return !isSz(id) && h != null && (h === 'china' ? 'allies' : POWERS[h as PowerKey].coalition) !== POWERS[me].coalition;
  };
  const friendly = (id: string) => {
    if (isSz(id)) return !enemyAt(id);
    const h = view.control[id];
    return h != null && (h === 'china' ? 'allies' : POWERS[h as PowerKey].coalition) === POWERS[me].coalition;
  };

  const targets = useMemo(() => {
    if (!origin) return [];
    const picked = Object.entries(take).filter(([, n]) => n > 0);
    if (!picked.length) return [];
    return neighborsOf(origin).filter((id) => {
      const t = TERR[id];
      if (t?.isImpassable) return false;
      const hasSea = picked.some(([k]) => SEA_KEYS.includes(k as UnitKey));
      const hasLand = picked.some(([k]) => !SEA_KEYS.includes(k as UnitKey) && !AIR_KEYS.includes(k as UnitKey));
      if (isSz(id) && hasLand) return false;
      if (!isSz(id) && hasSea) return false;
      if (mode === 'combat') return enemyAt(id) || hostileControl(id);
      return friendly(id) && !enemyAt(id);
    });
  }, [origin, take, mode, view.board, view.control]);

  const picks: SpacePick[] = origin
    ? targets.map((id) => ({ id, color: mode === 'combat' ? '#e05555' : '#7be0a3' }))
    : origins.map((id) => ({ id }));

  const doMove = (target: string) => {
    const units = Object.entries(take).filter(([, n]) => n > 0).map(([key, count]) => ({ key: key as UnitKey, count }));
    if (!units.length) return;
    if (mode === 'combat') {
      act({ type: 'attack', target, forces: [{ from: origin!, units }] });
    } else {
      act({ type: 'move', from: origin!, to: target, units });
    }
    setOrigin(null);
    setTake({});
  };

  return (
    <>
      <div className="ax-sheet">
        <div className="ig-lab">
          {mode === 'combat' ? 'Combat move — pick units, then the space to attack. Each attack resolves at once.' : 'Noncombat move — reposition into friendly spaces.'}
        </div>
        {!origin && (
          <div className="ax-row ax-wrap">
            {origins.map((id) => (
              <Chip key={id} label={spaceName(id)} onTap={() => setOrigin(id)} />
            ))}
            <Chip label={mode === 'combat' ? 'No more attacks' : 'Done moving'} tone="gold" onTap={() => act({ type: 'endPhase' })} />
          </div>
        )}
        {origin && (
          <>
            <div className="ax-row" style={{ alignItems: 'center' }}>
              <b style={{ fontSize: 14 }}>{spaceName(origin)}</b>
              <Chip label="Change origin" onTap={() => { setOrigin(null); setTake({}); }} />
            </div>
            <div className="ax-units">
              {myStacksAt(origin).filter((s) => s.key !== 'factory').map((s, i) => (
                <div key={`${s.key}-${i}`} className="ax-unit-row">
                  <span>{UNITS[s.key].name}{s.power === 'china' ? ' (China)' : ''} × {s.count}</span>
                  <Stepper
                    value={take[s.key] ?? 0}
                    max={s.count}
                    onChange={(n) => setTake((t) => ({ ...t, [s.key]: n }))}
                  />
                </div>
              ))}
            </div>
            <div className="ax-row ax-wrap">
              {targets.map((id) => (
                <Chip key={id} label={`${mode === 'combat' ? 'Attack' : 'To'} ${spaceName(id)}`} tone={mode === 'combat' ? 'danger' : 'gold'} onTap={() => doMove(id)} />
              ))}
              {targets.length === 0 && <span style={{ fontSize: 12.5, opacity: 0.6 }}>Set unit counts to see destinations.</span>}
            </div>
          </>
        )}
      </div>
      <MapPanel view={view} picks={picks} onPick={(id) => {
        if (!origin) { if (origins.includes(id)) setOrigin(id); return; }
        if (targets.includes(id)) doMove(id);
      }} focusSpace={origin} />
    </>
  );
}

function BattleSheet({ view, act }: { view: AxisView; act: Act }) {
  const c = view.combat!;
  const b = c.battle;
  const d = b.decision;
  const [picked, setPicked] = useState<number[]>([]);
  const byUid = new Map([...b.attacker, ...b.defender].map((u) => [u.uid, u]));
  const needed = d?.type === 'casualties' ? d.buckets.reduce((n, bk) => n + Math.min(bk.hits, bk.eligible.length), 0) : 0;
  return (
    <div className="ax-sheet">
      <div className="ig-lab">Battle — {spaceName(c.space)} — round {b.round}</div>
      {!d && (
        <div className="ax-row">
          <Chip label="Roll the dice" tone="gold" onTap={() => act({ type: 'battleRoll' })} />
        </div>
      )}
      {d?.type === 'retreat' && (
        <div className="ax-row">
          <Chip label="Press the attack" tone="gold" onTap={() => act({ type: 'battleRetreat', retreat: false })} />
          <Chip label="Retreat" tone="danger" onTap={() => act({ type: 'battleRetreat', retreat: true })} />
        </div>
      )}
      {d?.type === 'submerge' && (
        <div className="ax-row">
          <Chip label="Fight on" tone="gold" onTap={() => act({ type: 'battleSubmerge', uids: [] })} />
          <Chip label="Submerge all" onTap={() => act({ type: 'battleSubmerge', uids: d.subs })} />
        </div>
      )}
      {d?.type === 'casualties' && (
        <>
          <div style={{ fontSize: 13, opacity: 0.85 }}>
            {POWERS[view.active].coalition === 'axis' ? '' : ''}Choose {needed} {needed === 1 ? 'casualty' : 'casualties'} ({d.side} losses){picked.length ? ` — ${picked.length} picked` : ''}
          </div>
          <div className="ax-row ax-wrap">
            {d.buckets.flatMap((bk) => bk.eligible).map((uid) => {
              const u = byUid.get(uid);
              if (!u) return null;
              const on = picked.includes(uid);
              return (
                <Chip
                  key={uid}
                  label={`${UNITS[u.key].name}${u.hp > 1 ? ' (damage)' : ''}${on ? ' ✓' : ''}`}
                  tone={on ? 'danger' : 'plain'}
                  onTap={() => setPicked((p) => (on ? p.filter((x) => x !== uid) : p.length < needed ? [...p, uid] : p))}
                />
              );
            })}
          </div>
          <div className="ax-row">
            <Chip label="Confirm casualties" tone="gold" disabled={picked.length < needed} onTap={() => { act({ type: 'battleCasualties', uids: picked }); setPicked([]); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MobilizeSheet({ view, act }: { view: AxisView; act: Act }) {
  const p = view.powers[view.active];
  const staged = Object.entries(p.staging) as [UnitKey, number][];
  const [key, setKey] = useState<UnitKey | null>(null);
  const spots = useMemo(() => {
    if (!key) return [];
    const sea = SEA_KEYS.includes(key);
    if (!sea) {
      return AXIS_MAP.territories
        .filter((t) => view.control[t.id] === view.active
          && (key === 'factory'
            ? t.ipc >= 1 && !(view.board[t.id] ?? []).some((s) => s.key === 'factory')
            : (view.board[t.id] ?? []).some((s) => s.key === 'factory')))
        .map((t) => t.id);
    }
    return AXIS_MAP.seaZones
      .filter((z) => (z.coastTo ?? []).some((tid) =>
        view.control[tid] === view.active && (view.board[tid] ?? []).some((s) => s.key === 'factory')))
      .map((z) => z.id);
  }, [key, view]);
  return (
    <>
      <div className="ax-sheet">
        <div className="ig-lab">Mobilize — place purchases at your industrial complexes</div>
        {staged.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>Nothing staged.</div>}
        <div className="ax-row ax-wrap">
          {staged.map(([k, n]) => (
            <Chip key={k} label={`${UNITS[k].name} × ${n}${key === k ? ' ✓' : ''}`} tone={key === k ? 'gold' : 'plain'} onTap={() => setKey(key === k ? null : k)} />
          ))}
        </div>
        {key && (
          <div className="ax-row ax-wrap">
            {spots.map((id) => (
              <Chip key={id} label={`Place at ${spaceName(id)}`} tone="gold" onTap={() => act({ type: 'place', space: id, key, count: 1 })} />
            ))}
            {spots.length === 0 && <span style={{ fontSize: 12.5, opacity: 0.6 }}>No legal placement for that unit.</span>}
          </div>
        )}
        <div className="ax-row">
          <Chip label="Collect income" tone="gold" onTap={() => act({ type: 'endPhase' })} />
        </div>
      </div>
      <MapPanel view={view} picks={key ? spots.map((id) => ({ id, color: '#7be0a3' })) : []} onPick={(id) => { if (key && spots.includes(id)) act({ type: 'place', space: id, key, count: 1 }); }} focusSpace={null} />
    </>
  );
}

// the phone's interactive board
function MapPanel({ view, picks, onPick, focusSpace }: {
  view: AxisView; picks: SpacePick[]; onPick: (id: string) => void; focusSpace: string | null;
}) {
  const manifest = useAxisManifest();
  const focus: FocusTarget | null = useMemo(() => {
    if (!focusSpace) return null;
    const c = SPACE_CENTER[focusSpace];
    if (!c) return null;
    const [x, z] = px2r(c[0], c[1]);
    return { x, z, dist: 18 };
  }, [focusSpace]);
  if (!manifest) return null;
  return (
    <div className="ax-map">
      <AxisTable manifest={manifest} board={view.board} control={view.control} focus={focus} picks={picks} onPick={onPick} />
    </div>
  );
}

// ---------- top-level ----------

export default function AxisPlay({ view, act, error }: {
  view: AxisView;
  act: (a: AxisAction) => void;
  error: string | null;
}) {
  const me = view.active; // dev single-player: the device drives the active power
  const power = POWERS[me];
  const p = view.powers[me];
  const actAs: Act = (a) => act({ ...a, asPower: me } as unknown as AxisAction);

  const onMap = Object.values(view.board).flat().filter((s) => s.power === me).reduce((n, s) => n + s.count, 0);

  return (
    <div className="ax-page">
      <header className="ax-head ig-glass">
        <div>
          <div className="ig-lab">Axis & Allies — {view.options.scenario} — {WIN_CONDITIONS[view.options.winCondition].label}</div>
          <b style={{ color: power.color, fontSize: 17, letterSpacing: '.03em' }}>{power.name}</b>
        </div>
        <div className="ax-head-stats">
          <span className="ig-num" title="IPCs on hand"><b>{p.ipcs}</b> IPC</span>
          <span className="ig-num" title="National production">+{p.production}</span>
          <span className="ig-num" title="Units on the map">{onMap} units</span>
        </div>
      </header>

      {error && <div className="ax-error">{error}</div>}

      {view.phase === 'rnd' && <ResearchSheet view={view} act={actAs} />}
      {view.phase === 'purchase' && <PurchaseSheet view={view} act={actAs} />}
      {view.phase === 'combatMove' && <MoveFlow view={view} act={actAs} mode="combat" />}
      {view.phase === 'battle' && view.combat && (
        <>
          <BattleSheet view={view} act={actAs} />
          <MapPanel view={view} picks={[]} onPick={() => {}} focusSpace={view.combat.space} />
        </>
      )}
      {view.phase === 'noncombat' && <MoveFlow view={view} act={actAs} mode="noncombat" />}
      {view.phase === 'mobilize' && <MobilizeSheet view={view} act={actAs} />}
      {view.phase === 'income' && (
        <div className="ax-sheet">
          <div className="ig-lab">Income collected</div>
          <div style={{ fontSize: 14 }}>{power.name} collected <b className="ig-num">{p.lastIncome}</b> IPCs. The production screen is on the TV.</div>
          <div className="ax-row">
            <Chip label="End turn" tone="gold" onTap={() => actAs({ type: 'endPhase' })} />
          </div>
        </div>
      )}
      {view.phase === 'gameOver' && (
        <div className="ax-sheet">
          <div className="ig-lab">Game over</div>
          <div style={{ fontSize: 15 }}>{view.winner === 'axis' ? 'The Axis' : 'The Allies'} win.</div>
        </div>
      )}
    </div>
  );
}
