// Player device for Axis & Allies Anniversary · the expanded turn portal.
// Board-first: ONE persistent interactive map fills the screen; the active
// phase publishes its tap targets onto it. Menus live in a collapsible LEFT
// glass panel (list rows, price on the right). Purchases stage into the
// printed mobilization zone. The IPC bank sits bottom-right; tapping it
// shows the actual note pieces, and income makes the bills fly in.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AXIS_MAP, POWERS, UNITS, TECHS, TECH_BY_KEY, RESEARCH_DIE_COST, CHINA_COLOR, WIN_CONDITIONS,
  type AxisView, type AxisAction, type PowerKey, type UnitKey, type UnitStack, type TechKey,
} from '@bge/shared';
import { AxisTable, useAxisManifest, useSceneReady, SPACE_CENTER, px2r, type FocusTarget, type SpacePick, type StagedStack, type AxisManifest, type OrderArrow } from './AxisScene';
import { AxisLoading } from './AxisBoard';
import { GameIntro, type Intro } from '../ttr/GameIntro';

type Act = (a: AxisAction & { asPower?: PowerKey }) => void;

// what a phase sheet publishes onto the shared map
export interface MapCtl {
  picks: SpacePick[];
  onPick: (id: string) => void;
  focusSpace: string | null;
  arrows?: OrderArrow[];
  selectedKeys?: Record<string, Set<string>>;
  onStackTap?: (spaceId: string, power: string, key: string) => void;
  onRegionTap?: (id: string) => void;
}
type PublishMap = (ctl: MapCtl) => void;
const MAP_IDLE: MapCtl = { picks: [], onPick: () => {}, focusSpace: null };

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
    { label: 'Purchases stage first', detail: 'Bought units wait in the mobilization zone on the board and enter play at your industrial complexes during mobilize, limited by each territory\'s income value.' },
    { label: 'Transports and carriers', detail: 'Transports carry one land unit plus one infantry; offloading into a fight is an amphibious assault, with battleships and cruisers bombarding ahead of the landing. Carriers hold two fighters.' },
    { label: 'Income and objectives', detail: 'Collect your production at turn end (plus national objectives if enabled). Capture an enemy capital and their unspent money is yours.' },
  ],
  rulebook: '/axis/rulebook.pdf',
  walkthrough: [
    { title: 'The map is your controller', body: 'Your whole nation is on the board. Anything you can tap pulses gold on the map, and every tap is mirrored as a button in the left panel · use whichever is easier. The panel collapses if you want the whole map.' },
    { title: 'Buying units', body: 'In PURCHASE UNITS, tap a row to buy it. Your purchases stand in the MOBILIZATION ZONE box printed on the board · everyone can see them · and they deploy to your factories at the end of your turn.' },
    { title: 'Declaring an attack', body: 'In COMBAT MOVE, tap the space your forces start in, set how many of each unit go, then tap a red target. The battle starts immediately · dice, casualties, the lot · and the TV flies in to watch.' },
    { title: 'Fighting a battle', body: 'Tap ROLL THE DICE to fire. When your side takes hits, you choose which units die. Between rounds the attacker chooses: press on or retreat. Submarines may slip away instead of fighting.' },
    { title: 'Bombing raids', body: 'Send only bombers at a territory with an enemy factory and you will be offered a STRATEGIC BOMBING RAID: their AA fires first, your survivors deal dice of damage that chokes what the factory can build.' },
    { title: 'Amphibious assaults', body: 'Load infantry onto transports in NONCOMBAT MOVE. Next turn, start an attack from the sea zone: pick the troops aboard plus any battleships and cruisers, and tap the shore. The big ships bombard before the landing.' },
    { title: 'Noncombat and mobilize', body: 'After combat, reposition anything that did not fight, land your aircraft somewhere friendly, and place your staged purchases at industrial complexes. Each factory places up to the territory\'s printed income number.' },
    { title: 'Income and the win', body: 'Your turn ends by collecting income · watch the notes fly into your bank at the bottom right. Tap the bank any time to count your bills. Hold enough victory cities at the end of a round and your side wins.' },
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

// ---------- per-phase sheets (rendered inside the left panel) ----------

function ResearchSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const [dice, setDice] = useState(1);
  const p = view.powers[view.active];
  useEffect(() => { map(MAP_IDLE); }, []);
  if (view.awaitingChart) {
    return (
      <div className="ax-sheet-body">
        <div className="ig-lab">Breakthrough · choose a chart</div>
        <div className="ax-col">
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
    <div className="ax-sheet-body">
      <div className="ig-lab">Research & Development</div>
      <div className="ax-row" style={{ alignItems: 'center', gap: 14 }}>
        <Stepper value={dice} max={Math.floor(p.ipcs / RESEARCH_DIE_COST)} onChange={setDice} />
        <span style={{ opacity: 0.75, fontSize: 13 }}>{cost} IPCs. Any 6 is a breakthrough. Failed researchers stay{p.researchTokens ? ` (${p.researchTokens} standing by)` : ''}.</span>
      </div>
      <div className="ax-row ax-wrap">
        <Chip label={`Roll ${dice} research ${dice === 1 ? 'die' : 'dice'}`} tone="gold" disabled={cost > p.ipcs || dice < 1} onTap={() => act({ type: 'buyResearch', dice })} />
        <Chip label="Skip research" onTap={() => act({ type: 'endPhase' })} />
      </div>
    </div>
  );
}

function PurchaseSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const p = view.powers[view.active];
  const shipyards = p.techs.includes('improvedShipyards');
  const costOf = (k: UnitKey) => (shipyards && { battleship: 17, carrier: 11, cruiser: 10, destroyer: 7, transport: 6, submarine: 5 }[k as string]) || UNITS[k].cost;
  const staged = Object.entries(p.staging) as [UnitKey, number][];
  useEffect(() => { map({ ...MAP_IDLE, focusSpace: 'mobilization' }); }, []);
  // repairable factories
  const damaged = AXIS_MAP.territories.filter((t) =>
    view.control[t.id] === view.active && (view.factoryDamage[t.id] ?? 0) > 0
    && (view.board[t.id] ?? []).some((s) => s.key === 'factory'));
  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">Purchase units · {p.ipcs} IPCs</div>
      <div className="ax-list">
        {BUYABLE.map((k) => {
          const cost = costOf(k);
          const afford = p.ipcs >= cost;
          const have = p.staging[k] ?? 0;
          return (
            <button
              key={k}
              className="ax-list-row"
              disabled={!afford}
              title={afford ? undefined : `Costs ${cost} IPCs, you have ${p.ipcs}`}
              onClick={() => act({ type: 'buy', key: k, count: 1 })}
            >
              <span>{UNITS[k].name}{have > 0 ? <em className="ax-have"> ×{have}</em> : null}</span>
              <span className="ig-num">{cost}</span>
            </button>
          );
        })}
      </div>
      {staged.length > 0 && (
        <div>
          <div className="ig-lab" style={{ margin: '8px 0 4px' }}>In the mobilization zone · tap to return</div>
          <div className="ax-row ax-wrap">
            {staged.map(([k, n]) => (
              <Chip key={k} label={`${n} ${UNITS[k].name}`} onTap={() => act({ type: 'unbuy', key: k, count: 1 })} />
            ))}
          </div>
        </div>
      )}
      {damaged.length > 0 && (
        <div>
          <div className="ig-lab" style={{ margin: '8px 0 4px' }}>Factory repairs · 1 IPC per point</div>
          <div className="ax-row ax-wrap">
            {damaged.map((t) => (
              <Chip
                key={t.id}
                label={`Repair ${t.name} (${view.factoryDamage[t.id]})`}
                disabled={p.ipcs < 1}
                onTap={() => act({ type: 'repair', territory: t.id, count: 1 })}
              />
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

function MoveFlow({ view, act, mode, map }: { view: AxisView; act: Act; mode: 'combat' | 'noncombat'; map: PublishMap }) {
  const me = view.active;
  const [origin, setOrigin] = useState<string | null>(null);
  const [take, setTake] = useState<Record<TakeKey, number>>({});
  const [sbrAsk, setSbrAsk] = useState<string | null>(null); // target awaiting raid-vs-assault choice

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
  const onlyBombers = ownKeys.length > 0 && ownKeys.every((k) => k === 'bomber') && !anyCargo;
  const hasLand = ownKeys.some((k) => !SEA_KEYS.includes(k) && !AIR_KEYS.includes(k));

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

  interface Target { id: string; via?: string; amphibious?: boolean; sbr?: boolean }
  const targets = useMemo((): Target[] => {
    if (!origin || picked.length === 0) return [];
    const out: Target[] = [];
    const seaOrigin = isSz(origin);
    const enemyFactory = (id: string) => !isSz(id) && hostileControl(id) && (view.board[id] ?? []).some((s) => s.key === 'factory');

    if (mode === 'combat') {
      const want = (id: string) => (isSz(id) ? enemyAt(id) : enemyAt(id) || hostileControl(id));
      if (seaOrigin) {
        if (anyCargo) {
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
          if (want(n)) out.push({ id: n, sbr: onlyBombers && enemyFactory(n) });
        }
        if (allTanks) {
          for (const { id } of ring2(origin, 'land')) if (want(id) && passable(id)) out.push({ id });
        }
        if (allAir) {
          const range = Math.min(...ownKeys.map((k) => UNITS[k].move)) - 1;
          let frontier = [origin];
          const seen = new Set(frontier);
          for (let d = 1; d <= range; d++) {
            const next: string[] = [];
            for (const sp of frontier) {
              for (const n of neighborsOf(sp)) {
                if (seen.has(n)) continue;
                seen.add(n);
                if (want(n) && (isSz(n) || passable(n)) && !out.some((t) => t.id === n)) {
                  out.push({ id: n, sbr: onlyBombers && enemyFactory(n) });
                }
                next.push(n);
              }
            }
            frontier = next;
          }
        }
      }
      return out;
    }

    // noncombat: never into or through hostile or neutral ground
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

  const loadZones = useMemo(() => {
    if (mode !== 'noncombat' || !origin || isSz(origin) || !hasLand) return [];
    return (TERR[origin]?.coastTo ?? []).filter((z) =>
      (view.board[z] ?? []).some((st) => st.power === me && st.key === 'transport'));
  }, [origin, take, mode, view.board]);

  const [pending, setPending] = useState<Target | null>(null);
  const reset = () => { setOrigin(null); setTake({}); setSbrAsk(null); setPending(null); };

  const commit = (t: Target, forceSbr?: boolean) => {
    const own = picked.filter(([k]) => !isCargoKey(k)).map(([key, count]) => ({ key: baseKey(key), count }));
    const cargo = picked.filter(([k]) => isCargoKey(k)).map(([key, count]) => ({ key: baseKey(key), count }));
    if (mode === 'combat') {
      if (t.sbr && forceSbr === undefined) { setSbrAsk(t.id); return; } // popup: raid or assault?
      if (forceSbr) {
        const bombers = own.find((u) => u.key === 'bomber')?.count ?? 0;
        act({ type: 'sbr', target: t.id, forces: [{ from: origin!, bombers }] });
      } else if (t.amphibious) {
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

  // publish the tap targets onto the shared map
  useEffect(() => {
    const picks: SpacePick[] = origin
      ? targets.map((t) => ({ id: t.id, color: mode === 'combat' ? '#e05555' : '#7be0a3' }))
      : origins.map((id) => ({ id }));
    map({
      picks,
      onPick: (id) => {
        if (!origin) { if (origins.includes(id)) setOrigin(id); return; }
        const t = targets.find((x) => x.id === id);
        if (t) setPending(t); // draw the arrow; the big button executes
      },
      focusSpace: origin,
      arrows: pending && origin ? [{
        from: [SPACE_CENTER[origin] ?? [0, 0]],
        to: SPACE_CENTER[pending.id] ?? [0, 0],
        color: mode === 'combat' ? '#e05555' : '#7be0a3',
      }] : [],
      selectedKeys: origin
        ? { [origin]: new Set(Object.entries(take).filter(([, n]) => n > 0).map(([k]) => isCargoKey(k) ? `${me}:transport` : `${me}:${k}`)) }
        : {},
      onRegionTap: (id) => {
        if (!origin) { if (origins.includes(id)) setOrigin(id); return; }
        if (id === origin) return;
        const t = targets.find((x) => x.id === id);
        if (t) { setPending(t); return; }
        if (origins.includes(id)) { setOrigin(id); setTake({}); setPending(null); }
      },
      onStackTap: (spaceId, power, key) => {
        const mine = power === me || (me === 'usa' && power === 'china');
        if (!mine) return;
        if (origin && origin !== spaceId) { setOrigin(spaceId); setTake({ [key]: 1 }); setPending(null); return; }
        if (!origin) setOrigin(spaceId);
        const stack = (view.board[spaceId] ?? []).find((st) => st.power === power && st.key === key);
        const max = stack?.count ?? 0;
        setTake((t) => ({ ...t, [key]: Math.min(max, (t[key] ?? 0) + 1) }));
      },
    });
  }, [origin, targets, origins, mode, pending, take]);

  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">
        {mode === 'combat'
          ? 'Combat move. Pick units, then the space to attack. Each attack resolves at once.'
          : 'Noncombat move. Reposition, land aircraft, load and offload transports. No hostile or neutral ground.'}
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
            <Chip label="Back" onTap={reset} />
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
                label={`${pending?.id === t.id ? '● ' : ''}${mode === 'combat' ? (t.amphibious ? 'Assault' : 'Attack') : isSz(origin) && !isSz(t.id) ? 'Offload to' : 'To'} ${spaceName(t.id)}${t.via ? ` via ${spaceName(t.via)}` : ''}`}
                tone={mode === 'combat' ? 'danger' : 'gold'}
                onTap={() => setPending(t)}
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
      {origin && (
        <div className="ax-order">
          {pending ? (
            <>
              <button className="ax-order-go" onClick={() => commit(pending)}>
                {mode === 'combat' ? (pending.sbr ? 'STRIKE' : pending.amphibious ? 'ASSAULT' : 'ATTACK') : 'MOVE'} · {spaceName(pending.id)}
              </button>
              <button className="ax-order-cancel" onClick={() => setPending(null)}>✕</button>
            </>
          ) : (
            <button className="ax-order-back" onClick={reset}>Back</button>
          )}
        </div>
      )}
      {sbrAsk && (
        <div className="ax-modal">
          <div className="ig-glass ax-modal-card">
            <div className="ig-lab">Bombers over {spaceName(sbrAsk)}</div>
            <p style={{ fontSize: 13.5, opacity: 0.85, margin: '6px 0 12px' }}>
              That territory holds an enemy industrial complex. Bomb the factory, or attack the defenders?
            </p>
            <div className="ax-col">
              <Chip label="Strategic bombing raid" tone="gold" onTap={() => { const t = targets.find((x) => x.id === sbrAsk); if (t) commit(t, true); }} />
              <Chip label="Attack the defenders" tone="danger" onTap={() => { const t = targets.find((x) => x.id === sbrAsk); if (t) commit(t, false); }} />
              <Chip label="Never mind" onTap={() => setSbrAsk(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BattleSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const c = view.combat!;
  const b = c.battle;
  const d = b.decision;
  const [picked, setPicked] = useState<number[]>([]);
  const byUid = new Map([...b.attacker, ...b.defender].map((u) => [u.uid, u]));
  const needed = d?.type === 'casualties' ? d.buckets.reduce((n, bk) => n + Math.min(bk.hits, bk.eligible.length), 0) : 0;
  const deciderIsDefender = d && d.type !== 'retreat' && (d as { side?: string }).side === 'defender';
  useEffect(() => { map({ ...MAP_IDLE, focusSpace: c.space }); }, [c.space]);
  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">Battle · {spaceName(c.space)} · round {b.round}</div>
      {!d && (
        <button className="ax-mega" onClick={() => act({ type: 'battleRoll' })}>ROLL THE DICE</button>
      )}
      {d?.type === 'retreat' && (
        <div className="ax-col">
          <button className="ax-mega" onClick={() => act({ type: 'battleRetreat', retreat: false })}>PRESS THE ATTACK</button>
          <button className="ax-mega danger" onClick={() => act({ type: 'battleRetreat', retreat: true })}>RETREAT</button>
        </div>
      )}
      {d?.type === 'submerge' && (
        <div className="ax-col">
          <button className="ax-mega" onClick={() => act({ type: 'battleSubmerge', uids: [] })}>STRIKE</button>
          <button className="ax-mega" onClick={() => act({ type: 'battleSubmerge', uids: d.subs })}>SUBMERGE</button>
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
          <button className="ax-mega" disabled={picked.length < needed} onClick={() => { act({ type: 'battleCasualties', uids: picked }); setPicked([]); }}>
            CONFIRM CASUALTIES
          </button>
        </>
      )}
    </div>
  );
}

function MobilizeSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const p = view.powers[view.active];
  const staged = Object.entries(p.staging) as [UnitKey, number][];
  const [sel, setSel] = useState<Record<string, number>>({}); // multi-select: key -> count
  const selected = Object.entries(sel).filter(([, n]) => n > 0);
  const spots = useMemo(() => {
    if (!selected.length) return [];
    const keys = selected.map(([k]) => k as UnitKey | 'china');
    const spotsFor = (key: UnitKey | 'china'): Set<string> => {
      if (key === 'china') {
        const claimable = new Set(['kiangsu', 'manchuria']);
        return new Set(AXIS_MAP.territories
          .filter((t) => (t.isChinese || claimable.has(t.id))
            && view.control[t.id] != null
            && (view.control[t.id] === 'china' || POWERS[view.control[t.id] as PowerKey]?.coalition === 'allies')
            && (view.board[t.id] ?? []).reduce((n, st) => n + st.count, 0) < 3)
          .map((t) => t.id));
      }
      const sea = SEA_KEYS.includes(key);
      if (!sea) {
        return new Set(AXIS_MAP.territories
          .filter((t) => view.control[t.id] === view.active
            && (key === 'factory'
              ? t.ipc >= 1 && !(view.board[t.id] ?? []).some((s) => s.key === 'factory')
              : (view.board[t.id] ?? []).some((s) => s.key === 'factory')))
          .map((t) => t.id));
      }
      return new Set(AXIS_MAP.seaZones
        .filter((z) => (z.coastTo ?? []).some((tid) =>
          view.control[tid] === view.active && (view.board[tid] ?? []).some((s) => s.key === 'factory')))
        .map((z) => z.id));
    };
    // intersection: a spot must accept EVERY selected type
    let acc: Set<string> | null = null;
    for (const k of keys) {
      const spotSet = spotsFor(k);
      acc = acc == null ? spotSet : new Set([...acc].filter((x: string) => spotSet.has(x)));
    }
    return [...(acc ?? new Set<string>())];
  }, [sel, view]);

  const placeAll = (space: string) => {
    for (const [k, n] of selected) {
      for (let i = 0; i < n; i++) {
        act(k === 'china' ? { type: 'placeChina', space } : { type: 'place', space, key: k as UnitKey, count: 1 });
      }
    }
    setSel({});
  };

  useEffect(() => {
    map({
      picks: spots.map((id) => ({ id, color: '#7be0a3' })),
      onPick: (id) => { if (spots.includes(id)) placeAll(id); },
      focusSpace: null,
    });
  }, [spots.join(','), selected.map(([k, n]) => k + n).join(',')]);

  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">Mobilize · pick units, then tap the destination</div>
      {staged.length === 0 && view.chinaGrant === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>Nothing staged.</div>}
      <div className="ax-units">
        {staged.map(([k, n]) => (
          <div key={k} className="ax-unit-row">
            <span>{UNITS[k].name} × {n}</span>
            <Stepper value={sel[k] ?? 0} max={n} onChange={(v) => setSel((s) => ({ ...s, [k]: v }))} />
          </div>
        ))}
        {view.chinaGrant > 0 && (
          <div className="ax-unit-row">
            <span>Chinese infantry × {view.chinaGrant}</span>
            <Stepper value={sel.china ?? 0} max={view.chinaGrant} onChange={(v) => setSel((s) => ({ ...s, china: v }))} />
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="ax-row ax-wrap">
          {spots.map((id) => (
            <Chip key={id} label={`Place at ${spaceName(id)}`} tone="gold" onTap={() => placeAll(id)} />
          ))}
          {spots.length === 0 && <span style={{ fontSize: 12.5, opacity: 0.6 }}>No space accepts that whole selection.</span>}
        </div>
      )}
      <div className="ax-row">
        <Chip label="Collect income" tone="gold" onTap={() => act({ type: 'endPhase' })} />
      </div>
    </div>
  );
}

// ---------- nation panel (assets + reference card) ----------

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

// ---------- the IPC bank: counter, bills, income fly-in ----------

function billArt(manifest: AxisManifest | null, denom: 1 | 5 | 10): string | null {
  const nick = denom === 1 ? /ONE/ : denom === 5 ? /FIVE/ : /TEN/;
  const deck = (manifest as unknown as { ipcDecks?: { nick: string; face: string | null }[] })?.ipcDecks?.find((d) => nick.test(d.nick ?? ''));
  return deck?.face ?? null;
}

function IpcBank({ view, manifest }: { view: AxisView; manifest: AxisManifest | null }) {
  const me = view.active;
  const ipcs = view.powers[me].ipcs;
  const [open, setOpen] = useState(false);
  const [flying, setFlying] = useState(0);
  const prev = useRef(ipcs);

  useEffect(() => {
    if (ipcs > prev.current) {
      setFlying(Math.min(6, Math.max(3, Math.round((ipcs - prev.current) / 6))));
      const t = setTimeout(() => setFlying(0), 1600);
      prev.current = ipcs;
      return () => clearTimeout(t);
    }
    prev.current = ipcs;
  }, [ipcs]);

  // greedy note split
  const tens = Math.floor(ipcs / 10);
  const fives = Math.floor((ipcs % 10) / 5);
  const ones = ipcs % 5;
  const oneArt = billArt(manifest, 1);
  const fiveArt = billArt(manifest, 5);
  const tenArt = billArt(manifest, 10);

  return (
    <>
      <button className="ax-bank ig-glass" onClick={() => setOpen(true)} title="Your IPC notes">
        <span className="ig-lab">IPC</span>
        <b className="ig-num">{ipcs}</b>
      </button>
      {flying > 0 && Array.from({ length: flying }, (_, i) => (
        <span key={i} className="ax-bill-fly" style={{ animationDelay: `${i * 0.14}s`, backgroundImage: oneArt ? `url(${oneArt})` : undefined }} />
      ))}
      {open && (
        <div className="ax-nation" onClick={() => setOpen(false)}>
          <div className="ax-nation-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ax-row" style={{ justifyContent: 'space-between' }}>
              <b>The bank · {ipcs} IPCs</b>
              <button className="ax-chip" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="ax-bills">
              {[
                { n: tens, denom: 10, art: tenArt },
                { n: fives, denom: 5, art: fiveArt },
                { n: ones, denom: 1, art: oneArt },
              ].map(({ n, denom, art }) => (
                n > 0 && (
                  <div key={denom} className="ax-bill-stack">
                    {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                      <span key={i} className="ax-bill" style={{ left: i * 9, top: -i * 2, backgroundImage: art ? `url(${art})` : undefined }} />
                    ))}
                    <span className="ax-bill-label ig-num">{n} × {denom}</span>
                  </div>
                )
              ))}
              {ipcs === 0 && <span style={{ opacity: 0.6, fontSize: 13 }}>Empty. Capture something.</span>}
            </div>
          </div>
        </div>
      )}
    </>
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
  const manifest = useAxisManifest();
  const ready = useSceneReady();
  const [showNation, setShowNation] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mapCtl, setMapCtl] = useState<MapCtl>(MAP_IDLE);
  const publish: PublishMap = (ctl) => setMapCtl(ctl);

  const staged: StagedStack[] = useMemo(() => {
    const out: StagedStack[] = [];
    for (const pw of view.turnOrder) {
      for (const [key, count] of Object.entries(view.powers[pw].staging)) {
        if (count) out.push({ power: pw, key: key as UnitKey, count: count as number });
      }
    }
    return out;
  }, [view.powers]);

  const focus: FocusTarget | null = useMemo(() => {
    if (!mapCtl.focusSpace) return null;
    const c = SPACE_CENTER[mapCtl.focusSpace];
    if (!c) return null;
    const [x, z] = px2r(c[0], c[1]);
    return { x, z, dist: 18 };
  }, [mapCtl.focusSpace]);

  if (!manifest) return <AxisLoading label="Reading the mod" />;

  return (
    <div className="ax-page2">
      <div className="ax-map-bg">
        <AxisTable
          manifest={manifest}
          board={view.board}
          control={view.control}
          focus={focus}
          picks={mapCtl.picks}
          onPick={mapCtl.onPick}
          staged={staged}
          arrows={mapCtl.arrows}
          selectedKeys={mapCtl.selectedKeys}
          onStackTap={mapCtl.onStackTap}
          onRegionTap={mapCtl.onRegionTap}
        />
      </div>
      {!ready && <AxisLoading label="Setting up the table" overlay />}

      <div className={`ax-left ig-glass${collapsed ? ' collapsed' : ''}`}>
        <header className="ax-left-head">
          <div>
            <div className="ig-lab">{view.options.scenario} · {WIN_CONDITIONS[view.options.winCondition].label} · Round {view.round}</div>
            <b style={{ color: power.color, fontSize: 16, letterSpacing: '.03em' }}>{power.name}</b>
          </div>
          <div className="ax-row" style={{ gap: 6 }}>
            <button className="ax-chip" onClick={() => setShowNation(true)}>Nation</button>
            <button className="ax-chip" aria-label="Rules" onClick={() => setShowIntro(true)}>?</button>
          </div>
        </header>
        {error && <div className="ax-error">{error}</div>}
        {view.phase === 'rnd' && <ResearchSheet view={view} act={actAs} map={publish} />}
        {view.phase === 'purchase' && <PurchaseSheet view={view} act={actAs} map={publish} />}
        {view.phase === 'combatMove' && <MoveFlow view={view} act={actAs} mode="combat" map={publish} />}
        {view.phase === 'battle' && view.combat && <BattleSheet view={view} act={actAs} map={publish} />}
        {view.phase === 'noncombat' && <MoveFlow view={view} act={actAs} mode="noncombat" map={publish} />}
        {view.phase === 'mobilize' && <MobilizeSheet view={view} act={actAs} map={publish} />}
        {view.phase === 'income' && (
          <div className="ax-sheet-body">
            <div className="ig-lab">Income collected</div>
            <div style={{ fontSize: 14 }}>{power.name} collected <b className="ig-num">{p.lastIncome}</b> IPCs. The production screen is on the TV.</div>
            <div className="ax-row">
              <Chip label="End turn" tone="gold" onTap={() => actAs({ type: 'endPhase' })} />
            </div>
          </div>
        )}
        {view.phase === 'gameOver' && (
          <div className="ax-sheet-body">
            <div className="ig-lab">Game over</div>
            <div style={{ fontSize: 15 }}>{view.winner === 'axis' ? 'The Axis' : 'The Allies'} win.</div>
          </div>
        )}
      </div>
      <button
        className="ax-left-tab ig-glass"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Open the menu' : 'Collapse to the map'}
      >{collapsed ? '›' : '‹'}</button>

      <IpcBank view={view} manifest={manifest} />

      {showNation && <NationPanel view={view} onClose={() => setShowNation(false)} />}
      {showIntro && (
        <GameIntro intro={AXIS_INTRO} onClose={() => setShowIntro(false)} onWalkthrough={() => setShowNation(false)} />
      )}
    </div>
  );
}
