// The parts of a turn that are not movement: research, buying, deploying, and the nation card.
// Each is a sheet over the map that leaves the board visible.
import { useEffect, useMemo, useState } from 'react';
import {
  AXIS_INDEX, AXIS_MAP, POWERS, RESEARCH_DIE_COST, TECHS, TECH_BY_KEY, UNITS,
  type AxisView, type PowerKey, type UnitKey,
} from '@bge/shared';
import type { Act } from './useOrders';
import { Stepper } from './AxisPlay';
import UnitIcon from './UnitIcon';
import { axisCurrentUnitReference, axisFactoryRepairOffer, axisResearchChartPresentation } from './axisTechnologyPresentation';
import { axisCapitalTurnPresentation } from './axisCapitalPresentation';
import { axisCarrierObligationCards, axisCarrierRequiredPlacements } from './axisCarrierPresentation';
import { axisFirstLegalStagedPlacement, axisMobilizationDestinationPlans, buildPlaceBatchAction } from './axisMobilization';
import { axisForceInventory } from './axisInventory';
import { TERR, isSea, powerInk, powerName, powerShort, spaceName, unitCount, unitRank } from './world';
import { Roundel } from './Roundel';

const BUYABLE: UnitKey[] = ['infantry', 'artillery', 'tank', 'aaGun', 'fighter', 'bomber', 'battleship', 'carrier', 'cruiser', 'destroyer', 'submarine', 'transport', 'factory'];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Renders of the sculpts in the active nation's colour, keyed by unit. Empty until they are drawn. */
export type UnitArt = Record<string, string>;

/** A unit as a picture: the sculpt itself when it has been rendered, the line icon until then. */
export function UnitPicture({ unitKey, art, size }: { unitKey: UnitKey; art: UnitArt; size: number }) {
  const src = art[unitKey];
  if (src) return <img className="axx-pic" src={src} width={size} height={size} alt="" draggable={false} />;
  return <span className="axx-pic" style={{ width: size, height: size }}><UnitIcon unitKey={unitKey} size={Math.round(size * 0.56)} title={UNITS[unitKey].name} /></span>;
}

/** A value out of the most it can be, drawn as filled marks. */
function Marks({ value, max }: { value: number; max: number }) {
  return <span className="axx-marks" aria-hidden="true">{Array.from({ length: max }, (_, i) => <i key={i} className={i < value ? 'on' : ''} />)}</span>;
}

// ---------- research ----------

