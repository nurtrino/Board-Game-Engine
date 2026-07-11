import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { BattleSimProps } from './BattleSim';
import {
  stylizedCameraPlan,
  stylizedFormation,
  type StylizedCameraPlan,
  type StylizedPlacement,
} from './stylizedBattleLayout';
import { stylizedAuthoritativeVolleyLinks } from './stylizedBattleVolley';
import {
  beginsParatrooperDrop,
  isAboardParatrooper,
  isDeployedParatrooper,
  isLinkedAboardLoss,
} from './stylizedBattleAirborne';
import { fireSoundFor, visualFor, type Domain, type Side, type SimUnit } from './battlescene';
import {
  STYLIZED_DEATH_MS,
  STYLIZED_RETREAT_MS,
  STYLIZED_SUBMERGE_MS,
  stylizedPresentationDurationMs,
  stylizedVolleyDurationMs,
  type StylizedPresentationSnapshot,
} from './stylizedBattleTiming';
import './StylizedBattleSim.css';

export type StylizedBattleSimProps = BattleSimProps;

const SIDE_ACCENT: Record<Side, string> = {
  attacker: '#f0a84b',
  defender: '#58b5cf',
};

// Above this size, the exact same command pieces remain visible but expensive
// shadow and supersampling passes are disabled. Large battles otherwise pay a
// second render of every sculpt and can exhaust integrated GPUs.
const DENSE_SCENE_UNIT_THRESHOLD = 32;

interface FactionPalette {
  readonly body: string;
  readonly light: string;
  readonly dark: string;
  readonly metal: string;
}

const DEFAULT_PALETTES: Record<Side, FactionPalette> = {
  attacker: { body: '#b77836', light: '#e2ae67', dark: '#3c291c', metal: '#75634c' },
  defender: { body: '#3f7f91', light: '#77b5c5', dark: '#18313a', metal: '#60757b' },
};

const FACTION_PALETTES: readonly (readonly [RegExp, FactionPalette])[] = [
  [/german|axis/i, { body: '#58605b', light: '#8f9991', dark: '#202522', metal: '#6d756f' }],
  [/japan/i, { body: '#ad7836', light: '#dca95f', dark: '#402917', metal: '#70624d' }],
  [/ital/i, { body: '#687151', light: '#9da77d', dark: '#293020', metal: '#6a705f' }],
  [/soviet|ussr|russia/i, { body: '#a3463f', light: '#d37967', dark: '#3b1919', metal: '#71605a' }],
  [/united kingdom|britain|british|uk/i, { body: '#8d795d', light: '#c1a984', dark: '#342b22', metal: '#766d5d' }],
  [/united states|america|american|usa|u\.s\./i, { body: '#4e7183', light: '#81a8b8', dark: '#1e3039', metal: '#64767c' }],
  [/china|chinese/i, { body: '#6d7f4f', light: '#9eaf75', dark: '#29331d', metal: '#69715c' }],
  [/france|french/i, { body: '#4c668d', light: '#819bc0', dark: '#1d293c', metal: '#68727f' }],
];

function paletteFor(name: string | undefined, side: Side): FactionPalette {
  if (name) {
    const match = FACTION_PALETTES.find(([pattern]) => pattern.test(name));
    if (match) return match[1];
  }
  return DEFAULT_PALETTES[side];
}

function seedFrom(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - THREE.MathUtils.clamp(value, 0, 1), 3);
}

function easeInOutCubic(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const audioByName = new Map<string, HTMLAudioElement>();
let audioConsumers = 0;

function retainStylizedAudio(): () => void {
  audioConsumers += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    audioConsumers = Math.max(0, audioConsumers - 1);
    if (audioConsumers > 0) return;
    for (const audio of audioByName.values()) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
      } catch {
        // A browser may already have torn down its media element.
      }
    }
    audioByName.clear();
  };
}

function playStylizedSound(name: string): void {
  try {
    let audio = audioByName.get(name);
    if (!audio) {
      audio = new Audio(`/axis/sim/sounds/${name}.mp3`);
      audioByName.set(name, audio);
    }
    audio.currentTime = 0;
    audio.volume = 0.42;
    void audio.play().catch(() => undefined);
  } catch {
    // Audio is decorative. Browser autoplay policy must never block readiness.
  }
}

function SculptMaterial({ color, emissive = '#000000' }: { color: string; emissive?: string }) {
  return (
    <meshToonMaterial
      color={color}
      emissive={emissive}
      emissiveIntensity={emissive === '#000000' ? 0 : 0.24}
    />
  );
}

function AccentMaterial({ color }: { color: string }) {
  return <meshStandardMaterial color={color} metalness={0.38} roughness={0.45} flatShading />;
}

function InfantrySculpt({ palette }: { palette: FactionPalette }) {
  return (
    <group>
      <mesh position={[-0.18, 0.44, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.48, 3, 6]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0.18, 0.44, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.48, 3, 6]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0, 1.16, 0]} castShadow>
        <dodecahedronGeometry args={[0.42, 0]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      <mesh position={[0, 1.78, 0.03]} castShadow>
        <icosahedronGeometry args={[0.29, 1]} />
        <SculptMaterial color={palette.light} />
      </mesh>
      <mesh position={[0, 1.95, 0.02]} scale={[1.1, 0.32, 1.05]} castShadow>
        <sphereGeometry args={[0.3, 10, 5]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0.31, 1.15, 0.42]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.055, 0.075, 1.35, 6]} />
        <AccentMaterial color={palette.metal} />
      </mesh>
      <mesh position={[0.14, 1.32, 0.15]} rotation={[0.35, 0, -0.65]} castShadow>
        <capsuleGeometry args={[0.09, 0.58, 3, 6]} />
        <SculptMaterial color={palette.body} />
      </mesh>
    </group>
  );
}

function TankSculpt({ palette, mechanized = false }: { palette: FactionPalette; mechanized?: boolean }) {
  return (
    <group scale={mechanized ? [0.9, 0.9, 1.08] : 1}>
      <mesh position={[-0.69, 0.34, 0]} castShadow>
        <boxGeometry args={[0.36, 0.55, 2.15]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0.69, 0.34, 0]} castShadow>
        <boxGeometry args={[0.36, 0.55, 2.15]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[1.25, 0.68, 1.9]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      <mesh position={[0, 1.08, 0.2]} castShadow>
        <cylinderGeometry args={[0.52, 0.6, 0.42, 8]} />
        <SculptMaterial color={palette.light} />
      </mesh>
      <mesh position={[0, 1.13, 1.28]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.09, 0.13, 2.05, 8]} />
        <AccentMaterial color={palette.metal} />
      </mesh>
      {mechanized && (
        <mesh position={[0, 1.14, -0.6]} castShadow>
          <boxGeometry args={[0.8, 0.48, 0.68]} />
          <SculptMaterial color={palette.light} />
        </mesh>
      )}
    </group>
  );
}

function ArtillerySculpt({ palette, antiAir = false }: { palette: FactionPalette; antiAir?: boolean }) {
  return (
    <group>
      <mesh position={[-0.64, 0.43, -0.2]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.2, 10]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0.64, 0.43, -0.2]} rotation-z={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.2, 10]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0, 0.63, -0.1]} castShadow>
        <boxGeometry args={[1.15, 0.28, 1.3]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      {(antiAir ? [-0.18, 0.18] : [0]).map((x) => (
        <mesh key={x} position={[x, antiAir ? 1.37 : 1.02, antiAir ? 0.55 : 0.85]} rotation-x={antiAir ? Math.PI * 0.31 : Math.PI * 0.42} castShadow>
          <cylinderGeometry args={[0.065, 0.095, antiAir ? 1.9 : 2.25, 8]} />
          <AccentMaterial color={palette.metal} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.52, 0.42, 8]} />
        <SculptMaterial color={palette.light} />
      </mesh>
      <mesh position={[0, 0.22, -1.3]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 1.7, 6]} />
        <SculptMaterial color={palette.body} />
      </mesh>
    </group>
  );
}

