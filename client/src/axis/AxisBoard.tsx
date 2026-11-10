// The big screen. Only the war: the whole map, a camera that goes to every order as it is given,
// one line saying what just happened, the battle when there is one, and the ledger between turns.
import './axis.css';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { POWERS, WIN_CONDITIONS, type AxisView, type PowerKey } from '@bge/shared';
import { MapStage } from './MapStage';
import { Boundary } from './Boundary';
import { Roundel } from './Roundel';
import { stagedUnits } from './AxisPlay';
import { MOB_ID, powerInk, powerName } from './world';
import { playSfx } from '../sfx';

const BattleTheater = lazy(() => import('./battle/BattleTheater').then((m) => ({ default: m.BattleTheater })));

const seatVar = (power: string | null) => ({ '--seat': powerInk(power) } as CSSProperties);
type Entry = AxisView['log'][number];
// The engine writes its log with long dashes; the screen speaks in plain sentences.
const plain = (text: string) => text.replace(/\s+[—–]\s+/g, '. ').replace(/[—–]/g, ', ').replace(/!+/g, '.');

const PHASE_LABEL: Record<string, string> = {
  rnd: 'Research', purchase: 'Buying units', combatMove: 'Planning attacks', battle: 'Battle',
  noncombat: 'Moving', mobilize: 'Deploying', income: 'Collecting income', gameOver: 'Game over',
};

