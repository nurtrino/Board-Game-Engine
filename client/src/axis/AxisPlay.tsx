// Player device for Axis & Allies Anniversary · the expanded turn portal.
// Board-first: the interactive world map fills the screen; every legal tap
// pulses on the board AND is mirrored as a labelled chip below (Kanban
// pattern · chips complete multi-part choices and drive the DOM smoke).
// Phases: research -> purchase -> combat moves (each resolved immediately
// through the battle view, amphibious included) -> noncombat (transports
// load/offload) -> mobilize (China grant on the US turn) -> income.

import { useMemo, useState } from 'react';
import {
  AXIS_MAP, POWERS, UNITS, TECHS, TECH_BY_KEY, RESEARCH_DIE_COST, CHINA_COLOR, WIN_CONDITIONS,
  type AxisView, type AxisAction, type PowerKey, type UnitKey, type UnitStack, type TechKey,
} from '@bge/shared';
import { AxisTable, useAxisManifest, SPACE_CENTER, px2r, type FocusTarget, type SpacePick } from './AxisScene';
import { GameIntro, type Intro } from '../ttr/GameIntro';

type Act = (a: AxisAction & { asPower?: PowerKey }) => void;

const powerHex = (p: PowerKey | 'china') => (p === 'china' ? CHINA_COLOR : POWERS[p].color);

