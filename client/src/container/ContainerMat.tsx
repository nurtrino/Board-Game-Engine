// 3D personal harbor board for the Container device: the seat's own board art
// with the real 3D pieces on it — container meshes in the priced lots,
// extruded factory and warehouse tiles on the build tracks, reserve tokens,
// and visiting ships at the docks. A fixed, gently-angled frame (the shared
// TV keeps the orbit camera; the personal mat is a display).

import { Suspense, useEffect, useMemo } from 'react';
import { Canvas, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ContainerView, ContColor } from '@bge/shared';
import { CONT_SCENE } from './cont-scene';
import {
  ContainerPiece, FactoryPiece, WarehousePiece, Ship, useContainerProto, ContFlatImage,
  lotSpots, lotCenter,
} from './cont-three';

const S = CONT_SCENE;
const AW = 2712, AH = 1702;
const BW = AW * S.pb.s; // 14.2 x 8.9 world, same scale as the TV table
const BH = AH * S.pb.s;

/** board art px -> mat-local render XZ (art upright: harbor away, factory near) */
const a2m = (px: number, py: number): [number, number] => [
  (px - S.pb.cx) * S.pb.s,
  (py - S.pb.cy) * S.pb.s,
];

function BoardArt({ seatColor }: { seatColor: string }) {
  const tex = useLoader(THREE.TextureLoader, S.boards[seatColor].img);
  useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 16;
  }, [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[BW, BH]} />
      <meshStandardMaterial map={tex} roughness={0.9} transparent alphaTest={0.3} />
    </mesh>
  );
}

function MatPieces({ view, seat }: { view: ContainerView; seat: number }) {
  const proto = useContainerProto();
  const p = view.players[seat];
  const nodes: React.ReactNode[] = [];

  p.factories.forEach((color, i) => {
    const [x, z] = a2m(S.pb.factoryTrack[i][0], S.pb.factoryTrack[i][1]);
    nodes.push(<FactoryPiece key={`f${i}`} color={color} x={x} z={z} />);
  });
  for (let i = 0; i < p.warehouses; i++) {
    const [x, z] = a2m(S.pb.warehouseTrack[i][0], S.pb.warehouseTrack[i][1]);
    nodes.push(<WarehousePiece key={`w${i}`} x={x} z={z} />);
  }
  const lots = (which: 'factory' | 'harbor') => {
    const src = which === 'factory' ? p.factoryLots : p.harborLots;
    const anchors = which === 'factory' ? S.pb.factoryLots : S.pb.harborLots;
    for (const [price, list] of Object.entries(src)) {
      const at = anchors[price];
      if (!at) continue;
      const [cx, cy] = lotCenter(which, at);
      const spots = lotSpots(which, (list as ContColor[]).length);
      (list as ContColor[]).forEach((color, i) => {
        const [dx, dy, layer] = spots[i];
        const [x, z] = a2m(cx + dx, cy + dy);
        nodes.push(<ContainerPiece key={`${which}-${price}-${i}`} color={color}
          x={x} z={z} y={layer * proto.height} yaw={Math.PI / 2} proto={proto} />);
      });
    }
  };
  lots('factory');
  lots('harbor');

  // reserve tokens (containers locked on the bank bid tile)
  const res: [number, 'factory' | 'harbor'][] = [[p.reserves.factory, 'factory'], [p.reserves.harbor, 'harbor']];
  for (const [count, from] of res) {
    for (let i = 0; i < count; i++) {
      const anchor = from === 'factory' ? S.pb.factoryLots['1'] : S.pb.harborLots['2'];
      const [x, z] = a2m(anchor[0] + 220 + i * 90, anchor[1] + 60);
      nodes.push(<ContFlatImage key={`r-${from}-${i}`} url={S.reserveTokenArt.img} w={0.7} h={0.7} pos={[x, 0.06, z]} />);
    }
  }

  // opponents' ships tied up at my docks: same cove assignment as the TV,
  // bow nosing just inside the printed notch
  view.players
    .filter((q) => q.ship.loc.kind === 'harbor' && q.ship.loc.seat === seat)
    .forEach((q) => {
      const cove = S.pb.docks[(q.seat - seat - 1 + view.players.length) % view.players.length % S.pb.docks.length];
      const [x, z] = a2m(cove[0], -333);
      nodes.push(
        <Ship key={`v${q.seat}`} seatColor={q.color} x={x} z={z} yaw={-Math.PI / 2}
          cargo={q.ship.cargo} proto={proto} />,
      );
    });

  return <group>{nodes}</group>;
}

/** fit the whole board width in frame at a gentle fixed tilt, whatever the
 * frame's shape (the device column is nearly square, the board is wide) */
function FitCamera() {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  useEffect(() => {
    const vFov = (40 * Math.PI) / 180;
    const aspect = size.width / Math.max(1, size.height);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const dist = (BW / 2 + 0.7) / Math.tan(hFov / 2);
    const tilt = (54 * Math.PI) / 180; // from horizontal
    camera.fov = 40;
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist + 1.1);
    camera.lookAt(0, 0, 0.6);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

export function ContainerMat({ view, seat }: { view: ContainerView; seat: number }) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 40, near: 0.1, far: 120, position: [0, 12, 8] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      style={{ background: 'transparent' }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 12, 7]} intensity={1.5} castShadow
        shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-7, 9, -5]} intensity={0.4} />
      <FitCamera />
      <Suspense fallback={null}>
        <BoardArt seatColor={view.players[seat].color} />
        <MatPieces view={view} seat={seat} />
      </Suspense>
    </Canvas>
  );
}
