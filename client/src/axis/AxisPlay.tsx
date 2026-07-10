// Player device for Axis & Allies Anniversary · the expanded turn portal.
// Board-first: ONE persistent interactive map fills the screen; the active
// phase publishes its tap targets onto it. Menus live in a collapsible LEFT
// glass panel (list rows, price on the right). Purchases stage into the
// printed mobilization zone. The IPC bank sits bottom-right; tapping it
// shows the actual note pieces, and income makes the bills fly in.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  AXIS_MAP, POWERS, UNITS, TECHS, TECH_BY_KEY, RESEARCH_DIE_COST, CHINA_COLOR, WIN_CONDITIONS,
  type AxisView, type AxisAction, type PowerKey, type UnitKey, type UnitStack, type TechKey,
} from '@bge/shared';
import { AxisTable, useAxisManifest, useSceneReady, SPACE_CENTER, px2r, type FocusTarget, type SpacePick, type StagedStack, type AxisManifest, type OrderArrow } from './AxisScene';
import { AxisLoading } from './AxisBoard';
import UnitIcon from './UnitIcon';
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

// Purchasing lives in a refined center-screen popup over darker glass
// (owner directive): unit silhouette, name, combat line, price; buy on tap,
// return staged units with the small counter.
function PurchaseSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const p = view.powers[view.active];
  const [open, setOpen] = useState(true);
  const shipyards = p.techs.includes('improvedShipyards');
  const costOf = (k: UnitKey) => (shipyards && { battleship: 17, carrier: 11, cruiser: 10, destroyer: 7, transport: 6, submarine: 5 }[k as string]) || UNITS[k].cost;
  const stagedTotal = Object.values(p.staging).reduce((n, c) => n + (c ?? 0), 0);
  useEffect(() => { map({ ...MAP_IDLE, focusSpace: 'mobilization' }); }, []);
  // repairable factories
  const damaged = AXIS_MAP.territories.filter((t) =>
    view.control[t.id] === view.active && (view.factoryDamage[t.id] ?? 0) > 0
    && (view.board[t.id] ?? []).some((s) => s.key === 'factory'));
  return (
    <>
      <div className="ax-sheet-body">
        <div className="ig-lab">Purchase units · {p.ipcs} IPCs</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          {stagedTotal > 0 ? `${stagedTotal} unit${stagedTotal === 1 ? '' : 's'} staged in the mobilization zone.` : 'Nothing bought yet.'}
        </div>
        <div className="ax-row ax-wrap">
          <Chip label="Open the armory" tone="gold" onTap={() => setOpen(true)} />
          <Chip label="Done purchasing" onTap={() => act({ type: 'endPhase' })} />
        </div>
      </div>
      {open && createPortal(
        <div className="ax-modal dark" onClick={() => setOpen(false)}>
          <div className="ax-buy ig-glass" onClick={(e) => e.stopPropagation()}>
            <header className="ax-buy-head">
              <div>
                <div className="ig-lab">Purchase units</div>
                <b className="ig-num" style={{ fontSize: 20 }}>{p.ipcs} IPCs</b>
              </div>
              <button className="ax-chip" onClick={() => setOpen(false)}>Map</button>
            </header>
            <div className="ax-buy-grid">
              {BUYABLE.map((k) => {
                const cost = costOf(k);
                const afford = p.ipcs >= cost;
                const have = p.staging[k] ?? 0;
                const u = UNITS[k];
                return (
                  <div key={k} className={`ax-buy-row${have > 0 ? ' owned' : ''}`}>
                    <span className="ax-buy-icon"><UnitIcon unitKey={k} size={30} title={u.name} /></span>
                    <span className="ax-buy-name">
                      <b>{u.name}</b>
                      <em>{u.attack || '·'} / {u.defense || '·'} / {u.move || '·'}</em>
                    </span>
                    <span className="ax-buy-ctl">
                      {have > 0 && (
                        <>
                          <button className="ax-buy-btn" onClick={() => act({ type: 'unbuy', key: k, count: 1 })} aria-label={`Return one ${u.name}`}>−</button>
                          <b className="ig-num">{have}</b>
                        </>
                      )}
                      <button
                        className="ax-buy-btn buy"
                        disabled={!afford}
                        title={afford ? undefined : `Costs ${cost} IPCs, you have ${p.ipcs}`}
                        onClick={() => act({ type: 'buy', key: k, count: 1 })}
                        aria-label={`Buy one ${u.name}`}
                      >+</button>
                      <span className="ax-buy-price ig-num">{cost}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {damaged.length > 0 && (
              <div className="ax-buy-repairs">
                <div className="ig-lab">Factory repairs · 1 IPC per point</div>
                <div className="ax-row ax-wrap" style={{ marginTop: 6 }}>
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
            <footer className="ax-buy-foot">
              <span style={{ fontSize: 12.5, opacity: 0.7 }}>Purchases stand in the mobilization zone until you mobilize.</span>
              <button className="ax-order-go" onClick={() => act({ type: 'endPhase' })}>DONE PURCHASING</button>
            </footer>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// unit selection: keys are `${space}|${unit}` (or `${space}|cargo:${unit}`),
// so a force can be gathered from SEVERAL regions and sent as one order —
// the HOI4 arrows merge the origins into a single strike.
type TakeKey = string;
const keySpace = (k: TakeKey) => k.slice(0, k.indexOf('|'));
const keyUnitPart = (k: TakeKey) => k.slice(k.indexOf('|') + 1);
const isCargoPart = (part: string) => part.startsWith('cargo:');
const partUnit = (part: string): UnitKey => (isCargoPart(part) ? part.slice(6) : part) as UnitKey;

function MoveFlow({ view, act, mode, map }: { view: AxisView; act: Act; mode: 'combat' | 'noncombat'; map: PublishMap }) {
  const me = view.active;
  const [origin, setOrigin] = useState<string | null>(null); // the focused region
  const [peek, setPeek] = useState<string | null>(null); // any tapped region zooms
  const [take, setTake] = useState<Record<TakeKey, number>>({});
  const [pending, setPending] = useState<Target | null>(null);
  const [sbrAsk, setSbrAsk] = useState<string | null>(null);

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
  const pickedSpaces = [...new Set(picked.map(([k]) => keySpace(k)))];
  const allUnitParts = picked.map(([k]) => keyUnitPart(k));
  const anyCargo = allUnitParts.some(isCargoPart);
  const ownUnits = allUnitParts.filter((p) => !isCargoPart(p)).map(partUnit);
  const onlyBombers = ownUnits.length > 0 && ownUnits.every((k) => k === 'bomber') && !anyCargo;

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

  // legal destinations for ONE origin's picked units
  const targetsFor = (space: string): Target[] => {
    const parts = picked.filter(([k]) => keySpace(k) === space).map(([k]) => keyUnitPart(k));
    if (parts.length === 0) return [];
    const cargoHere = parts.some(isCargoPart);
    const own = parts.filter((p) => !isCargoPart(p)).map(partUnit);
    const tanksOnly = own.length > 0 && own.every((k) => k === 'tank') && !cargoHere;
    const shipsOnly = own.length > 0 && own.every((k) => SEA_KEYS.includes(k)) && !cargoHere;
    const airOnly = own.length > 0 && own.every((k) => AIR_KEYS.includes(k)) && !cargoHere;
    const landHere = own.some((k) => !SEA_KEYS.includes(k) && !AIR_KEYS.includes(k));
    const seaOrigin = isSz(space);
    const out: Target[] = [];
    const enemyFactory = (id: string) => !isSz(id) && hostileControl(id) && (view.board[id] ?? []).some((s) => s.key === 'factory');

    if (mode === 'combat') {
      const want = (id: string) => (isSz(id) ? enemyAt(id) : enemyAt(id) || hostileControl(id));
      if (seaOrigin) {
        if (cargoHere) {
          for (const t of ZONE[space]?.coastTo ?? []) {
            if (want(t) && passable(t)) out.push({ id: t, amphibious: true });
          }
        }
        if (shipsOnly || (own.length > 0 && !cargoHere)) {
          for (const z of neighborsOf(space).filter(isSz)) if (want(z)) out.push({ id: z });
          for (const { id, via } of ring2(space, 'sea')) if (want(id)) out.push({ id, via });
        }
        return out;
      }
      for (const n of neighborsOf(space)) {
        if (isSz(n) && landHere) continue;
        if (!isSz(n) && !passable(n)) continue;
        if (want(n)) out.push({ id: n, sbr: onlyBombers && enemyFactory(n) });
      }
      if (tanksOnly) {
        for (const { id } of ring2(space, 'land')) if (want(id) && passable(id)) out.push({ id });
      }
      if (airOnly) {
        const range = Math.min(...own.map((k) => UNITS[k].move)) - 1;
        let frontier = [space];
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
      return out;
    }

    // noncombat: never into or through hostile or neutral ground
    if (seaOrigin) {
      if (cargoHere) {
        for (const t of ZONE[space]?.coastTo ?? []) {
          if (!isSz(t) && friendly(t) && !enemyAt(t)) out.push({ id: t });
        }
      }
      if (shipsOnly || (own.length > 0 && !cargoHere)) {
        for (const z of neighborsOf(space).filter(isSz)) if (friendly(z)) out.push({ id: z });
        for (const { id, via } of ring2(space, 'sea')) if (friendly(id)) out.push({ id, via });
      }
      return out;
    }
    for (const n of neighborsOf(space)) {
      if (isSz(n)) continue;
      if (friendly(n) && !enemyAt(n) && passable(n)) out.push({ id: n });
    }
    if (tanksOnly || airOnly) {
      for (const { id, via } of ring2(space, 'land')) {
        if (friendly(id) && !enemyAt(id) && passable(id)) out.push({ id, via });
      }
    }
    return out;
  };

  // merged order: a target must be reachable by EVERY origin in the force
  const targets = useMemo((): Target[] => {
    if (pickedSpaces.length === 0) return [];
    let acc: Target[] | null = null;
    for (const space of pickedSpaces) {
      const ts = targetsFor(space);
      if (acc == null) { acc = ts; continue; }
      acc = acc
        .filter((t) => ts.some((x) => x.id === t.id))
        .map((t) => {
          const other = ts.find((x) => x.id === t.id)!;
          return { ...t, amphibious: t.amphibious || other.amphibious, sbr: (t.sbr ?? false) && (other.sbr ?? false) };
        });
    }
    return acc ?? [];
  }, [take, mode, view.board, view.control]);

  const loadZones = useMemo(() => {
    if (mode !== 'noncombat' || !origin || isSz(origin)) return [];
    const landPicked = picked.some(([k]) => keySpace(k) === origin && !isCargoPart(keyUnitPart(k)) && !SEA_KEYS.includes(partUnit(keyUnitPart(k))) && !AIR_KEYS.includes(partUnit(keyUnitPart(k))));
    if (!landPicked) return [];
    return (TERR[origin]?.coastTo ?? []).filter((z) =>
      (view.board[z] ?? []).some((st) => st.power === me && st.key === 'transport'));
  }, [origin, take, mode, view.board]);

  const reset = () => { setOrigin(null); setPeek(null); setTake({}); setSbrAsk(null); setPending(null); };

  const commit = (t: Target, forceSbr?: boolean) => {
    if (mode === 'combat') {
      if (t.sbr && forceSbr === undefined) { setSbrAsk(t.id); return; }
      if (forceSbr) {
        const forces = pickedSpaces.map((space) => ({
          from: space,
          bombers: picked.filter(([k]) => keySpace(k) === space && partUnit(keyUnitPart(k)) === 'bomber')
            .reduce((n, [, c]) => n + c, 0),
        })).filter((f) => f.bombers > 0);
        act({ type: 'sbr', target: t.id, forces });
      } else {
        const forces: { from: string; units: { key: UnitKey; count: number }[] }[] = [];
        let offloadFrom: string | undefined;
        let offloadUnits: { key: UnitKey; count: number }[] = [];
        for (const space of pickedSpaces) {
          const own = picked.filter(([k]) => keySpace(k) === space && !isCargoPart(keyUnitPart(k)))
            .map(([k, count]) => ({ key: partUnit(keyUnitPart(k)), count }));
          const cargo = picked.filter(([k]) => keySpace(k) === space && isCargoPart(keyUnitPart(k)))
            .map(([k, count]) => ({ key: partUnit(keyUnitPart(k)), count }));
          if (own.length) forces.push({ from: space, units: own });
          if (cargo.length && isSz(space)) { offloadFrom = space; offloadUnits = cargo; }
        }
        act({ type: 'attack', target: t.id, forces, ...(offloadFrom ? { offloadFrom, offloadUnits } : {}) });
      }
    } else {
      // noncombat: one move (or offload) per origin, same destination
      for (const space of pickedSpaces) {
        const own = picked.filter(([k]) => keySpace(k) === space && !isCargoPart(keyUnitPart(k)))
          .map(([k, count]) => ({ key: partUnit(keyUnitPart(k)), count }));
        const cargo = picked.filter(([k]) => keySpace(k) === space && isCargoPart(keyUnitPart(k)))
          .map(([k, count]) => ({ key: partUnit(keyUnitPart(k)), count }));
        if (cargo.length && isSz(space) && !isSz(t.id)) {
          act({ type: 'offload', zone: space, territory: t.id, units: cargo });
        }
        if (own.length) {
          const perOrigin = targetsFor(space).find((x) => x.id === t.id);
          act({ type: 'move', from: space, to: t.id, units: own, ...(perOrigin?.via ? { via: perOrigin.via } : {}) });
        }
      }
    }
    reset();
  };

  // publish the interactive layer onto the shared map
  useEffect(() => {
    const picks: SpacePick[] = origin || pickedSpaces.length
      ? targets.map((t) => ({ id: t.id, color: mode === 'combat' ? '#e05555' : '#7be0a3' }))
      : origins.map((id) => ({ id }));
    const selectedKeys: Record<string, Set<string>> = {};
    for (const [k, n] of picked) {
      if (n <= 0) continue;
      const space = keySpace(k);
      const part = keyUnitPart(k);
      (selectedKeys[space] ??= new Set()).add(isCargoPart(part) ? `${me}:transport` : `${me}:${partUnit(part)}`);
    }
    map({
      picks,
      onPick: (id) => {
        if (!origin && !pickedSpaces.length) { if (origins.includes(id)) setOrigin(id); return; }
        const t = targets.find((x) => x.id === id);
        if (t) setPending(t);
      },
      focusSpace: origin ?? peek,
      arrows: pending && pickedSpaces.length ? [{
        from: pickedSpaces.map((sp) => SPACE_CENTER[sp] ?? [0, 0]),
        to: SPACE_CENTER[pending.id] ?? [0, 0],
        color: mode === 'combat' ? '#e05555' : '#7be0a3',
      }] : [],
      selectedKeys,
      onRegionTap: (id) => {
        // tapping ANY part of the map zooms onto that region (owner: HOI4)
        if (!origin && !pickedSpaces.length) {
          if (origins.includes(id)) setOrigin(id);
          else setPeek(id);
          return;
        }
        if (id === origin) return;
        const t = targets.find((x) => x.id === id);
        if (t) { setPending(t); return; }
        if (origins.includes(id)) { setOrigin(id); setPending(null); return; } // focus another origin, keep picks
        setPeek(id);
      },
      onStackTap: (spaceId, power, key) => {
        const mine = power === me || (me === 'usa' && power === 'china');
        if (!mine) return;
        setOrigin(spaceId); // focus follows the tap; picks accumulate across regions
        const stack = (view.board[spaceId] ?? []).find((st) => st.power === power && st.key === key);
        const max = stack?.count ?? 0;
        const tk = `${spaceId}|${key}`;
        setTake((t) => {
          const next = { ...t, [tk]: Math.min(max, (t[tk] ?? 0) + 1) };
          for (const k of Object.keys(next)) if (!next[k]) delete next[k];
          return next;
        });
        setPending(null);
      },
    });
  }, [origin, peek, targets, origins, mode, pending, take]);

  const stepperFor = (space: string, part: string, max: number) => (
    <Stepper
      value={take[`${space}|${part}`] ?? 0}
      max={max}
      onChange={(n) => setTake((t) => {
        const next = { ...t, [`${space}|${part}`]: n };
        if (!n) delete next[`${space}|${part}`];
        return next;
      })}
    />
  );

  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">
        {mode === 'combat'
          ? 'Combat move. Tap pieces to gather a force (several regions is fine), then the region to attack.'
          : 'Noncombat move. Reposition, land aircraft, load and offload transports. No hostile or neutral ground.'}
      </div>
      {!origin && pickedSpaces.length === 0 && (
        <div className="ax-row ax-wrap">
          {origins.map((id) => (
            <Chip key={id} label={spaceName(id)} onTap={() => setOrigin(id)} />
          ))}
          <Chip label={mode === 'combat' ? 'No more attacks' : 'Done moving'} tone="gold" onTap={() => act({ type: 'endPhase' })} />
        </div>
      )}
      {(origin || pickedSpaces.length > 0) && (
        <>
          <div className="ax-row" style={{ alignItems: 'center' }}>
            <b style={{ fontSize: 14 }}>{origin ? spaceName(origin) : 'Force'}</b>
            <Chip label="Back" onTap={reset} />
          </div>
          {origin && (
            <div className="ax-units">
              {myStacksAt(origin).filter((s) => s.key !== 'factory').map((s, i) => (
                <div key={`${s.key}-${i}`} className="ax-unit-row">
                  <span>{UNITS[s.key].name}{s.power === 'china' ? ' (China)' : ''} × {s.count}</span>
                  {stepperFor(origin, s.key, s.count)}
                </div>
              ))}
              {Object.entries(cargoAt(origin)).map(([k, n]) => (
                <div key={`cargo-${k}`} className="ax-unit-row">
                  <span>{UNITS[k as UnitKey].name} aboard × {n}</span>
                  {stepperFor(origin, `cargo:${k}`, n ?? 0)}
                </div>
              ))}
            </div>
          )}
          {pickedSpaces.filter((sp) => sp !== origin).length > 0 && (
            <div className="ax-row ax-wrap" style={{ fontSize: 12, opacity: 0.8 }}>
              {pickedSpaces.filter((sp) => sp !== origin).map((sp) => (
                <Chip key={sp} label={`+ ${spaceName(sp)}`} onTap={() => setOrigin(sp)} />
              ))}
            </div>
          )}
          <div className="ax-row ax-wrap">
            {targets.map((t) => (
              <Chip
                key={`${t.id}-${t.via ?? ''}`}
                label={`${mode === 'combat' ? (t.amphibious ? 'Assault' : 'Attack') : isSz(t.id) ? 'To' : anyCargo ? 'Offload to' : 'To'} ${spaceName(t.id)}${t.via ? ` via ${spaceName(t.via)}` : ''}`}
                tone={pending?.id === t.id ? 'gold' : mode === 'combat' ? 'danger' : 'gold'}
                onTap={() => setPending(t)}
              />
            ))}
            {loadZones.map((z) => (
              <Chip
                key={`load-${z}`}
                label={`Load into ${spaceName(z)}`}
                tone="gold"
                onTap={() => {
                  const own = picked.filter(([k]) => keySpace(k) === origin && !isCargoPart(keyUnitPart(k)))
                    .filter(([k]) => !SEA_KEYS.includes(partUnit(keyUnitPart(k))) && !AIR_KEYS.includes(partUnit(keyUnitPart(k))))
                    .map(([k, count]) => ({ key: partUnit(keyUnitPart(k)), count }));
                  act({ type: 'load', zone: z, territory: origin!, units: own });
                  reset();
                }}
              />
            ))}
            {targets.length === 0 && loadZones.length === 0 && (
              <span style={{ fontSize: 12.5, opacity: 0.6 }}>Tap pieces to gather the force, then pick a destination.</span>
            )}
          </div>
        </>
      )}
      {(origin || pickedSpaces.length > 0) && createPortal(
        <div className="ax-order center">
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
        </div>,
        document.body,
      )}
      {sbrAsk && createPortal(
        <div className="ax-modal dark">
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
        </div>,
        document.body,
      )}
    </div>
  );
}

// Battle actions live front and center mid-screen (owner: big buttons in the
// middle), while the left panel just narrates.
function BattleSheet({ view, act, map }: { view: AxisView; act: Act; map: PublishMap }) {
  const c = view.combat!;
  const b = c.battle;
  const d = b.decision;
  const [picked, setPicked] = useState<number[]>([]);
  const byUid = new Map([...b.attacker, ...b.defender].map((u) => [u.uid, u]));
  const needed = d?.type === 'casualties' ? d.buckets.reduce((n, bk) => n + Math.min(bk.hits, bk.eligible.length), 0) : 0;
  const deciderIsDefender = d && d.type !== 'retreat' && (d as { side?: string }).side === 'defender';
  // battle decisions route to the power they belong to (the defender picks
  // their own casualties even on the attacker's turn)
  const defenderPower = (b.defender.find((u) => u.hp > 0)?.power ?? b.defender[0]?.power ?? 'china') as PowerKey | 'china';
  const asDefender = defenderPower === 'china' ? 'usa' : defenderPower;
  const decide = (a: Parameters<Act>[0]) => act(deciderIsDefender ? { ...a, asPower: asDefender as PowerKey } : a);
  const over = Boolean(c.confirmed); // battle finished, both sides confirm
  useEffect(() => { map({ ...MAP_IDLE, focusSpace: c.space }); }, [c.space]);
  useEffect(() => { setPicked([]); }, [c.id]);
  const winnerLine =
    b.status === 'attacker_captured' ? `${POWERS[c.attacker].name} takes ${spaceName(c.space)}` :
    b.status === 'attacker_cleared' ? `${POWERS[c.attacker].name} clears ${spaceName(c.space)}` :
    b.status === 'defender_won' ? 'The attack is repelled' :
    b.status === 'retreated' ? `${POWERS[c.attacker].name} retreats` :
    b.status === 'standoff' ? 'Standoff' : 'Mutual destruction';
  const standing = (side: 'attacker' | 'defender') => {
    const m = new Map<UnitKey, number>();
    for (const u of b[side]) if (u.hp > 0) m.set(u.key, (m.get(u.key) ?? 0) + 1);
    return [...m.entries()].map(([k, n]) => `${n} ${UNITS[k].name}`).join(', ') || 'none';
  };
  return (
    <>
      <div className="ax-sheet-body">
        <div className="ig-lab">Battle · {spaceName(c.space)} · round {b.round}</div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>The battle plays on the TV. Your orders are center screen.</div>
      </div>
      {createPortal(<div className="ax-battle-center">
        {over && c.confirmed && (
          <div className="ax-battle-cas ig-glass">
            <div className="ax-battle-verdict">{winnerLine}</div>
            <div className="ax-battle-standing">
              <span style={{ color: powerHex(c.attacker) }}>{POWERS[c.attacker].name}</span> {standing('attacker')}
            </div>
            <div className="ax-battle-standing">
              <span style={{ color: powerHex(defenderPower) }}>{defenderPower === 'china' ? 'China' : POWERS[defenderPower as PowerKey].name}</span> {standing('defender')}
            </div>
            <div className="ax-row" style={{ justifyContent: 'center', gap: 10 }}>
              <button
                className="ax-mega xl"
                disabled={c.confirmed.attacker}
                onClick={() => act({ type: 'battleContinue' })}
              >{c.confirmed.attacker ? 'ATTACKER READY' : 'CONTINUE · ATTACKER'}</button>
              <button
                className="ax-mega xl"
                disabled={c.confirmed.defender}
                onClick={() => act({ type: 'battleContinue', asPower: asDefender as PowerKey } as Parameters<Act>[0])}
              >{c.confirmed.defender ? 'DEFENDER READY' : 'CONTINUE · DEFENDER'}</button>
            </div>
          </div>
        )}
        {!over && !d && (
          <button className="ax-mega xl" onClick={() => act({ type: 'battleRoll' })}>ROLL THE DICE</button>
        )}
        {!over && d?.type === 'retreat' && (
          <>
            <button className="ax-mega xl" onClick={() => act({ type: 'battleRetreat', retreat: false })}>PRESS THE ATTACK</button>
            <button className="ax-mega xl danger" onClick={() => act({ type: 'battleRetreat', retreat: true })}>RETREAT</button>
          </>
        )}
        {!over && d?.type === 'submerge' && (
          <>
            <button className="ax-mega xl" onClick={() => decide({ type: 'battleSubmerge', uids: [] })}>STRIKE</button>
            <button className="ax-mega xl" onClick={() => decide({ type: 'battleSubmerge', uids: d.subs })}>SUBMERGE</button>
          </>
        )}
        {!over && d?.type === 'casualties' && (
          <div className="ax-battle-cas ig-glass">
            <div className="ig-lab">
              {deciderIsDefender ? 'Defender picks' : 'Attacker picks'} {needed} {needed === 1 ? 'casualty' : 'casualties'}{picked.length ? `, ${picked.length} picked` : ''}
            </div>
            <div className="ax-row ax-wrap" style={{ justifyContent: 'center' }}>
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
            <button className="ax-mega xl" disabled={picked.length < needed} onClick={() => { decide({ type: 'battleCasualties', uids: picked }); setPicked([]); }}>
              CONFIRM CASUALTIES
            </button>
          </div>
        )}
      </div>, document.body)}
    </>
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

  // the camera sits on the mobilization zone while units are chosen; the
  // legal destinations light up on the map as soon as something is selected
  useEffect(() => {
    map({
      picks: spots.map((id) => ({ id, color: '#7be0a3' })),
      onPick: (id) => { if (spots.includes(id)) placeAll(id); },
      focusSpace: selected.length > 0 ? null : 'mobilization',
    });
  }, [spots.join(','), selected.map(([k, n]) => k + n).join(',')]);

  return (
    <div className="ax-sheet-body">
      <div className="ig-lab">Mobilize · pick units, then tap a lit destination</div>
      {staged.length === 0 && view.chinaGrant === 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>Nothing staged. End the turn to collect income.</div>
      )}
      <div className="ax-units">
        {staged.map(([k, n]) => (
          <div key={k} className="ax-unit-row">
            <span className="ax-unit-label"><UnitIcon unitKey={k} size={22} /> {UNITS[k].name} × {n}</span>
            <Stepper value={sel[k] ?? 0} max={n} onChange={(v) => setSel((s) => ({ ...s, [k]: v }))} />
          </div>
        ))}
        {view.chinaGrant > 0 && (
          <div className="ax-unit-row">
            <span className="ax-unit-label"><UnitIcon unitKey="infantry" size={22} /> Chinese infantry × {view.chinaGrant}</span>
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
        <Chip label="End turn" tone="gold" onTap={() => act({ type: 'endPhase' })} title="Places are done; income is collected automatically" />
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

interface DeckInfo { face: string | null; grid: [number, number] | null }
function billDeck(manifest: AxisManifest | null, denom: 1 | 5 | 10): DeckInfo | null {
  const nick = denom === 1 ? /ONE/ : denom === 5 ? /FIVE/ : /TEN/;
  const deck = (manifest as unknown as { ipcDecks?: { nick: string; face: string | null; grid: [number, number] | null }[] })?.ipcDecks?.find((d) => nick.test(d.nick ?? ''));
  return deck ? { face: deck.face, grid: deck.grid } : null;
}
function billStyle(deck: DeckInfo | null): CSSProperties {
  if (!deck?.face) return {};
  const [cols, rows] = deck.grid ?? [10, 7];
  return {
    backgroundImage: `url(${deck.face})`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: '0% 0%',
  };
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
  const oneDeck = billDeck(manifest, 1);
  const fiveDeck = billDeck(manifest, 5);
  const tenDeck = billDeck(manifest, 10);

  return (
    <>
      <button className="ax-bank ig-glass" onClick={() => setOpen(true)} title="Your IPC notes">
        <span className="ig-lab">IPC</span>
        <b className="ig-num">{ipcs}</b>
      </button>
      {flying > 0 && Array.from({ length: flying }, (_, i) => (
        <span key={i} className="ax-bill-fly" style={{ animationDelay: `${i * 0.14}s`, ...billStyle(oneDeck) }} />
      ))}
      {open && (
        <div className="ax-nation" onClick={() => setOpen(false)}>
          <div className="ax-nation-card ig-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ax-row" style={{ justifyContent: 'space-between' }}>
              <b>Treasury · {ipcs} IPCs</b>
              <button className="ax-chip" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="ax-bills">
              {[
                { n: tens, denom: 10, deck: tenDeck },
                { n: fives, denom: 5, deck: fiveDeck },
                { n: ones, denom: 1, deck: oneDeck },
              ].map(({ n, denom, deck }) => (
                n > 0 && (
                  <div key={denom} className="ax-bill-stack">
                    {Array.from({ length: Math.min(n, 8) }, (_, i) => (
                      <span key={i} className="ax-bill" style={{ left: i * 9, top: -i * 2, ...billStyle(deck) }} />
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
  // sheets may name the power they act for (battle decisions belong to the
  // defender); default is the active power
  const actAs: Act = (a) => act({ asPower: me, ...a } as unknown as AxisAction);
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
