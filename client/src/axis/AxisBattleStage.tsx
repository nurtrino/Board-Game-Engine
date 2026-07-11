// TV battle stage: the assistant repo's cinematic 3D battle sim, driven by
// OUR battle engine's state. Expands across the middle of the screen while a
// combat resolves: the battlefield on the left, dice tray + scoreboard on
// the right, and an after-action report with the losses when it ends.

import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  AXIS_MAP, POWERS, UNITS,
  type AxisView, type PowerKey, type UnitKey,
} from '@bge/shared';

function spaceName(id: string): string {
  const t = AXIS_MAP.territories.find((x) => x.id === id);
  if (t) return t.name;
  const z = AXIS_MAP.seaZones.find((x) => x.id === id);
  return z ? `Sea Zone ${z.n}` : id;
}
import BattleSim, { clearBattleAssetCache, type BattleSimProps } from './sim/BattleSim';
import { useAxisManifest } from './AxisScene';
import DiceBox from '@3d-dice/dice-box-threejs';
import UnitIcon from './UnitIcon';
import { powerTextColor } from './axisColors';
import {
  battlePresentationGenerationAccepts,
  battlePresentationReady,
  battlePresentationSessionAccepts,
  diceNotation,
  physicalDiceResultValues,
  planBattleVisualTransition,
  type BattlePresentationGeneration,
  type BattlePresentationSession,
  type BattlePresentationSnapshot,
} from './axisBattlePresentation';
import { axisRetreatCopy, axisRetreatOutcomeText } from './axisRetreatPresentation';
import {
  loadAxisBattleVisualStyle,
  saveAxisBattleVisualStyle,
  type AxisBattleVisualStyle,
} from './axisBattleVisualStyle';
import type { SimUnit } from './sim/battlescene';

const loadStylizedBattleSim = () => import('./sim/StylizedBattleSim');

/** Warm only the selected secondary module; it remains out of the initial bundle. */
export function warmPreferredBattleRenderer(): Promise<unknown> {
  return loadAxisBattleVisualStyle() === 'diorama'
    ? loadStylizedBattleSim()
    : Promise.resolve();
}

class BattleStyleBoundary extends Component<{
  children: ReactNode;
  onFailure: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const powerName = (p: PowerKey | 'china' | null) => (p == null ? 'Neutral' : p === 'china' ? 'China' : POWERS[p].name);

type Battle = NonNullable<AxisView['combat']>['battle'];

type SessionProgress = {
  sessionEpoch: number;
  value: number;
};

function aaTargetLabel(battle: Battle, targetUid?: number): string | null {
  if (targetUid === undefined) return null;
  const target = battle.attacker.find((unit) => unit.uid === targetUid);
  if (!target) return null;
  return target.role === 'bomber' && target.pairId
    ? 'AA vs Bomber + carried Infantry'
    : `AA vs ${UNITS[target.key].name}`;
}

type DiceRuntime = {
  box: DiceBox;
  el: HTMLDivElement;
  status: 'loading' | 'ready' | 'failed';
  ready: Promise<void>;
  disposed: boolean;
  ownerToken: number | null;
  rollToken: number;
  resizeListener: EventListenerOrEventListenerObject | null;
};

let diceRuntime: DiceRuntime | null = null;
let diceOwnerSequence = 0;

function reportDiceFailure(stage: string, error: unknown): void {
  console.error(`[Axis battle dice] ${stage}`, error);
}

type DiceBoxInternals = {
  running?: boolean | number;
  rolling?: boolean;
  diceList?: Array<{
    body?: unknown;
    geometry?: { dispose?: () => void };
    getFaceValue?: () => { value?: unknown; reason?: unknown };
    axisOwnedGeometry?: { dispose?: () => void };
  }>;
  scene?: { remove: (item: unknown) => void };
  world?: { removeBody: (body: unknown) => void };
  camera?: unknown;
  swapDiceFace?: (die: unknown, value: number) => void;
  renderer?: {
    render?: (scene: unknown, camera: unknown) => void;
    dispose?: () => void;
    forceContextLoss?: () => void;
  };
};

function stopDiceMotion(box: DiceBox): void {
  const internal = box as unknown as DiceBoxInternals;
  internal.running = false;
  internal.rolling = false;
}

/**
 * The package's public clearDice schedules a second render 100ms later. Remove
 * models synchronously instead so a retry can immediately dispose the WebGL
 * renderer without leaving a delayed render pointed at the dead context.
 */
function clearDiceImmediately(box: DiceBox): void {
  const internal = box as unknown as DiceBoxInternals;
  stopDiceMotion(box);
  if (internal.diceList && internal.scene && internal.world) {
    let die: NonNullable<DiceBoxInternals['diceList']>[number] | undefined;
    while ((die = internal.diceList.pop())) {
      internal.scene.remove(die);
      if (die.body) internal.world.removeBody(die.body);
      die.axisOwnedGeometry?.dispose?.();
    }
  }
  internal.renderer?.render?.(internal.scene, internal.camera);
}

/**
 * The upstream renderer's predetermination simulation can diverge from its
 * visible animation on slower frames. Re-label the face that actually settled
 * under the camera, then render once more and verify what is on screen. This
 * preserves the physical throw while guaranteeing the authoritative faces.
 */
function settleAuthoritativeDiceFaces(box: DiceBox, expected: readonly number[]): boolean {
  const internal = box as unknown as DiceBoxInternals;
  const dice = internal.diceList;
  if (!dice || dice.length !== expected.length || !internal.swapDiceFace) return false;

  for (let index = 0; index < dice.length; index++) {
    const die = dice[index]!;
    const face = die.getFaceValue?.();
    if (typeof face?.value !== 'number') return false;
    // A forced result means the package already cloned this die's geometry.
    // Track it so repeated volleys can release that otherwise orphaned clone.
    if (face.reason === 'forced' && die.geometry) die.axisOwnedGeometry = die.geometry;
    if (face.value === expected[index]) continue;

    const previousGeometry = die.geometry;
    const previousOwnedGeometry = die.axisOwnedGeometry;
    internal.swapDiceFace(die, expected[index]!);
    if (die.geometry !== previousGeometry && die.geometry) {
      if (previousOwnedGeometry === previousGeometry) previousOwnedGeometry?.dispose?.();
      die.axisOwnedGeometry = die.geometry;
    }
  }

  internal.renderer?.render?.(internal.scene, internal.camera);
  return dice.every((die, index) => die.getFaceValue?.().value === expected[index]);
}

function ownsDiceRuntime(runtime: DiceRuntime, ownerToken: number): boolean {
  return diceRuntime === runtime
    && !runtime.disposed
    && runtime.ownerToken === ownerToken;
}

function disposeDiceRuntime(runtime: DiceRuntime): void {
  if (!runtime.disposed) {
    runtime.disposed = true;
    runtime.ownerToken = null;
    runtime.rollToken += 1;
  }
  // Re-attempt renderer cleanup even for an already-marked runtime. The
  // package creates its renderer before awaiting theme assets, so initialize()
  // can finish after an early reset and expose that same context again.
  stopDiceMotion(runtime.box);
  if (runtime.resizeListener) {
    window.removeEventListener('resize', runtime.resizeListener);
    runtime.resizeListener = null;
  }
  const renderer = (runtime.box as unknown as DiceBoxInternals).renderer;
  try { renderer?.dispose?.(); } catch { /* an interrupted renderer may already be disposed */ }
  try { renderer?.forceContextLoss?.(); } catch { /* context loss is best-effort during teardown */ }
  // A queued animation callback may run once after stopDiceMotion. Make that
  // callback harmless after the context has been released.
  if (renderer?.render) renderer.render = () => {};
  runtime.el.remove();
}

function parkDiceElement(el: HTMLDivElement): void {
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    visibility: 'hidden',
    pointerEvents: 'none',
    zIndex: '-1',
  });
}

