// Off-Shore Bank close-up: the device's CALL BANK view. The player's board is
// replaced by a 3D dolly onto the Bank as printed on the water mat. Tapping a
// lot physically drops the auction token onto it, then the matching bid tile
// dialog opens; lots already under auction offer OUTBID instead. The hotspots
// are real DOM buttons (drei Html) so they are tappable and testable.

import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { ContainerView, ContAuction } from '@bge/shared';
import {
  ContFlatImage as FlatImage, ContWaterMat as WaterMat, ContCashStack as CashStack,
  useContainerProto, ContainerPiece, packGrid,
} from './cont-three';
import { CONT_SCENE, px2r, w2r } from './cont-scene';

const S = CONT_SCENE;
const ROMAN = ['I', 'II', 'III'];

/** token offset beside a lot, matching where the TV board seats it */
const tokenAt = (at: [number, number]): [number, number] => {
  const [x, z] = px2r(at[0], at[1]);
  return [x + 1.15, z - 1.1];
};

function LookAt({ target }: { target: [number, number, number] }) {
  const camera = useThree((st) => st.camera);
  useEffect(() => {
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
  }, [camera, target]);
  return null;
}

/** the auction token flying in from the token supply and dropping on the lot */
function TokenDrop({ x, z }: { x: number; z: number }) {
  const group = useRef<THREE.Group>(null);
  const t0 = useRef<number | null>(null);
  const [fromX, fromZ] = w2r(S.supply.bankSide.auctionTokens[0][0], S.supply.bankSide.auctionTokens[0][1]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    t0.current ??= clock.elapsedTime;
    const t = Math.min(1, (clock.elapsedTime - t0.current) / 0.55);
    const k = t * t * (3 - 2 * t);
    g.position.set(fromX + (x - fromX) * k, 4.2 * (1 - k) + 0.09, fromZ + (z - fromZ) * k);
  });
  return (
    <group ref={group} position={[fromX, 4.3, fromZ]}>
      <FlatImage url={S.auctionTokenArt.img} w={1.1} h={1.1} pos={[0, 0, 0]} />
    </group>
  );
}

function PulseRing({ x, z, dim }: { x: number; z: number; dim?: boolean }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    mesh.current?.scale.setScalar(1 + (dim ? 0 : 0.14 * Math.sin(clock.elapsedTime * 3.4)));
  });
  return (
    <mesh ref={mesh} position={[x, 0.07, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.5, 1.78, 44]} />
      <meshBasicMaterial color={dim ? '#8b93a3' : '#e8b450'} transparent opacity={dim ? 0.4 : 0.8} depthWrite={false} />
    </mesh>
  );
}

/** everything already sitting on the Bank: lot contents, tokens, holdings */
function BankPieces({ view }: { view: ContainerView }) {
  const proto = useContainerProto();
  const nodes: React.ReactNode[] = [];

  view.bank.containerLots.forEach((lot, li) => {
    const at = S.bankLots.containers[li];
    const spots = packGrid(lot.length, 2, 0.75, 1.5, 4);
    lot.forEach((color, i) => {
      const [dx, dz, layer] = spots[i];
      const [x, z] = px2r(at[0], at[1]);
      nodes.push(<ContainerPiece key={`bank-${li}-${i}`} color={color}
        x={x + dx} z={z + dz} y={layer * proto.height} yaw={Math.PI / 2} proto={proto} />);
    });
  });
  view.bank.cashLots.forEach((amount, li) => {
    if (amount > 0) nodes.push(<CashStack key={`cash-${li}`} amount={amount} at={S.bankLots.cash[li]} />);
  });
  // tokens already on auctioned lots
  for (const a of view.bank.auctions) {
    const [x, z] = tokenAt(a.lotType === 'container' ? S.bankLots.containers[a.lot] : S.bankLots.cash[a.lot]);
    nodes.push(<FlatImage key={`tok-${a.lotType}-${a.lot}`} url={S.auctionTokenArt.img} w={1.1} h={1.1}
      pos={[x, 0.09, z]} />);
  }
  // free tokens waiting at the supply spot the drop animation launches from
  for (let i = 0; i < view.bank.tokensFree; i++) {
    const [wx, wz] = S.supply.bankSide.auctionTokens[i % 2];
    const [x, z] = w2r(wx, wz);
    nodes.push(<FlatImage key={`tokfree-${i}`} url={S.auctionTokenArt.img} w={1.1} h={1.1} pos={[x, 0.03, z]} />);
  }
  // every seat's holding hex, for context (auction winnings wait here)
  for (const p of view.players) {
    const at = S.hexArt[`${p.color}:holding`];
    if (!at) continue;
    const spots = packGrid(p.holding.length, 2, 0.8, 1.5, 4);
    p.holding.forEach((color, i) => {
      const [dx, dz, layer] = spots[i];
      const [x, z] = px2r(at[0], at[1]);
      nodes.push(<ContainerPiece key={`ho-${p.seat}-${i}`} color={color}
        x={x + dx} z={z + dz} y={layer * proto.height} yaw={Math.PI / 2} proto={proto} />);
    });
  }
  return <group>{nodes}</group>;
}

interface Spot {
  key: string;
  x: number; z: number;
  label: string;
  sub?: string;
  disabled: boolean;
  onClick: () => void;
}