export function Research({ view, act }: { view: AxisView; act: Act }) {
  const p = view.powers[view.active];
  const charts = axisResearchChartPresentation(p.techs);
  const done = TECHS.every((t) => p.techs.includes(t.key));
  const maxNew = Math.floor(p.ipcs / RESEARCH_DIE_COST);
  const [dice, setDice] = useState(() => (p.researchTokens > 0 ? 0 : Math.min(1, maxNew)));
  const total = p.researchTokens + dice;

  if (view.awaitingChart) {
    return (
      <div className="axx-sheet ig-glass">
        <div className="axx-sheet-head"><div><span className="ig-lab">Breakthrough</span><h3>Choose a chart</h3></div></div>
        <p className="axx-hint">You gain one advance from the chart you pick. One you already have is rolled again.</p>
        <div className="axx-cards two">
          {charts.map((chart) => (
            <button key={chart.chart} className="axx-card pick" disabled={chart.complete} onClick={() => act({ type: 'chooseChart', chart: chart.chart })}>
              <b>Chart {chart.chart}</b>
              {chart.advances.map((a) => <small key={a.key} className={a.developed ? 'have' : ''}>{a.roll}. {a.name}</small>)}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="axx-bar ig-glass">
      <div className="axx-bar-text">
        <b>Research</b>
        <small>
          {done ? 'Every advance is already developed.'
            : `Each researcher costs ${RESEARCH_DIE_COST} IPCs and rolls one die. A 6 is a breakthrough. Researchers that fail stay for next turn.`}
        </small>
        {!done && <Stepper label={p.researchTokens ? `New researchers (${p.researchTokens} standing)` : 'Researchers'} value={dice} max={maxNew} onChange={setDice} />}
      </div>
      {!done && <button className="axx-go" disabled={total < 1} onClick={() => act({ type: 'buyResearch', dice })}>Roll {total}</button>}
      <button className="axx-x" onClick={() => act({ type: 'endPhase' })}>{done ? 'Continue' : 'Skip'}</button>
    </div>
  );
}

// ---------- purchase ----------

export function Armory({ view, act, art }: { view: AxisView; act: Act; art: UnitArt }) {
  const p = view.powers[view.active];
  const [open, setOpen] = useState(true);
  const bought = Object.values(p.purchasedThisTurn).reduce((n, x) => n + (x?.count ?? 0), 0);
  const damaged = AXIS_MAP.territories.filter((t) =>
    view.control[t.id] === view.active && (view.factoryDamage[t.id] ?? 0) > 0 && (view.board[t.id] ?? []).some((s) => s.key === 'factory'));

  if (!open) {
    return (
      <div className="axx-bar ig-glass">
        <div className="axx-bar-text">
          <b>Buy units</b>
          <small>{bought ? `${plural(bought, 'unit')} bought. They wait in the mobilization zone until you deploy.` : 'Nothing bought yet.'}{view.active === 'usa' && view.chinaGrant ? ` China raises ${view.chinaGrant} infantry.` : ''}</small>
        </div>
        <button className="axx-x" onClick={() => setOpen(true)}>Armory</button>
        <button className="axx-go" onClick={() => act({ type: 'endPhase' })}>Done buying</button>
      </div>
    );
  }
  return (
    <div className="axx-sheet tall ig-glass">
      <div className="axx-sheet-head">
        <div><span className="ig-lab">Buy units</span><h3><span className="ig-num">{p.ipcs}</span> IPCs to spend</h3></div>
        <button className="axx-x" onClick={() => setOpen(false)}>Show map</button>
      </div>
      <div className="axx-armory">
        {BUYABLE.map((key) => {
          const ref = axisCurrentUnitReference(key, p.techs);
          const queued = p.purchasedThisTurn[key]?.count ?? 0;
          return (
            <div key={key} className={`axx-buy${queued ? ' on' : ''}${p.ipcs < ref.cost && !queued ? ' poor' : ''}`}>
              <button className="axx-buy-art" onClick={() => act({ type: 'buy', key, count: 1 })} disabled={p.ipcs < ref.cost} aria-label={`Buy one ${UNITS[key].name}`}>
                <UnitPicture unitKey={key} art={art} size={104} />
                <span className="ig-num cost">{ref.cost}</span>
                {queued > 0 && <span className="ig-num qty">{queued}</span>}
              </button>
              <b className="nm">{UNITS[key].name}</b>
              <div className="axx-stats-row" aria-label={`Attack ${ref.attack || 0}, defend ${ref.defense || 0}, move ${ref.move || 0}`}>
                <span><small>ATK</small><Marks value={ref.attack || 0} max={4} /></span>
                <span><small>DEF</small><Marks value={ref.defense || 0} max={4} /></span>
                <span><small>MOVE</small><Marks value={Math.min(6, ref.move || 0)} max={6} /></span>
              </div>
              <span className="ctl">
                <button onClick={() => act({ type: 'unbuy', key, count: 1 })} disabled={!queued} aria-label={`Return one ${UNITS[key].name}`}>-</button>
                <button onClick={() => act({ type: 'buy', key, count: 1 })} disabled={p.ipcs < ref.cost} aria-label={`Buy one ${UNITS[key].name}`}>+</button>
              </span>
            </div>
          );
        })}
      </div>
      {damaged.length > 0 && (
        <div className="axx-chips">
          {damaged.map((t) => {
            const damage = view.factoryDamage[t.id] ?? 0;
            const offer = axisFactoryRepairOffer(damage, p.techs);
            return offer && (
              <button key={t.id} className="axx-chip" disabled={p.ipcs < offer.cost} onClick={() => act({ type: 'repair', territory: t.id, count: offer.count })}>
                Repair {t.name}: {offer.count} of {damage} damage for {offer.cost}
              </button>
            );
          })}
        </div>
      )}
      <button className="axx-go wide" onClick={() => act({ type: 'endPhase' })}>Done buying</button>
    </div>
  );
}

// ---------- deploy ----------

export function Deploy({ view, act, onTargets, flyTo, art }: {
  view: AxisView;
  act: Act;
  onTargets: (t: { targets: string[]; labels?: Record<string, string>; onPick: (id: string) => void } | null) => void;
  flyTo: (ids: string[]) => void;
  art: UnitArt;
}) {
  const p = view.powers[view.active];
  const capital = axisCapitalTurnPresentation(view);
  const locked = capital.regularMobilizationLocked;
  const staged = locked ? [] : (Object.entries(p.staging) as [UnitKey, number][]).filter(([, n]) => n > 0);
  const stagedTotal = staged.reduce((n, [, c]) => n + c, 0);
  const [sel, setSel] = useState<Record<string, number>>({});
  const [confirmCarry, setConfirmCarry] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);

  const selection = Object.fromEntries(Object.entries(sel).filter(([key, n]) => n > 0 && (!locked || key === 'china')));
  const hasSel = Object.keys(selection).length > 0;
  const planning = {
    board: view.board, control: view.control, contested: view.contested, factoryDamage: view.factoryDamage,
    factoriesUsed: p.factoriesUsed, techs: p.techs, chinaPlacementSpaces: view.chinaPlacementSpaces,
    newCarrierLandingObligations: view.newCarrierLandingObligations, stagedCarriers: p.staging.carrier ?? 0,
  };
  const plans = useMemo(() => axisMobilizationDestinationPlans({ state: planning, idx: AXIS_INDEX, power: view.active, selection }), [sel, view]);
  const required = axisCarrierRequiredPlacements(view, view.active);
  const obligations = axisCarrierObligationCards(view, view.active);
  const requiredCount = required.reduce((n, r) => n + r.count, 0);
  const witness = useMemo(() => (locked ? null : axisFirstLegalStagedPlacement({ state: planning, idx: AXIS_INDEX, power: view.active, staging: p.staging })), [view]);
  const spots = [...new Set(plans.map((plan) => plan.space))];

  const place = (plan: (typeof plans)[number]) => {
    act(buildPlaceBatchAction(plan.space, selection, plan.factory));
    setSel({});
    setChoice(null);
  };

  // The map lights the legal destinations for whatever is selected; a tap places it.
  const sig = `${JSON.stringify(selection)}|${spots.join(',')}`;
  useEffect(() => {
    if (!hasSel || !spots.length) { onTargets(null); return; }
    // each lit space carries the number of units its factory can still build
    const labels: Record<string, string> = {};
    for (const plan of plans) {
      if (plan.factoryRemaining == null) continue;
      labels[plan.space] = String(Math.max(Number(labels[plan.space] ?? 0), plan.factoryRemaining));
    }
    onTargets({
      targets: spots,
      labels,
      onPick: (id) => {
        const here = plans.filter((plan) => plan.space === id);
        if (here.length === 1) place(here[0]);
        else if (here.length > 1) setChoice(id);
      },
    });
    flyTo(spots);
    return () => onTargets(null);
  }, [sig]);
  // Start with everything in hand: most turns the whole purchase goes to one factory.
  useEffect(() => {
    if (!stagedTotal && !view.chinaGrant) return;
    setSel(Object.fromEntries([...staged.map(([k, n]) => [k, n]), ...(view.chinaGrant ? [['china', 0]] : [])]));
  }, [view.active, view.phase]);
  // If the whole selection fits nowhere, fall back to one unit so there is always a way forward.
  useEffect(() => {
    if (hasSel && plans.length === 0) {
      const [key] = Object.keys(selection);
      if (Object.keys(selection).length > 1 || selection[key] > 1) setSel({ [key]: 1 });
    }
  }, [sig]);

  const end = () => {
    if (view.chinaGrant > 0) { setSel({ china: view.chinaGrant }); return; }
    if (requiredCount > 0) return;
    if (witness) { setSel({ [witness.key]: 1 }); return; }
    if (!locked && stagedTotal > 0 && !confirmCarry) { setConfirmCarry(true); return; }
    act({ type: 'endPhase' });
  };

  const blocked = view.chinaGrant > 0 ? `Place China's ${`${view.chinaGrant} infantry`} first.`
    : requiredCount > 0 ? 'Place every promised carrier first.'
      : witness ? 'There is still room at a factory for what you bought.' : '';

  if (choice) {
    const here = plans.filter((plan) => plan.space === choice);
    return (
      <div className="axx-sheet ig-glass">
        <div className="axx-sheet-head"><div><span className="ig-lab">Which factory builds it</span><h3>{spaceName(choice)}</h3></div><button className="axx-x" onClick={() => setChoice(null)}>Back</button></div>
        <div className="axx-chips">
          {here.map((plan) => <button key={plan.factory ?? 'none'} className="axx-chip" onClick={() => place(plan)}>{plan.factory ? spaceName(plan.factory) : spaceName(plan.space)}{plan.factoryRemaining != null ? `, ${plan.factoryRemaining} open` : ''}</button>)}
        </div>
      </div>
    );
  }

  const waiting = stagedTotal > 0 || view.chinaGrant > 0;
  const status = capital.mobilize ? `${capital.mobilize.title}. ${capital.mobilize.detail}`
    : confirmCarry ? `${plural(stagedTotal, 'unit')} will wait for next turn.`
      : !waiting ? 'Nothing to deploy.'
        : !hasSel ? (blocked || 'Pick what to place.')
          : spots.length ? 'Tap a lit factory.' : 'No factory has room for all of this. Pick fewer.';
  const step = (key: string, max: number, by: number) => setSel((cur) => {
    const next = Math.max(0, Math.min(max, (cur[key] ?? 0) + by));
    return key === 'china' ? { china: next } : { ...cur, [key]: next };
  });
  const tile = (key: string, unit: UnitKey, n: number, name: string) => {
    const picked = sel[key] ?? 0;
    return (
      <div key={key} className={`axx-tile${picked ? ' on' : ''}`}>
        <button className="axx-tile-art" onClick={() => step(key, n, picked ? -picked : n)} aria-label={`${picked ? 'Put back' : 'Pick up'} ${name}`}>
          <UnitPicture unitKey={unit} art={art} size={88} />
          <span className="ig-num count">{picked}<i>/{n}</i></span>
        </button>
        <span className="pips" aria-hidden="true">{Array.from({ length: Math.min(n, 10) }, (_, i) => <i key={i} className={i < Math.round((picked / n) * Math.min(n, 10)) ? 'on' : ''} />)}</span>
        {n > 1 && (
          <span className="ctl">
            <button onClick={() => step(key, n, -1)} disabled={picked <= 0} aria-label={`Fewer ${name}`}>-</button>
            <button onClick={() => step(key, n, 1)} disabled={picked >= n} aria-label={`More ${name}`}>+</button>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="axx-bar axx-deploy ig-glass">
      <div className="axx-bar-text">
        <div className="axx-deploy-head">
          <b>{confirmCarry ? 'Leave units undeployed?' : 'Deploy'}</b>
          <small>{status}</small>
        </div>
        {waiting && !confirmCarry && (
          <div className="axx-tiles">
            {staged.map(([key, n]) => tile(key, key, n, UNITS[key].name))}
            {view.chinaGrant > 0 && tile('china', 'infantry', view.chinaGrant, 'Chinese infantry')}
          </div>
        )}
        {required.length > 0 && (
          <div className="axx-chips tight">
            {required.map((r) => {
              const plan = axisMobilizationDestinationPlans({ state: planning, idx: AXIS_INDEX, power: view.active, selection: { carrier: r.count } })
                .find((x) => x.space === r.seaZone && x.factory === r.factory);
              const fighters = obligations.find((c) => c.seaZone === r.seaZone)?.fighterCount ?? 0;
              return (
                <button key={`${r.seaZone}-${r.factory}`} className="axx-chip on" disabled={!plan || (p.staging.carrier ?? 0) < r.count}
                  onClick={() => { act(buildPlaceBatchAction(r.seaZone, { carrier: r.count }, r.factory)); setSel({}); }}>
                  Place {unitCount(r.count, 'carrier')} in {spaceName(r.seaZone)} from {spaceName(r.factory)}{fighters ? ` for ${unitCount(fighters, 'fighter')}` : ''}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {confirmCarry && <button className="axx-x" onClick={() => setConfirmCarry(false)}>Back</button>}
      <button className="axx-go" onClick={end} disabled={requiredCount > 0}>{confirmCarry ? 'End turn anyway' : capital.mobilize?.endLabel ?? 'End turn'}</button>
    </div>
  );
}

// ---------- nation card ----------

export function NationCard({ view, power, onClose }: { view: AxisView; power: PowerKey; onClose: () => void }) {
  const [who, setWho] = useState<PowerKey>(power);
  const p = view.powers[who];
  const force = axisForceInventory(view.board, who);
  return (
    <div className="ig-modal" onClick={onClose}>
      <div className="ig-modal-card ig-glass axx-nation" style={{ ['--seat' as string]: powerInk(who) }} onClick={(e) => e.stopPropagation()}>
        <div className="ig-modal-head">
          <span className="ig-prompt-ring" />
          <b>{POWERS[who].name}</b>
          <button className="ig-modal-x" onClick={onClose}>✕</button>
        </div>
        <div className="axx-chips tight">
          {view.turnOrder.map((k) => <button key={k} className={`axx-chip${k === who ? ' on' : ''}`} onClick={() => setWho(k)}>{POWERS[k].short}</button>)}
        </div>
        <div className="ig-hold" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div><div className="ig-lab">IPCs</div><div className="ig-stat-v ig-num">{p.ipcs}</div></div>
          <div><div className="ig-lab">Income</div><div className="ig-stat-v ig-num">{p.production}</div></div>
          <div><div className="ig-lab">Side</div><div className="ig-stat-v">{POWERS[who].coalition === 'axis' ? 'Axis' : 'Allies'}</div></div>
        </div>
        <div className="ig-build-head"><span className="ig-lab">Forces in the field</span></div>
        <div className="axx-force wrap">
          {BUYABLE.filter((k) => force[k]).map((k) => (
            <span key={k} className="axx-unit"><UnitIcon unitKey={k} size={20} title={UNITS[k].name} /><b className="ig-num">{force[k]}</b> {UNITS[k].name}</span>
          ))}
        </div>
        {p.techs.length > 0 && (
          <>
            <div className="ig-build-head"><span className="ig-lab">Advances</span></div>
            {p.techs.map((t) => <div key={t} className="ig-build-row"><span>{TECH_BY_KEY[t]?.name ?? t}</span></div>)}
          </>
        )}
        <a className="axx-chip" href="/axis/rulebook.pdf" target="_blank" rel="noreferrer">Rulebook</a>
      </div>
    </div>
  );
}

// ---------- inspector ----------

/** What stands on the space that was last touched: who holds it, what it is worth, who is there. */
export function Inspector({ view, space, onClose }: { view: AxisView; space: string; onClose: () => void }) {
  const t = TERR[space];
  const holder = isSea(space) ? null : view.control[space] ?? null;
  const byPower = new Map<string, Map<string, number>>();
  for (const st of view.board[space] ?? []) {
    if (st.count <= 0) continue;
    const units = byPower.get(st.power) ?? new Map<string, number>();
    units.set(st.key, (units.get(st.key) ?? 0) + st.count);
    byPower.set(st.power, units);
  }
  const damage = view.factoryDamage[space] ?? 0;
  const facts = [
    t ? (t.isImpassable ? 'Neutral, impassable' : `${t.ipc} IPC${t.ipc === 1 ? '' : 's'}`) : 'Sea zone',
    holder ? powerName(holder) : null,
    t?.isVictoryCity ? `Victory city${t.victoryCity ? `, ${t.victoryCity}` : ''}` : null,
    damage ? `Factory damage ${damage}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <aside className="axx-inspect ig-glass" style={{ ['--seat' as string]: powerInk(holder) }}>
      <div className="axx-inspect-head">
        {holder && <Roundel power={holder} size={30} />}
        <span><b>{spaceName(space)}</b><small>{facts}</small></span>
        <button onClick={onClose} aria-label="Close">✕</button>
      </div>
      {byPower.size === 0 && <div className="axx-inspect-empty">No units here.</div>}
      {[...byPower].map(([power, units]) => (
        <div key={power} className="axx-inspect-row" style={{ ['--seat' as string]: powerInk(power) }}>
          <span className="who">{powerShort(power)}</span>
          <span className="units">
            {[...units].sort((a, b) => unitRank(a[0]) - unitRank(b[0])).map(([key, n]) => (
              <span key={key} title={unitCount(n, key)}><UnitIcon unitKey={key as UnitKey} size={18} />{n}</span>
            ))}
          </span>
        </div>
      ))}
    </aside>
  );
}
