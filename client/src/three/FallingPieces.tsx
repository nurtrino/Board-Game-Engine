// A full-screen backdrop of genuine TTS game pieces tumbling down behind the
// home menu: colourful dice and chips, red and white checkers, white and black
// chess, a lean set of painted creatures, plus real playing cards and Monopoly
// bills. Each piece falls, spins, and recycles to the top. Loaded offline.

import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// ---- glb pieces --------------------------------------------------------------
const DICE = ['d4', 'd8', 'd10', 'd12', 'd20', 'die', 'trapezohedron']; // die = red d6
const CHIPS = ['chip_10', 'chip_50', 'chip_100', 'chip_500', 'chip_1000', 'go_chip', 'othello_chip'];
const CHESS = ['pawn', 'bishop', 'knight', 'rook', 'queen', 'king'];
// fewer creatures than before — just the striking ones so the bright pieces lead
const CREATURES = [
  'black_dragon', 'griffon', 'hydra', 'cerberus', 'manticora', 'wyvern',
  'golem', 'troll', 'vampire', 'skeleton_knight', 'centaur', 'chimera',
];
const MODEL_NAMES = [...DICE, ...CHIPS, ...CHESS, 'checker', ...CREATURES];
MODEL_NAMES.forEach((n) => useGLTF.preload(`/models/${n}.glb`));

const flat = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `/pieces/${prefix}${i + 1}.png`);
const CARDS = flat('card', 8); // poker faces
const MONEY = flat('money', 6); // Monopoly bills
const UNO = flat('uno', 6); // UNO cards
const FLAT = [...CARDS, ...MONEY, ...UNO];
FLAT.forEach((u) => useTexture.preload(u));

// width / height for each flat-piece family
const ASPECT: Record<string, number> = { money: 0.474, uno: 0.7, card: 0.714 };
const flatAspect = (url: string) => {
  const name = url.slice(url.lastIndexOf('/') + 1);
  for (const k in ASPECT) if (name.startsWith(k)) return ASPECT[k];
  return ASPECT.card;
};

const WHITE = '#efe8d6';
const BLACK = '#2f3037';
const RED = '#d23b3b';
const chessTint = (n: string) => (['pawn', 'bishop', 'queen'].includes(n) ? WHITE : BLACK);

interface Slot { url: string; tint?: string; }
const m = (name: string, tint?: string): Slot => ({ url: `/models/${name}.glb`, tint });

// one of every colourful piece, weighted toward the bright ones, then the cards
// and bills, then a thinner scattering of creatures
const SLOTS: Slot[] = [
  ...DICE.map((n) => m(n)),
  m('die'), m('d20'), m('d10'), m('d12'), // extra bright dice, one of them red
  ...CHIPS.map((n) => m(n)),
  m('chip_100'), m('chip_500'), m('chip_1000'),
  // red and white checkers
  m('checker', RED), m('checker', WHITE), m('checker', RED), m('checker', WHITE),
  // white and black chess
  ...CHESS.map((n) => m(n, chessTint(n))),
  m('queen', WHITE), m('king', BLACK), m('knight', BLACK), m('bishop', WHITE),
  // flat pieces: poker cards, Monopoly bills, UNO cards
  ...CARDS.map((url) => ({ url })), ...CARDS.map((url) => ({ url })),
  ...MONEY.map((url) => ({ url })), ...MONEY.map((url) => ({ url })),
  ...UNO.map((url) => ({ url })), ...UNO.map((url) => ({ url })),
  // a light dusting of creatures
  ...CREATURES.map((n) => m(n)),
];

// 15% more pieces, sampled proportionally from the curated set so the mix holds
const BASE = SLOTS.length;
const EXTRA = Math.round(BASE * 0.15);
for (let i = 0; i < EXTRA; i++) SLOTS.push(SLOTS[Math.floor(Math.random() * BASE)]);