const TERR = Object.fromEntries(AXIS_MAP.territories.map((t) => [t.id, t]));
const ZONE = Object.fromEntries(AXIS_MAP.seaZones.map((z) => [z.id, z]));
const isSz = (id: string) => id.startsWith('sz-');
const spaceName = (id: string) => TERR[id]?.name ?? (ZONE[id] ? `Sea Zone ${ZONE[id].n}` : id);
const SEA_KEYS: UnitKey[] = ['battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];
const AIR_KEYS: UnitKey[] = ['fighter', 'bomber'];
const BUYABLE: UnitKey[] = ['infantry', 'artillery', 'tank', 'aaGun', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport', 'factory'];
const REFERENCE: UnitKey[] = ['infantry', 'artillery', 'tank', 'aaGun', 'factory', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport'];

function neighborsOf(id: string): string[] {
  const t = TERR[id];
  if (t) return [...t.adj, ...(t.coastTo ?? [])];
  const z = ZONE[id];
  if (z) return [...z.adj, ...(z.coastTo ?? [])];
  return [];
}

export const AXIS_INTRO: Intro = {
  title: 'Axis & Allies Anniversary',
  tagline: 'World War II across the whole map: 1941 or 1942, Axis against Allies.',
  goal: 'Win as a side. Capture and hold victory cities until your side holds the number chosen at game start (13, 15, or 18) at the end of a full round. Income from the territories you control buys new units every turn.',
  points: [
    { label: 'Your turn, seven phases', detail: 'Research (if enabled), purchase units, combat moves, battles, noncombat moves, mobilize new units, collect income. The device walks you through them in order.' },
    { label: 'Attacks resolve at once', detail: 'Declare one attack and it goes straight to the battle: dice on the TV, casualties picked by the defender, retreat is the attacker\'s call. Then declare your next attack.' },
    { label: 'Purchases stage first', detail: 'Bought units wait in your staging area and enter play at your industrial complexes during mobilize, limited by each territory\'s income value.' },
    { label: 'Transports and carriers', detail: 'Transports carry one land unit plus one infantry; offloading into a fight is an amphibious assault, with battleships and cruisers bombarding ahead of the landing. Carriers hold two fighters.' },
    { label: 'Income and objectives', detail: 'Collect your production at turn end (plus national objectives if enabled). Capture an enemy capital and their unspent money is yours.' },
  ],
  rulebook: '/axis/rulebook.pdf',
  walkthrough: [
    { title: 'The map is your controller', body: 'Your whole nation is on the board. Anything you can tap pulses gold on the map, and every tap is mirrored as a button under it · use whichever is easier.' },
    { title: 'Buying units', body: 'In PURCHASE UNITS, tap a unit to buy it. It goes to your STAGING AREA, not the board · new units arrive at your factories at the end of your turn. Anything you cannot afford is greyed out.' },
    { title: 'Declaring an attack', body: 'In COMBAT MOVE, tap the space your forces start in, set how many of each unit go, then tap a red target. The battle starts immediately · dice, casualties, the lot · and the TV flies in to watch.' },
    { title: 'Fighting a battle', body: 'Tap ROLL THE DICE to fire. When your side takes hits, you choose which units die. Between rounds the attacker chooses: press on or retreat. Submarines may slip away instead of fighting.' },
    { title: 'Amphibious assaults', body: 'Load infantry onto transports in NONCOMBAT MOVE. Next turn, start an attack from the sea zone: pick the troops aboard plus any battleships and cruisers, and tap the shore. The big ships bombard before the landing.' },
    { title: 'Noncombat and mobilize', body: 'After combat, reposition anything that did not fight, land your aircraft somewhere friendly, and place your staged purchases at industrial complexes. Each factory places up to the territory\'s printed income number.' },
    { title: 'Income and the win', body: 'Your turn ends by collecting income · the TV shows every nation\'s production. Watch the victory city count at the bottom of the TV: hold enough at the end of a round and your side wins.' },
    { title: 'China', body: 'On the US turn, China raises one infantry for every two free Chinese territories. Place them anywhere inside China with fewer than three units. Chinese pieces never leave China.' },
  ],
};

// ---------- shared bits ----------

function Chip({ label, onTap, tone, disabled, title }: {
  label: string; onTap?: () => void; tone?: 'gold' | 'plain' | 'danger'; disabled?: boolean; title?: string;
}) {
  return (
    <button className="ax-chip" data-tone={tone ?? 'plain'} onClick={onTap} disabled={disabled} title={title}>{label}</button>
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
        <div className="ig-lab">Breakthrough · choose a chart</div>
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
        <span style={{ opacity: 0.75, fontSize: 13 }}>{cost} IPCs. Any 6 is a breakthrough. Failed researchers stay for future turns{p.researchTokens ? ` (${p.researchTokens} standing by)` : ''}.</span>
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
      <div className="ig-lab">Purchase units · {p.ipcs} IPCs</div>
      <div className="ax-buy-grid">
        {BUYABLE.map((k) => {
          const cost = costOf(k);
          const afford = p.ipcs >= cost;
          return (
            <button
              key={k}
              className="ax-buy"
              disabled={!afford}
              title={afford ? undefined : `Costs ${cost} IPCs, you have ${p.ipcs}`}
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
          <div className="ig-lab" style={{ margin: '8px 0 4px' }}>Staging area · mobilizes after combat</div>
          <div className="ax-row ax-wrap">
            {staged.map(([k, n]) => (
              <Chip key={k} label={`${n} ${UNITS[k].name}, return`} onTap={() => act({ type: 'unbuy', key: k, count: 1 })} />
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

// unit selection key: own units by unit key, transported cargo as cargo:<key>
type TakeKey = string;
const isCargoKey = (k: TakeKey) => k.startsWith('cargo:');
const baseKey = (k: TakeKey): UnitKey => (isCargoKey(k) ? k.slice(6) : k) as UnitKey;

function MoveFlow({ view, act, mode }: { view: AxisView; act: Act; mode: 'combat' | 'noncombat' }) {
  const me = view.active;
  const [origin, setOrigin] = useState<string | null>(null);
  const [take, setTake] = useState<Record<TakeKey, number>>({});

  const side = (p: string) => (p === 'china' ? 'allies' : POWERS[p as PowerKey].coalition);
  const mySide = POWERS[me].coalition;

  const myStacksAt = (id: string): UnitStack[] =>
    (view.board[id] ?? []).filter((s) => s.power === me || (me === 'usa' && s.power === 'china'));

  const cargoAt = (id: string): Partial<Record<UnitKey, number>> => {
    const out: Partial<Record<UnitKey, number>> = {};
    for (const st of (view.board[id] ?? [])) {
      if (st.power !== me || st.key !== 'transport') continue;
      for (const c of st.cargo ?? []) out[c.key] = (out[c.key] ?? 0) + c.count;
    }
    return out;
  };

  const origins = useMemo(
    () => Object.keys(view.board).filter((id) =>
      myStacksAt(id).some((s) => s.key !== 'factory') || Object.keys(cargoAt(id)).length > 0),
    [view.board, me],
  );

  const enemyAt = (id: string) => (view.board[id] ?? []).some((s) => side(s.power) !== mySide);
  const hostileControl = (id: string) => {
    const h = view.control[id];
    return !isSz(id) && h != null && side(h) !== mySide;
  };
  const friendly = (id: string) => {
    if (isSz(id)) return !enemyAt(id);
    const h = view.control[id];
    return h != null && side(h) === mySide;
  };
  const passable = (id: string) => !TERR[id]?.isImpassable && (isSz(id) || TERR[id]?.originalOwner != null || view.control[id] != null);

  const picked = Object.entries(take).filter(([, n]) => n > 0);
  const pickedKeys = picked.map(([k]) => k);
  const anyCargo = pickedKeys.some(isCargoKey);
  const ownKeys = pickedKeys.filter((k) => !isCargoKey(k)).map(baseKey);
  const allTanks = ownKeys.length > 0 && ownKeys.every((k) => k === 'tank') && !anyCargo;
  const allShips = ownKeys.length > 0 && ownKeys.every((k) => SEA_KEYS.includes(k)) && !anyCargo;
  const allAir = ownKeys.length > 0 && ownKeys.every((k) => AIR_KEYS.includes(k)) && !anyCargo;
  const hasLand = ownKeys.some((k) => !SEA_KEYS.includes(k) && !AIR_KEYS.includes(k));

  // second-ring targets (with the intermediate used as `via`)
  const ring2 = (id: string, domain: 'land' | 'sea'): { id: string; via: string }[] => {
    const out: { id: string; via: string }[] = [];
    const seen = new Set([id, ...neighborsOf(id)]);
    for (const mid of neighborsOf(id)) {
      const midOkLand = !isSz(mid) && passable(mid) && (friendly(mid) || !enemyAt(mid));
      const midOkSea = isSz(mid) && !enemyAt(mid);
      if (domain === 'land' ? !midOkLand : !midOkSea) continue;
      for (const far of neighborsOf(mid)) {
        if (seen.has(far)) continue;
        if (domain === 'land' && isSz(far)) continue;
        if (domain === 'sea' && !isSz(far)) continue;
        seen.add(far);
        out.push({ id: far, via: mid });
      }
    }
    return out;
  };

  interface Target { id: string; via?: string; amphibious?: boolean }
  const targets = useMemo((): Target[] => {
    if (!origin || picked.length === 0) return [];
    const out: Target[] = [];
    const seaOrigin = isSz(origin);

    if (mode === 'combat') {
      const want = (id: string) => (isSz(id) ? enemyAt(id) : enemyAt(id) || hostileControl(id));
      if (seaOrigin) {
        if (anyCargo) {
          // amphibious: shorelines of this zone
          for (const t of ZONE[origin]?.coastTo ?? []) {
            if (want(t) && passable(t)) out.push({ id: t, amphibious: true });
          }
        }
        if (allShips) {
          for (const z of neighborsOf(origin).filter(isSz)) if (want(z)) out.push({ id: z });
          for (const { id, via } of ring2(origin, 'sea')) if (want(id)) out.push({ id, via });
        }
      } else {
        for (const n of neighborsOf(origin)) {
          if (isSz(n) && hasLand) continue;
          if (!isSz(n) && !passable(n)) continue;
          if (want(n)) out.push({ id: n });
        }
        if (allTanks) {
          for (const { id } of ring2(origin, 'land')) if (want(id) && passable(id)) out.push({ id });
        }
        if (allAir) {
          // air strikes within range - 1 (a landing move is reserved)
          const range = Math.min(...ownKeys.map((k) => UNITS[k].move)) - 1;
          let frontier = [origin];
          const seen = new Set(frontier);
          for (let d = 1; d <= range; d++) {
            const next: string[] = [];
            for (const sp of frontier) {
              for (const n of neighborsOf(sp)) {
                if (seen.has(n)) continue;
                seen.add(n);
                if (want(n) && (isSz(n) || passable(n)) && !out.some((t) => t.id === n)) out.push({ id: n });
                next.push(n);
              }
            }
            frontier = next;
          }
        }
      }
      return out;
    }

    // noncombat
    if (seaOrigin) {
      if (anyCargo) {
        for (const t of ZONE[origin]?.coastTo ?? []) {
          if (!isSz(t) && friendly(t) && !enemyAt(t)) out.push({ id: t });
        }
      }
      if (allShips) {
        for (const z of neighborsOf(origin).filter(isSz)) if (friendly(z)) out.push({ id: z });
        for (const { id, via } of ring2(origin, 'sea')) if (friendly(id)) out.push({ id, via });
      }
      return out;
    }
    for (const n of neighborsOf(origin)) {
      if (isSz(n)) continue;
      if (friendly(n) && !enemyAt(n) && passable(n)) out.push({ id: n });
    }
    if (allTanks || allAir) {
      for (const { id, via } of ring2(origin, 'land')) {
        if (friendly(id) && !enemyAt(id) && passable(id)) out.push({ id, via });
      }
    }
    return out;
  }, [origin, take, mode, view.board, view.control]);

  // load chips: land units picked in a coastal territory with own transports nearby
  const loadZones = useMemo(() => {
    if (mode !== 'noncombat' || !origin || isSz(origin) || !hasLand) return [];
    return (TERR[origin]?.coastTo ?? []).filter((z) =>
      (view.board[z] ?? []).some((st) => st.power === me && st.key === 'transport'));
  }, [origin, take, mode, view.board]);

  const reset = () => { setOrigin(null); setTake({}); };

  const doMove = (t: Target) => {
    const own = picked.filter(([k]) => !isCargoKey(k)).map(([key, count]) => ({ key: baseKey(key), count }));
    const cargo = picked.filter(([k]) => isCargoKey(k)).map(([key, count]) => ({ key: baseKey(key), count }));
    if (mode === 'combat') {
      if (t.amphibious) {
        act({
          type: 'attack', target: t.id,
          forces: own.length ? [{ from: origin!, units: own }] : [],
          offloadFrom: origin!, offloadUnits: cargo,
        });
      } else {
        act({ type: 'attack', target: t.id, forces: [{ from: origin!, units: own }] });
      }
    } else if (isSz(origin!) && !isSz(t.id) && cargo.length) {
      act({ type: 'offload', zone: origin!, territory: t.id, units: cargo });
    } else {
      act({ type: 'move', from: origin!, to: t.id, units: own, ...(t.via ? { via: t.via } : {}) });
    }
    reset();
  };

  const picks: SpacePick[] = origin
    ? targets.map((t) => ({ id: t.id, color: mode === 'combat' ? '#e05555' : '#7be0a3' }))
    : origins.map((id) => ({ id }));

  return (
    <>
      <div className="ax-sheet">
        <div className="ig-lab">
          {mode === 'combat'
            ? 'Combat move. Pick units, then the space to attack. Each attack resolves at once.'
            : 'Noncombat move. Reposition, land aircraft, load and offload transports.'}
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
              <Chip label="Change origin" onTap={reset} />
            </div>
            <div className="ax-units">
              {myStacksAt(origin).filter((s) => s.key !== 'factory').map((s, i) => (
                <div key={`${s.key}-${i}`} className="ax-unit-row">
                  <span>{UNITS[s.key].name}{s.power === 'china' ? ' (China)' : ''} × {s.count}</span>
                  <Stepper value={take[s.key] ?? 0} max={s.count} onChange={(n) => setTake((t) => ({ ...t, [s.key]: n }))} />
                </div>
              ))}
              {Object.entries(cargoAt(origin)).map(([k, n]) => (
                <div key={`cargo-${k}`} className="ax-unit-row">
                  <span>{UNITS[k as UnitKey].name} aboard × {n}</span>
                  <Stepper value={take[`cargo:${k}`] ?? 0} max={n ?? 0} onChange={(v) => setTake((t) => ({ ...t, [`cargo:${k}`]: v }))} />
                </div>
              ))}
            </div>
            <div className="ax-row ax-wrap">
              {targets.map((t) => (
                <Chip
                  key={`${t.id}-${t.via ?? ''}`}
                  label={`${mode === 'combat' ? (t.amphibious ? 'Assault' : 'Attack') : isSz(origin) && !isSz(t.id) ? 'Offload to' : 'To'} ${spaceName(t.id)}${t.via ? ` via ${spaceName(t.via)}` : ''}`}
                  tone={mode === 'combat' ? 'danger' : 'gold'}
                  onTap={() => doMove(t)}
                />
              ))}
              {loadZones.map((z) => (
                <Chip
                  key={`load-${z}`}
                  label={`Load into ${spaceName(z)}`}
                  tone="gold"
                  onTap={() => {
                    const own = picked.filter(([k]) => !isCargoKey(k) && !SEA_KEYS.includes(baseKey(k)) && !AIR_KEYS.includes(baseKey(k)))
                      .map(([key, count]) => ({ key: baseKey(key), count }));
                    act({ type: 'load', zone: z, territory: origin!, units: own });
                    reset();
                  }}
                />
              ))}
              {targets.length === 0 && loadZones.length === 0 && (
                <span style={{ fontSize: 12.5, opacity: 0.6 }}>Set unit counts to see destinations.</span>
              )}
            </div>
          </>
        )}
      </div>
      <MapPanel view={view} picks={picks} onPick={(id) => {
        if (!origin) { if (origins.includes(id)) setOrigin(id); return; }
        const t = targets.find((x) => x.id === id);
        if (t) doMove(t);
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
  const deciderIsDefender = d && d.type !== 'retreat' && (d as { side?: string }).side === 'defender';
  return (
    <div className="ax-sheet">
      <div className="ig-lab">Battle · {spaceName(c.space)} · round {b.round}</div>
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
            {deciderIsDefender ? 'Defender picks' : 'Attacker picks'} {needed} {needed === 1 ? 'casualty' : 'casualties'}{picked.length ? `, ${picked.length} picked` : ''}
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
  const [key, setKey] = useState<UnitKey | 'china' | null>(null);
  const spots = useMemo(() => {
    if (!key) return [];
    if (key === 'china') {
      const claimable = new Set(['kiangsu', 'manchuria']);
      return AXIS_MAP.territories
        .filter((t) => (t.isChinese || claimable.has(t.id))
          && view.control[t.id] != null
          && (view.control[t.id] === 'china' || POWERS[view.control[t.id] as PowerKey]?.coalition === 'allies')
          && (view.board[t.id] ?? []).reduce((n, st) => n + st.count, 0) < 3)
        .map((t) => t.id);
    }
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
        <div className="ig-lab">Mobilize · place purchases at your industrial complexes</div>
        {staged.length === 0 && view.chinaGrant === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>Nothing staged.</div>}
        <div className="ax-row ax-wrap">
          {staged.map(([k, n]) => (
            <Chip key={k} label={`${UNITS[k].name} × ${n}${key === k ? ' ✓' : ''}`} tone={key === k ? 'gold' : 'plain'} onTap={() => setKey(key === k ? null : k)} />
          ))}
          {view.chinaGrant > 0 && (
            <Chip label={`Chinese infantry × ${view.chinaGrant}${key === 'china' ? ' ✓' : ''}`} tone={key === 'china' ? 'gold' : 'plain'} onTap={() => setKey(key === 'china' ? null : 'china')} />
          )}
        </div>
        {key && (
          <div className="ax-row ax-wrap">
            {spots.map((id) => (
              <Chip
                key={id}
                label={`Place at ${spaceName(id)}`}
                tone="gold"
                onTap={() => act(key === 'china' ? { type: 'placeChina', space: id } : { type: 'place', space: id, key, count: 1 })}
              />
            ))}
            {spots.length === 0 && <span style={{ fontSize: 12.5, opacity: 0.6 }}>No legal placement for that unit.</span>}
          </div>
        )}
        <div className="ax-row">
          <Chip label="Collect income" tone="gold" onTap={() => act({ type: 'endPhase' })} />
        </div>
      </div>
      <MapPanel
        view={view}
        picks={key ? spots.map((id) => ({ id, color: '#7be0a3' })) : []}
        onPick={(id) => { if (key && spots.includes(id)) act(key === 'china' ? { type: 'placeChina', space: id } : { type: 'place', space: id, key, count: 1 }); }}
        focusSpace={null}
      />
    </>
  );
}

// The nation panel: assets lineup, IPCs, techs, and the reference card
// (the play-side unit chart · the mod ships no reference cards, so this IS
// the personal card).
function NationPanel({ view, onClose }: { view: AxisView; onClose: () => void }) {
  const me = view.active;
  const p = view.powers[me];
  const counts: Partial<Record<UnitKey, number>> = {};
  for (const stacks of Object.values(view.board)) {
    for (const st of stacks) {
      if (st.power !== me) continue;
      counts[st.key] = (counts[st.key] ?? 0) + st.count;
      for (const c of st.cargo ?? []) counts[c.key] = (counts[c.key] ?? 0) + c.count;
    }
  }
  const territories = AXIS_MAP.territories.filter((t) => view.control[t.id] === me).length;
  return (
    <div className="ax-nation" onClick={onClose}>
      <div className="ax-nation-card ig-glass" onClick={(e) => e.stopPropagation()} style={{ borderColor: powerHex(me) }}>
        <div className="ax-row" style={{ justifyContent: 'space-between' }}>
          <b style={{ color: powerHex(me), fontSize: 18, letterSpacing: '.04em' }}>{POWERS[me].name}</b>
          <button className="ax-chip" onClick={onClose}>Close</button>
        </div>
        <div className="ax-row" style={{ gap: 18, margin: '6px 0 10px' }}>
          <span className="ig-num"><b>{p.ipcs}</b> IPCs</span>
          <span className="ig-num">+{p.production} production</span>
          <span className="ig-num">{territories} territories</span>
        </div>
        {p.techs.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="ig-lab">Developments</div>
            <div className="ax-row ax-wrap" style={{ marginTop: 4 }}>
              {p.techs.map((t: TechKey) => <span key={t} className="ax-chip" style={{ cursor: 'default' }}>{TECH_BY_KEY[t].name}</span>)}
            </div>
          </div>
        )}
        <div className="ig-lab">Forces & reference</div>
        <table className="ax-ref">
          <thead>
            <tr><th></th><th>Have</th><th>Cost</th><th>Att</th><th>Def</th><th>Move</th></tr>
          </thead>
          <tbody>
            {REFERENCE.map((k) => (
              <tr key={k} className={counts[k] ? '' : 'dim'}>
                <td>{UNITS[k].name}</td>
                <td className="ig-num">{counts[k] ?? 0}</td>
                <td className="ig-num">{UNITS[k].cost}</td>
                <td className="ig-num">{UNITS[k].attack || '·'}</td>
                <td className="ig-num">{UNITS[k].defense || '·'}</td>
                <td className="ig-num">{UNITS[k].move || '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 8 }}>
          Infantry attack at 2 with matching artillery. Battleships take two hits. One AA gun fires per territory.
        </div>
      </div>
    </div>
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
  const [showNation, setShowNation] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  return (
    <div className="ax-page">
      <header className="ax-head ig-glass">
        <div>
          <div className="ig-lab">Axis & Allies · {view.options.scenario} · {WIN_CONDITIONS[view.options.winCondition].label} · Round {view.round}</div>
          <b style={{ color: power.color, fontSize: 17, letterSpacing: '.03em' }}>{power.name}</b>
        </div>
        <div className="ax-head-stats">
          <span className="ig-num" title="IPCs on hand"><b>{p.ipcs}</b> IPC</span>
          <button className="ax-chip" onClick={() => setShowNation(true)}>Nation</button>
          <button className="ax-chip" aria-label="Rules" onClick={() => setShowIntro(true)}>?</button>
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

      {showNation && <NationPanel view={view} onClose={() => setShowNation(false)} />}
      {showIntro && (
        <GameIntro intro={AXIS_INTRO} onClose={() => setShowIntro(false)} onWalkthrough={() => setShowNation(false)} />
      )}
    </div>
  );
}
