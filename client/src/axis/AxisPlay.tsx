// A player's device. The whole screen is the map and the map is the controller: tap or drag
// your own units to pick them up, tap or drop on a lit space to send them. A slim bar along the
// bottom says what is in hand and carries the one button that commits it.
import './axis.css';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  POWERS, UNITS, WIN_CONDITIONS,
  type AxisAction, type AxisView, type PowerKey, type UnitKey, type UnitStack,
} from '@bge/shared';
import { MapStage } from './MapStage';
import { Boundary } from './Boundary';
import { useOrders, type Act, type Orders } from './useOrders';
import { Armory, Deploy, NationCard, Research, type UnitArt } from './sheets';
import { renderPortraits } from './portraits';
import { axisAvailablePhaseKeys, axisCapitalTurnPresentation, axisPhasePresentation } from './axisCapitalPresentation';
import UnitIcon from './UnitIcon';
import { Roundel } from './Roundel';
import { Inspector } from './sheets';
import { MOB_ID, listNames, powerInk, powerName, spaceName, unitCount } from './world';

const BattleCommand = lazy(() => import('./battle/BattleCommand').then((m) => ({ default: m.BattleCommand })));

const seatVar = (power: string) => ({ '--seat': powerInk(power) } as CSSProperties);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Purchases of every power wait in the printed mobilization zone until they are placed. */
export function stagedUnits(view: AxisView): UnitStack[] {
  const out: UnitStack[] = [];
  for (const power of view.turnOrder) {
    if (power === view.active && view.turnStartedCapitalOccupied) continue;
    for (const [key, count] of Object.entries(view.powers[power].staging)) {
      if (count) out.push({ power, key: key as UnitKey, count: count as number });
    }
  }
  return out;
}