function AircraftSculpt({ palette, bomber = false, tactical = false }: { palette: FactionPalette; bomber?: boolean; tactical?: boolean }) {
  const wingRadius = bomber ? 2.15 : tactical ? 1.75 : 1.55;
  const length = bomber ? 4.3 : tactical ? 3.45 : 3.1;
  return (
    <group>
      <mesh position={[0, 0.08, -0.08]} rotation-y={Math.PI} scale={[1, 0.14, bomber ? 0.85 : 1]} castShadow>
        <coneGeometry args={[wingRadius, 1, bomber ? 4 : 3]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      <mesh position={[0, 0.23, 0]} rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[bomber ? 0.3 : 0.22, length - 0.6, 5, 8]} />
        <SculptMaterial color={palette.light} />
      </mesh>
      <mesh position={[0, 0.24, length / 2]} rotation-x={Math.PI / 2} castShadow>
        <coneGeometry args={[bomber ? 0.31 : 0.23, 0.75, 8]} />
        <AccentMaterial color={palette.metal} />
      </mesh>
      <mesh position={[0, 0.38, -length * 0.42]} scale={[0.92, 0.11, 0.48]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      {bomber && [-0.94, 0.94].map((x) => (
        <mesh key={x} position={[x, -0.03, 0.15]} rotation-x={Math.PI / 2} castShadow>
          <capsuleGeometry args={[0.22, 1.05, 4, 7]} />
          <SculptMaterial color={palette.dark} />
        </mesh>
      ))}
    </group>
  );
}

function WarshipSculpt({ palette, type, accent }: { palette: FactionPalette; type: string; accent: string }) {
  const carrier = type === 'carrier';
  const transport = type === 'transport';
  const battleship = type === 'battleship';
  const length = carrier ? 5.3 : battleship ? 4.9 : transport ? 4.4 : type === 'cruiser' ? 4.25 : 3.85;
  const beam = carrier ? 1.45 : battleship ? 1.25 : 1.02;
  return (
    <group>
      <mesh position={[0, 0.43, -0.18]} castShadow>
        <boxGeometry args={[beam, 0.72, length * 0.82]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      <mesh position={[0, 0.43, length * 0.43]} rotation-x={Math.PI / 2} castShadow>
        <coneGeometry args={[beam * 0.51, length * 0.28, 4]} />
        <SculptMaterial color={palette.light} />
      </mesh>
      {carrier ? (
        <>
          <mesh position={[0, 0.86, -0.12]} castShadow>
            <boxGeometry args={[beam * 1.36, 0.16, length * 0.96]} />
            <SculptMaterial color={palette.dark} />
          </mesh>
          <mesh position={[beam * 0.5, 1.25, -0.45]} castShadow>
            <boxGeometry args={[0.34, 0.72, 0.75]} />
            <AccentMaterial color={palette.metal} />
          </mesh>
          <mesh position={[0, 0.96, 0.1]}>
            <boxGeometry args={[0.055, 0.055, length * 0.72]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 1.02, -0.38]} castShadow>
            <boxGeometry args={[beam * 0.62, 0.72, length * 0.28]} />
            <SculptMaterial color={palette.light} />
          </mesh>
          {!transport && [-0.9, 0.84].map((z) => (
            <group key={z} position={[0, 1.03, z]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.22, 0.28, 0.25, 8]} />
                <SculptMaterial color={palette.dark} />
              </mesh>
              <mesh position={[0, 0.05, 0.46]} rotation-x={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.045, 0.065, 0.88, 6]} />
                <AccentMaterial color={palette.metal} />
              </mesh>
            </group>
          ))}
          {transport && (
            <mesh position={[0, 0.95, 0.45]} castShadow>
              <boxGeometry args={[beam * 0.78, 0.48, 1.1]} />
              <SculptMaterial color={palette.dark} />
            </mesh>
          )}
          <mesh position={[0, 1.65, -0.45]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 1.05, 5]} />
            <AccentMaterial color={palette.metal} />
          </mesh>
        </>
      )}
    </group>
  );
}

function SubmarineSculpt({ palette }: { palette: FactionPalette }) {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} rotation-x={Math.PI / 2} castShadow>
        <capsuleGeometry args={[0.55, 3.15, 6, 10]} />
        <SculptMaterial color={palette.dark} />
      </mesh>
      <mesh position={[0, 0.92, -0.15]} castShadow>
        <boxGeometry args={[0.56, 0.58, 0.85]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      <mesh position={[0.18, 1.36, -0.13]} castShadow>
        <cylinderGeometry args={[0.035, 0.045, 0.72, 5]} />
        <AccentMaterial color={palette.metal} />
      </mesh>
      <mesh position={[0, 0.5, -1.75]} scale={[1.35, 0.1, 0.38]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <SculptMaterial color={palette.body} />
      </mesh>
    </group>
  );
}

function FactorySculpt({ palette }: { palette: FactionPalette }) {
  return (
    <group>
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[2.35, 1.45, 1.75]} />
        <SculptMaterial color={palette.body} />
      </mesh>
      <mesh position={[0, 1.57, 0]} rotation-z={Math.PI / 4} castShadow>
        <boxGeometry args={[1.65, 1.65, 1.82]} />
        <SculptMaterial color={palette.light} />
      </mesh>
      {[-0.72, 0.68].map((x, index) => (
        <mesh key={x} position={[x, 2.2, index ? -0.38 : 0.35]} castShadow>
          <cylinderGeometry args={[0.2, 0.28, index ? 1.5 : 1.9, 7]} />
          <SculptMaterial color={palette.dark} />
        </mesh>
      ))}
      <mesh position={[0, 0.82, 0.9]}>
        <boxGeometry args={[1.18, 0.52, 0.08]} />
        <meshBasicMaterial color="#f1c56c" toneMapped={false} />
      </mesh>
    </group>
  );
}

// Sculpt geometry and materials remain declarative Canvas children so R3F
// owns and disposes them with each renderer. The only imperative geometry in
// this module is the memoized arena surface, released explicitly below.
function UnitSculpt({ unit, palette }: { unit: SimUnit; palette: FactionPalette }) {
  switch (unit.type) {
    case 'tank': return <TankSculpt palette={palette} />;
    case 'mechInfantry': return <TankSculpt palette={palette} mechanized />;
    case 'artillery': return <ArtillerySculpt palette={palette} />;
    case 'aaGun': return <ArtillerySculpt palette={palette} antiAir />;
    case 'fighter': return <AircraftSculpt palette={palette} />;
    case 'tacticalBomber': return <AircraftSculpt palette={palette} tactical />;
    case 'bomber': return <AircraftSculpt palette={palette} bomber />;
    case 'submarine': return <SubmarineSculpt palette={palette} />;
    case 'destroyer':
    case 'cruiser':
    case 'transport':
    case 'carrier':
    case 'battleship':
      return <WarshipSculpt palette={palette} type={unit.type} accent={SIDE_ACCENT[unit.side]} />;
    case 'factory': return <FactorySculpt palette={palette} />;
    default: return <InfantrySculpt palette={palette} />;
  }
}

