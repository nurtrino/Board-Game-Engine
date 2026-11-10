// The TV battle screen. A full-screen 3D battlefield with the interface drawn over it.
// The TV is a spectator: it never sends anything and nothing waits for it. The interface (forces,
// dice, losses, result) renders directly from view state; the 3D stage plays the same state as a
// queue of beats and is allowed to be late, to skip, or to be absent.
import { useEffect, useMemo, useRef, useState } from 'react';
import { UNITS, type AxisView, type PowerKey } from '@bge/shared';
import UnitIcon from '../UnitIcon';
import { Roundel } from '../Roundel';
import { lastVolley } from './dice';
import { Director } from './director';
import { DiceStrip, ForceCard, LossFeed, ResultCard, battleKicker, resultFromCombat, resultFromLast, seat } from './Hud';
import { combatantName, defenderOf, forceRows, spaceName, unitName, type Combat, type LastBattle, type Side } from './model';
import { BattleSound } from './sound';
import { BattleStage } from './stage/BattleStage';
import { pendingHits, stageStatus } from './timeline';
import './battle.css';

/** How long the result stays up after both commanders have continued. */
const AFTER_MS = 5200;
/** How long the last explosions get before the result card covers the field. */
const RESULT_DELAY_MS = 2600;

export function BattleTheater({ view, onDone }: { view: AxisView; onDone?: () => void }) {
  const combat = view.combat;
  const held = useRef<Combat | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const [endedSeq, setEndedSeq] = useState<number | null>(null);
  if (combat) held.current = combat;

  // After the battle leaves the state, its report (same seq) holds the screen for a few seconds.
  const last = view.lastBattle;
  const was = held.current;
  const after: LastBattle | null = !combat && was && last && last.seq === was.id && endedSeq !== last.seq ? last : null;
  const afterSeq = after?.seq ?? null;
  const idle = combat == null;

  useEffect(() => {
    if (!idle || !held.current) return;
    if (afterSeq === null) {
      // raids, rocket strikes and anything without a report end as soon as they leave the state
      held.current = null;
      done.current?.();
      return;
    }
    const id = window.setTimeout(() => {
      held.current = null;
      setEndedSeq(afterSeq);
      done.current?.();
    }, AFTER_MS);
    return () => window.clearTimeout(id);
  }, [idle, afterSeq]);

  const showing = combat ?? (after ? was : null);
  if (!showing) return null;
  return <Theater combat={showing} after={after} active={view.active} />;
}

