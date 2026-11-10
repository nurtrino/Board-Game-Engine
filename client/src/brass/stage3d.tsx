// The moving half of the Brass table. Pieces here animate themselves: give the
// scene a new game state and tiles drop onto their squares, cubes fly between
// the market and the build, sold tiles turn over, markers walk the track and
// turn tokens trade places. Whoever drives the scene (the big screen's
// director, or a player's own device) only decides WHEN a state is shown.
//
// Everything a piece does is announced on the FxBus, so sound and screen
// effects land on the exact frame a tile does.

import {
  createContext, Suspense, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type MutableRefObject, type ReactNode,
} from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import { TILES, startingCubes } from '@bge/shared';
import {
  Model, Tile, Deck, CardPile, SheetTile, RoundToken, BeerBarrel, useColorTexture, WHITE_PX, SEAT_HEX,
  type SceneDef, type GameSceneState, type TileDef, type ModelDef, type DeckDef, type CardPileDef, type Zone,
} from './pieces';

// ---------------------------------------------------------------------------
// Effects bus
// ---------------------------------------------------------------------------

export type Fx =
  | { t: 'land'; x: number; z: number; tile: string; color: string }
  | { t: 'flip'; x: number; z: number }
  | { t: 'flipped'; x: number; z: number; color: string }
  | { t: 'cube'; kind: 'coal' | 'iron' | 'beer' }
  | { t: 'link'; x: number; z: number; era: 'canal' | 'rail'; color: string }
  | { t: 'step' }
  | { t: 'token' }
  | { t: 'coin' }
  | { t: 'lift' }
  | { t: 'ring'; x: number; z: number; color: string; size?: number }
  | { t: 'float'; x: number; z: number; text: string; tone?: 'up' | 'down' | 'plain' }
  | { t: 'scout' }
  | { t: 'shake'; amount: number };

export class FxBus {
  private listeners = new Set<(e: Fx) => void>();
  on(fn: (e: Fx) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  emit(e: Fx): void { for (const l of this.listeners) l(e); }
}

export interface Spot { x: number; z: number; color: string; size?: number; }

interface StageCfg {
  bus: FxBus;
  /** where the action is: cubes leaving the table fly here, arrivals fly from here */
  hint: MutableRefObject<{ x: number; z: number } | null>;
  /** false = show states instantly (first paint, catching up) */
  animate: boolean;
}
export const StageCtx = createContext<StageCfg>({ bus: new FxBus(), hint: { current: null }, animate: false });

const easeInOut = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Stable 0..1 from a string, so a group of pieces leaves in a loose ripple. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Presence: keep a piece on stage long enough to animate its exit
// ---------------------------------------------------------------------------

interface Held<T> { key: string; item: T; out: boolean; fresh: boolean; order: number; outOrder: number; }

function usePresence<T>(items: Record<string, T>, animate: boolean, linger = 1.9): Held<T>[] {
  const mem = useRef(new Map<string, { item: T; outAt: number | null; fresh: boolean; order: number; outOrder: number }>());
  const first = useRef(true);
  const [, bump] = useState(0);
  const m = mem.current;
  let added = 0;
  for (const k of Object.keys(items)) {
    const h = m.get(k);
    if (h) { h.item = items[k]; h.outAt = null; }
    else m.set(k, { item: items[k], outAt: null, fresh: animate && !first.current, order: added++, outOrder: 0 });
  }
  const now = performance.now();
  let pending = false;
  let removed = 0;
  for (const [k, h] of m) {
    if (k in items) continue;
    if (h.outAt === null) {
      if (!animate) { m.delete(k); continue; }
      h.outAt = now; h.outOrder = removed++;
    }
    if (now - h.outAt > linger * 1000) m.delete(k); else pending = true;
  }
  useEffect(() => { first.current = false; }, []);
  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => bump((n) => n + 1), linger * 1000 + 80);
    return () => window.clearTimeout(id);
  });
  return [...m].map(([key, h]) => ({ key, item: h.item, out: h.outAt !== null, fresh: h.fresh, order: h.order, outOrder: h.outOrder }));
}

// ---------------------------------------------------------------------------
// Fly: a small piece that arrives from, and leaves toward, the action
// ---------------------------------------------------------------------------