function HealthBar({ health, color, y }: { health: number; color: string; y: number }) {
  const clamped = THREE.MathUtils.clamp(health, 0, 1);
  if (clamped >= 0.999 || clamped <= 0) return null;
  return (
    <Billboard position={[0, y, 0]}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[1.72, 0.19]} />
        <meshBasicMaterial color="#071015" transparent opacity={0.92} depthTest={false} />
      </mesh>
      <mesh position={[-(1 - clamped) * 0.82, 0, 0]} scale={[clamped, 1, 1]}>
        <planeGeometry args={[1.58, 0.1]} />
        <meshBasicMaterial color={color} toneMapped={false} depthTest={false} />
      </mesh>
    </Billboard>
  );
}

interface UnitTokenProps {
  readonly placement: StylizedPlacement;
  readonly domain: Domain;
  readonly palette: FactionPalette;
  readonly destroyed: boolean;
  readonly submerged: boolean;
  readonly retreating: boolean;
  readonly health: number;
  readonly salvo: number;
  readonly firing: boolean;
  readonly active: boolean;
  readonly replayInitialTransitions: boolean;
  readonly onDropComplete?: (unitId: string) => void;
}

function UnitToken({
  placement,
  domain,
  palette,
  destroyed,
  submerged,
  retreating,
  health,
  salvo,
  firing,
  active,
  replayInitialTransitions,
  onDropComplete,
}: UnitTokenProps) {
  const motion = useRef<THREE.Group>(null);
  const sculpt = useRef<THREE.Group>(null);
  const wreck = useRef<THREE.Group>(null);
  const baseRing = useRef<THREE.Mesh>(null);
  const ringMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const flash = useRef<THREE.Mesh>(null);
  const flashMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const ripple = useRef<THREE.Mesh>(null);
  const rippleMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const parachute = useRef<THREE.Group>(null);
  const parachuteMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const age = useRef(0);
  const deathProgress = useRef(destroyed && !replayInitialTransitions ? 1 : 0);
  const submergeProgress = useRef(submerged && !replayInitialTransitions ? 1 : 0);
  const retreatProgress = useRef(retreating && !replayInitialTransitions ? 1 : 0);
  const firePulse = useRef(0);
  const damagePulse = useRef(replayInitialTransitions && health < 1 ? 1 : 0);
  const paratrooperInfantry = placement.unit.paratrooper?.role === 'infantry';
  const carriedInfantry = isAboardParatrooper(placement.unit);
  const dropProgress = useRef(paratrooperInfantry && !carriedInfantry && !destroyed ? 0 : 1);
  const previousAboard = useRef(carriedInfantry);
  const dropReported = useRef(!paratrooperInfantry || carriedInfantry || destroyed);
  const previousDestroyed = useRef(destroyed);
  const previousSubmerged = useRef(submerged);
  const previousRetreating = useRef(retreating);
  const lastSalvo = useRef(0);
  const previousHealth = useRef(health);
  const layoutDirty = useRef(true);
  const seed = useMemo(() => seedFrom(placement.unit.id), [placement.unit.id]);
  const air = !!visualFor(placement.unit.type).air;
  const accent = SIDE_ACCENT[placement.unit.side];
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (destroyed && !previousDestroyed.current) deathProgress.current = 0;
    if (!destroyed) deathProgress.current = 0;
    previousDestroyed.current = destroyed;
    layoutDirty.current = true;
  }, [destroyed]);

  useEffect(() => {
    if (submerged && !previousSubmerged.current) submergeProgress.current = 0;
    if (!submerged) submergeProgress.current = 0;
    previousSubmerged.current = submerged;
    layoutDirty.current = true;
  }, [submerged]);

  useEffect(() => {
    if (retreating && !previousRetreating.current) retreatProgress.current = 0;
    if (!retreating) retreatProgress.current = 0;
    previousRetreating.current = retreating;
    layoutDirty.current = true;
  }, [retreating]);

  useEffect(() => {
    if (salvo !== lastSalvo.current) {
      lastSalvo.current = salvo;
      if (firing) firePulse.current = 1;
    }
  }, [firing, salvo]);

  useEffect(() => {
    if (health < previousHealth.current) damagePulse.current = 1;
    previousHealth.current = health;
    layoutDirty.current = true;
  }, [health]);

  useEffect(() => {
    layoutDirty.current = true;
  }, [placement.rotationY, placement.scale, placement.x, placement.z]);

  useEffect(() => {
    if (!paratrooperInfantry) return;
    if (carriedInfantry) {
      previousAboard.current = true;
      dropProgress.current = 0;
      dropReported.current = true;
      return;
    }
    if (!destroyed && beginsParatrooperDrop(previousAboard.current, placement.unit)) {
      dropProgress.current = 0;
      dropReported.current = false;
    }
    previousAboard.current = false;
  }, [carriedInfantry, destroyed, paratrooperInfantry, placement.unit]);

  useFrame(({ clock }, delta) => {
    if (!active) return;
    const root = motion.current;
    if (!root) return;
    const transitionActive = layoutDirty.current
      || age.current < 0.72
      || firePulse.current > 0.001
      || damagePulse.current > 0.001
      || (destroyed && deathProgress.current < 1)
      || (submerged && submergeProgress.current < 1)
      || (retreating && retreatProgress.current < 1)
      || (paratrooperInfantry && !carriedInfantry && dropProgress.current < 1);
    // Settled land pieces are static. Avoid running trigonometry and writing
    // the same transforms for every token on every frame in large battles.
    if (!air && domain !== 'sea' && !transitionActive) return;
    const dt = Math.min(delta, 0.05);
    age.current += dt;
    firePulse.current = Math.max(0, firePulse.current - dt * 3.8);
    damagePulse.current = Math.max(0, damagePulse.current - dt * 2.1);
    if (destroyed) deathProgress.current = Math.min(1, deathProgress.current + dt / (STYLIZED_DEATH_MS[domain] / 1000));
    if (submerged) submergeProgress.current = Math.min(1, submergeProgress.current + dt / (STYLIZED_SUBMERGE_MS / 1000));
    if (retreating) retreatProgress.current = Math.min(1, retreatProgress.current + dt / (STYLIZED_RETREAT_MS / 1000));
    if (paratrooperInfantry && !carriedInfantry && dropProgress.current < 1) {
      dropProgress.current = Math.min(1, dropProgress.current + dt / (reduceMotion ? 0.18 : 1.85));
      if (dropProgress.current >= 1 && !dropReported.current) {
        dropReported.current = true;
        onDropComplete?.(placement.unit.id);
      }
    }

    const spawn = easeOutCubic(age.current / 0.7);
    const death = easeInOutCubic(deathProgress.current);
    const dive = easeInOutCubic(submergeProgress.current);
    const retreat = easeInOutCubic(retreatProgress.current);
    const drop = easeOutCubic(dropProgress.current);
    const dropping = paratrooperInfantry && !carriedInfantry && dropProgress.current < 1;
    const direction = placement.unit.side === 'attacker' ? -1 : 1;
    const baseY = air ? 4.35 : domain === 'sea' ? 0.52 : 0.42;
    const bob = air
      ? Math.sin(clock.elapsedTime * 1.45 + seed * 8) * 0.14
      : domain === 'sea'
        ? Math.sin(clock.elapsedTime * 0.75 + seed * 11) * 0.12
        : 0;
    const recoil = firePulse.current * -direction * 0.28;
    root.position.set(
      placement.x + (dropping ? Math.sin(drop * Math.PI * 3 + seed * 4) * (1 - drop) * 0.9 : 0),
      baseY - (1 - spawn) * 1.7 + bob + (dropping ? THREE.MathUtils.lerp(13, 0, drop) : 0) - dive * 3.8 - (domain === 'sea' ? death * 3.5 : death * 0.15),
      placement.z + direction * retreat * 48 + recoil,
    );
    root.rotation.y = placement.rotationY;
    root.rotation.z = (domain === 'sea' ? Math.sin(clock.elapsedTime * 0.52 + seed * 6) * 0.025 + death * direction * 0.72 : death * direction * 1.42)
      + (dropping ? Math.sin(drop * Math.PI) * direction * 0.07 : 0);
    root.rotation.x = air && destroyed ? death * 1.18 : domain === 'sea' ? Math.cos(clock.elapsedTime * 0.43 + seed * 5) * 0.018 : 0;
    const retreatScale = 1 - retreat * 0.28;
    const deathScale = 1 - death * 0.52;
    root.scale.setScalar(placement.scale * spawn * retreatScale * deathScale);
    root.visible = !carriedInfantry && retreat < 0.995;

    if (sculpt.current) sculpt.current.visible = death < 0.94 && dive < 0.98;
    if (wreck.current) wreck.current.visible = death > 0.76 && domain === 'land' && !air;
    if (baseRing.current) {
      const pulse = 1 + firePulse.current * 0.32 + damagePulse.current * 0.18;
      baseRing.current.scale.setScalar(pulse);
      baseRing.current.visible = death < 0.8 && dive < 0.82;
    }
    if (ringMaterial.current) ringMaterial.current.emissiveIntensity = 0.18 + firePulse.current * 2.2 + damagePulse.current * 1.5;
    if (flash.current && flashMaterial.current) {
      const flashLife = destroyed ? Math.max(0, 1 - deathProgress.current * 2.55) : 0;
      flash.current.visible = flashLife > 0.015;
      flash.current.scale.setScalar(0.35 + (1 - flashLife) * 2.7);
      flashMaterial.current.opacity = flashLife * 0.9;
    }
    if (ripple.current && rippleMaterial.current) {
      const rippleLife = submerged ? Math.max(0, 1 - submergeProgress.current) : 0;
      ripple.current.visible = rippleLife > 0.01;
      ripple.current.scale.setScalar(0.7 + submergeProgress.current * 2.2);
      rippleMaterial.current.opacity = rippleLife * 0.75;
    }
    if (parachute.current && parachuteMaterial.current) {
      const canopyLife = dropping && !destroyed ? Math.min(1, (1 - dropProgress.current) * 5) : 0;
      parachute.current.visible = canopyLife > 0.01;
      parachute.current.scale.setScalar(0.82 + canopyLife * 0.18);
      parachuteMaterial.current.opacity = canopyLife * 0.94;
    }
    layoutDirty.current = false;
  });

  const barHeight = placement.unit.type === 'factory' ? 4.2 : air ? 1.35 : placement.role === 'naval' ? 2.4 : 2.65;
  return (
    <group ref={motion}>
      <mesh ref={baseRing} position={[0, 0.08, 0]} rotation-x={Math.PI / 2} receiveShadow>
        <torusGeometry args={[placement.role === 'naval' ? 2.25 : placement.role === 'air' ? 1.85 : 1.38, 0.095, 5, 32]} />
        <meshStandardMaterial ref={ringMaterial} color={accent} emissive={accent} emissiveIntensity={0.18} metalness={0.55} roughness={0.36} />
      </mesh>
      <group ref={sculpt}>
        <UnitSculpt unit={placement.unit} palette={palette} />
      </group>
      <group ref={wreck} visible={false} position={[0, 0.1, 0]} rotation-y={Math.PI / 4}>
        <mesh castShadow>
          <boxGeometry args={[2.35, 0.16, 0.48]} />
          <SculptMaterial color={palette.dark} />
        </mesh>
        <mesh rotation-y={Math.PI / 2} castShadow>
          <boxGeometry args={[2.35, 0.16, 0.48]} />
          <SculptMaterial color={palette.dark} />
        </mesh>
      </group>
      <mesh ref={flash} visible={false} position={[0, 1.2, 0]}>
        <icosahedronGeometry args={[0.65, 1]} />
        <meshBasicMaterial ref={flashMaterial} color="#ffd27a" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ripple} visible={false} position={[0, 0.18, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[1.15, 0.075, 5, 32]} />
        <meshBasicMaterial ref={rippleMaterial} color="#8ce2ef" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      {paratrooperInfantry && (
        <group ref={parachute} visible={false} position={[0, 3.35, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[1.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              ref={parachuteMaterial}
              color={palette.light}
              emissive={accent}
              emissiveIntensity={0.08}
              roughness={0.78}
              metalness={0.03}
              transparent
              opacity={0}
              side={THREE.DoubleSide}
            />
          </mesh>
          {[-1, 1].map((x) => (
            <mesh key={`front-${x}`} position={[x * 0.62, -1.14, 0.25]} rotation-z={x * -0.34}>
              <cylinderGeometry args={[0.018, 0.018, 2.5, 5]} />
              <meshBasicMaterial color="#e4dcc2" />
            </mesh>
          ))}
          {[-1, 1].map((z) => (
            <mesh key={`rear-${z}`} position={[0, -1.14, z * 0.44]} rotation-x={z * 0.3}>
              <cylinderGeometry args={[0.014, 0.014, 2.45, 5]} />
              <meshBasicMaterial color="#bfc5bd" />
            </mesh>
          ))}
        </group>
      )}
      <HealthBar health={health} color={accent} y={barHeight} />
    </group>
  );
}

function makeFacetedSurface(domain: Domain): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(56, 76, 12, 18);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = -positions.getY(index);
    const height = domain === 'sea'
      ? Math.sin(x * 0.44 + z * 0.18) * 0.12 + Math.cos(z * 0.38 - x * 0.11) * 0.08
      : Math.sin(x * 0.17) * Math.cos(z * 0.13) * 0.16 + Math.sin(z * 0.31 + x * 0.08) * 0.08;
    positions.setZ(index, height);
  }
  geometry.rotateX(-Math.PI / 2);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  return faceted;
}

