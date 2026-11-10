// Dev bench for Axis & Allies: the whole game running in this tab, no room and no server.
// Route: /dev/axis            the device screen, commanding every power
//        /dev/axis?screen=tv  the big screen
// The engine state and a few helpers hang off window.__lab so a battle can be staged from the console.
import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AXIS_SEATS, applyAxisGameAction, axisGameViewFor, createAxisGame,
  type AxisAction, type AxisState, type AxisView, type PowerKey,
} from '@bge/shared';

const AxisPlay = lazy(() => import('../axis/AxisPlay'));
const AxisBoard = lazy(() => import('../axis/AxisBoard'));

interface Lab {
  state: AxisState;
  view: AxisView;
  act: (a: AxisAction & { asPower?: PowerKey }) => string | null;
  /** Roll, take losses and press on until the open battle wants a human or ends. */
  step: () => string;
  /** Play the open battle to its end. */
  resolve: () => void;
  screen: (s: 'device' | 'tv') => void;
  refresh: () => void;
  /** Put two made-up forces next to each other and send Germany in. */
  fight: (kind?: 'land' | 'sea' | 'big') => string | null;
}

export function AxisDev() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const state = useRef<AxisState | null>(null);
  if (!state.current) {
    state.current = createAxisGame([], Number(params.get('seed') ?? 7), {
      scenario: params.get('scenario') === '1942' ? '1942' : '1941',
      rnd: params.get('rnd') === '1',
      nationalObjectives: true,
      winCondition: 'standard',
    });
  }
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const [screen, setScreen] = useState<'device' | 'tv'>(params.get('screen') === 'tv' ? 'tv' : 'device');
  const [error, setError] = useState<string | null>(null);
  const fought = useRef(false);

  const view = useMemo<AxisView>(() => {
    void tick;
    // a fresh object every time, the way the wire delivers it
    const v = JSON.parse(JSON.stringify(axisGameViewFor(state.current!, 'dev'))) as AxisView;
    v.battleVisualReady = true;
    v.controlledPowers = [...AXIS_SEATS];
    return v;
  }, [tick]);

  const act = (a: AxisAction & { asPower?: PowerKey }): string | null => {
    const result = applyAxisGameAction(state.current!, 0, a);
    const err = result.ok ? null : result.error ?? 'Illegal action';
    setError(err);
    bump();
    return err;
  };

  useEffect(() => {
    const lab: Lab = {
      state: state.current!,
      view,
      act,
      step: () => {
        const v = axisGameViewFor(state.current!, 'dev');
        const c = v.combat;
        if (!c) return 'no battle';
        const ref = { combatId: c.id, visualSeq: c.visualSeq };
        const d = c.battle.decision;
        const cont = v.pendings.find((p) => p.kind === 'battle-continue');
        const pending = v.pendings.find((p) => p.kind !== 'battle-continue');
        const sidePower = (side: string) => (side === 'attacker' ? c.attacker : (pending?.power ?? c.attacker)) as PowerKey;
        if (cont) return act({ type: 'battleContinue', ...ref, asPower: cont.power } as never) ?? 'continue';
        if (d?.type === 'casualties') {
          const uids: number[] = [];
          for (const b of d.buckets) for (const uid of b.eligible) if (uids.length < d.picks && !uids.includes(uid)) uids.push(uid);
          return act({ type: 'battleCasualties', uids, ...ref, asPower: sidePower(d.side) } as never) ?? 'casualties';
        }
        if (d?.type === 'retreat') return act({ type: 'battleRetreat', retreat: false, ...ref } as never) ?? 'press on';
        if (d?.type === 'submerge') return act({ type: 'battleSubmerge', uids: [], ...ref, asPower: sidePower(d.side) } as never) ?? 'submerge';
        return act({ type: 'battleRoll', ...ref } as never) ?? 'roll';
      },
      resolve: () => { for (let i = 0; i < 300 && axisGameViewFor(state.current!, 'dev').combat; i++) lab.step(); },
      screen: setScreen,
      refresh: bump,
      fight: (kind = 'land') => {
        const st = state.current!;
        if (st.phase === 'purchase') act({ type: 'endPhase' });
        const put = (space: string, power: PowerKey, units: Record<string, number>) => {
          st.board[space] = Object.entries(units).map(([key, count]) => ({ power, key, count })) as never;
        };
        const pick = (units: Record<string, number>) => Object.entries(units).map(([key, count]) => ({ key, count }));
        if (kind === 'sea') {
          const mine = { battleship: 1, cruiser: 2, destroyer: 2, submarine: 2 };
          put('sz-5', 'germany', mine);
          put('sz-6', 'uk', { battleship: 1, carrier: 1, cruiser: 1, destroyer: 2, transport: 1, fighter: 2 });
          return act({ type: 'attack', target: 'sz-6', forces: [{ from: 'sz-5', units: pick(mine) }] } as never);
        }
        const mine = kind === 'big' ? { infantry: 12, artillery: 4, tank: 6, fighter: 3, bomber: 2 } : { infantry: 6, artillery: 2, tank: 3, fighter: 2, bomber: 1 };
        put('poland', 'germany', mine);
        put('east-poland', 'ussr', kind === 'big' ? { infantry: 10, artillery: 3, tank: 4, fighter: 2, aaGun: 1 } : { infantry: 5, artillery: 1, tank: 2, fighter: 1, aaGun: 1 });
        return act({ type: 'attack', target: 'east-poland', forces: [{ from: 'poland', units: pick(mine) }] } as never);
      },
    };
    (window as unknown as { __lab?: Lab }).__lab = lab;
    const want = params.get('fight');
    if (want && !fought.current) {
      fought.current = true;
      lab.fight(want as 'land' | 'sea' | 'big');
    }
  });

  return (
    <Suspense fallback={<div className="page center"><h2>Loading</h2></div>}>
      {screen === 'tv' ? <AxisBoard view={view} /> : <AxisPlay view={view} act={act as (a: AxisAction) => void} error={error} />}
    </Suspense>
  );
}