// Join screen: an organized grid of pieces filling the space around the centred
// QR card, each spinning gently in place. No creatures; a calm, orderly showcase.
// One red checker, one black checker.
const TILE: Slot[] = [
  // interleaved by type, so every patch of the grid shows a varied mix. Chess is
  // well represented here — both colours of all six pieces.
  m('die'), m('king', BLACK), m('checker', RED), { url: CARDS[0] }, m('queen', WHITE), m('chip_500'),
  m('d20'), m('king', WHITE), { url: UNO[0] }, m('knight', BLACK), { url: MONEY[0] }, m('checker', BLACK),
  m('bishop', WHITE), { url: CARDS[1] }, m('rook', BLACK), m('chip_100'), m('queen', BLACK), { url: MONEY[2] },
  m('d12'), m('pawn', WHITE), { url: UNO[1] }, m('knight', WHITE), m('chip_1000'), m('bishop', BLACK),
  { url: CARDS[2] }, m('d10'), m('rook', WHITE), { url: MONEY[1] }, m('pawn', BLACK), { url: CARDS[3] },
  m('d8'), m('trapezohedron'), { url: UNO[2] },
];

// solid tint (chess, checkers) — a lit matte with a soft self-glow so it reads
// against the black backdrop
const solidCache = new Map<string, THREE.MeshStandardMaterial>();
function solidMat(hex: string): THREE.MeshStandardMaterial {
  let mat = solidCache.get(hex);
  if (!mat) {
    const c = new THREE.Color(hex);
    mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.12, emissive: c.clone().multiplyScalar(0.34) });
    solidCache.set(hex, mat);
  }
  return mat;
}
const nameFromUrl = (url: string) => url.slice(url.lastIndexOf('/') + 1, -4);

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// --- falling motion (home screen): drift down the whole screen, recycle at top -
interface Fall { x: number; y: number; z: number; fall: number; rx: number; ry: number; rz: number; size: number; }
function spawn(spread: boolean): Fall {
  return {
    x: rand(-16, 16),
    y: spread ? rand(-11, 12) : rand(11, 16),
    z: rand(-7, 2),
    fall: rand(0.6, 1.8),
    rx: rand(-0.9, 0.9),
    ry: rand(-0.9, 0.9),
    rz: rand(-0.9, 0.9),
    size: rand(0.7, 1.15),
  };
}
function Tumbler({ fit, children }: { fit: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const st = useRef<Fall>(spawn(true));
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const p = st.current;
    p.y -= p.fall * dt;
    if (p.y < -9) Object.assign(p, spawn(false));
    g.position.set(p.x, p.y, p.z);
    g.rotation.x += p.rx * dt;
    g.rotation.y += p.ry * dt;
    g.rotation.z += p.rz * dt;
    g.scale.setScalar(p.size * fit);
  });
  return <group ref={ref}>{children}</group>;
}

// --- organized spin (join screen): each piece holds a fixed spot in a tidy side
// column and turns slowly in place, with a slight forward tilt so 3D pieces read
interface Place { x: number; y: number; z: number; size: number; phase: number; spin: number; }
function Spinner({ fit, place, children }: { fit: number; place: Place; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const rot = useRef(place.phase);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    rot.current += dt * place.spin;
    g.position.set(place.x, place.y, place.z);
    g.rotation.set(0.32, rot.current, 0);
    g.scale.setScalar(place.size * fit);
  });
  return <group ref={ref}>{children}</group>;
}

function ModelPiece({ url, tint, place }: Slot & { place?: Place }) {
  const { scene } = useGLTF(url);
  const { obj, fit } = useMemo(() => {
    const clone = scene.clone(true);
    const isChip = nameFromUrl(url).startsWith('chip_');
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry && !mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals();
      if (tint) {
        mesh.material = solidMat(tint);
        return;
      }
      // keep the piece's real texture, brighten it with its own texture as glow
      const mm = mesh.material as THREE.MeshStandardMaterial;
      if (!mm) return;
      if (mm.color) mm.color.set('#ffffff');
      if (mm.map) {
        mm.emissiveMap = mm.map;
        if (mm.emissive) mm.emissive.set('#ffffff');
        mm.emissiveIntensity = isChip ? 0.72 : 0.62;
        mm.needsUpdate = true;
      }
    });
    const box = new THREE.Box3().setFromObject(clone);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    clone.position.set(-c.x, -c.y, -c.z);
    return { obj: clone, fit: 1 / (Math.max(s.x, s.y, s.z) || 1) };
  }, [scene, url, tint]);
  return place
    ? <Spinner fit={fit} place={place}><primitive object={obj} /></Spinner>
    : <Tumbler fit={fit}><primitive object={obj} /></Tumbler>;
}