function CommandArena({ domain }: { domain: Domain }) {
  const surface = useMemo(() => makeFacetedSurface(domain), [domain]);
  useEffect(() => () => surface.dispose(), [surface]);
  const sea = domain === 'sea';
  return (
    <group>
      <mesh position={[0, -0.62, 0]} receiveShadow castShadow>
        <boxGeometry args={[59, 1.15, 79]} />
        <meshStandardMaterial color="#11191b" metalness={0.62} roughness={0.42} />
      </mesh>
      <mesh geometry={surface} position={[0, 0, 0]} receiveShadow>
        <meshStandardMaterial
          color={sea ? '#245269' : '#596547'}
          roughness={sea ? 0.36 : 0.86}
          metalness={sea ? 0.22 : 0.02}
          flatShading
        />
      </mesh>
      <gridHelper
        args={[56, 14, sea ? '#6da4b3' : '#a9ad83', sea ? '#365f70' : '#747c5d']}
        position={[0, 0.16, 0]}
        scale={[1, 1, 1.34]}
      />
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <boxGeometry args={[53, 0.055, 0.18]} />
        <meshBasicMaterial color="#d8c891" transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.18, -19.5]}>
        <boxGeometry args={[53, 0.035, 8.5]} />
        <meshBasicMaterial color={SIDE_ACCENT.attacker} transparent opacity={0.055} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.18, 19.5]}>
        <boxGeometry args={[53, 0.035, 8.5]} />
        <meshBasicMaterial color={SIDE_ACCENT.defender} transparent opacity={0.055} depthWrite={false} />
      </mesh>
      {[
        [0, 0.05, -39.1, 59.5, 0.82, 1.25],
        [0, 0.05, 39.1, 59.5, 0.82, 1.25],
        [-29.25, 0.05, 0, 0.82, 1.25, 78],
        [29.25, 0.05, 0, 0.82, 1.25, 78],
      ].map(([x, y, z, width, height, depth], index) => (
        <mesh key={index} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#8d7450" metalness={0.72} roughness={0.3} />
        </mesh>
      ))}
      {sea && [-22, 0, 22].map((z, index) => (
        <mesh key={z} position={[0, 0.22, z]} rotation-x={Math.PI / 2} scale={[1 + index * 0.12, 1 + index * 0.12, 1]}>
          <torusGeometry args={[8.5, 0.055, 4, 64]} />
          <meshBasicMaterial color="#8bd2df" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

interface TracerSpec {
  readonly key: string;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  readonly delayMs: number;
  readonly color: string;
}

function Tracer({ spec, elapsedMs }: { spec: TracerSpec; elapsedMs: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const beamMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const head = useRef<THREE.Mesh>(null);
  const headMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const impact = useRef<THREE.Mesh>(null);
  const impactMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const vector = useMemo(() => spec.to.clone().sub(spec.from), [spec.from, spec.to]);
  const length = vector.length();
  const midpoint = useMemo(() => spec.from.clone().lerp(spec.to, 0.5), [spec.from, spec.to]);
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize()),
    [vector],
  );

  useFrame(() => {
    const local = elapsedMs.current - spec.delayMs;
    const visible = local >= 0 && local <= 620;
    if (group.current) group.current.visible = visible;
    if (!visible) return;
    const travel = THREE.MathUtils.clamp(local / 370, 0, 1);
    const fade = local < 370 ? Math.min(1, local / 70) : Math.max(0, 1 - (local - 370) / 250);
    if (head.current) head.current.position.lerpVectors(spec.from, spec.to, easeInOutCubic(travel));
    if (headMaterial.current) headMaterial.current.opacity = fade;
    if (beamMaterial.current) beamMaterial.current.opacity = fade * 0.34;
    if (beam.current) beam.current.scale.y = Math.max(0.04, travel);
    const impactLife = local > 300 ? Math.max(0, 1 - (local - 300) / 320) : 0;
    if (impact.current && impactMaterial.current) {
      impact.current.visible = impactLife > 0.01;
      impact.current.scale.setScalar(0.32 + (1 - impactLife) * 1.75);
      impactMaterial.current.opacity = impactLife * 0.92;
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={beam} position={midpoint} quaternion={quaternion}>
        <cylinderGeometry args={[0.045, 0.075, length, 5]} />
        <meshBasicMaterial ref={beamMaterial} color={spec.color} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={head} position={spec.from}>
        <octahedronGeometry args={[0.23, 0]} />
        <meshBasicMaterial ref={headMaterial} color="#fff6cc" transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={impact} position={spec.to} visible={false}>
        <icosahedronGeometry args={[0.52, 1]} />
        <meshBasicMaterial ref={impactMaterial} color={spec.color} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function VolleyRig({
  units,
  placements,
  destroyedIds,
  submergedIds,
  preferredTargetIds,
  shotLinks,
  salvo,
  firingIds,
  playSounds,
  active,
  onComplete,
}: {
  readonly units: readonly SimUnit[];
  readonly placements: readonly StylizedPlacement[];
  readonly destroyedIds: readonly string[];
  readonly submergedIds: readonly string[];
  readonly preferredTargetIds: readonly string[];
  readonly shotLinks: readonly { readonly firingId: string; readonly targetId: string }[];
  readonly salvo: number;
  readonly firingIds: readonly string[];
  readonly playSounds: boolean;
  readonly active: boolean;
  readonly onComplete: (salvo: number) => void;
}) {
  const [tracers, setTracers] = useState<TracerSpec[]>([]);
  const elapsedMs = useRef(0);
  const durationMs = useRef(0);
  const pendingSalvo = useRef<number | null>(null);
  const observedSalvo = useRef(0);
  const soundPlayed = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const unitById = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  const positionById = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();
    for (const placement of placements) {
      const air = !!visualFor(placement.unit.type).air;
      positions.set(placement.unit.id, new THREE.Vector3(
        placement.x,
        air ? 4.45 : placement.role === 'naval' ? 1.3 : 1.5,
        placement.z,
      ));
    }
    return positions;
  }, [placements]);

  useEffect(() => {
    if (salvo === observedSalvo.current) return;
    observedSalvo.current = salvo;
    const links = stylizedAuthoritativeVolleyLinks({
      units,
      firingIds,
      preferredTargetIds,
      shotLinks,
      destroyedIds,
      submergedIds,
    });
    const next = links.flatMap((link) => {
      const from = positionById.get(link.firingId);
      const to = positionById.get(link.targetId);
      const firing = unitById.get(link.firingId);
      if (!from || !to || !firing) return [];
      return [{
        key: `${salvo}:${link.firingId}:${link.targetId}:${link.delayMs}`,
        from,
        to,
        delayMs: link.delayMs,
        color: SIDE_ACCENT[firing.side],
      }];
    });
    elapsedMs.current = 0;
    durationMs.current = stylizedVolleyDurationMs(next.map((tracer) => tracer.delayMs));
    pendingSalvo.current = salvo;
    soundPlayed.current = false;
    setTracers(next);
  }, [destroyedIds, firingIds, positionById, preferredTargetIds, salvo, shotLinks, submergedIds, unitById, units]);

  useFrame((_, delta) => {
    if (!active || pendingSalvo.current === null) return;
    if (!soundPlayed.current && playSounds) {
      soundPlayed.current = true;
      const sounds = new Set(
        units.filter((unit) => firingIds.includes(unit.id)).map((unit) => fireSoundFor(unit.type)),
      );
      sounds.forEach(playStylizedSound);
    }
    elapsedMs.current += Math.min(delta, 0.05) * 1000;
    if (elapsedMs.current < durationMs.current) return;
    const completed = pendingSalvo.current;
    pendingSalvo.current = null;
    setTracers([]);
    onCompleteRef.current(completed);
  });

  return <>{tracers.map((tracer) => <Tracer key={tracer.key} spec={tracer} elapsedMs={elapsedMs} />)}</>;
}

function IntroCamera({ domain, plan, active, onComplete }: { domain: Domain; plan: StylizedCameraPlan; active: boolean; onComplete: () => void }) {
  const camera = useThree((state) => state.camera);
  const elapsed = useRef(0);
  const complete = useRef(false);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const duration = reduceMotion ? 0.18 : 2.65;
  const start = useMemo(() => new THREE.Vector3(...plan.start), [plan]);
  const end = useMemo(() => new THREE.Vector3(...plan.end), [plan]);
  useEffect(() => {
    camera.position.copy(start);
    camera.lookAt(0, 0, 0);
  }, [camera, start]);
  useFrame((_, delta) => {
    if (!active || complete.current) return;
    elapsed.current += Math.min(delta, 0.05);
    const raw = Math.min(1, elapsed.current / duration);
    const eased = easeInOutCubic(raw);
    const arc = Math.sin(raw * Math.PI) * (domain === 'sea' ? 7 : 5);
    camera.position.lerpVectors(start, end, eased);
    camera.position.y += arc;
    camera.lookAt(0, 0.7 + (1 - eased) * 2.4, 0);
    if (raw >= 1) {
      complete.current = true;
      onComplete();
    }
  });
  return null;
}

function RenderHeartbeat({ active, onReady }: { active: boolean; onReady: () => void }) {
  const reported = useRef(false);
  useEffect(() => {
    if (!active) reported.current = false;
  }, [active]);
  useFrame(() => {
    if (!active || reported.current) return;
    reported.current = true;
    onReady();
  });
  return null;
}

function PresentationGate({
  visualSeq,
  domain,
  snapshot,
  requestedMs,
  active,
  ready,
  replayInitialTransitions,
  onComplete,
}: {
  readonly visualSeq: number;
  readonly domain: Domain;
  readonly snapshot: StylizedPresentationSnapshot;
  readonly requestedMs: number;
  readonly active: boolean;
  readonly ready: boolean;
  readonly replayInitialTransitions: boolean;
  readonly onComplete: (visualSeq: number) => void;
}) {
  const observedSeq = useRef(visualSeq);
  const previousSnapshot = useRef<StylizedPresentationSnapshot>(replayInitialTransitions ? {} : snapshot);
  const pendingSeq = useRef<number | null>(replayInitialTransitions ? visualSeq : null);
  const requiredMs = useRef(replayInitialTransitions
    ? stylizedPresentationDurationMs({ domain, previous: {}, next: snapshot, requestedMs })
    : 0);
  const elapsedMs = useRef(0);
  const paintedFrames = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  useEffect(() => {
    if (visualSeq === observedSeq.current) return;
    requiredMs.current = stylizedPresentationDurationMs({
      domain,
      previous: previousSnapshot.current,
      next: snapshot,
      requestedMs,
    });
    previousSnapshot.current = snapshot;
    observedSeq.current = visualSeq;
    pendingSeq.current = visualSeq;
    elapsedMs.current = 0;
    paintedFrames.current = 0;
  }, [domain, requestedMs, snapshot, visualSeq]);

  useFrame((_, delta) => {
    if (!active || !ready || pendingSeq.current === null) return;
    paintedFrames.current += 1;
    elapsedMs.current += Math.min(delta, 0.05) * 1000;
    if (paintedFrames.current < 2 || elapsedMs.current < requiredMs.current) return;
    const completed = pendingSeq.current;
    pendingSeq.current = null;
    onCompleteRef.current(completed);
  });
  return null;
}

function DioramaScene({
  units,
  domain,
  destroyedIds,
  submergedIds,
  retreatingIds,
  preferredTargetIds,
  shotLinks,
  presentationDurationMs,
  visualSeq,
  salvo,
  firingIds,
  healthById,
  playSounds,
  attackerName,
  defenderName,
  active,
  rendererReady,
  onFirstFrame,
  onInteractionReady,
  onVolleyComplete,
  onPresentationComplete,
  replayInitialTransitions,
  cameraPlan,
}: Required<Pick<BattleSimProps, 'units' | 'domain' | 'destroyedIds' | 'visualSeq' | 'salvo' | 'firingIds'>> & {
  readonly submergedIds: string[];
  readonly retreatingIds: string[];
  readonly preferredTargetIds: string[];
  readonly shotLinks: readonly { readonly firingId: string; readonly targetId: string }[];
  readonly presentationDurationMs: number;
  readonly healthById?: Record<string, number>;
  readonly playSounds: boolean;
  readonly attackerName?: string;
  readonly defenderName?: string;
  readonly active: boolean;
  readonly rendererReady: boolean;
  readonly onFirstFrame: () => void;
  readonly onInteractionReady: () => void;
  readonly onVolleyComplete: (salvo: number) => void;
  readonly onPresentationComplete: (visualSeq: number) => void;
  readonly replayInitialTransitions: boolean;
  readonly cameraPlan: StylizedCameraPlan;
}) {
  const placements = useMemo(() => {
    const raw = [
      ...stylizedFormation(units.filter((unit) => unit.side === 'attacker'), 'attacker', domain),
      ...stylizedFormation(units.filter((unit) => unit.side === 'defender'), 'defender', domain),
    ];
    const maxX = Math.max(1, ...raw.map((placement) => Math.abs(placement.x)));
    const maxZ = Math.max(1, ...raw.map((placement) => Math.abs(placement.z)));
    const fit = Math.min(1, 24 / maxX, 32 / maxZ);
    return raw.map((placement) => ({
      ...placement,
      x: placement.x * fit,
      z: placement.z * fit,
      scale: placement.scale * Math.max(0.58, fit) * cameraPlan.unitScale,
    }));
  }, [cameraPlan.unitScale, domain, units]);
  const destroyed = useMemo(() => new Set(destroyedIds), [destroyedIds]);
  const submerged = useMemo(() => new Set(submergedIds), [submergedIds]);
  const retreating = useMemo(() => new Set(retreatingIds), [retreatingIds]);
  const firing = useMemo(() => new Set(firingIds), [firingIds]);
  const attackerPalette = useMemo(() => paletteFor(attackerName, 'attacker'), [attackerName]);
  const defenderPalette = useMemo(() => paletteFor(defenderName, 'defender'), [defenderName]);
  const [introDone, setIntroDone] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const interactionReported = useRef(false);
  const [initialDropIds] = useState(() => new Set(
    units
      .filter((unit) => isDeployedParatrooper(unit) && !destroyedIds.includes(unit.id))
      .map((unit) => unit.id),
  ));
  const completedInitialDrops = useRef(new Set<string>());
  const [initialDropsComplete, setInitialDropsComplete] = useState(initialDropIds.size === 0);
  const reportDropComplete = useCallback((unitId: string) => {
    if (!initialDropIds.has(unitId) || completedInitialDrops.current.has(unitId)) return;
    completedInitialDrops.current.add(unitId);
    if (completedInitialDrops.current.size >= initialDropIds.size) setInitialDropsComplete(true);
  }, [initialDropIds]);
  const snapshot = useMemo<StylizedPresentationSnapshot>(() => ({
    destroyedIds,
    submergedIds,
    retreatingIds,
    aboardParatrooperIds: units.filter(isAboardParatrooper).map((unit) => unit.id),
    deployedParatrooperIds: units.filter(isDeployedParatrooper).map((unit) => unit.id),
    healthById,
  }), [destroyedIds, healthById, retreatingIds, submergedIds, units]);

  useEffect(() => {
    if (!active) interactionReported.current = false;
    if (!active || !frameReady || !introDone || !initialDropsComplete || interactionReported.current) return;
    interactionReported.current = true;
    onInteractionReady();
  }, [active, frameReady, initialDropsComplete, introDone, onInteractionReady]);

  return (
    <>
      <color attach="background" args={[domain === 'sea' ? '#06151e' : '#10150f']} />
      <fog attach="fog" args={[domain === 'sea' ? '#0a2430' : '#1a2116', 55, 122]} />
      <hemisphereLight args={[domain === 'sea' ? '#a3d4dc' : '#d9d5b1', '#101719', 1.1]} />
      <ambientLight intensity={0.52} />
      <directionalLight
        position={[-18, 34, -24]}
        intensity={2.6}
        color="#ffe1ae"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-near={1}
        shadow-camera-far={100}
        shadow-bias={-0.0005}
        shadow-normalBias={0.035}
      />
      <pointLight position={[-24, 8, -23]} color={SIDE_ACCENT.attacker} intensity={24} distance={46} decay={2} />
      <pointLight position={[24, 8, 23]} color={SIDE_ACCENT.defender} intensity={24} distance={46} decay={2} />
      <mesh position={[0, -2.5, 0]} receiveShadow>
        <cylinderGeometry args={[72, 76, 3, 10]} />
        <meshStandardMaterial color="#070b0d" roughness={0.92} />
      </mesh>
      <CommandArena domain={domain} />
      {placements.map((placement) => (
        <UnitToken
          key={placement.unit.id}
          placement={placement}
          domain={domain}
          palette={placement.unit.side === 'attacker' ? attackerPalette : defenderPalette}
          destroyed={destroyed.has(placement.unit.id)}
          submerged={submerged.has(placement.unit.id)}
          retreating={retreating.has(placement.unit.id)}
          health={healthById?.[placement.unit.id] ?? 1}
          salvo={salvo}
          firing={firing.has(placement.unit.id)}
          active={active}
          replayInitialTransitions={replayInitialTransitions}
          onDropComplete={reportDropComplete}
        />
      ))}
      <VolleyRig
        units={units}
        placements={placements}
        destroyedIds={destroyedIds}
        submergedIds={submergedIds}
        preferredTargetIds={preferredTargetIds}
        shotLinks={shotLinks}
        salvo={salvo}
        firingIds={firingIds}
        playSounds={playSounds}
        active={active}
        onComplete={onVolleyComplete}
      />
      <RenderHeartbeat active={active} onReady={() => { setFrameReady(true); onFirstFrame(); }} />
      <PresentationGate
        visualSeq={visualSeq}
        domain={domain}
        snapshot={snapshot}
        requestedMs={presentationDurationMs}
        active={active}
        ready={rendererReady}
        replayInitialTransitions={replayInitialTransitions}
        onComplete={onPresentationComplete}
      />
      {!introDone && <IntroCamera domain={domain} plan={cameraPlan} active={active} onComplete={() => setIntroDone(true)} />}
      {introDone && (
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.075}
          enablePan={false}
          minDistance={cameraPlan.minDistance}
          maxDistance={cameraPlan.maxDistance}
          minPolarAngle={0.42}
          maxPolarAngle={Math.PI / 2.3}
          target={[0, 0.5, 0]}
        />
      )}
    </>
  );
}

function titleFor(type: string): string {
  const names: Record<string, string> = {
    aaGun: 'AA Gun',
    mechInfantry: 'Mechanized Infantry',
    tacticalBomber: 'Tactical Bomber',
  };
  return names[type] ?? `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

function KillFeed({ units, destroyedIds }: { units: readonly SimUnit[]; destroyedIds: readonly string[] }) {
  const [entries, setEntries] = useState<{ id: string; label: string; side: Side; detail: string }[]>([]);
  const announced = useRef(new Set(destroyedIds));
  const expiryTimers = useRef(new Map<string, number>());
  useEffect(() => () => {
    for (const timer of expiryTimers.current.values()) window.clearTimeout(timer);
    expiryTimers.current.clear();
  }, []);
  useEffect(() => {
    if (destroyedIds.length === 0) {
      for (const timer of expiryTimers.current.values()) window.clearTimeout(timer);
      expiryTimers.current.clear();
      announced.current.clear();
      setEntries([]);
      return;
    }
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const destroyed = new Set(destroyedIds);
    const fresh = destroyedIds.flatMap((id) => {
      if (announced.current.has(id)) return [];
      announced.current.add(id);
      const unit = byId.get(id);
      if (!unit) return [];
      const linkedAirborneLoss = isLinkedAboardLoss(unit, units, destroyed);
      return [{
        id,
        label: linkedAirborneLoss ? 'Airborne infantry' : titleFor(unit.type),
        side: unit.side,
        detail: linkedAirborneLoss ? 'lost with bomber' : 'eliminated',
      }];
    });
    if (!fresh.length) return;
    setEntries((current) => [...current, ...fresh].slice(-4));
    for (const entry of fresh) {
      const prior = expiryTimers.current.get(entry.id);
      if (prior !== undefined) window.clearTimeout(prior);
      const timer = window.setTimeout(() => {
        expiryTimers.current.delete(entry.id);
        setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
      }, 4_000);
      expiryTimers.current.set(entry.id, timer);
    }
  }, [destroyedIds, units]);
  if (!entries.length) return null;
  return (
    <div className="axis-stylized-killfeed" aria-live="polite">
      {entries.map((entry) => (
        <div key={entry.id} className={`axis-stylized-kill axis-stylized-kill--${entry.side}`}>
          <span className="axis-stylized-kill-mark" aria-hidden>×</span>
          <span>{entry.label}</span>
          <small>{entry.detail}</small>
        </div>
      ))}
    </div>
  );
}

class StylizedCanvasBoundary extends Component<{
  readonly children: ReactNode;
  readonly onFailure: () => void;
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

function useHostVisibility(root: React.RefObject<HTMLElement>): boolean {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const evaluate = () => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      setVisible(
        document.visibilityState === 'visible'
        && rect.width >= 8
        && rect.height >= 8
        && style.display !== 'none'
        && style.visibility !== 'hidden',
      );
    };
    evaluate();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(evaluate);
    resize?.observe(element);
    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('resize', evaluate);
    return () => {
      resize?.disconnect();
      document.removeEventListener('visibilitychange', evaluate);
      window.removeEventListener('resize', evaluate);
    };
  }, [root]);
  return visible;
}

function ContextLossGuard({ onFailure }: { onFailure: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onFailure();
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onFailure]);
  return null;
}

export default function StylizedBattleSim({
  units,
  domain,
  destroyedIds,
  visualSeq,
  submergedIds = [],
  retreatingIds = [],
  preferredTargetIds = [],
  shotLinks = [],
  presentationDurationMs = 0,
  salvo,
  firingIds,
  healthById,
  playSounds = true,
  attackerName,
  defenderName,
  onVisualReady,
  onInteractionReady,
  onVolleyComplete,
  onPresentationComplete,
  onVisualUnavailable,
  onVisualFailure,
  className,
}: StylizedBattleSimProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => retainStylizedAudio(), []);
  const hostVisible = useHostVisibility(root);
  const visibleRef = useRef(hostVisible);
  useEffect(() => { visibleRef.current = hostVisible; }, [hostVisible]);
  const [rendererReady, setRendererReady] = useState(false);
  const [rendererFailed, setRendererFailed] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const unavailableReported = useRef(false);
  const failureReported = useRef(false);
  // A fresh mount has not presented any authoritative generation yet. Keep
  // this null until real frames have painted and PresentationGate reports the
  // exact visualSeq; reconnects and style switches must never inherit a
  // serialized generation as already shown.
  const lastPresentedSeq = useRef<number | null>(null);
  const callbacks = useRef({
    onVisualReady,
    onInteractionReady,
    onVisualUnavailable,
    onVisualFailure,
    onPresentationComplete,
  });
  useEffect(() => {
    callbacks.current = { onVisualReady, onInteractionReady, onVisualUnavailable, onVisualFailure, onPresentationComplete };
  }, [onInteractionReady, onPresentationComplete, onVisualFailure, onVisualReady, onVisualUnavailable]);

  const reportUnavailable = useCallback(() => {
    setRendererReady(false);
    if (unavailableReported.current) return;
    unavailableReported.current = true;
    callbacks.current.onVisualUnavailable?.();
  }, []);

  const reportFailure = useCallback(() => {
    reportUnavailable();
    setRendererFailed(true);
    if (failureReported.current) return;
    failureReported.current = true;
    callbacks.current.onVisualFailure?.();
  }, [reportUnavailable]);

  const reportReady = useCallback(() => {
    if (!visibleRef.current || failureReported.current) return;
    unavailableReported.current = false;
    setRendererReady(true);
    setRendererFailed(false);
    callbacks.current.onVisualReady?.();
  }, []);

  const reportInteraction = useCallback(() => {
    if (!visibleRef.current || failureReported.current) return;
    setIntroComplete(true);
    callbacks.current.onInteractionReady?.();
  }, []);

  const reportPresentation = useCallback((completedSeq: number) => {
    lastPresentedSeq.current = completedSeq;
    callbacks.current.onPresentationComplete?.(completedSeq);
  }, []);

  useEffect(() => {
    setRendererReady(false);
    setIntroComplete(false);
    unavailableReported.current = false;
    failureReported.current = false;
    reportUnavailable();
  }, [canvasKey, domain, reportUnavailable]);

  useEffect(() => {
    if (!hostVisible) reportUnavailable();
  }, [hostVisible, reportUnavailable]);

  useEffect(() => {
    if (!hostVisible || rendererReady || rendererFailed) return;
    const watchdog = window.setTimeout(reportFailure, 8_000);
    return () => window.clearTimeout(watchdog);
  }, [hostVisible, rendererFailed, rendererReady, reportFailure]);

  const lost = new Set(destroyedIds);
  const unavailable = new Set([...submergedIds, ...retreatingIds]);
  const activeCount = (side: Side) => units.filter(
    (unit) => unit.side === side
      && !lost.has(unit.id)
      && !unavailable.has(unit.id)
      && !isAboardParatrooper(unit),
  ).length;
  const attackerActive = activeCount('attacker');
  const defenderActive = activeCount('defender');
  const attackerLosses = units.filter((unit) => unit.side === 'attacker' && lost.has(unit.id)).length;
  const defenderLosses = units.filter((unit) => unit.side === 'defender' && lost.has(unit.id)).length;
  const airborneCount = units.filter((unit) => isAboardParatrooper(unit) && !lost.has(unit.id)).length;
  const attackerLabel = attackerName ?? 'Attacker';
  const defenderLabel = defenderName ?? 'Defender';
  const active = hostVisible && !rendererFailed;
  const denseScene = units.length > DENSE_SCENE_UNIT_THRESHOLD;
  const cameraPlan = useMemo(() => stylizedCameraPlan(units.length, domain), [domain, units.length]);
  const replayInitialTransitions = lastPresentedSeq.current !== visualSeq;

  return (
    <div
      ref={root}
      className={[
        'axis-stylized-battle',
        `axis-stylized-battle--${domain}`,
        rendererReady ? 'is-ready' : 'is-loading',
        rendererFailed ? 'is-failed' : '',
        introComplete ? 'is-intro-complete' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      aria-label={`${attackerLabel} versus ${defenderLabel}, ${domain} battle. ${attackerActive} attacking and ${defenderActive} defending units active.`}
    >
      {!rendererFailed && (
        <StylizedCanvasBoundary key={canvasKey} onFailure={reportFailure}>
          <Canvas
            className="axis-stylized-canvas"
            frameloop={active ? 'always' : 'never'}
            shadows={denseScene ? false : 'percentage'}
            dpr={denseScene ? 1 : [1, 1.25]}
            camera={{ position: [...cameraPlan.end], fov: cameraPlan.fov, near: 0.1, far: 180 }}
            performance={{ min: denseScene ? 0.5 : 0.65, max: 1, debounce: 180 }}
            gl={{
              antialias: !denseScene,
              alpha: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.05,
              stencil: false,
            }}
          >
            <ContextLossGuard onFailure={reportFailure} />
            <DioramaScene
              key={domain}
              units={units}
              domain={domain}
              destroyedIds={destroyedIds}
              visualSeq={visualSeq}
              submergedIds={submergedIds}
              retreatingIds={retreatingIds}
              preferredTargetIds={preferredTargetIds}
              shotLinks={shotLinks}
              presentationDurationMs={presentationDurationMs}
              salvo={salvo}
              firingIds={firingIds}
              healthById={healthById}
              playSounds={playSounds}
              attackerName={attackerName}
              defenderName={defenderName}
              active={active}
              rendererReady={rendererReady}
              onFirstFrame={reportReady}
              onInteractionReady={reportInteraction}
              onVolleyComplete={(completedSalvo) => onVolleyComplete?.(completedSalvo)}
              onPresentationComplete={reportPresentation}
              replayInitialTransitions={replayInitialTransitions}
              cameraPlan={cameraPlan}
            />
          </Canvas>
        </StylizedCanvasBoundary>
      )}

      <div className="axis-stylized-vignette" aria-hidden />
      <div className="axis-stylized-scanlines" aria-hidden />
      <div className="axis-stylized-letterbox" aria-hidden>
        <span className="axis-stylized-letterbox-top" />
        <span className="axis-stylized-letterbox-bottom" />
      </div>

      <div className="axis-stylized-domain" aria-hidden>
        <span className="axis-stylized-domain-glyph">{domain === 'sea' ? '≈' : '◇'}</span>
        <span>{domain === 'sea' ? 'Naval engagement' : 'Ground engagement'}</span>
      </div>

      <div className="axis-stylized-intro" aria-hidden>
        <div className="axis-stylized-intro-kicker">Command diorama</div>
        <div className="axis-stylized-intro-matchup">
          <strong>{attackerLabel}</strong>
          <span>versus</span>
          <strong>{defenderLabel}</strong>
        </div>
        <div className="axis-stylized-intro-rule" />
      </div>

      <div className="axis-stylized-plate axis-stylized-plate--attacker" aria-hidden>
        <i />
        <div>
          <span>Attacker</span>
          <strong>{attackerLabel}</strong>
          <small>{attackerActive} field{airborneCount > 0 ? ` · ${airborneCount} airborne` : ''} · {attackerLosses} lost</small>
        </div>
      </div>
      <div className="axis-stylized-plate axis-stylized-plate--defender" aria-hidden>
        <div>
          <span>Defender</span>
          <strong>{defenderLabel}</strong>
          <small>{defenderActive} active · {defenderLosses} lost</small>
        </div>
        <i />
      </div>

      <KillFeed units={units} destroyedIds={destroyedIds} />

      {!rendererReady && !rendererFailed && (
        <div className="axis-stylized-loading" role="status">
          <span className="axis-stylized-loading-mark" aria-hidden />
          <span>Preparing command diorama</span>
        </div>
      )}

      {rendererFailed && (
        <div className="axis-stylized-failure" role="alert">
          <div className="axis-stylized-failure-mark" aria-hidden>!</div>
          <div>
            <strong>Diorama renderer interrupted</strong>
            <span>The battle remains paused until the selected battlefield is restored.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              unavailableReported.current = false;
              failureReported.current = false;
              setRendererFailed(false);
              setRendererReady(false);
              setIntroComplete(false);
              setCanvasKey((value) => value + 1);
            }}
          >
            Retry renderer
          </button>
        </div>
      )}
    </div>
  );
}