export default function ContainerBankScene({ view, seat, pendingToken, onPick, onCancel }: {
  view: ContainerView;
  seat: number;
  /** locally placed token (drop animation) before the opening bid confirms */
  pendingToken: { lotType: 'cash' | 'container'; lot: number } | null;
  onPick: (lotType: 'cash' | 'container', lot: number, outbid: ContAuction | null) => void;
  onCancel: () => void;
}) {
  const myCash = view.players[seat].cash ?? 0;
  const auctions = view.bank.auctions;
  const canStart = view.bank.tokensFree > 0 && (view.players.length >= 5 || auctions.length === 0);
  const activeCont = auctions.find((a) => a.lotType === 'container');
  const activeCash = auctions.find((a) => a.lotType === 'cash');

  const spots: Spot[] = [];
  [0, 1, 2].forEach((lot) => {
    const [x, z] = px2r(S.bankLots.containers[lot][0], S.bankLots.containers[lot][1]);
    if (activeCont && activeCont.lot === lot) {
      const mine = activeCont.bidder === seat;
      const short = myCash < activeCont.bid + 1;
      spots.push({
        key: `c${lot}`, x, z,
        label: mine ? 'YOUR BID LEADS' : `OUTBID · $${activeCont.bid + 1}+`,
        sub: mine ? `$${activeCont.bid} ON YOUR TILE` : short ? 'NOT ENOUGH CASH'
          : `${view.players[activeCont.bidder].name.toUpperCase()} BIDS $${activeCont.bid}`,
        disabled: mine || short,
        onClick: () => onPick('container', lot, activeCont),
      });
    } else if (canStart && !activeCont && view.bank.containerLots[lot].length > 0) {
      const n = view.bank.containerLots[lot].length;
      spots.push({
        key: `c${lot}`, x, z,
        label: `BID CASH · LOT ${ROMAN[lot]}`,
        sub: `${n} CONTAINER${n > 1 ? 'S' : ''}`,
        disabled: false,
        onClick: () => onPick('container', lot, null),
      });
    }
  });
  [0, 1, 2].forEach((lot) => {
    const [x, z] = px2r(S.bankLots.cash[lot][0], S.bankLots.cash[lot][1]);
    if (activeCash && activeCash.lot === lot) {
      const mine = activeCash.bidder === seat;
      spots.push({
        key: `m${lot}`, x, z,
        label: mine ? 'YOUR BID LEADS' : `OUTBID · ${activeCash.bid + 1}+ CONTAINERS`,
        sub: mine ? `${activeCash.bid} ON YOUR TILE`
          : `${view.players[activeCash.bidder].name.toUpperCase()} BIDS ${activeCash.bid}`,
        disabled: mine,
        onClick: () => onPick('cash', lot, activeCash),
      });
    } else if (canStart && !activeCash && view.bank.cashLots[lot] > 0) {
      spots.push({
        key: `m${lot}`, x, z,
        label: `BID CONTAINERS · LOT ${ROMAN[lot]}`,
        sub: `WIN $${view.bank.cashLots[lot]}`,
        disabled: false,
        onClick: () => onPick('cash', lot, null),
      });
    }
  });

  const onlyOutbids = spots.length > 0 && spots.every((s) => s.key.length === 2 && auctions.some((a) => (a.lotType === 'container' ? 'c' : 'm') + a.lot === s.key));
  const hint = pendingToken
    ? 'AUCTION TOKEN PLACED · MAKE YOUR OPENING BID'
    : onlyOutbids
      ? 'AN AUCTION IS OPEN · OUTBID TO TAKE THE TILE'
      : spots.length > 0
        ? 'TAP A LOT TO PLACE THE AUCTION TOKEN, OR OUTBID AN OPEN AUCTION'
        : view.bank.tokensFree <= 0 ? 'NO AUCTION TOKEN FREE' : 'NO LOT AVAILABLE TO AUCTION';

  const dropAt = pendingToken
    ? tokenAt(pendingToken.lotType === 'container' ? S.bankLots.containers[pendingToken.lot] : S.bankLots.cash[pendingToken.lot])
    : null;

  return (
    <div className="cont-bank-scene" data-testid="cont-bank-scene">
      <Canvas dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ fov: 46, near: 0.1, far: 200, position: [11, 23, 16.5] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        style={{ background: '#05070c' }}>
        <color attach="background" args={['#05070c']} />
        <hemisphereLight intensity={0.65} color="#cdd8e8" groundColor="#0d1018" />
        <directionalLight position={[18, 30, 16]} intensity={2.0} color="#f2ecdd" />
        <LookAt target={[11, 0, 0.4]} />
        <Suspense fallback={null}>
          <WaterMat />
          <BankPieces view={view} />
          {dropAt && <TokenDrop x={dropAt[0]} z={dropAt[1]} />}
        </Suspense>
        {!pendingToken && spots.map((s) => <PulseRing key={`ring-${s.key}`} x={s.x} z={s.z} dim={s.disabled} />)}
        {!pendingToken && spots.map((s, i) => (
          // stagger neighboring pills so three lots in a row never overlap
          <group key={s.key} position={[s.x, 0.3, s.z + 1.35 + (i % 2) * 1.05]}>
            <Html center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
              <button className={'cont-spot-btn' + (s.disabled ? ' off' : '')} disabled={s.disabled}
                style={{ pointerEvents: 'auto' }} onClick={s.onClick}>
                <span>{s.label}</span>
                {s.sub && <small>{s.sub}</small>}
              </button>
            </Html>
          </group>
        ))}
      </Canvas>
      <div className="cont-bank-scene-head ig-glass">
        <b>CALL BANK · OFF-SHORE BANK</b>
        <span>{hint}</span>
        <button className="ig-modal-x" onClick={onCancel} aria-label="Back to your board">✕</button>
      </div>
    </div>
  );
}