function mountDiceElement(el: HTMLDivElement): void {
  Object.assign(el.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    visibility: 'visible',
    pointerEvents: 'none',
    zIndex: '',
  });
}

function createDiceRuntime(initialHost?: HTMLElement): DiceRuntime {
  const previous = document.getElementById('ax-dice-box');
  if (previous) previous.remove();
  const el = document.createElement('div');
  el.id = 'ax-dice-box';
  if (initialHost) {
    mountDiceElement(el);
    initialHost.appendChild(el);
  } else {
    parkDiceElement(el);
    document.body.appendChild(el);
  }
  const box = new DiceBox('#ax-dice-box', {
    shadows: true,
    sounds: false,
    gravity_multiplier: 400,
    light_intensity: 1,
    // The rail tray is intentionally shallow. The package default (100)
    // produces cropped, unreadable dice at TV aspect ratios.
    baseScale: 46,
    strength: 1,
    theme_surface: 'green-felt',
    theme_customColorset: {
      name: 'Axis brass',
      foreground: '#111820',
      background: '#c9a227',
      outline: '#f1d77a',
      texture: 'none',
      material: 'metal',
    },
  });
  const runtime: DiceRuntime = {
    box,
    el,
    status: 'loading',
    ready: Promise.resolve(),
    disposed: false,
    ownerToken: null,
    rollToken: 0,
    resizeListener: null,
  };
  diceRuntime = runtime;
  // Capture the global resize listener installed synchronously by the package;
  // it exposes no disposer of its own.
  const originalAddEventListener = window.addEventListener;
  window.addEventListener = (function captureDiceResizeListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === 'resize') runtime.resizeListener = listener;
    return (originalAddEventListener as (
      eventType: string,
      eventListener: EventListenerOrEventListenerObject,
      eventOptions?: boolean | AddEventListenerOptions,
    ) => void).call(window, type, listener, options);
  }) as typeof window.addEventListener;
  let init: Promise<void>;
  try {
    init = box.initialize();
  } finally {
    window.addEventListener = originalAddEventListener;
  }
  // Initialization can outlive its timeout. If a retry has replaced this
  // singleton by the time the raw promise finishes, tear down the late WebGL
  // context instead of letting it leak or report readiness.
  void init.then(() => {
    if (runtime.disposed || diceRuntime !== runtime) disposeDiceRuntime(runtime);
  }, () => {});
  const guardedInit = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Physical dice initialization timed out.')), 20_000);
    void init.then(() => { window.clearTimeout(timeout); resolve(); }, (error) => { window.clearTimeout(timeout); reject(error); });
  });
  runtime.ready = guardedInit.then(() => {
    if (runtime.disposed || diceRuntime !== runtime) throw new Error('Physical dice initialization was superseded.');
    runtime.status = 'ready';
  }).catch((error: unknown) => {
    if (!runtime.disposed && diceRuntime === runtime) {
      reportDiceFailure('initialization failed', error);
      runtime.status = 'failed';
    }
    throw error;
  });
  return runtime;
}

function getDiceRuntime(initialHost?: HTMLElement): DiceRuntime {
  return diceRuntime ?? createDiceRuntime(initialHost);
}

/** Warm the physical dice renderer on the TV route before combat begins. */
export function warmDiceBox(): Promise<void> {
  try {
    return getDiceRuntime().ready;
  } catch (error) {
    return Promise.reject(error);
  }
}

function resetDiceBox(): void {
  if (!diceRuntime) return;
  const runtime = diceRuntime;
  diceRuntime = null;
  disposeDiceRuntime(runtime);
}

/** Release the route-owned physical dice singleton when leaving Axis TV. */
export function releaseDiceBox(): void {
  resetDiceBox();
}