export default function AxisPlay({ view, act, error }: { view: AxisView; act: (a: AxisAction) => void; error: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<MapStage | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState('');
  const [nation, setNation] = useState(false);
  const [inspect, setInspect] = useState<string | null>(null);
  const [deploySel, setDeploySel] = useState<{ targets: string[]; labels?: Record<string, string>; onPick: (id: string) => void } | null>(null);
  const [art, setArt] = useState<UnitArt>({});

  const active = view.active;
  const mine = view.controlledPowers.includes(active);
  const operating = view.operatingPower ?? active;
  const power = view.powers[active];
  const actAs: Act = (a) => act({ asPower: active, ...a } as unknown as AxisAction);
  const inBattle = view.phase === 'battle' || view.defendingCarrierLanding != null;
  const moving = mine && !inBattle && (view.phase === 'combatMove' || view.phase === 'noncombat')
    && !(active === 'usa' && !view.usaOperationFirst);
  const orders = useOrders(view, actAs, view.phase === 'noncombat' ? 'noncombat' : 'combat', moving);
  const latest = useRef(orders);
  latest.current = orders;

  // ---------- the stage ----------

  useEffect(() => {
    if (!host.current) return;
    let st: MapStage;
    try {
      st = new MapStage(host.current, 'device');
    } catch (e) {
      console.error(e);
      setFailed('This browser cannot draw the map.');
      return;
    }
    stage.current = st;
    if (import.meta.env.DEV) (window as unknown as { __axis?: MapStage }).__axis = st;
    st.onProgress = setLoaded;
    st.handlers = {
      // While a sheet is asking for a space, a tap on a piece counts as a tap on its space.
      pieceTap: (hit) => { setInspect(hit.space); if (pick.current) pick.current(hit.space); else latest.current.tapPiece(hit); },
      pieceHold: (hit) => latest.current.holdPiece(hit),
      regionTap: (id) => { setInspect(id); if (pick.current) pick.current(id); else latest.current.tapRegion(id); },
      dragStart: (hit) => latest.current.dragStart(hit),
      dragEnd: (space) => latest.current.dragEnd(space),
    };
    st.ready.then(() => setLoaded(1)).catch((e) => { console.error(e); setFailed('The map could not be loaded.'); });
    return () => { st.dispose(); stage.current = null; };
  }, []);

  const pick = useRef<((id: string) => void) | null>(null);
  pick.current = deploySel ? deploySel.onPick : null;

  const staged = useMemo(() => stagedUnits(view), [view.powers, view.active, view.turnStartedCapitalOccupied]);
  const first = useRef(true);
  useEffect(() => {
    stage.current?.setBoard(view.board, staged, !first.current);
    stage.current?.setControl(view.control);
    first.current = false;
  }, [view.board, view.control, staged]);

  // what the order in hand looks like on the map
  const targetSig = orders.stageTargets.map((t) => `${t.id}:${t.tone}`).join(',');
  const arrowSig = orders.stageArrows.map((a) => `${a.from.join('+')}>${a.to}:${a.tone}`).join(',');
  const selSig = Object.entries(orders.stageSelection).map(([k, v]) => `${k}:${[...v].join('.')}`).join(',');
  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    if (deploySel) {
      st.setTargets(deploySel.targets.map((id) => ({ id, tone: 'move' as const, label: deploySel.labels?.[id] })), true);
      st.setArrows([]);
      st.setSelection('', {});
      return;
    }
    st.setTargets(orders.stageTargets, orders.dim);
    st.setArrows(orders.stageArrows);
    st.setSelection(operating, orders.stageSelection);
  }, [targetSig, arrowSig, selSig, orders.dim, operating, deploySel]);
  useEffect(() => { stage.current?.setSpentDim(moving ? operating : null); }, [moving, operating]);

  // The camera goes where the turn is.
  const capital = active ? POWERS[active].capital : null;
  useEffect(() => {
    const st = stage.current;
    if (!st || !capital) return;
    if (view.phase === 'purchase' && mine) void st.flyTo([MOB_ID], { pad: 5 });
    else void st.flyTo([capital], { pad: 5.5, seconds: 1.1 });
  }, [active, capital, view.phase === 'purchase', mine, loaded === 1]);
  useEffect(() => {
    if (orders.pending) void stage.current?.flyTo([...orders.pickedSpaces, orders.pending.id], { pad: 2.1, seconds: 0.6 });
  }, [orders.pending?.id]);

  // The menus show the sculpts themselves, in the colour of whoever is buying.
  useEffect(() => {
    const st = stage.current;
    if (!st || loaded < 1) return;
    setArt(renderPortraits(st.library, active));
  }, [active, loaded === 1]);

  // ---------- chrome ----------

  const phases = axisPhasePresentation(view);
  const cap = axisCapitalTurnPresentation(view);
  const goal = WIN_CONDITIONS[view.options.winCondition]?.cities ?? view.vc.goal;
  const side = POWERS[active].coalition;
  const phaseKeys = axisAvailablePhaseKeys(view.options.rnd);
  void phaseKeys;

  if (failed) return <div className="page center"><h2>{failed}</h2></div>;

  return (
    <div className="axx" style={seatVar(operating)}>
      <div className="axx-map" ref={host} />
      {loaded < 1 && (
        <div className="axx-curtain">
          <span className="eyebrow">Axis &amp; Allies</span>
          <h2>Setting the table</h2>
          <div className="axx-load"><i style={{ width: `${Math.round(loaded * 100)}%` }} /></div>
        </div>
      )}

      <header className="axx-top">
        <button className="axx-plate ig-glass" onClick={() => setNation(true)}>
          <Roundel power={operating} size={36} />
          <span>
            <b>{powerName(operating)}</b>
            <small>Round {view.round} · {mine ? 'your turn' : `${POWERS[active].name} to play`}</small>
          </span>
        </button>
        <ol className="axx-steps ig-glass" aria-label="Turn phases">
          {phases.map((node) => (
            <li key={node.key} className={`${node.progress} ${node.restriction}`} aria-current={node.progress === 'current' ? 'step' : undefined}>
              {node.label}
            </li>
          ))}
        </ol>
        <div className="axx-stats ig-glass">
          <span><small className="ig-lab">IPCs</small><b className="ig-num">{power.ipcs}</b></span>
          <span><small className="ig-lab">Income</small><b className="ig-num">{power.production}</b></span>
          <span><small className="ig-lab">Cities</small><b className="ig-num">{side === 'axis' ? view.vc.axis : view.vc.allies}<i>/{goal}</i></b></span>
        </div>
      </header>

      {inspect && !inBattle && <Inspector view={view} space={inspect} onClose={() => setInspect(null)} />}
      {cap.banner && mine && <div className="axx-note ig-glass"><b>{cap.banner.title}</b> {cap.banner.detail}</div>}
      {error && <div className="toast">{error}</div>}

      {view.winner ? (
        <div className="axx-bar ig-glass">
          <div className="axx-bar-text"><b>{view.winner === 'axis' ? 'The Axis wins' : 'The Allies win'}</b><small>{view.vc.axis} Axis cities, {view.vc.allies} Allied cities</small></div>
        </div>
      ) : inBattle ? (
        <Boundary fallback={<div className="axx-bar ig-glass"><div className="axx-bar-text"><b>The battle controls stopped</b><small>Reload this page to carry on. The battle itself is safe on the server.</small></div><button className="axx-go" onClick={() => location.reload()}>Reload</button></div>}>
          <Suspense fallback={null}><BattleCommand view={view} act={actAs} /></Suspense>
        </Boundary>
      ) : !mine ? (
        <div className="axx-bar ig-glass">
          <div className="axx-bar-text"><b>{POWERS[active].name} is {phaseVerb(view.phase)}</b><small>Watch the screen. You will be asked when a battle needs you.</small></div>
        </div>
      ) : active === 'usa' && !view.usaOperationFirst && (view.phase === 'combatMove' || view.phase === 'noncombat') ? (
        <div className="axx-bar ig-glass">
          <div className="axx-bar-text"><b>Who moves first?</b><small>China and the United States act as separate forces. Finish one before the other.</small></div>
          <button className="axx-go" onClick={() => actAs({ type: 'chooseUsOperationOrder', first: 'usa' })}>United States</button>
          <button className="axx-go" onClick={() => actAs({ type: 'chooseUsOperationOrder', first: 'china' })}>China</button>
        </div>
      ) : view.phase === 'rnd' ? (
        <Research view={view} act={actAs} />
      ) : view.phase === 'purchase' ? (
        <Armory view={view} act={actAs} art={art} />
      ) : view.phase === 'mobilize' || view.phase === 'income' ? (
        <Deploy view={view} act={actAs} art={art} onTargets={setDeploySel} flyTo={(ids) => void stage.current?.flyTo(ids, { pad: 2.6 })} />
      ) : (
        <OrderBar orders={orders} view={view} />
      )}

      {nation && <NationCard view={view} power={operating === 'china' ? 'usa' : (operating as PowerKey)} onClose={() => setNation(false)} />}
    </div>
  );
}