function Theater({ combat, after, active }: { combat: Combat; after: LastBattle | null; active: PowerKey }) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const director = useRef<Director | null>(null);
  const latest = useRef(combat);
  latest.current = combat;
  // The battle is shown as a designed board over the map. The modelled battlefield is still here
  // behind ?battle=3d for the day its art is good enough to lead.
  const [mode, setMode] = useState<'3d' | '2d'>(() => (new URLSearchParams(window.location.search).get('battle') === '3d' ? '3d' : '2d'));
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const sound = useRef<BattleSound | null>(null);
  useEffect(() => {
    const s = new BattleSound();
    sound.current = s;
    return () => { s.dispose(); sound.current = null; };
  }, []);

  // The stage lives as long as this screen is in 3D. One stage serves battle after battle.
  useEffect(() => {
    if (mode !== '3d' || !host.current || !labels.current) return;
    let stage: BattleStage;
    try {
      stage = new BattleStage(host.current, labels.current);
    } catch (error) {
      console.warn('[battle] 3D is not available here, showing the flat battle', error);
      setMode('2d');
      return;
    }
    const d = new Director(stage, {
      onPhase: (p) => { if (p === 'failed') setMode('2d'); else setPhase(p); },
    });
    stage.onLost = () => setMode('2d');
    director.current = d;
    d.ingest(latest.current);
    const onVisible = () => { if (!document.hidden) d.catchUp(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      director.current = null;
      d.dispose();
      stage.dispose();
    };
  }, [mode]);

  useEffect(() => { director.current?.ingest(combat); }, [combat]);

  const b = combat.battle;
  const volley = useMemo(() => lastVolley(b.log, [...b.attacker, ...b.defender]), [b.log, b.attacker, b.defender]);
  const pending = pendingHits(b);
  const status = stageStatus(combat, active);
  const over = b.status !== 'ongoing' || after != null;
  const defender = defenderOf(b);

  // Let the last hits land before the result covers the field. A screen that opens on a finished
  // battle shows the result at once.
  const overKey = over ? `${combat.id}:${b.status}` : null;
  const [resultKey, setResultKey] = useState<string | null>(overKey);
  useEffect(() => {
    if (!overKey) { setResultKey(null); return; }
    const id = window.setTimeout(() => setResultKey(overKey), mode === '3d' ? RESULT_DELAY_MS : 1100);
    return () => window.clearTimeout(id);
  }, [overKey, mode]);
  const result = !over ? null : after ? resultFromLast(after) : resultKey === overKey ? resultFromCombat(combat) : null;

  return (
    <div className={`axb axb-tv mode-${mode}`} data-phase={mode === '3d' ? phase : 'ready'} style={seat(combat.attacker)}>
      <div className="axb-stage" ref={host} aria-hidden="true" />
      <div className="axb-tags" ref={labels} aria-hidden="true" />
      {mode === '2d' && <FlatField combat={combat} />}
      {mode === '3d' && phase === 'loading' && (
        <div className="axb-loading"><span className="ig-lab">Loading the battlefield</span><i /></div>
      )}
      <div className="axb-shade" aria-hidden="true" />

      <header className="axb-top ig-glass">
        <small className="ig-lab">{battleKicker(combat)}</small>
        <h1>{spaceName(combat.space)}</h1>
        {combat.kind === 'battle' && <span className="axb-round ig-num">Round {b.round}</span>}
      </header>

      <div className="axb-side attacker">
        <ForceCard side="attacker" power={combat.attacker} units={b.attacker} pending={pending.find((p) => p.side === 'attacker')} />
      </div>
      <div className="axb-side defender">
        <ForceCard side="defender" power={defender} units={b.defender} pending={pending.find((p) => p.side === 'defender')} />
      </div>

      {result && (
        <div className="axb-result-wrap">
          <ResultCard result={result} />
        </div>
      )}

      <div className="axb-dock">
        {!result && <LossFeed log={b.log} />}
        <footer className="axb-bottom ig-glass">
          {volley
            ? <DiceStrip volley={volley} combatId={combat.id} onRoll={() => sound.current?.play('dice-roll')} />
            : <div className="axb-volley empty"><span className="ig-lab">Dice</span><b>No roll yet</b></div>}
          <p className="axb-status">{after ? 'Battle over' : status.line}</p>
        </footer>
      </div>
    </div>
  );
}

/** The battle board: both forces drawn up as ranks of pieces over the map, losses struck out.
 *  One tile is one unit, so the size of a force and what it has lost read from across a room. */
function FlatField({ combat }: { combat: Combat }) {
  const b = combat.battle;
  const column = (side: Side, power: string | null, units: typeof b.attacker) => {
    const rows = forceRows(units);
    const alive = rows.reduce((n, r) => n + r.alive, 0);
    return (
      <section className={`axb-flat-side ${side}`} style={seat(power)}>
        <header>
          <Roundel power={power} size={72} />
          <div>
            <small className="ig-lab">{side === 'attacker' ? 'Attacking' : 'Defending'}</small>
            <h2>{combatantName(power)}</h2>
          </div>
          <b className="ig-num">{alive}</b>
        </header>
        <div className="axb-ranks">
          {rows.map((r) => {
            const total = r.alive + r.lost;
            const shown = Math.min(12, total);
            const standing = total > shown ? Math.round((r.alive / total) * shown) : r.alive;
            const needs = side === 'attacker' ? UNITS[r.key].attack : UNITS[r.key].defense;
            return (
              <div className={`axb-rank${r.alive ? '' : ' gone'}`} key={r.key}>
                <div className="axb-rank-head">
                  <b className="ig-num">{r.alive}</b>
                  <span>{unitName(r.key)}{r.alive === 1 ? '' : 's'}</span>
                  <em>{needs ? `hits on ${needs} or less` : 'does not fire'}</em>
                </div>
                <div className="axb-tiles" aria-label={`${r.alive} ${unitName(r.key)}, ${r.lost} lost`}>
                  {Array.from({ length: shown }, (_, i) => (
                    <span key={i} className={i < standing ? '' : 'lost'}><UnitIcon unitKey={r.key} size={40} /></span>
                  ))}
                  {total > shown && <i className="ig-num">+{total - shown}</i>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };
  return (
    <div className="axb-flat">
      {column('attacker', combat.attacker, b.attacker)}
      <div className="axb-flat-vs"><span>vs</span></div>
      {column('defender', defenderOf(b), b.defender)}
    </div>
  );
}