function DiceTray({ battle, salvo, retryKey, enabled, onReady, onUnavailable, onFailure, onRollStart, onRollComplete }: {
  battle: Battle;
  salvo: number;
  retryKey: number;
  enabled: boolean;
  onReady: () => void;
  onUnavailable: () => void;
  onFailure: () => void;
  onRollStart: (salvo: number) => void;
  onRollComplete: (salvo: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ownerTokenRef = useRef<number | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const onReadyRef = useRef(onReady);
  const onUnavailableRef = useRef(onUnavailable);
  const onFailureRef = useRef(onFailure);
  const onRollStartRef = useRef(onRollStart);
  const onRollCompleteRef = useRef(onRollComplete);
  onReadyRef.current = onReady;
  onUnavailableRef.current = onUnavailable;
  onFailureRef.current = onFailure;
  onRollStartRef.current = onRollStart;
  onRollCompleteRef.current = onRollComplete;
  const lastRolls = [...battle.log].reverse().find((e) => e.rolls.length > 0);
  const damageVolley = lastRolls?.metric === 'damage';
  const damageScore = damageVolley ? lastRolls.rolls.reduce((sum, roll) => sum + (roll.selected === false ? 0 : roll.value), 0) : 0;

  useEffect(() => {
    if (!enabled) {
      setRuntimeReady(false);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    let active = true;
    let runtime: DiceRuntime;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
    setRuntimeReady(false);
    onUnavailableRef.current();
    try {
      // A cold retry initializes against the tray's real dimensions. Starting
      // WebGL in a hidden viewport-sized parking node can produce a valid but
      // visibly empty canvas after it is resized into this narrow rail.
      runtime = getDiceRuntime(host);
      const ownerToken = ++diceOwnerSequence;
      ownerTokenRef.current = ownerToken;
      runtime.ownerToken = ownerToken;
      runtime.rollToken += 1;
      stopDiceMotion(runtime.box);
      host.appendChild(runtime.el);
      mountDiceElement(runtime.el);
    } catch (error) {
      reportDiceFailure('runtime creation failed', error);
      onFailureRef.current();
      return;
    }

    const lost = (event: Event) => {
      event.preventDefault();
      const ownerToken = ownerTokenRef.current;
      if (!active || ownerToken === null || !ownsDiceRuntime(runtime, ownerToken)) return;
      runtime.status = 'failed';
      onUnavailableRef.current();
      onFailureRef.current();
    };

    void runtime.ready.then(() => {
      const ownerToken = ownerTokenRef.current;
      if (!active || ownerToken === null || !ownsDiceRuntime(runtime, ownerToken) || !host.contains(runtime.el)) return;
      if (runtime.status !== 'ready') {
        onUnavailableRef.current();
        onFailureRef.current();
        return;
      }
      // The renderer is shared across engagements for warm starts. Never let
      // the previous battle's settled faces appear as this battle's first roll.
      try {
        clearDiceImmediately(runtime.box);
      } catch (error) {
        reportDiceFailure('initial clear failed', error);
        runtime.status = 'failed';
        onUnavailable();
        onFailure();
        return;
      }
      for (const canvas of runtime.el.querySelectorAll('canvas')) {
        canvas.addEventListener('webglcontextlost', lost, { once: true });
      }
      const resizeDice = () => window.dispatchEvent(new Event('resize'));
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resizeDice);
        resizeObserver.observe(host);
      }
      setRuntimeReady(true);
      resizeFrame = requestAnimationFrame(() => {
        resizeDice();
        resizeFrame = requestAnimationFrame(() => {
          const currentOwner = ownerTokenRef.current;
          if (active && currentOwner !== null && ownsDiceRuntime(runtime, currentOwner) && host.contains(runtime.el)) onReadyRef.current();
        });
      });
    }).catch((error) => {
      const ownerToken = ownerTokenRef.current;
      if (!active || ownerToken === null || !ownsDiceRuntime(runtime, ownerToken)) return;
      reportDiceFailure('renderer readiness failed', error);
      onUnavailableRef.current();
      onFailureRef.current();
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      cancelAnimationFrame(resizeFrame);
      for (const canvas of runtime.el.querySelectorAll('canvas')) {
        canvas.removeEventListener('webglcontextlost', lost);
      }
      const ownerToken = ownerTokenRef.current;
      if (ownerToken !== null && ownsDiceRuntime(runtime, ownerToken)) {
        runtime.ownerToken = null;
        runtime.rollToken += 1;
        stopDiceMotion(runtime.box);
        if (runtime.el.parentElement === host) document.body.appendChild(runtime.el);
        parkDiceElement(runtime.el);
      }
      if (ownerTokenRef.current === ownerToken) ownerTokenRef.current = null;
    };
  }, [enabled, retryKey]);

  // Presentation-style changes start a new readiness session but do not tear
  // down or reroll the already-settled physical dice. Re-acknowledge the live
  // tray to the new session through the latest scoped callback.
  useEffect(() => {
    if (enabled && runtimeReady) onReady();
  }, [enabled, onReady, runtimeReady]);

  useEffect(() => {
    const runtime = diceRuntime;
    const ownerToken = ownerTokenRef.current;
    if (!enabled || !runtimeReady || !lastRolls || salvo === 0 || runtime?.status !== 'ready'
      || ownerToken === null || !ownsDiceRuntime(runtime, ownerToken)) return;
    const expectedValues = lastRolls.rolls.map((roll) => roll.value);
    const notation = diceNotation(expectedValues);
    if (!notation) return;
    let active = true;
    const rollToken = runtime.rollToken + 1;
    runtime.rollToken = rollToken;
    const ownsRoll = () => active
      && ownsDiceRuntime(runtime, ownerToken)
      && runtime.rollToken === rollToken;
    const fail = (error: unknown) => {
      if (!ownsRoll()) return;
      active = false;
      reportDiceFailure('authoritative roll failed', error);
      stopDiceMotion(runtime.box);
      runtime.status = 'failed';
      onUnavailableRef.current();
      onFailureRef.current();
    };
    const watchdog = window.setTimeout(
      () => fail(new Error('Physical dice roll timed out.')),
      15_000,
    );
    onRollStartRef.current(salvo);
    try {
      void runtime.box.roll(notation).then((result) => {
        if (!ownsRoll()) return;
        window.clearTimeout(watchdog);
        const actualValues = physicalDiceResultValues(result);
        if (actualValues?.length !== expectedValues.length) {
          fail(new Error('Physical dice returned an invalid or incomplete roll result.'));
          return;
        }
        if (!settleAuthoritativeDiceFaces(runtime.box, expectedValues)) {
          fail(new Error(
            `Physical dice could not display the authoritative faces [${expectedValues.join(',')}].`,
          ));
          return;
        }
        onRollCompleteRef.current(salvo);
      }).catch((error) => {
        fail(error);
      });
    } catch (error) {
      fail(error);
    }
    return () => {
      const stillOwnsRoll = ownsRoll();
      active = false;
      window.clearTimeout(watchdog);
      if (stillOwnsRoll) {
        runtime.rollToken += 1;
        stopDiceMotion(runtime.box);
      }
    };
  }, [enabled, runtimeReady, salvo]);

  return (
    <div className="ax-dice-tray">
      <div className="ax-rail-section-head">
        <span>{lastRolls ? lastRolls.title : 'Waiting for the first roll'}</span>
        {lastRolls && <b>{damageVolley ? `${damageScore} damage` : `${lastRolls.rolls.filter((r) => r.hit).length} hits`} / {lastRolls.rolls.length} dice</b>}
      </div>
      <div className={`ax-dice-felt ax-dice-physical${lastRolls ? ' rolled' : ''}`} ref={hostRef} aria-label="Cinematic dice tray" />
      {lastRolls && (
        <div className="ax-dice-row ax-dice-readout" aria-label={`${lastRolls.rolls.length} dice rolled`}>
          {lastRolls.rolls.map((r, i) => {
            const aaTarget = aaTargetLabel(battle, r.targetUid);
            const title = r.selected === false
              ? `${UNITS[r.key].name}: ${r.value}, discarded`
              : damageVolley
                ? `${UNITS[r.key].name}: ${r.value} selected strategic damage`
                : aaTarget
                  ? `${aaTarget}: rolled ${r.value}, needed ${r.hitOn} or less — ${r.hit ? 'target destroyed' : 'target survives'}`
                  : `${UNITS[r.key].name}: rolled ${r.value}, needed ${r.hitOn} or less`;
            return (
              <span
                key={`${salvo}-${i}`}
                className={`ax-die${r.selected === false ? ' discarded' : damageVolley ? ' damage' : r.hit ? ' hit' : ''}`}
                style={{ animationDelay: `${i * 0.06}s` }}
                title={title}
                aria-label={title}
                data-target-uid={r.targetUid}
              >
                <strong>{r.value}</strong>
                <small>{aaTarget ?? (r.selected === false ? 'DISCARD' : damageVolley ? r.selected ? 'BEST' : 'DAMAGE' : r.selected ? r.hit ? 'BEST HIT' : 'BEST' : r.hit ? 'HIT' : `≤${r.hitOn}`)}</small>
              </span>
            );
          })}
        </div>
      )}
      {!lastRolls && <div className="ax-dice-idle"><span /><b>Physical dice are ready for the first volley</b></div>}
      <div className="ax-dice-legend">{damageVolley
        ? lastRolls?.kind === 'rocket_damage'
          ? 'The rocket scores its single physical die face as factory damage.'
          : 'Each bomber scores one die; Heavy Bombers keep the higher roll.'
        : lastRolls?.kind === 'aa_fire'
          ? 'Each AA die is assigned to the Fighter or Bomber named beneath it.'
          : 'Gold dice scored a hit. Heavy Bombers keep only their best attack die.'}</div>
    </div>
  );
}

/** Running record of the fight: every volley and who it killed. */
function KillLog({ battle }: { battle: Battle }) {
  const events = battle.log.filter((e) => e.rolls.length > 0 || e.casualties.length > 0 || e.kind === 'paratrooper_drop').slice(-6);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [battle.log.length]);
  if (events.length === 0) return null;
  return (
    <div className="ax-kill-log" ref={ref}>
      <div className="ax-rail-section-head"><span>Combat timeline</span><b>latest actions</b></div>
      {events.map((e, i) => {
        const hits = e.rolls.filter((r) => r.hit).length;
        const damage = e.metric === 'damage' ? e.rolls.reduce((sum, roll) => sum + (roll.selected === false ? 0 : roll.value), 0) : 0;
        const byKey = new Map<string, number>();
        for (const cas of e.casualties) byKey.set(`${cas.side}:${cas.key}`, (byKey.get(`${cas.side}:${cas.key}`) ?? 0) + 1);
        return (
          <div key={`${battle.log.indexOf(e)}-${i}`} className="ax-kill-row">
            <span className="ax-kill-title">
              {e.title}
              {e.rolls.length > 0 && <em>{e.metric === 'damage' ? `${damage} damage` : `${hits}/${e.rolls.length} hit`}</em>}
            </span>
            {byKey.size > 0 && (
              <span className="ax-kill-cas">
                {[...byKey.entries()].map(([sk, n]) => {
                  const [side, key] = sk.split(':');
                  return <b key={sk} data-side={side}>{n} {UNITS[key as UnitKey].name}</b>;
                })}
              </span>
            )}
            {e.kind === 'paratrooper_drop' && <span className="ax-kill-cas"><b data-side="attacker">{e.text}</b></span>}
          </div>
        );
      })}
    </div>
  );
}

function SideBoard({ battle, side, name, color }: { battle: Battle; side: 'attacker' | 'defender'; name: string; color: string }) {
  const units = battle[side];
  const airborne = units.filter((u) => u.hp > 0 && u.role === 'infantry' && u.aboard === true);
  const deployed = units.filter((u) => !(u.role === 'infantry' && u.aboard === true));
  const alive = deployed.filter((u) => u.hp > 0);
  const dead = units.filter((u) => u.hp <= 0);
  const byKey = (list: typeof units) => {
    const m = new Map<UnitKey, number>();
    for (const u of list) m.set(u.key, (m.get(u.key) ?? 0) + 1);
    return [...m.entries()];
  };
  return (
    <div className="ax-sideboard" data-side={side}>
      <div className="ax-sideboard-head"><span style={{ color }}>{name}</span><small>{side}</small></div>
      <div className="ax-sideboard-bar"><span style={{ width: `${(alive.length / Math.max(1, deployed.length)) * 100}%`, background: color }} /></div>
      <div className="ax-sideboard-units">
        {byKey(alive).map(([k, n]) => <span key={k}><UnitIcon unitKey={k} size={18} title={UNITS[k].name} /><b>{n}</b>{UNITS[k].name}</span>)}
        {alive.length === 0 && airborne.length === 0 && <span style={{ opacity: 0.6 }}>Wiped out</span>}
        {airborne.length > 0 && <span className="airborne"><UnitIcon unitKey="infantry" size={18} title="Carried Paratroopers" /><b>{airborne.length}</b>aboard bomber</span>}
      </div>
      {dead.length > 0 && (
        <div className="ax-sideboard-units lost">
          {byKey(dead).map(([k, n]) => <span key={k}><UnitIcon unitKey={k} size={16} title={UNITS[k].name} /><b>{n}</b>{UNITS[k].name}</span>)}
        </div>
      )}
    </div>
  );
}

export function AxisBattleStage({ view, onBattleVisualReady }: {
  view: AxisView;
  onBattleVisualReady?: (combatId: number, ready: boolean, visualSeq: number) => void;
}) {
  const c = view.combat!;
  const b = c.battle;
  const [visualStyle, setVisualStyle] = useState<AxisBattleVisualStyle>(loadAxisBattleVisualStyle);
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => { saveAxisBattleVisualStyle(visualStyle); }, [visualStyle]);
  const strategicRaid = c.kind === 'strategicRaid';
  const rocketStrike = c.kind === 'rocketStrike';
  const battleStep = b.steps[b.stepIndex] ?? null;
  const manifest = useAxisManifest();
  const railArt = (manifest as unknown as { boards?: { image?: string }[] } | null)?.boards?.[0]?.image ?? null;
  const visualSeq = c.visualSeq ?? 0;
  const sessionIdentity = `${c.id}:${visualStyle}:${retryKey}`;
  const sessionCounter = useRef({ identity: sessionIdentity, epoch: 0 });
  if (sessionCounter.current.identity !== sessionIdentity) {
    sessionCounter.current = {
      identity: sessionIdentity,
      epoch: sessionCounter.current.epoch + 1,
    };
  }
  const sessionEpoch = sessionCounter.current.epoch;
  const presentationSession = useMemo<BattlePresentationSession>(
    () => ({ combatId: c.id, sessionEpoch }),
    [c.id, sessionEpoch],
  );
  const presentationGeneration = useMemo<BattlePresentationGeneration>(
    () => ({ ...presentationSession, visualSeq }),
    [presentationSession, visualSeq],
  );
  const activeSessionRef = useRef(presentationSession);
  const activeGenerationRef = useRef(presentationGeneration);
  activeSessionRef.current = presentationSession;
  activeGenerationRef.current = presentationGeneration;
  const domain = b.ctx.seaCombat ? 'sea' : 'land';
  const currentSnapshot: BattlePresentationSnapshot = useMemo(() => ({
    units: [...b.attacker, ...b.defender].map((unit) => ({
      uid: unit.uid,
      key: unit.key,
      side: unit.side,
      hp: unit.hp,
      submerged: Boolean(unit.submerged),
    })),
    status: b.status,
  }), [b.attacker, b.defender, b.status]);
  const previousSnapshot = useRef(currentSnapshot);
  const transitionFrame = useMemo(() => ({
    previous: previousSnapshot.current,
    transition: planBattleVisualTransition(previousSnapshot.current, currentSnapshot, domain),
  }), [currentSnapshot, domain, visualSeq]);
  useEffect(() => { previousSnapshot.current = currentSnapshot; }, [currentSnapshot, visualSeq]);
  const paratrooperDropSeq = b.paratrooperDropSeq ?? 0;
  const previousParatrooperDropSeq = useRef(paratrooperDropSeq);
  const paratrooperDropTransition = paratrooperDropSeq > previousParatrooperDropSeq.current;
  useEffect(() => {
    previousParatrooperDropSeq.current = paratrooperDropSeq;
  }, [paratrooperDropSeq, visualSeq]);

  const simUnits: SimUnit[] = useMemo(() => {
    const sourceById = new Map([...b.attacker, ...b.defender].map((unit) => [unit.uid, unit]));
    const currentById = new Map(currentSnapshot.units.map((unit) => [unit.uid, unit]));
    const retreating = new Set(transitionFrame.transition.retreatingIds);
    const ordered = transitionFrame.previous.units
      .map((prior) => currentById.get(prior.uid) ?? (retreating.has(String(prior.uid)) ? prior : null))
      .filter((unit): unit is BattlePresentationSnapshot['units'][number] => unit != null);
    const seen = new Set(ordered.map((unit) => unit.uid));
    ordered.push(...currentSnapshot.units.filter((unit) => !seen.has(unit.uid)));
    return ordered.map((unit) => {
      const source = sourceById.get(unit.uid);
      return {
        id: String(unit.uid),
        type: unit.key,
        side: unit.side,
        ...(source?.pairId && source.role ? {
          paratrooper: {
            pairId: source.pairId,
            role: source.role,
            ...(source.counterpartUid !== undefined ? { counterpartId: String(source.counterpartUid) } : {}),
            aboard: source.aboard === true,
          },
        } : {}),
      };
    });
  }, [b.attacker, b.defender, currentSnapshot.units, transitionFrame, visualSeq]);
  const destroyedIds = useMemo(
    () => [...b.attacker, ...b.defender].filter((u) => u.hp <= 0).map((u) => String(u.uid)),
    [b.attacker, b.defender, b.log.length],
  );
  const healthById = useMemo(() => {
    const out: Record<string, number> = {};
    for (const u of [...b.attacker, ...b.defender]) out[String(u.uid)] = Math.max(0, u.hp / u.maxHp);
    return out;
  }, [b.attacker, b.defender, b.log.length]);

  // Volleys: every unit that rolled fires, including visible misses.
  const rollEvents = b.log.filter((e) => e.rolls.length > 0);
  const salvo = rollEvents.length;
  const activeSalvoRef = useRef(salvo);
  activeSalvoRef.current = salvo;
  const firingIds = useMemo(() => {
    const last = rollEvents[rollEvents.length - 1];
    if (!last) return [];
    return [...new Set(last.rolls.filter((r) => r.uid > 0).map((r) => String(r.uid)))];
  }, [salvo]);
  const shotLinks = useMemo(() => {
    const last = rollEvents[rollEvents.length - 1];
    if (!last) return [];
    return last.rolls.flatMap((roll) => roll.uid > 0 && roll.targetUid !== undefined
      ? [{ firingId: String(roll.uid), targetId: String(roll.targetUid) }]
      : []);
  }, [salvo]);
  const preferredTargetIds = useMemo(() => {
    const last = rollEvents[rollEvents.length - 1];
    if (last?.kind === 'aa_fire') {
      return [...new Set(last.rolls
        .map((roll) => roll.targetUid)
        .filter((uid): uid is number => uid !== undefined))]
        .map(String);
    }
    if (last?.kind === 'raid_damage' || last?.kind === 'rocket_damage') {
      return b.defender.filter((unit) => unit.key === 'factory' && unit.hp > 0).map((unit) => String(unit.uid));
    }
    return [];
  }, [b.defender, salvo]);

  const defenderPower = (b.defender[0]?.power ?? null) as PowerKey | 'china' | null;

  // the dice clatter on every new roll
  const diceAudio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (salvo === 0) return;
    if (!diceAudio.current) diceAudio.current = new Audio('/axis/sim/sounds/dice-roll.mp3');
    diceAudio.current.currentTime = 0;
    diceAudio.current.volume = 0.6;
    void diceAudio.current.play().catch(() => {});
  }, [salvo]);
  const stopDiceAudio = useCallback(() => {
    const audio = diceAudio.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);
  useEffect(() => () => {
    stopDiceAudio();
    diceAudio.current = null;
  }, [c.id, stopDiceAudio]);

  // Rolling unlocks only after both original presentation systems are truly
  // live: the exact 3D battlefield has rendered and the physical dice renderer
  // is initialized in its visible host. No timeout can promote this state.
  const initialSettledSalvo = salvo > 0 ? salvo - 1 : 0;
  const [cinematicReadySession, setCinematicReadySession] = useState<number | null>(null);
  const [cinematicInteractiveSession, setCinematicInteractiveSession] = useState<number | null>(null);
  const [diceReadySession, setDiceReadySession] = useState<number | null>(null);
  const [diceRollingSession, setDiceRollingSession] = useState<number | null>(null);
  const [settledSalvoState, setSettledSalvo] = useState<SessionProgress>(() => ({
    sessionEpoch,
    value: initialSettledSalvo,
  }));
  const [settledBattlefieldSalvoState, setSettledBattlefieldSalvo] = useState<SessionProgress>(() => ({
    sessionEpoch,
    value: initialSettledSalvo,
  }));
  // A mount/reconnect must paint this exact generation before it can unlock;
  // it cannot inherit a serialized generation as already presented.
  const [settledVisualSeqState, setSettledVisualSeq] = useState<SessionProgress>(() => ({
    sessionEpoch,
    value: visualSeq - 1,
  }));
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [loadFailureState, setLoadFailureState] = useState<{
    sessionEpoch: number;
    kind: 'battlefield' | 'dice';
  } | null>(null);
  const cinematicReady = cinematicReadySession === sessionEpoch;
  const cinematicInteractive = cinematicInteractiveSession === sessionEpoch;
  const diceReady = diceReadySession === sessionEpoch;
  const diceRolling = diceRollingSession === sessionEpoch;
  const settledSalvo = settledSalvoState.sessionEpoch === sessionEpoch
    ? settledSalvoState.value
    : initialSettledSalvo;
  const settledBattlefieldSalvo = settledBattlefieldSalvoState.sessionEpoch === sessionEpoch
    ? settledBattlefieldSalvoState.value
    : initialSettledSalvo;
  const settledVisualSeq = settledVisualSeqState.sessionEpoch === sessionEpoch
    ? settledVisualSeqState.value
    : visualSeq - 1;
  const loadFailure = loadFailureState?.sessionEpoch === sessionEpoch
    ? loadFailureState.kind
    : null;
  // React.lazy caches a rejected promise. Recreate the wrapper on a deliberate
  // retry so a transient chunk-load failure cannot poison this TV session.
  const StylizedBattleRenderer = useMemo(() => lazy(loadStylizedBattleSim), [retryKey]);
  const stageVisible = battlePresentationReady({ cinematic: cinematicReady, dice: diceReady, failed: Boolean(loadFailure) });
  const finalPresentationSettled = settledSalvo >= salvo && settledBattlefieldSalvo >= salvo && !diceRolling;
  const presentationSettled = finalPresentationSettled && settledVisualSeq >= visualSeq;
  const stageReady = stageVisible && cinematicInteractive && presentationSettled && pageVisible;
  const reportRef = useRef(onBattleVisualReady);
  const reportedRef = useRef<{ combatId: number; visualSeq: number; ready: boolean } | null>(null);
  useEffect(() => { reportRef.current = onBattleVisualReady; }, [onBattleVisualReady]);
  const revokeBattleVisualReady = useCallback(() => {
    const { combatId, visualSeq } = activeGenerationRef.current;
    if (reportedRef.current?.combatId === combatId
      && reportedRef.current.visualSeq === visualSeq
      && reportedRef.current.ready === false) return;
    reportedRef.current = { combatId, visualSeq, ready: false };
    reportRef.current?.(combatId, false, visualSeq);
  }, []);
  useEffect(() => {
    if (reportedRef.current?.combatId === c.id
      && reportedRef.current.visualSeq === visualSeq
      && reportedRef.current.ready === stageReady) return;
    reportedRef.current = { combatId: c.id, visualSeq, ready: stageReady };
    reportRef.current?.(c.id, stageReady, visualSeq);
  }, [c.id, stageReady, visualSeq]);
  useEffect(() => () => { reportRef.current?.(c.id, false, visualSeq); }, [c.id, visualSeq]);

  const sessionAccepts = useCallback((expected: BattlePresentationSession) => (
    battlePresentationSessionAccepts(
      expected,
      activeSessionRef.current,
      document.visibilityState !== 'hidden',
    )
  ), []);
  const invalidatePresentationSession = useCallback(() => {
    const sessionEpoch = sessionCounter.current.epoch + 1;
    sessionCounter.current = { ...sessionCounter.current, epoch: sessionEpoch };
    const session = { combatId: c.id, sessionEpoch };
    activeSessionRef.current = session;
    activeGenerationRef.current = { ...session, visualSeq };
  }, [c.id, visualSeq]);
  const markLoadFailure = useCallback((kind: 'battlefield' | 'dice') => {
    if (!sessionAccepts(presentationSession)) return;
    revokeBattleVisualReady();
    setLoadFailureState({ sessionEpoch: presentationSession.sessionEpoch, kind });
  }, [presentationSession, revokeBattleVisualReady, sessionAccepts]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState !== 'hidden';
      revokeBattleVisualReady();
      invalidatePresentationSession();
      stopDiceAudio();
      setPageVisible(visible);
      setCinematicReadySession(null);
      setCinematicInteractiveSession(null);
      setDiceReadySession(null);
      setDiceRollingSession(null);
      setSettledSalvo({ sessionEpoch: -1, value: initialSettledSalvo });
      setSettledBattlefieldSalvo({ sessionEpoch: -1, value: initialSettledSalvo });
      setSettledVisualSeq({ sessionEpoch: -1, value: visualSeq - 1 });
      if (visible) {
        if (diceRuntime?.status === 'failed') resetDiceBox();
        setLoadFailureState(null);
        setRetryKey((key) => key + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [initialSettledSalvo, invalidatePresentationSession, revokeBattleVisualReady, stopDiceAudio, visualSeq]);

  useEffect(() => {
    if (stageVisible || loadFailure || !pageVisible) return;
    const watchdog = window.setTimeout(
      () => markLoadFailure(diceReady ? 'battlefield' : 'dice'),
      30_000,
    );
    return () => window.clearTimeout(watchdog);
  }, [diceReady, loadFailure, markLoadFailure, pageVisible, stageVisible]);

  useEffect(() => {
    if (!stageVisible || cinematicInteractive || loadFailure || !pageVisible) return;
    const watchdog = window.setTimeout(() => markLoadFailure('battlefield'), 12_000);
    return () => window.clearTimeout(watchdog);
  }, [cinematicInteractive, loadFailure, markLoadFailure, pageVisible, stageVisible]);

  useEffect(() => {
    if (settledBattlefieldSalvo >= salvo || loadFailure || !pageVisible) return;
    const watchdog = window.setTimeout(() => markLoadFailure('battlefield'), 15_000);
    return () => window.clearTimeout(watchdog);
  }, [loadFailure, markLoadFailure, pageVisible, salvo, settledBattlefieldSalvo]);

  useEffect(() => {
    if (settledVisualSeq >= visualSeq || loadFailure || !pageVisible) return;
    const watchdog = window.setTimeout(() => markLoadFailure('battlefield'), 15_000);
    return () => window.clearTimeout(watchdog);
  }, [loadFailure, markLoadFailure, pageVisible, settledVisualSeq, visualSeq]);

  // Resource callbacks are session-scoped rather than visualSeq-scoped. This
  // lets a live renderer paint later authoritative generations without being
  // torn down, while callbacks from an abandoned retry remain inert.
  const onVisualReady = useCallback(() => {
    if (!sessionAccepts(presentationSession)) return;
    setCinematicReadySession(presentationSession.sessionEpoch);
  }, [presentationSession, sessionAccepts]);
  const onInteractionReady = useCallback(() => {
    if (!sessionAccepts(presentationSession)) return;
    setCinematicInteractiveSession(presentationSession.sessionEpoch);
  }, [presentationSession, sessionAccepts]);
  const onVisualUnavailable = useCallback(() => {
    if (!sessionAccepts(presentationSession)) return;
    revokeBattleVisualReady();
    setCinematicReadySession(null);
    setCinematicInteractiveSession(null);
  }, [presentationSession, revokeBattleVisualReady, sessionAccepts]);
  const onVisualFailure = useCallback(() => {
    markLoadFailure('battlefield');
  }, [markLoadFailure]);
  const onDiceReady = useCallback(() => {
    if (!sessionAccepts(presentationSession)) return;
    setDiceReadySession(presentationSession.sessionEpoch);
  }, [presentationSession, sessionAccepts]);
  const onDiceUnavailable = useCallback(() => {
    if (!sessionAccepts(presentationSession)) return;
    revokeBattleVisualReady();
    setDiceReadySession(null);
  }, [presentationSession, revokeBattleVisualReady, sessionAccepts]);
  const onDiceFailure = useCallback(() => {
    markLoadFailure('dice');
  }, [markLoadFailure]);
  const onDiceRollStart = useCallback((startedSalvo: number) => {
    if (!sessionAccepts(presentationSession) || startedSalvo !== activeSalvoRef.current) return;
    revokeBattleVisualReady();
    setDiceRollingSession(presentationSession.sessionEpoch);
  }, [presentationSession, revokeBattleVisualReady, sessionAccepts]);
  const onDiceRollComplete = useCallback((completedSalvo: number) => {
    if (!sessionAccepts(presentationSession) || completedSalvo !== activeSalvoRef.current) return;
    setSettledSalvo((current) => ({
      sessionEpoch: presentationSession.sessionEpoch,
      value: current.sessionEpoch === presentationSession.sessionEpoch
        ? Math.max(current.value, completedSalvo)
        : completedSalvo,
    }));
    setDiceRollingSession(null);
  }, [presentationSession, sessionAccepts]);
  const onBattlefieldVolleyComplete = useCallback((completedSalvo: number) => {
    if (!sessionAccepts(presentationSession) || completedSalvo !== activeSalvoRef.current) return;
    setSettledBattlefieldSalvo((current) => ({
      sessionEpoch: presentationSession.sessionEpoch,
      value: current.sessionEpoch === presentationSession.sessionEpoch
        ? Math.max(current.value, completedSalvo)
        : completedSalvo,
    }));
  }, [presentationSession, sessionAccepts]);
  const onBattlefieldPresentationComplete = useCallback((completedVisualSeq: number) => {
    const completedGeneration = { ...presentationSession, visualSeq: completedVisualSeq };
    if (!battlePresentationGenerationAccepts(
      completedGeneration,
      activeGenerationRef.current,
      document.visibilityState !== 'hidden',
    )) return;
    setSettledVisualSeq((current) => ({
      sessionEpoch: presentationSession.sessionEpoch,
      value: current.sessionEpoch === presentationSession.sessionEpoch
        ? Math.max(current.value, completedVisualSeq)
        : completedVisualSeq,
    }));
  }, [presentationSession]);
  const retryCinematic = useCallback(() => {
    revokeBattleVisualReady();
    invalidatePresentationSession();
    if (loadFailure === 'dice' || diceRuntime?.status === 'failed') resetDiceBox();
    if (loadFailure === 'battlefield') clearBattleAssetCache();
    setCinematicReadySession(null);
    setCinematicInteractiveSession(null);
    setDiceReadySession(null);
    setDiceRollingSession(null);
    setSettledSalvo({ sessionEpoch: -1, value: initialSettledSalvo });
    setSettledBattlefieldSalvo({ sessionEpoch: -1, value: initialSettledSalvo });
    setSettledVisualSeq({ sessionEpoch: -1, value: visualSeq - 1 });
    setLoadFailureState(null);
    setRetryKey((key) => key + 1);
  }, [initialSettledSalvo, invalidatePresentationSession, loadFailure, revokeBattleVisualReady, visualSeq]);

  const selectVisualStyle = useCallback((next: AxisBattleVisualStyle) => {
    // Do not tear down the shared physical dice canvas while it is resolving
    // an authoritative volley. The choice unlocks again as soon as the exact
    // faces have settled.
    if (next === visualStyle || diceRolling) return;
    revokeBattleVisualReady();
    invalidatePresentationSession();
    setCinematicReadySession(null);
    setCinematicInteractiveSession(null);
    setDiceReadySession(null);
    setDiceRollingSession(null);
    setSettledSalvo({ sessionEpoch: -1, value: initialSettledSalvo });
    setSettledBattlefieldSalvo({ sessionEpoch: -1, value: initialSettledSalvo });
    setSettledVisualSeq({ sessionEpoch: -1, value: visualSeq - 1 });
    setLoadFailureState(null);
    setVisualStyle(next);
  }, [diceRolling, initialSettledSalvo, invalidatePresentationSession, revokeBattleVisualReady, visualSeq, visualStyle]);

  const requiredPresentationDuration = Math.max(
    transitionFrame.transition.durationMs,
    paratrooperDropTransition ? 2_200 : 0,
  );
  const rendererProps: BattleSimProps = {
    units: simUnits,
    domain,
    destroyedIds,
    visualSeq,
    submergedIds: currentSnapshot.units.filter((unit) => unit.submerged).map((unit) => String(unit.uid)),
    retreatingIds: transitionFrame.transition.retreatingIds,
    preferredTargetIds,
    presentationDurationMs: requiredPresentationDuration,
    salvo,
    firingIds,
    shotLinks,
    healthById,
    playSounds: true,
    attackerName: powerName(c.attacker),
    defenderName: powerName(defenderPower),
    onVisualReady,
    onInteractionReady,
    onVolleyComplete: onBattlefieldVolleyComplete,
    onPresentationComplete: onBattlefieldPresentationComplete,
    onVisualUnavailable,
    onVisualFailure,
  };

  const over = Boolean(c.confirmed);
  const retreatCopy = axisRetreatCopy(c);
  const retreatOutcome = c.retreatTo !== undefined
    ? axisRetreatOutcomeText(powerName(c.attacker), c.retreatTo, c.space, spaceName)
    : null;
  const verdict =
    rocketStrike ? `${c.rocket?.appliedDamage ?? 0} rocket damage delivered` :
    strategicRaid ? `${c.raid?.appliedDamage ?? 0} bombing damage delivered` :
    b.status === 'attacker_captured' ? `${powerName(c.attacker)} takes the field` :
    b.status === 'attacker_cleared' ? `${powerName(c.attacker)} clears the field` :
    b.status === 'defender_won' ? `${powerName(defenderPower)} holds` :
    b.status === 'retreated' ? axisRetreatOutcomeText(powerName(c.attacker), c.retreatTo, c.space, spaceName) :
    b.status === 'standoff' ? 'Standoff' : 'Mutual destruction';
  const remaining = (side: 'attacker' | 'defender') => {
    const m = new Map<UnitKey, number>();
    for (const u of b[side]) if (u.hp > 0) m.set(u.key, (m.get(u.key) ?? 0) + 1);
    return [...m.entries()];
  };

  return (
    <div className="ax-stage">
      <div className="ax-stage-shell">
        <header className="ax-stage-head">
          <div>
            <span className="ax-stage-eyebrow">Live engagement · {rocketStrike ? 'Rocket strike' : strategicRaid ? 'Strategic bombing raid' : domain === 'sea' ? 'Naval battle' : 'Land battle'}</span>
            <h2>{spaceName(c.space)}</h2>
          </div>
          <div className="ax-stage-head-tools">
            <div className="ax-battle-style-switch" role="group" aria-label="Battle presentation style">
              <button type="button" title="Original cinematic battlefield" disabled={diceRolling} aria-pressed={visualStyle === 'cinematic'} onClick={() => selectVisualStyle('cinematic')}>Cinematic</button>
              <button type="button" title="Stylized non-photorealistic command table" disabled={diceRolling} aria-pressed={visualStyle === 'diorama'} onClick={() => selectVisualStyle('diorama')}>Command diorama</button>
            </div>
            <div className="ax-stage-round"><small>{rocketStrike ? 'Strike step' : strategicRaid ? 'Raid step' : 'Combat round'}</small><b className="ig-num">{rocketStrike ? battleStep === 'rocket_damage' ? 'DMG' : 'END' : strategicRaid ? battleStep === 'aa_fire' ? 'AA' : battleStep === 'raid_damage' ? 'DMG' : 'END' : b.round}</b></div>
          </div>
        </header>
        <div className="ax-stage-grid">
          <div className="ax-stage-sim">
            <BattleStyleBoundary key={`${c.id}-${visualStyle}-${retryKey}`} onFailure={onVisualFailure}>
              {visualStyle === 'diorama' ? (
                <Suspense fallback={null}>
                  <StylizedBattleRenderer {...rendererProps} />
                </Suspense>
              ) : (
                <BattleSim {...rendererProps} />
              )}
            </BattleStyleBoundary>
            <div className="ax-stage-sim-caption"><span>{powerName(c.attacker)}</span><b>{rocketStrike ? 'rocket battery' : strategicRaid ? 'bombing run' : visualStyle === 'diorama' ? 'command diorama' : 'cinematic battlefield'}</b><span>{powerName(defenderPower)}</span></div>
          </div>
          <aside
            className="ax-stage-rail"
            style={railArt ? {
              backgroundImage: `linear-gradient(rgba(6,8,11,.94), rgba(6,8,11,.98)), url(${railArt})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
            } : undefined}
            aria-label="Battle intelligence"
          >
            <div className="ax-stage-title">
              <span className="ax-vs-name" style={{ color: powerTextColor(c.attacker) }}>{powerName(c.attacker)}</span>
              <span className="ax-vs-word">{rocketStrike ? 'strikes' : strategicRaid ? 'raids' : 'attacks'}</span>
              <span className="ax-vs-name" style={{ color: powerTextColor(defenderPower) }}>{powerName(defenderPower)}</span>
            </div>
            <SideBoard battle={b} side="attacker" name={powerName(c.attacker)} color={powerTextColor(c.attacker)} />
            <SideBoard battle={b} side="defender" name={powerName(defenderPower)} color={powerTextColor(defenderPower)} />
            {retreatOutcome && (
              <div className="ax-stage-retreat-route" role="status" aria-live="polite">
                <span>{typeof c.retreatTo === 'string' ? 'Chosen retreat route' : 'Aircraft disengaging'}</span>
                <b>{retreatOutcome}</b>
              </div>
            )}
            <DiceTray
              battle={b}
              salvo={salvo}
              retryKey={retryKey}
              enabled={pageVisible}
              onReady={onDiceReady}
              onUnavailable={onDiceUnavailable}
              onFailure={onDiceFailure}
              onRollStart={onDiceRollStart}
              onRollComplete={onDiceRollComplete}
            />
            <KillLog battle={b} />
            {!over && b.decision && (
              <div className="ax-stage-waiting">
                <span>Waiting on player device</span>
                <b>
                  {b.decision.type === 'casualties' && `${b.decision.side === 'defender' ? powerName(defenderPower) : powerName(c.attacker)} is choosing casualties`}
                  {b.decision.type === 'retreat' && (retreatCopy.terminalTransportStandoff
                    ? `${powerName(c.attacker)} chooses REMAIN or an exact RETREAT route`
                    : retreatCopy.airOnly
                      ? `${powerName(c.attacker)} decides whether to disengage aircraft`
                      : retreatCopy.mixedBeach
                        ? `${powerName(c.attacker)} decides whether overland and air units withdraw`
                        : `${powerName(c.attacker)} chooses whether to press or retreat`)}
                  {b.decision.type === 'submerge' && 'Submarines may submerge or strike'}
                </b>
                {b.decision.type === 'retreat' && c.retreatPolicy?.destinationRequired && (
                  <small>{c.retreatPolicy.destinations.length
                    ? `Exact routes: ${c.retreatPolicy.destinations.map(spaceName).join(' / ')}`
                    : 'No legal retreat route - the attacking force must remain'}</small>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
      {over && c.confirmed && presentationSettled && (
        <div className="ax-battle-end">
          <div className="ax-battle-end-card">
            <div className="ig-lab">{rocketStrike ? 'Rocket strike complete' : strategicRaid ? 'Raid complete' : 'Battle over'} · {spaceName(c.space)}</div>
            <div className="ax-battle-end-verdict">{verdict}</div>
            {retreatOutcome && b.status !== 'retreated' && (
              <div className="ax-battle-end-retreat">{retreatOutcome}</div>
            )}
            {rocketStrike ? (
              <>
                <div className="ax-battle-end-side">
                  <span style={{ color: powerTextColor(c.attacker) }}>Rocket battery</span>
                  <span>{spaceName(c.rocket?.source ?? '')} · die {c.rocket?.roll ?? 0}</span>
                </div>
                <div className="ax-battle-end-side">
                  <span style={{ color: powerTextColor(defenderPower) }}>Industrial complex</span>
                  <span>{c.rocket?.appliedDamage ?? 0} applied · {(c.rocket?.damageBefore ?? 0) + (c.rocket?.appliedDamage ?? 0)}/{c.rocket?.cap ?? 0} damage</span>
                </div>
              </>
            ) : strategicRaid ? (
              <>
                <div className="ax-battle-end-side">
                  <span style={{ color: powerTextColor(c.attacker) }}>Bombing force</span>
                  <span>{b.attacker.filter((unit) => unit.hp > 0).length} bomber(s) through · {b.attacker.filter((unit) => unit.hp <= 0).length} lost</span>
                </div>
                <div className="ax-battle-end-side">
                  <span style={{ color: powerTextColor(defenderPower) }}>Industrial complex</span>
                  <span>{c.raid?.rawDamage ?? 0} rolled · {c.raid?.appliedDamage ?? 0} applied · {(c.raid?.damageBefore ?? 0) + (c.raid?.appliedDamage ?? 0)}/{c.raid?.cap ?? 0} damage</span>
                </div>
              </>
            ) : (['attacker', 'defender'] as const).map((side) => {
              const p = side === 'attacker' ? c.attacker : defenderPower;
              const units = remaining(side);
              return (
                <div key={side} className="ax-battle-end-side">
                  <span style={{ color: powerTextColor(p) }}>{powerName(p)}</span>
                  <span>{units.length ? units.map(([k, n]) => `${n} ${UNITS[k].name}`).join(', ') : 'wiped out'}</span>
                </div>
              );
            })}
            <div className="ax-battle-end-wait">
              {c.confirmed.attacker && c.confirmed.defender ? 'Continuing' : 'Both commanders press continue on their devices'}
            </div>
          </div>
        </div>
      )}
      {!stageVisible && (
        <div className="ax-stage-curtain" role={loadFailure ? 'alert' : 'status'} aria-live="polite">
          <div className="ig-lab">{rocketStrike ? 'Conduct rocket strike' : strategicRaid ? 'Conduct strategic raid' : 'Conduct combat'}</div>
          <h2>{loadFailure
            ? `${visualStyle === 'diorama' ? 'Command diorama' : 'Cinematic'} load interrupted`
            : rocketStrike
              ? 'Preparing the rocket battery and dice'
              : strategicRaid
                ? 'Preparing the bombing run and dice'
                : visualStyle === 'diorama'
                  ? 'Preparing the command diorama and dice'
                  : 'Preparing the cinematic battlefield and dice'}</h2>
          {loadFailure ? (
            <>
              <p>{loadFailure === 'dice' ? 'The physical dice renderer did not finish loading.' : 'The selected 3D battle presentation was interrupted.'} Combat remains paused.</p>
              <button className="battle-reload-btn" onClick={retryCinematic}>Retry {visualStyle === 'diorama' ? 'command diorama' : 'cinematic'}</button>
            </>
          ) : (
            <div className="ax-loading-bar"><span /></div>
          )}
        </div>
      )}
    </div>
  );
}

/** After a battle clears, hold the losses on screen for a beat. */
export function AfterAction({ view }: { view: AxisView }) {
  const last = view.lastBattle;
  const [shown, setShown] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!last || view.combat) return;
    setShown(last.seq);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), 7000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [last?.seq, view.combat]);
  if (!last || view.combat || shown !== last.seq) return null;

  const statusLine =
    last.status === 'attacker_captured' ? `${powerName(last.attacker)} takes the territory` :
    last.status === 'attacker_cleared' ? `${powerName(last.attacker)} clears the field but cannot hold it` :
    last.status === 'defender_won' ? `${powerName(last.defender)} holds` :
    last.status === 'retreated' ? axisRetreatOutcomeText(powerName(last.attacker), last.retreatTo, last.space, spaceName) :
    last.status === 'standoff' ? 'Standoff' : 'Mutual destruction';

  const lossList = (losses: Partial<Record<UnitKey, number>>) =>
    Object.entries(losses).map(([k, n]) => `${n} ${UNITS[k as UnitKey].name}`).join(', ') || 'no losses';

  return (
    <div className="ax-afteraction ig-glass">
      <div className="ig-lab">Battle over</div>
      <div className="ax-afteraction-status">{statusLine}</div>
      {last.retreatTo !== undefined && last.status !== 'retreated' && (
        <div className="ax-afteraction-retreat">
          {axisRetreatOutcomeText(powerName(last.attacker), last.retreatTo, last.space, spaceName)}
        </div>
      )}
      <div className="ax-afteraction-row">
        <span style={{ color: powerTextColor(last.attacker) }}>{powerName(last.attacker)}</span>
        <span>lost {lossList(last.atkLost)}</span>
      </div>
      <div className="ax-afteraction-row">
        <span style={{ color: powerTextColor(last.defender) }}>{powerName(last.defender)}</span>
        <span>lost {lossList(last.defLost)}</span>
      </div>
    </div>
  );
}