function phaseVerb(phase: string): string {
  if (phase === 'rnd') return 'researching';
  if (phase === 'purchase') return 'buying units';
  if (phase === 'combatMove') return 'planning attacks';
  if (phase === 'battle') return 'in battle';
  if (phase === 'noncombat') return 'moving';
  return 'deploying';
}

// ---------- the order bar ----------

function OrderBar({ orders: o, view }: { orders: Orders; view: AxisView }) {
  const combat = o.mode === 'combat';
  const hulls = o.focus ? o.hullCardsAt(o.focus).filter((c) => c.canOffload && c.manifest.length > 0) : [];
  // One line for the whole force, whatever number of spaces it is drawn from.
  const tally = new Map<string, number>();
  for (const p of o.picked) tally.set(p.key, (tally.get(p.key) ?? 0) + p.count);
  const aboard = new Map<string, number>();
  for (const p of o.cargoPicked) aboard.set(p.key, (aboard.get(p.key) ?? 0) + p.count);
  const force = [...[...tally].map(([key, n]) => unitCount(n, key)), ...[...aboard].map(([key, n]) => `${unitCount(n, key)} aboard`)].join(', ');
  const from = listNames(o.pickedSpaces);

  if (o.confirmStranded) {
    return (
      <div className="axx-bar ig-glass">
        <div className="axx-bar-text">
          <b>{`${o.strandedTotal} aircraft`} cannot land</b>
          <small>{o.stranded.map((g) => `${unitCount(g.count, g.key)} in ${spaceName(g.space)}`).join(', ')}. They are lost if you end movement now.</small>
        </div>
        <button className="axx-go danger" onClick={() => o.finish(true)}>End and lose them</button>
        <button className="axx-x" onClick={o.cancelFinish}>Keep moving</button>
      </div>
    );
  }

  if (o.load) {
    const l = o.load;
    return (
      <div className="axx-sheet ig-glass">
        <div className="axx-sheet-head">
          <div><span className="ig-lab">Board transports</span><h3>{spaceName(l.territory)} to {spaceName(l.zone)}</h3></div>
          <button className="axx-x" onClick={l.cancel}>Cancel</button>
        </div>
        <p className="axx-hint">A transport carries one land unit plus one infantry. Units that found no berth stay ashore.</p>
        <div className="axx-cards">
          {l.cards.map((card) => (
            <div key={`${card.owner}-${card.physicalOrdinal}`} className={`axx-card${l.usable(card) ? '' : ' off'}`}>
              <b>{POWERS[card.owner].short} transport {card.physicalOrdinal + 1}</b>
              <small>{card.manifest.length ? card.manifest.map((c) => unitCount(c.count, c.key)).join(', ') : 'Empty'} · {card.capacity.remaining} open</small>
              {l.usable(card) && l.picks.map((u) => (
                <Stepper key={u.key} label={UNITS[u.key].name} value={l.countOn(card, u.key)} max={l.countOn(card, u.key) + Math.max(0, l.maxFor(card, u.key) - l.countOn(card, u.key))} onChange={(n) => l.setCount(card, u.key, n)} />
              ))}
            </div>
          ))}
        </div>
        <button className="axx-go wide" disabled={!l.ready} onClick={l.confirm}>Board</button>
      </div>
    );
  }

  if (o.sbrAsk) {
    const t = o.targets.find((x) => x.id === o.sbrAsk);
    return (
      <div className="axx-bar ig-glass">
        <div className="axx-bar-text"><b>Bombers over {spaceName(o.sbrAsk)}</b><small>There is a factory here. Bomb it, or fight the defenders?</small></div>
        <button className="axx-go" onClick={() => t && o.commit(t, true)}>Bomb the factory</button>
        <button className="axx-go danger" onClick={() => t && o.commit(t, false)}>Attack</button>
        <button className="axx-x" onClick={o.closeSbr}>Back</button>
      </div>
    );
  }

  if (o.rocket) {
    return (
      <div className="axx-bar ig-glass">
        <div className="axx-bar-text">
          <b>{o.rocketAim ? `Rocket strike on ${spaceName(o.rocketAim.target)}` : `Rockets from ${spaceName(o.rocket.source)}`}</b>
          <small>{o.rocketAim ? 'One die of damage to the factory.' : 'Tap a lit factory in range.'}</small>
        </div>
        {o.rocketAim && <button className="axx-go danger" onClick={o.launchRocket}>Launch</button>}
        <button className="axx-x" onClick={o.reset}>Cancel</button>
      </div>
    );
  }

  if (o.paraSelected.length) {
    return (
      <div className="axx-sheet ig-glass">
        <div className="axx-sheet-head">
          <div><span className="ig-lab">Airborne assault</span><h3>{o.paraAim ? spaceName(o.paraAim.target) : 'Tap a lit territory'}</h3></div>
          <button className="axx-x" onClick={o.reset}>Cancel</button>
        </div>
        <div className="axx-chips">
          {o.paraCards.map((card) => (
            <button key={card.key} className={`axx-chip${o.paraSelected.some((c) => c.key === card.key) ? ' on' : ''}`} onClick={() => o.togglePara(card.key)}>
              {spaceName(card.from)} pair {card.pairNumber}
            </button>
          ))}
        </div>
        {o.paraAim && (
          <>
            <p className="axx-hint">Ground units next door may join. Without them the drop cannot retreat.</p>
            <div className="axx-chips">
              {o.paraSupport.map((s) => (
                <button key={s.key} className={`axx-chip${o.paraSupportKeys.includes(s.key) ? ' on' : ''}`} onClick={() => o.toggleParaSupport(s.key)}>
                  {UNITS[s.unit].name}, {spaceName(s.from)}
                </button>
              ))}
            </div>
            <button className="axx-go wide danger" onClick={o.launchAirborne}>Drop on {spaceName(o.paraAim.target)}</button>
          </>
        )}
      </div>
    );
  }

  if (o.choices) {
    return (
      <div className="axx-sheet ig-glass">
        <div className="axx-sheet-head">
          <div><span className="ig-lab">Choose the route</span><h3>{spaceName(o.choices[0].id)}</h3></div>
          <button className="axx-x" onClick={o.cancelPending}>Back</button>
        </div>
        <div className="axx-chips">
          {o.choices.map((t, i) => <button key={i} className="axx-chip" onClick={() => o.choose(t)}>{o.routeLabel(t) || 'Direct'}</button>)}
        </div>
      </div>
    );
  }

  if (o.pending) {
    const t = o.pending;
    const plans = t.carrierPlans ?? [];
    return (
      <div className="axx-bar ig-glass confirm">
        <div className="axx-bar-text">
          <b>{o.verb(t)} {spaceName(t.id)}</b>
          <small>{force} from {from}{o.routeLabel(t) ? `, ${o.routeLabel(t)}` : ''}</small>
          {plans.length > 0 && (
            <div className="axx-chips tight">
              {plans.map((plan) => (
                <button key={plan.key} className={`axx-chip${o.carrierPlan?.key === plan.key ? ' on' : ''}`} onClick={() => o.setCarrierPlanKey(plan.key)}>
                  Land on a new carrier in {spaceName(plan.zone)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className={`axx-go${combat ? ' danger' : ''}`} onClick={() => o.commit(t)}>{o.verb(t).split(' ')[0]}</button>
        <button className="axx-x" onClick={o.cancelPending}>Back</button>
      </div>
    );
  }

  if (o.hasForce) {
    return (
      <div className="axx-bar ig-glass">
        <div className="axx-bar-text">
          <div className="axx-force">
            {o.picked.map((p) => (
              <span key={`${p.space}|${p.key}`} className="axx-unit">
                <UnitIcon unitKey={p.key} size={20} title={UNITS[p.key].name} />
                <button onClick={() => o.setCount(p.space, p.key, p.count - 1)} aria-label={`One fewer ${UNITS[p.key].name}`}>-</button>
                <b className="ig-num">{p.count}<i>/{p.max}</i></b>
                <button onClick={() => o.setCount(p.space, p.key, p.count + 1)} disabled={p.count >= p.max} aria-label={`One more ${UNITS[p.key].name}`}>+</button>
              </span>
            ))}
            {o.cargoPicked.map((p) => (
              <span key={`c${p.space}|${p.key}`} className="axx-unit"><UnitIcon unitKey={p.key} size={20} title={UNITS[p.key].name} /><b className="ig-num">{p.count}</b> aboard</span>
            ))}
          </div>
          <small>
            {o.targets.length || o.loadZones.length
              ? `From ${from}. ${combat ? 'Tap or drop on a red space to attack.' : 'Tap or drop on a lit space to move.'}`
              : `From ${from}. ${combat ? 'Nothing in reach to attack with this force.' : 'Nowhere to go with this force.'}`}
          </small>
          {hulls.length > 0 && (
            <div className="axx-chips tight">
              {hulls.map((card) => (
                <button key={`${card.owner}-${card.physicalOrdinal}`} className={`axx-chip${o.cargoSelected(o.focus!, card) ? ' on' : ''}`} onClick={() => o.toggleCargoHull(o.focus!, card)}>
                  Land {card.manifest.map((c) => unitCount(c.count, c.key)).join(' and ')}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="axx-x" onClick={o.reset}>Clear</button>
      </div>
    );
  }

  return (
    <div className="axx-bar ig-glass">
      <div className="axx-bar-text">
        <b>{combat ? 'Plan your attacks' : 'Move your forces'}</b>
        <small>
          {view.active === 'usa' ? `${powerName(o.me)} forces. ` : ''}
          Tap a unit to pick it up, hold to take every one of its kind, or drag it where it should go.
        </small>
        {(hulls.length > 0 || o.rocketLaunchers.length > 0 || o.paraCards.length > 0) && (
          <div className="axx-chips tight">
            {hulls.map((card) => (
              <button key={`${card.owner}-${card.physicalOrdinal}`} className="axx-chip" onClick={() => o.toggleCargoHull(o.focus!, card)}>
                Land {card.manifest.map((c) => unitCount(c.count, c.key)).join(' and ')}
              </button>
            ))}
            {o.rocketLaunchers.map((l) => (
              <button key={o.rocketId(l)} className="axx-chip" onClick={() => o.pickRocket(o.rocketId(l))}>Rockets, {spaceName(l.source)}</button>
            ))}
            {o.paraCards.map((card) => (
              <button key={card.key} className="axx-chip" onClick={() => o.togglePara(card.key)}>Paratroopers, {spaceName(card.from)}</button>
            ))}
          </div>
        )}
      </div>
      <button className="axx-go" onClick={() => o.finish()}>{combat ? 'Done attacking' : 'Done moving'}</button>
    </div>
  );
}

export function Stepper({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="axx-stepper">
      <span>{label}</span>
      <button onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Fewer ${label}`}>-</button>
      <b className="ig-num">{value}</b>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>+</button>
    </span>
  );
}