function Fly({ at, fresh, out, delay = 0, outDelay = 0, arc = 1.5, sound, children }: {
  at: [number, number, number]; fresh: boolean; out: boolean; delay?: number; outDelay?: number; arc?: number;
  sound?: Fx; children: ReactNode;
}) {
  const { bus, hint } = useContext(StageCtx);
  const g = useRef<THREE.Group>(null);
  const target = useRef(new THREE.Vector3());
  target.current.set(at[0], at[1], at[2]);
  const s = useRef<{ phase: 'in' | 'idle' | 'out' | 'gone'; t: number; from: THREE.Vector3 | null; to: THREE.Vector3 | null; said: boolean } | null>(null);
  // A piece already at the action (cubes on the tile being built) has nowhere
  // to fly: it simply drops in or lifts away.
  const far = (h: { x: number; z: number } | null) =>
    (h && (h.x - at[0]) ** 2 + (h.z - at[2]) ** 2 > 1.6 ? h : null);
  if (!s.current) {
    const h = fresh ? far(hint.current) : null;
    s.current = {
      phase: fresh ? 'in' : 'idle', t: -delay, said: false, to: null,
      from: h ? new THREE.Vector3(h.x, at[1] + 0.25, h.z) : null,
    };
  }
  useLayoutEffect(() => {
    if (!g.current) return;
    g.current.position.copy(target.current);
    g.current.visible = !fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const st = s.current!;
    if (out) {
      const h = far(hint.current);
      st.phase = 'out'; st.t = -outDelay; st.said = false;
      st.to = h ? new THREE.Vector3(h.x, target.current.y + 0.25, h.z) : null;
    } else if (st.phase === 'out' || st.phase === 'gone') {
      st.phase = 'in'; st.t = 0; st.from = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out]);

  useFrame((_, dt) => {
    const st = s.current!;
    const grp = g.current;
    if (!grp) return;
    const tgt = target.current;
    if (st.phase === 'in') {
      st.t += dt;
      if (st.t < 0) { grp.visible = false; return; }
      grp.visible = true;
      const k = Math.min(1, st.t / (st.from ? 0.6 : 0.42));
      if (st.from) {
        const e = easeInOut(k);
        grp.position.lerpVectors(st.from, tgt, e);
        grp.position.y += Math.sin(k * Math.PI) * arc;
        grp.scale.setScalar(0.35 + 0.65 * e);
      } else {
        grp.position.copy(tgt);
        grp.position.y += (1 - easeOut(k)) * 1.5;
        grp.scale.setScalar(Math.max(0.01, easeOutBack(k)));
      }
      if (k >= 1) { st.phase = 'idle'; grp.scale.setScalar(1); if (sound) bus.emit(sound); }
    } else if (st.phase === 'out') {
      st.t += dt;
      if (st.t < 0) return;
      if (!st.said) { st.said = true; if (sound) bus.emit(sound); }
      const k = Math.min(1, st.t / (st.to ? 0.6 : 0.5));
      if (st.to) {
        grp.position.lerpVectors(tgt, st.to, easeInOut(k));
        grp.position.y += Math.sin(k * Math.PI) * arc;
        grp.scale.setScalar(Math.max(0.001, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3));
      } else {
        grp.position.copy(tgt);
        grp.position.y += k * k * 2.4;
        grp.scale.setScalar(Math.max(0.001, 1 - k));
      }
      if (k >= 1) { st.phase = 'gone'; grp.visible = false; }
    } else if (st.phase === 'idle') {
      if (grp.position.distanceToSquared(tgt) > 1e-6) grp.position.lerp(tgt, 1 - Math.exp(-dt * 10));
    }
  });

  return <group ref={g}>{children}</group>;
}

// ---------------------------------------------------------------------------
// Glide: a piece that moves between known spots (turn tokens)
// ---------------------------------------------------------------------------

function Glide({ to, delay = 0, lift = 0.8, sound, children }: {
  to: [number, number, number]; delay?: number; lift?: number; sound?: Fx; children: ReactNode;
}) {
  const { bus, animate } = useContext(StageCtx);
  const g = useRef<THREE.Group>(null);
  const s = useRef({ from: new THREE.Vector3(...to), to: new THREE.Vector3(...to), t: 1, moving: false });
  useLayoutEffect(() => { g.current?.position.set(to[0], to[1], to[2]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    const st = s.current;
    const grp = g.current;
    if (!grp) return;
    if (st.to.x === to[0] && st.to.y === to[1] && st.to.z === to[2]) return;
    st.to.set(to[0], to[1], to[2]);
    if (!animate) { grp.position.copy(st.to); st.moving = false; return; }
    st.from.copy(grp.position);
    st.t = -delay;
    st.moving = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to[0], to[1], to[2]]);
  useFrame((_, dt) => {
    const st = s.current;
    const grp = g.current;
    if (!grp || !st.moving) return;
    st.t += dt;
    if (st.t < 0) return;
    const k = Math.min(1, st.t / 0.75);
    grp.position.lerpVectors(st.from, st.to, easeInOut(k));
    grp.position.y += Math.sin(k * Math.PI) * lift;
    if (k >= 1) { st.moving = false; if (sound) bus.emit(sound); }
  });
  return <group ref={g}>{children}</group>;
}

// ---------------------------------------------------------------------------
// Industry tiles: drop in, turn over when sold, lift away when an era ends
// ---------------------------------------------------------------------------

function BuiltTile({ art, sq, color, tile, flipped, x, y, z, fresh, out }: {
  art: TileDef; sq: string; color: string; tile: string; flipped: boolean;
  x: number; y: number; z: number; fresh: boolean; out: boolean;
}) {
  const { bus } = useContext(StageCtx);
  const g = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  // which side is up on screen right now (lags `flipped` while the tile turns)
  const [shown, setShown] = useState(fresh ? false : flipped);
  const want = useRef(flipped);
  want.current = flipped;
  const s = useRef({ phase: fresh ? 'drop' : 'idle' as 'drop' | 'settle' | 'idle' | 'flip' | 'leave' | 'gone', t: 0, swapped: false, side: fresh ? false : flipped });
  useLayoutEffect(() => {
    if (!g.current) return;
    g.current.position.set(x, y, z);
    g.current.visible = !fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (out) { s.current.phase = 'leave'; s.current.t = -hash01(sq) * 0.7; }
  }, [out, sq]);

  const def = useMemo<TileDef>(() => {
    const sc = art.place.scale[0];
    return {
      ...art, count: 1, name: `${art.name} (built)`,
      image: shown && art.back ? art.back : art.image,
      place: { pos: [0, 0, 0], rot: [0, 180, 0], scale: [sc, sc, sc] },
    };
  }, [art, shown]);

  useFrame((_, dt) => {
    const st = s.current;
    const grp = g.current;
    const inn = inner.current;
    if (!grp || !inn) return;
    if (st.phase === 'drop') {
      grp.visible = true;
      st.t += dt;
      const k = Math.min(1, st.t / 0.4);
      grp.position.set(x, y + 9 * (1 - k * k), z);
      inn.rotation.z = (1 - k) * 0.5;
      if (k >= 1) {
        st.phase = 'settle'; st.t = 0;
        inn.rotation.z = 0;
        bus.emit({ t: 'land', x, z, tile, color });
      }
    } else if (st.phase === 'settle') {
      st.t += dt;
      const k = Math.min(1, st.t / 0.24);
      inn.scale.set(1 + 0.14 * Math.sin(k * Math.PI), 1 - 0.3 * Math.sin(k * Math.PI), 1 + 0.14 * Math.sin(k * Math.PI));
      if (k >= 1) { inn.scale.set(1, 1, 1); st.phase = 'idle'; st.t = 0; }
    } else if (st.phase === 'idle') {
      if (st.side !== want.current) {
        // let a freshly landed tile sit for a beat before it turns
        st.t += dt;
        if (st.t > 0.35) { st.phase = 'flip'; st.t = 0; st.swapped = false; bus.emit({ t: 'flip', x, z }); }
      } else st.t = 0;
    } else if (st.phase === 'flip') {
      st.t += dt;
      const k = Math.min(1, st.t / 0.72);
      const e = easeInOut(k);
      grp.position.y = y + Math.sin(k * Math.PI) * 1.25;
      inn.rotation.z = e < 0.5 ? e * Math.PI : (e - 1) * Math.PI;
      if (e >= 0.5 && !st.swapped) { st.swapped = true; st.side = want.current; setShown(want.current); }
      if (k >= 1) {
        inn.rotation.z = 0; grp.position.y = y; st.phase = 'idle'; st.t = 0;
        bus.emit({ t: 'flipped', x, z, color });
      }
    } else if (st.phase === 'leave') {
      st.t += dt;
      if (st.t < 0) return;
      if (st.t - dt <= 0) bus.emit({ t: 'lift' });
      const k = Math.min(1, st.t / 0.7);
      grp.position.y = y + k * k * 5;
      inn.rotation.y = k * 1.4;
      grp.scale.setScalar(Math.max(0.001, 1 - k * k));
      if (k >= 1) { st.phase = 'gone'; grp.visible = false; }
    }
  });

  return (
    <group ref={g}>
      <group ref={inner}><Tile def={def} /></group>
    </group>
  );
}

// A canal or railway laid on its connection: it lands, and a streak in the
// owner's colour runs the length of it.
function LinkTile({ art, id, color, era, x, y, z, yaw, fresh, out }: {
  art: TileDef; id: string; color: string; era: 'canal' | 'rail'; x: number; y: number; z: number; yaw: number; fresh: boolean; out: boolean;
}) {
  const { bus } = useContext(StageCtx);
  const g = useRef<THREE.Group>(null);
  const streak = useRef<THREE.Mesh>(null);
  const s = useRef({ phase: fresh ? 'in' : 'idle' as 'in' | 'idle' | 'leave' | 'gone', t: 0 });
  useLayoutEffect(() => {
    if (!g.current) return;
    g.current.position.set(x, y, z);
    g.current.visible = !fresh;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (out) { s.current.phase = 'leave'; s.current.t = -hash01(id) * 0.8; }
  }, [out, id]);
  const def = useMemo<TileDef>(() => ({
    ...art, count: 1, name: `${art.name} (built)`,
    // zone yaw as-is: the tile art itself already carries the flat-art 180 in
    // the Tile renderer (adding another 180 here flipped them)
    place: { pos: [0, 0, 0], rot: [0, yaw, 0], scale: art.place.scale },
  }), [art, yaw]);
  const len = 2 * art.place.scale[0] * (art.aspect ?? 1);
  useFrame((_, dt) => {
    const st = s.current;
    const grp = g.current;
    if (!grp) return;
    const bar = streak.current;
    if (st.phase === 'in') {
      grp.visible = true;
      st.t += dt;
      const k = Math.min(1, st.t / 0.34);
      grp.position.y = y + 4 * (1 - k * k);
      if (bar) bar.visible = false;
      if (k >= 1) { st.phase = 'idle'; st.t = 0; grp.position.y = y; bus.emit({ t: 'link', x, z, era, color }); }
    } else if (st.phase === 'idle' && bar && st.t >= 0 && st.t < 0.6) {
      // the streak, once, right after landing
      if (!fresh) { st.t = 1; return; }
      st.t += dt;
      const k = Math.min(1, st.t / 0.55);
      bar.visible = k < 1;
      bar.position.x = (k - 0.5) * len;
      (bar.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.95;
    } else if (st.phase === 'leave') {
      st.t += dt;
      if (st.t < 0) return;
      if (st.t - dt <= 0) bus.emit({ t: 'lift' });
      const k = Math.min(1, st.t / 0.65);
      grp.position.y = y + k * k * 4.5;
      grp.scale.setScalar(Math.max(0.001, 1 - k * k));
      if (k >= 1) { st.phase = 'gone'; grp.visible = false; }
    }
  });
  return (
    <group ref={g}>
      <Tile def={def} />
      <group rotation={[0, -THREE.MathUtils.degToRad(yaw), 0]}>
        <mesh ref={streak} visible={false} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[len * 0.42, 0.5, 1]} renderOrder={20}>
          <planeGeometry />
          <meshBasicMaterial color={SEAT_HEX[color] ?? '#fff'} transparent opacity={0} depthTest={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Track markers: walk space by space instead of teleporting
// ---------------------------------------------------------------------------

function WalkingMarker({ def, offset, lift, track }: { def: ModelDef; offset: number; lift: number; track: THREE.Vector3[] }) {
  const { bus, animate } = useContext(StageCtx);
  const g = useRef<THREE.Group>(null);
  const s = useRef({ cur: offset, speed: 0, placed: false });
  const flat = useMemo<ModelDef>(() => ({ ...def, place: { ...def.place, pos: [0, 0, 0] } }), [def]);
  const place = (f: number) => {
    const grp = g.current;
    if (!grp || !track.length) return;
    const n = track.length;
    const i0 = Math.floor(f);
    const frac = f - i0;
    const a = track[((i0 % n) + n) % n];
    const b = track[(((i0 + 1) % n) + n) % n];
    grp.position.lerpVectors(a, b, frac);
    grp.position.y = lift + Math.sin(frac * Math.PI) * 0.3;
  };
  useLayoutEffect(() => { place(s.current.cur); });
  useEffect(() => {
    const st = s.current;
    const dist = Math.abs(offset - st.cur);
    if (!animate || dist === 0) { st.cur = offset; st.speed = 0; place(offset); return; }
    st.speed = dist / Math.min(2.4, 0.3 + dist * 0.085);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);
  useFrame((_, dt) => {
    const st = s.current;
    if (st.cur === offset) return;
    const dir = Math.sign(offset - st.cur);
    let next = st.cur + dir * st.speed * dt;
    if ((dir > 0 && next >= offset) || (dir < 0 && next <= offset)) next = offset;
    if (Math.floor(next) !== Math.floor(st.cur) || next === offset) bus.emit({ t: 'step' });
    st.cur = next;
    place(next);
  });
  return <group ref={g}><Model def={flat} /></group>;
}

// ---------------------------------------------------------------------------
// Coins on the turn track: this round's spending, one coin at a time
// ---------------------------------------------------------------------------

function useCoinGeo(coins: SceneDef['coins']) {
  const obj = useLoader(OBJLoader, coins.gold.mesh);
  return useMemo(() => {
    let g: THREE.BufferGeometry | null = null;
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !g) g = m.geometry; });
    if (!g) return { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.07, 16) as THREE.BufferGeometry, height: 0.07 };
    const merged = mergeVertices((g as THREE.BufferGeometry).clone());
    merged.computeVertexNormals();
    merged.computeBoundingBox();
    const bb = merged.boundingBox!;
    return { geo: merged as THREE.BufferGeometry, height: bb.max.y - bb.min.y };
  }, [obj]);
}

function Coin({ geo, mat, y, s, yaw, drop, delay }: {
  geo: THREE.BufferGeometry; mat: THREE.Material; y: number; s: number; yaw: number; drop: boolean; delay: number;
}) {
  const { bus } = useContext(StageCtx);
  const m = useRef<THREE.Mesh>(null);
  const st = useRef({ t: drop ? -delay : 1 });
  useLayoutEffect(() => { if (m.current) { m.current.position.y = y; m.current.visible = !drop; } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useFrame((_, dt) => {
    const mesh = m.current;
    if (!mesh) return;
    if (st.current.t >= 1) { if (mesh.position.y !== y) mesh.position.y = y; return; }
    st.current.t += dt / 0.3;
    if (st.current.t < 0) return;
    mesh.visible = true;
    const k = Math.min(1, st.current.t);
    mesh.position.y = y + 2.2 * (1 - k * k);
    if (k >= 1) { st.current.t = 1; bus.emit({ t: 'coin' }); }
  });
  return <mesh ref={m} geometry={geo} material={mat} scale={[s, s, s]} rotation-y={yaw} />;
}

function CoinStack({ coins, amount }: { coins: SceneDef['coins']; amount: number }) {
  const { animate } = useContext(StageCtx);
  const { geo, height } = useCoinGeo(coins);
  const gold = useColorTexture(coins.gold.diffuse ?? WHITE_PX);
  const silver = useColorTexture(coins.silver.diffuse ?? WHITE_PX);
  const bronze = useColorTexture(coins.bronze.diffuse ?? WHITE_PX);
  const mats = useMemo(() => ({
    gold: new THREE.MeshStandardMaterial({ map: gold, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    silver: new THREE.MeshStandardMaterial({ map: silver, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
    bronze: new THREE.MeshStandardMaterial({ map: bronze, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
  }), [gold, silver, bronze]);
  const pile = useMemo(() => {
    const out: ('gold' | 'silver' | 'bronze')[] = [];
    let left = Math.max(0, Math.round(amount));
    while (left >= 15) { out.push('gold'); left -= 15; }
    while (left >= 5) { out.push('silver'); left -= 5; }
    while (left >= 1) { out.push('bronze'); left -= 1; }
    return out;
  }, [amount]);
  // coins beyond the pile's old height are the new ones: only they fall
  const prev = useRef(animate ? 0 : pile.length);
  const base = prev.current;
  useEffect(() => { prev.current = pile.length; }, [pile.length]);
  let y = 0;
  return (
    <>
      {pile.map((denom, i) => {
        const s = coins[denom].scale * 0.55;
        const at = y + (height * s) / 2;
        y += height * s * 1.05;
        return (
          <Coin key={i} geo={geo} mat={mats[denom]} y={at} s={s} yaw={i * 0.7}
            drop={animate && i >= base} delay={Math.max(0, i - base) * 0.07} />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Scout: the two wild cards lift off their piles
// ---------------------------------------------------------------------------

function ScoutLift({ piles }: { piles: CardPileDef[] }) {
  const { bus } = useContext(StageCtx);
  const [run, setRun] = useState(0);
  const g = useRef<THREE.Group>(null);
  const t = useRef(9);
  useEffect(() => bus.on((e) => { if (e.t === 'scout') { t.current = 0; setRun((n) => n + 1); } }), [bus]);
  const defs = useMemo(() => piles.map((p) => ({ ...p, count: 1 })), [piles]);
  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    if (t.current > 1.7) { grp.visible = false; return; }
    t.current += dt;
    const k = Math.min(1, t.current / 1.7);
    grp.visible = true;
    const up = easeOut(Math.min(1, k / 0.45));
    grp.position.y = up * 2.6;
    const fade = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    grp.scale.setScalar(Math.max(0.001, fade));
  });
  if (!run) return null;
  return (
    <group ref={g} visible={false}>
      {defs.map((d) => <CardPile key={d.name} def={d} />)}
    </group>
  );
}

// ---------------------------------------------------------------------------
// The live table
// ---------------------------------------------------------------------------

type Cube = { at: [number, number, number]; kind: 'coal' | 'iron' | 'beer' };

export function SetupPieces({ scene, game }: { scene: SceneDef; game: GameSceneState }) {
  const { animate } = useContext(StageCtx);
  // The board mesh's painted top sits maxY*scaleY above its origin, ~0.181 for
  // this board (local top 10.482 * scale.y 0.01727). Pieces rest on that top; a
  // larger offset floats them (visibly so for the tall beer barrels). Keep a
  // hair above to avoid z-fighting with the board's top face.
  const surfaceY = scene.board.place.pos[1] + 0.184;

  const zones = useMemo(() => {
    const by = new Map<string, Zone>();
    for (const z of scene.zones) by.set(`${z.kind}|${z.name}`, z);
    const ending = (kind: string, suffix: string) => scene.zones.find((z) => z.kind === kind && z.name.endsWith(suffix));
    return { get: (kind: string, name: string) => by.get(`${kind}|${name}`), ending };
  }, [scene]);

  const track = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < 100; i++) {
      const z = zones.get('track', `track ${i}`);
      out.push(z ? new THREE.Vector3(z.pos[0], 0, -z.pos[2]) : new THREE.Vector3());
    }
    return out;
  }, [zones]);

  const coalDef = useMemo(() => scene.objects.find((o): o is ModelDef => o.t === 'model' && o.name === 'Coal'), [scene]);
  const ironDef = useMemo(() => scene.objects.find((o): o is ModelDef => o.t === 'model' && o.name === 'Iron'), [scene]);
  const flatCoal = useMemo(() => coalDef && ({ ...coalDef, place: { ...coalDef.place, pos: [0, 0, 0] } }), [coalDef]);
  const flatIron = useMemo(() => ironDef && ({ ...ironDef, place: { ...ironDef.place, pos: [0, 0, 0] } }), [ironDef]);
  const wildPiles = useMemo(() => scene.objects.filter((o): o is CardPileDef => o.t === 'cardpile'), [scene]);

  // ---- what is on the table, as flat keyed lists ----
  const industries = useMemo(() => {
    const out: Record<string, { color: string; tile: string; flipped: boolean; x: number; z: number }> = {};
    for (const [sq, b] of Object.entries(game.industries)) {
      const z = zones.get('locationSquare', sq);
      if (z) out[sq] = { color: b.color, tile: b.tile, flipped: b.flipped, x: z.pos[0], z: -z.pos[2] };
    }
    return out;
  }, [game.industries, zones]);

  const links = useMemo(() => {
    const out: Record<string, { color: string; era: 'canal' | 'rail'; x: number; z: number; yaw: number }> = {};
    for (const [link, color] of Object.entries(game.links)) {
      const z = zones.get('linkZone', link);
      if (z) out[link] = { color, era: game.era, x: z.pos[0], z: -z.pos[2], yaw: z.rot?.[1] ?? 0 };
    }
    return out;
  }, [game.links, game.era, zones]);

  const cubes = useMemo(() => {
    const out: Record<string, Cube> = {};
    game.markets.coal.forEach((v, i) => {
      const z = v === 1 ? zones.ending('coalMarket', `coal ${i}`) : undefined;
      if (z) out[`mc${i}`] = { at: [z.pos[0], surfaceY + 0.16, -z.pos[2]], kind: 'coal' };
    });
    game.markets.iron.forEach((v, i) => {
      const z = v === 1 ? zones.ending('ironMarket', `iron ${i}`) : undefined;
      if (z) out[`mi${i}`] = { at: [z.pos[0], surfaceY + 0.16, -z.pos[2]], kind: 'iron' };
    });
    for (const m of game.merchants) {
      const z = m.beer ? zones.ending('merchantBeer', ` beer ${m.slot}`) : undefined;
      if (z) out[`mb${m.slot}`] = { at: [z.pos[0], surfaceY, -z.pos[2]], kind: 'beer' };
    }
    const tileTopY = surfaceY + 0.03 + 0.19;
    for (const [sq, b] of Object.entries(game.industries)) {
      if (b.cubes <= 0) continue;
      const z = zones.get('locationSquare', sq);
      const type = TILES[b.tile]?.type;
      const kind = type === 'Coal Mine' ? 'coal' : type === 'Iron Works' ? 'iron' : type === 'Brewery' ? 'beer' : null;
      if (!z || !kind) continue;
      // lay the cubes out for the tile's printed count, so they do not shuffle as it empties
      const printed = Math.max(b.cubes, startingCubes(b.tile, game.era));
      const rows = Math.ceil(Math.min(printed, 6) / 2);
      for (let i = 0; i < Math.min(b.cubes, 6); i++) {
        const px = z.pos[0] + ((i % 2) - 0.5) * 0.4;
        const pz = z.pos[2] + (Math.floor(i / 2) - (rows - 1) / 2) * 0.36;
        out[`${sq}|${i}`] = { at: [px, kind === 'beer' ? tileTopY : tileTopY + 0.1, -pz], kind };
      }
    }
    return out;
  }, [game.markets, game.merchants, game.industries, game.era, zones, surfaceY]);

  const heldIndustries = usePresence(industries, animate);
  const heldLinks = usePresence(links, animate);
  const heldCubes = usePresence(cubes, animate);

  return (
    <>
      {game.merchants.map((m) => {
        const mz = zones.ending('merchantZone', ` merchant ${m.slot}`);
        const cell = scene.merchantTiles.cells[m.tile === 'Blank' ? 'Blank' : m.tile];
        return mz && cell !== undefined ? (
          <SheetTile key={m.slot} sheet={scene.merchantTiles.sheet} cell={cell} size={mz.scale[0] * 0.92} pos={[mz.pos[0], surfaceY, -mz.pos[2]]} />
        ) : null;
      })}

      {/* The player's barrel (the spent-money bowl) is the prominent barrel on
          the track; the portrait token sits centred on it, and this round's
          spent coins pile on the same barrel. */}
      {game.turnOrder.map((color, i) => {
        const bz = zones.ending('spentBowl', `spent ${i + 1}`);
        const tok = scene.turnTokens[color];
        if (!bz || !tok) return null;
        const spent = game.spentByColor[color] ?? 0;
        return (
          <Glide key={color} to={[bz.pos[0], surfaceY, -bz.pos[2]]} delay={i * 0.14} sound={{ t: 'token' }}>
            <RoundToken tok={tok} color={color} pos={[0, 0, 0]} />
            <group position={[0.5, 0.02, 0]}>
              <Suspense fallback={null}><CoinStack coins={scene.coins} amount={spent} /></Suspense>
            </group>
          </Glide>
        );
      })}

      {(() => {
        const dz = zones.ending('deckZone', 'draw deck');
        if (!dz) return null;
        const def: DeckDef = {
          // Yaw 270 matches the deck zone and the wild piles beside it.
          t: 'deck', back: scene.cardBack, count: game.drawCount, name: 'draw deck',
          place: { pos: [dz.pos[0], surfaceY + 0.05, dz.pos[2]], rot: [0, 270, 0], scale: [1.12, 1, 1.12] },
        };
        return game.drawCount > 0 ? <Deck def={def} /> : null;
      })()}
      <Suspense fallback={null}><ScoutLift piles={wildPiles} /></Suspense>

      {/* built industries: ONE tile of the player's art on its location square */}
      {heldIndustries.map(({ key, item, fresh, out }) => {
        const art = scene.objects.find((o): o is TileDef => o.t === 'tile' && o.name === `${item.color} ${item.tile}`);
        return art ? (
          <Suspense key={`${key}|${item.color}|${item.tile}`} fallback={null}>
            <BuiltTile art={art} sq={key} color={item.color} tile={item.tile} flipped={item.flipped}
              x={item.x} y={surfaceY + 0.03} z={item.z} fresh={fresh} out={out} />
          </Suspense>
        ) : null;
      })}

      {/* built links: the owner's canal/railway tile on the connection */}
      {heldLinks.map(({ key, item, fresh, out }) => {
        const art = scene.objects.find((o): o is TileDef => o.t === 'tile' && o.name === `${item.color} ${item.era === 'canal' ? 'Canal' : 'Railway'}`);
        return art ? (
          <Suspense key={`${key}|${item.color}|${item.era}`} fallback={null}>
            <LinkTile art={art} id={key} color={item.color} era={item.era} x={item.x} y={surfaceY + 0.02} z={item.z} yaw={item.yaw} fresh={fresh} out={out} />
          </Suspense>
        ) : null;
      })}

      {/* coal, iron and beer: on the markets, on the merchants, on the tiles */}
      {heldCubes.map(({ key, item, fresh, out, order, outOrder }) => (
        <Fly key={key} at={item.at} fresh={fresh} out={out} delay={0.5 + order * 0.09} outDelay={outOrder * 0.09}
          sound={{ t: 'cube', kind: item.kind }}>
          <Suspense fallback={null}>
            {item.kind === 'beer'
              ? <BeerBarrel def={scene.beerBarrel} pos={[0, 0, 0]} scale={key.startsWith('mb') ? 1 : 0.72} />
              : item.kind === 'coal' ? (flatCoal && <Model def={flatCoal} />) : (flatIron && <Model def={flatIron} />)}
          </Suspense>
        </Fly>
      ))}

      {/* income + VP markers walking the track (statics are hidden in-game) */}
      {game.markers.map((mk, i) => {
        const incDef = scene.objects.find((o): o is ModelDef => o.t === 'model' && o.name === `${mk.color} Income Marker`);
        const vpDef = scene.objects.find((o): o is ModelDef => o.t === 'model' && o.name === `${mk.color} Victory Points`);
        const lift = surfaceY + 0.05 + i * 0.055; // stack co-located markers
        return (
          <group key={mk.color}>
            {incDef && <WalkingMarker def={incDef} offset={mk.incomeOffset} lift={lift} track={track} />}
            {vpDef && <WalkingMarker def={vpDef} offset={mk.vpOffset} lift={lift} track={track} />}
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Screen effects: impact rings, debris, floating numbers, the spotlight
// ---------------------------------------------------------------------------

const RING_GEO = new THREE.RingGeometry(0.82, 1, 48);
const DEBRIS_GEO = new THREE.BoxGeometry(0.09, 0.09, 0.09);
const DEBRIS_MAT = new THREE.MeshStandardMaterial({ color: '#3a322a', roughness: 1 });

export function Effects({ spot }: { spot?: Spot | null }) {
  const { bus } = useContext(StageCtx);
  const rings = useRef(Array.from({ length: 8 }, () => ({ live: false, t: 0, x: 0, z: 0, size: 1.5, color: new THREE.Color('#fff') })));
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const bits = useRef(Array.from({ length: 28 }, () => ({ live: false, t: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() })));
  const inst = useRef<THREE.InstancedMesh>(null);
  const spotRef = useRef<THREE.Mesh>(null);
  const [floats, setFloats] = useState<{ id: number; x: number; z: number; text: string; tone: string }[]>([]);
  const nextId = useRef(1);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const ring = (x: number, z: number, color: string, size = 1.5) => {
      const r = rings.current.find((q) => !q.live) ?? rings.current[0];
      r.live = true; r.t = 0; r.x = x; r.z = z; r.size = size; r.color.set(color);
    };
    const burst = (x: number, z: number) => {
      let n = 0;
      for (const b of bits.current) {
        if (b.live) continue;
        const a = Math.random() * Math.PI * 2;
        const sp = 1.6 + Math.random() * 2.2;
        b.live = true; b.t = 0;
        b.pos.set(x + Math.cos(a) * 0.45, 1.62, z + Math.sin(a) * 0.45);
        b.vel.set(Math.cos(a) * sp, 1.8 + Math.random() * 2.2, Math.sin(a) * sp);
        if (++n >= 10) break;
      }
    };
    return bus.on((e) => {
      if (e.t === 'land') { ring(e.x, e.z, SEAT_HEX[e.color] ?? '#fff', 1.7); burst(e.x, e.z); }
      else if (e.t === 'flipped') ring(e.x, e.z, '#ffe9a8', 1.9);
      else if (e.t === 'link') ring(e.x, e.z, SEAT_HEX[e.color] ?? '#fff', 1.3);
      else if (e.t === 'ring') ring(e.x, e.z, e.color, e.size);
      else if (e.t === 'float') {
        const id = nextId.current++;
        setFloats((f) => [...f, { id, x: e.x, z: e.z, text: e.text, tone: e.tone ?? 'plain' }]);
        window.setTimeout(() => setFloats((f) => f.filter((q) => q.id !== id)), 2100);
      }
    });
  }, [bus]);

  useFrame(({ clock }, dt) => {
    rings.current.forEach((r, i) => {
      const mesh = ringRefs.current[i];
      if (!mesh) return;
      if (!r.live) { mesh.visible = false; return; }
      r.t += dt;
      const k = Math.min(1, r.t / 0.7);
      mesh.visible = true;
      mesh.position.set(r.x, 1.66, r.z);
      mesh.scale.setScalar(r.size * (0.35 + 1.1 * easeOut(k)));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.copy(r.color);
      mat.opacity = (1 - k) * 0.9;
      if (k >= 1) r.live = false;
    });
    const im = inst.current;
    if (im) {
      bits.current.forEach((b, i) => {
        if (b.live) {
          b.t += dt;
          b.vel.y -= 9.5 * dt;
          b.pos.addScaledVector(b.vel, dt);
          if (b.pos.y < 1.5 || b.t > 0.9) b.live = false;
        }
        dummy.position.copy(b.pos);
        dummy.rotation.set(b.t * 9, b.t * 7, 0);
        dummy.scale.setScalar(b.live ? Math.max(0.01, 1 - b.t / 0.9) : 0.0001);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
    }
    const sm = spotRef.current;
    if (sm) {
      const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.2);
      sm.scale.setScalar((spot?.size ?? 1) * (1 + 0.06 * k));
      (sm.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * k;
    }
  });

  return (
    <>
      {rings.current.map((_, i) => (
        <mesh key={i} ref={(m) => { ringRefs.current[i] = m; }} geometry={RING_GEO} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={30}>
          <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <instancedMesh ref={inst} args={[DEBRIS_GEO, DEBRIS_MAT, bits.current.length]} frustumCulled={false} />
      {spot && (
        <mesh ref={spotRef} geometry={RING_GEO} position={[spot.x, 1.64, spot.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={29}>
          <meshBasicMaterial color={spot.color} transparent opacity={0.7} depthTest={false} depthWrite={false} />
        </mesh>
      )}
      {floats.map((f) => (
        <Html key={f.id} position={[f.x, 2.3, f.z]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`bbx-float ${f.tone}`}>{f.text}</div>
        </Html>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Camera rig: scripted shots for the big screen
// ---------------------------------------------------------------------------

export interface Shot { pos: [number, number, number]; tgt: [number, number, number]; }
export interface RigApi {
  /** glide to a shot; resolves on arrival */
  fly(shot: Shot, seconds?: number): Promise<void>;
  /** glide back to the full-board view and hand the camera back */
  home(seconds?: number): Promise<void>;
  /** drift around the current target, radians per second (0 stops) */
  orbit(speed: number): void;
  /** jump straight home, no motion */
  reset(): void;
}

export function Rig({ api, controls, home, interactive }: {
  api: MutableRefObject<RigApi | null>;
  controls: MutableRefObject<OrbitControlsImpl | null>;
  home: MutableRefObject<Shot>;
  interactive: boolean;
}) {
  const camera = useThree((s) => s.camera);
  const { bus } = useContext(StageCtx);
  const st = useRef({
    on: false, orbit: 0, shake: 0,
    base: new THREE.Vector3(), tgt: new THREE.Vector3(),
    tween: null as null | { t: number; dur: number; fromPos: THREE.Vector3; fromTgt: THREE.Vector3; toPos: THREE.Vector3; toTgt: THREE.Vector3; resolve: () => void; release: boolean },
  });

  useEffect(() => {
    const take = () => {
      const s = st.current;
      if (s.on) return;
      s.base.copy(camera.position);
      s.tgt.copy(controls.current?.target ?? new THREE.Vector3());
      s.on = true;
      if (controls.current) controls.current.enabled = false;
    };
    const go = (shot: Shot, seconds: number, release: boolean) => new Promise<void>((resolve) => {
      const s = st.current;
      take();
      s.tween?.resolve();
      s.tween = {
        t: 0, dur: Math.max(0.01, seconds), release, resolve,
        fromPos: s.base.clone(), fromTgt: s.tgt.clone(),
        toPos: new THREE.Vector3(...shot.pos), toTgt: new THREE.Vector3(...shot.tgt),
      };
    });
    const handle: RigApi = {
      fly: (shot, seconds = 1) => go(shot, seconds, false),
      home: (seconds = 1.1) => { st.current.orbit = 0; return go(home.current, seconds, true); },
      orbit: (speed) => { if (speed) take(); st.current.orbit = speed; },
      reset: () => {
        const s = st.current;
        s.tween?.resolve();
        s.tween = null; s.orbit = 0; s.shake = 0; s.on = false;
        camera.position.set(...home.current.pos);
        const c = controls.current;
        if (c) { c.target.set(...home.current.tgt); c.enabled = interactive; c.update(); }
      },
    };
    api.current = handle;
    return () => { if (api.current === handle) api.current = null; };
  }, [api, camera, controls, home, interactive]);

  useEffect(() => bus.on((e) => {
    if (e.t === 'land') st.current.shake = Math.max(st.current.shake, 0.11);
    else if (e.t === 'shake') st.current.shake = Math.max(st.current.shake, e.amount);
  }), [bus]);

  useFrame((_, dt) => {
    const s = st.current;
    if (!s.on) { s.shake = 0; return; }
    const c = controls.current;
    const tw = s.tween;
    if (tw) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      s.base.lerpVectors(tw.fromPos, tw.toPos, e);
      s.tgt.lerpVectors(tw.fromTgt, tw.toTgt, e);
      if (k >= 1) {
        s.tween = null;
        if (tw.release) { s.on = false; if (c) c.enabled = interactive; }
        tw.resolve();
      }
    } else if (s.orbit) {
      const a = s.orbit * dt;
      const dx = s.base.x - s.tgt.x;
      const dz = s.base.z - s.tgt.z;
      s.base.x = s.tgt.x + dx * Math.cos(a) - dz * Math.sin(a);
      s.base.z = s.tgt.z + dx * Math.sin(a) + dz * Math.cos(a);
    }
    camera.position.copy(s.base);
    if (s.shake > 0.002) {
      camera.position.x += (Math.random() - 0.5) * s.shake;
      camera.position.y += (Math.random() - 0.5) * s.shake;
      camera.position.z += (Math.random() - 0.5) * s.shake;
      s.shake *= Math.exp(-dt * 13);
    } else s.shake = 0;
    if (c) { c.target.copy(s.tgt); c.update(); } else camera.lookAt(s.tgt);
  });
  return null;
}

// ---------------------------------------------------------------------------
// Player mat: the tile stacks run down as their owner builds and develops
// ---------------------------------------------------------------------------

export function MatTile({ def, left }: { def: TileDef; left: number }) {
  const { animate, bus } = useContext(StageCtx);
  const prev = useRef(left);
  const ghost = useRef<THREE.Group>(null);
  const t = useRef(9);
  const [ghostAt, setGhostAt] = useState<number | null>(null);
  useEffect(() => {
    if (left < prev.current && animate) { t.current = 0; setGhostAt(prev.current); bus.emit({ t: 'lift' }); }
    prev.current = left;
  }, [left, animate, bus]);
  // One tile's thickness. The save places a stack by its centre, so a shorter
  // stack has to be lowered to keep its bottom on the mat.
  const unit = 4 * def.thickness * def.place.scale[1];
  const floor = def.place.pos[1] - (def.count * unit) / 2;
  useFrame((_, dt) => {
    const grp = ghost.current;
    if (!grp) return;
    if (t.current > 0.7) { grp.visible = false; return; }
    t.current += dt;
    const k = Math.min(1, t.current / 0.7);
    grp.visible = true;
    grp.position.y = easeOut(k) * 2.2;
    grp.scale.setScalar(Math.max(0.001, 1 - k * k));
  });
  const stack = useMemo<TileDef>(() => {
    const n = Math.max(1, Math.min(left, def.count));
    return { ...def, count: n, place: { ...def.place, pos: [def.place.pos[0], floor + (n * unit) / 2, def.place.pos[2]] } };
  }, [def, left, floor, unit]);
  const top = useMemo<TileDef | null>(() => (ghostAt === null ? null : {
    ...def, count: 1,
    place: { ...def.place, pos: [def.place.pos[0], floor + (Math.min(ghostAt, def.count) - 0.5) * unit, def.place.pos[2]] },
  }), [def, ghostAt, floor, unit]);
  return (
    <>
      {left > 0 && <Tile def={stack} />}
      {top && <group ref={ghost} visible={false}><Tile def={top} /></group>}
    </>
  );
}