export default function AxisBoard({ view }: { view: AxisView }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<MapStage | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState('');
  const [caption, setCaption] = useState<Entry | null>(null);
  const [ledger, setLedger] = useState<{ power: PowerKey; before: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    let st: MapStage;
    try {
      st = new MapStage(host.current, 'screen');
    } catch (e) {
      console.error(e);
      setFailed('This browser cannot draw the map.');
      return;
    }
    stage.current = st;
    st.onProgress = setLoaded;
    st.ready.then(() => setLoaded(1)).catch((e) => { console.error(e); setFailed('The map could not be loaded.'); });
    return () => { st.dispose(); stage.current = null; };
  }, []);

  const staged = useMemo(() => stagedUnits(view), [view.powers, view.active, view.turnStartedCapitalOccupied]);
  const first = useRef(true);
  useEffect(() => {
    stage.current?.setBoard(view.board, staged, !first.current);
    stage.current?.setControl(view.control);
    first.current = false;
  }, [view.board, view.control, staged]);

  // The attack under way is drawn on the map for as long as it lasts.
  const combat = view.combat;
  const combatSig = combat ? `${combat.id}:${combat.space}` : '';
  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    if (!combat) { st.setArrows([]); st.setTargets([], false); return; }
    const from = [...new Set(combat.from.map((f) => f.space))].filter((s) => s !== combat.space);
    st.setArrows(from.length ? [{ from, to: combat.space, tone: 'attack' }] : []);
    st.setTargets([{ id: combat.space, tone: 'attack' }], true);
    void st.flyTo([combat.space, ...from], { pad: 2.6, seconds: 1.1 });
  }, [combatSig]);

  // Every logged order is shown in turn: the camera goes there, the caption says it, then the next.
  const queue = useRef<Entry[]>([]);
  const seen = useRef(-1);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inBattle = useRef(false);
  inBattle.current = Boolean(combat);
  const advance = () => {
    const next = queue.current.shift();
    if (!next) {
      busy.current = false;
      setCaption(null);
      if (!inBattle.current) void stage.current?.home();
      return;
    }
    busy.current = true;
    setCaption(next);
    playSfx('turn');
    if (next.space) void stage.current?.flyTo([next.space], { pad: 4.2, seconds: 1.2 });
    // Fall behind and the beats shorten, so the screen never trails the table by long.
    timer.current = setTimeout(advance, queue.current.length > 3 ? 1300 : 2900);
  };
  useEffect(() => {
    if (seen.current < 0) { seen.current = view.log.length; return; }
    const fresh = view.log.slice(seen.current);
    seen.current = view.log.length;
    if (!fresh.length) return;
    queue.current.push(...fresh);
    if (!busy.current) advance();
  }, [view.log.length]);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Purchases appear in the mobilization zone: look at them while the buying happens.
  useEffect(() => {
    if (view.phase === 'purchase' && staged.length && !busy.current) void stage.current?.flyTo([MOB_ID], { pad: 6 });
  }, [staged.length, view.phase]);

  // Between turns the ledger comes up: what everyone earns and what the last power collected.
  const prev = useRef<{ power: PowerKey; ipcs: Record<string, number> } | null>(null);
  useEffect(() => {
    const ipcs = Object.fromEntries(view.turnOrder.map((k) => [k, view.powers[k].ipcs]));
    const was = prev.current;
    prev.current = { power: view.active, ipcs };
    if (!was || was.power === view.active || view.winner) return;
    setLedger({ power: was.power, before: was.ipcs });
    const t = setTimeout(() => setLedger(null), 6500);
    return () => clearTimeout(t);
  }, [view.active, view.round]);

  if (failed) return <div className="page center"><h2>{failed}</h2></div>;

  const active = view.operatingPower ?? view.active;
  const goal = WIN_CONDITIONS[view.options.winCondition]?.cities ?? view.vc.goal;
  const maxIncome = Math.max(1, ...view.turnOrder.map((k) => view.powers[k].production));

  return (
    <div className="axt" style={seatVar(active)}>
      <div className="axt-map" ref={host} />
      {loaded < 1 && (
        <div className="axx-curtain">
          <span className="eyebrow">Axis &amp; Allies</span>
          <h2>Setting the table</h2>
          <div className="axx-load"><i style={{ width: `${Math.round(loaded * 100)}%` }} /></div>
        </div>
      )}

      <div className="axt-turn ig-glass">
        <Roundel power={active} size={52} />
        <span>
          <small className="ig-lab">Round {view.round}</small>
          <b>{view.winner ? (view.winner === 'axis' ? 'The Axis wins' : 'The Allies win') : powerName(active)}</b>
          <small>{PHASE_LABEL[view.phase] ?? ''}</small>
        </span>
      </div>

      <div className="axt-powers">
        {view.turnOrder.map((k) => (
          <div key={k} className={`axt-power ig-glass${k === view.active ? ' on' : ''}`} style={seatVar(k)}>
            <Roundel power={k} size={30} />
            <span>
              <small>{POWERS[k].short}</small>
              <b className="ig-num">{view.powers[k].ipcs}<i>+{view.powers[k].production}</i></b>
            </span>
          </div>
        ))}
      </div>

      <div className="axt-cities ig-glass">
        <span className="side"><small className="ig-lab">Axis</small><b className="ig-num">{view.vc.axis}</b></span>
        <span className="track" aria-label={`Victory cities: Axis ${view.vc.axis}, Allies ${view.vc.allies}, ${goal} to win`}>
          <i className="axis" style={{ width: `${(view.vc.axis / 18) * 100}%` }} />
          <i className="allies" style={{ width: `${(view.vc.allies / 18) * 100}%` }} />
          <em style={{ left: `${(goal / 18) * 100}%` }} />
          <em style={{ right: `${(goal / 18) * 100}%` }} />
        </span>
        <span className="side"><small className="ig-lab">Allies</small><b className="ig-num">{view.vc.allies}</b></span>
        <small className="goal">{goal} victory cities to win</small>
      </div>

      {caption && !combat && (
        <div className="axt-caption ig-glass" key={`${caption.round}-${caption.text}`} style={seatVar(caption.power)}>
          {caption.power && <small>{POWERS[caption.power].name}</small>}
          <b>{plain(caption.text)}</b>
        </div>
      )}

      <Boundary key={combat?.id ?? 'idle'}><Suspense fallback={null}><BattleTheater view={view} /></Suspense></Boundary>

      {ledger && !combat && (
        <div className="axt-income">
          <div className="axt-income-card ig-glass" style={seatVar(ledger.power)}>
            <span className="ig-lab">End of turn</span>
            <h2>{POWERS[ledger.power].name} collects {Math.max(0, view.powers[ledger.power].ipcs - (ledger.before[ledger.power] ?? 0))} IPCs</h2>
            {view.turnOrder.map((k) => {
              const delta = view.powers[k].ipcs - (ledger.before[k] ?? view.powers[k].ipcs);
              return (
                <div key={k} className="axt-row" style={seatVar(k)}>
                  <Roundel power={k} size={26} />
                  <span className="nm">{POWERS[k].name}</span>
                  <span className="bar"><i style={{ width: `${(view.powers[k].production / maxIncome) * 100}%` }} /></span>
                  <b className="ig-num">{view.powers[k].ipcs}</b>
                  <em className={`ig-num ${delta > 0 ? 'ig-up' : delta < 0 ? 'ig-down' : ''}`}>{delta > 0 ? `+${delta}` : delta || ''}</em>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