function FlatPiece({ url, place }: { url: string; place?: Place }) {
  const tex = useTexture(url);
  const { geo, mat } = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(flatAspect(url), 1);
    // unlit: cards and bills always show their art at full brightness, so they
    // never turn black when a face tilts away from the lights. alphaTest cuts out
    // the transparent card corners cleanly in the opaque pass (no sort artifacts).
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.DoubleSide, alphaTest: 0.5, toneMapped: false,
    });
    return { geo, mat };
  }, [tex, url]);
  return place
    ? <Spinner fit={1} place={place}><mesh geometry={geo} material={mat} /></Spinner>
    : <Tumbler fit={1}><mesh geometry={geo} material={mat} /></Tumbler>;
}

function Piece({ slot, place }: { slot: Slot; place?: Place }) {
  if (slot.url.startsWith('/pieces/')) return <FlatPiece url={slot.url} place={place} />;
  return <ModelPiece url={slot.url} tint={slot.tint} place={place} />;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={1.0} />
      <hemisphereLight args={['#ffffff', '#9aa0ab', 1.0]} />
      <directionalLight position={[4, 6, 6]} intensity={1.6} />
      <directionalLight position={[-5, 2, -3]} intensity={0.8} />
    </>
  );
}

// full-screen falling backdrop for the home menu
export function FallingPieces() {
  return (
    <Canvas className="falling-canvas" camera={{ position: [0, 0, 13], fov: 52 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]}>
      <Lights />
      {SLOTS.map((slot, i) => (
        <Suspense key={i} fallback={null}>
          <Piece slot={slot} />
        </Suspense>
      ))}
    </Canvas>
  );
}

// Fill the whole viewport with an evenly-spaced grid of spinning pieces, right
// across the centre and behind the QR card (the card's solid white QR panel keeps
// the code itself clean). Recomputes on resize, so it fills any screen shape.
function FillGrid() {
  const vw = useThree((s) => s.viewport.width);
  const vh = useThree((s) => s.viewport.height);
  const items = useMemo(() => {
    const target = 2.35; // desired gap between pieces
    const margin = 1.0; // keep pieces off the very edge
    const usableW = Math.max(target, vw - margin * 2);
    const usableH = Math.max(target, vh - margin * 2);
    const cols = Math.max(2, Math.round(usableW / target));
    const rows = Math.max(2, Math.round(usableH / target));
    const stepX = cols > 1 ? usableW / (cols - 1) : 0;
    const stepY = rows > 1 ? usableH / (rows - 1) : 0;
    const out: { slot: Slot; place: Place }[] = [];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -usableW / 2 + c * stepX;
        const y = usableH / 2 - r * stepY;
        // vary the spin speed (and direction) per piece so they don't turn in lockstep
        const spin = (0.32 + ((k * 7) % 11) * 0.075) * (k % 2 === 0 ? 1 : -1);
        out.push({ slot: TILE[k % TILE.length], place: { x, y, z: 0, size: 1.1, phase: k * 0.7, spin } });
        k++;
      }
    }
    return out;
  }, [vw, vh]);
  return (
    <>
      {items.map((it, i) => (
        <Suspense key={i} fallback={null}>
          <Piece slot={it.slot} place={it.place} />
        </Suspense>
      ))}
    </>
  );
}

export function SidePieces() {
  return (
    <Canvas className="falling-canvas" camera={{ position: [0, 0, 13], fov: 52 }} gl={{ antialias: true, alpha: true }} dpr={[1, 1.5]}>
      <Lights />
      <FillGrid />
    </Canvas>
  );
}
