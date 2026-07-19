// Container TV board: the mod's water mat (both islands printed on it) as the
// table surface, the five player harbor boards laid around it exactly as the
// mod places them, the mod's ship and container meshes seated on their printed
// spots, supply piles, the Off-Shore Bank lots, and the universal ig-* HUD.
// Camera flies to every action's location (lastEvent.focus).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import type { ContainerView, ContainerSeat, ContFocus } from '@bge/shared';
import { CONT_RULES, CONT_COLORS, contLotCount, contBidCards } from '@bge/shared';
import { playSfx } from '../sfx';
import {
  CONT_SCENE, px2r, w2r, boardSpot, MAT_RW, MAT_RH,
  islandCenterR, bankCenterR, CONT_UI_HEX, CONT_PIECE_HEX,
} from './cont-scene';
import {
  ContFlatImage as FlatImage, useContainerProto, ContainerPiece, packGrid, Ship,
  FactoryPiece, WarehousePiece, type ContainerProto,
} from './cont-three';
import './container.css';

const S = CONT_SCENE;

/** The water mat — the whole table surface, owner directive. */
function WaterMat() {
  const tex = useLoader(THREE.TextureLoader, S.mat.img);
  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
  }, [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[MAT_RW, MAT_RH]} />
      <meshStandardMaterial map={tex} roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

/** image-top direction per board yaw (see cont-scene yawRot derivation) */
const BOARD_RY: Record<number, number> = { 180: 0, 90: Math.PI / 2, 270: -Math.PI / 2, 0: Math.PI };

function PlayerBoards({ seats }: { seats: ContainerSeat[] }) {
  return (
    <group>
      {seats.map((seatColor) => {
        const b = S.boards[seatColor];
        const [x, z] = w2r(b.pos[0], b.pos[1]);
        const w = b.px[0] * S.pb.s;
        const h = b.px[1] * S.pb.s;
        return (
          <FlatImage key={seatColor} url={b.img} w={w} h={h}
            pos={[x, 0.03, z]} ry={BOARD_RY[b.yaw] ?? 0} alphaTest={0.3} />
        );
      })}
    </group>
  );
}

/** ship render spot + long-axis heading per game location */
function shipPlace(view: ContainerView, seat: number): { x: number; z: number; yaw: number } {
  const p = view.players[seat];
  const seatColor = p.color;
  const loc = p.ship.loc;
  if (loc.kind === 'ocean') {
    // idle anchorages float in genuinely OPEN water: clear of every board's
    // dock coves, of the boards' own corners (a ship hugging its own board
    // reads as a botched docking), and of the printed berth columns
    const OCEAN_IDLE: Record<string, [number, number]> = {
      Brown: [-14, -11], Pink: [-20, -9], Orange: [-20, 9],
      Teal: [22.5, -9.5], Purple: [22.5, 9.5],
    };
    const [wx, wz] = OCEAN_IDLE[seatColor] ?? S.shipStarts[seatColor];
    const [x, z] = w2r(wx, wz);
    // side ships ride north-south along the coast, the rest east-west
    return { x, z, yaw: Math.abs(wx) > 18 ? Math.PI / 2 : 0 };
  }
  if (loc.kind === 'harbor') {
    const host = view.players[loc.seat];
    // dock cove index = my seat index, so two visiting ships never overlap;
    // the hull sits in the sea with the bow just inside the printed cove
    const dock = S.pb.docks[seat % S.pb.docks.length];
    const [x, z] = boardSpot(host.color, [dock[0], -310]);
    // long axis perpendicular to the board's dock edge
    const yaw = (BOARD_RY[S.boards[host.color].yaw] ?? 0) + Math.PI / 2;
    return { x, z, yaw };
  }
  if (loc.kind === 'island') {
    // the mat prints five berth strips west of Container Island's pier
    const [x, z] = px2r(1390, ISLAND_BERTHS_Y[seat % ISLAND_BERTHS_Y.length]);
    return { x, z, yaw: 0 };
  }
  // the mat prints five berth strips east of the Off-Shore Bank's pier
  const [x, z] = px2r(2903, BANK_BERTHS_Y[seat % BANK_BERTHS_Y.length]);
  return { x, z, yaw: 0 };
}

// printed berth strip centers (mat art px, detected from the outline rows)
const ISLAND_BERTHS_Y = [1665, 1722, 1785, 1848, 1906];
const BANK_BERTHS_Y = [1662, 1725, 1789, 1852, 1915];

/** money card stack for a bank cash lot amount; the top card fills the
 * printed card slot, the rest fan out slightly underneath */
function CashStack({ amount, at }: { amount: number; at: [number, number] }) {
  const cards = useMemo(() => {
    const denoms = [20, 10, 5, 2, 1];
    const out: number[] = [];
    let rest = amount;
    for (const d of denoms) while (rest >= d && out.length < 9) { out.push(d); rest -= d; }
    return out;
  }, [amount]);
  const [x, z] = px2r(at[0], at[1]);
  const W = 2.35, H = W * 1.4; // sized to the printed slot (~3.4 x 3.6 world)
  return (
    <group>
      {cards.map((d, i) => (
        <FlatImage key={i} url={S.cards.money[String(d)]} w={W} h={H}
          pos={[x + (i % 3) * 0.14 - 0.07, 0.04 + i * 0.012, z + Math.floor(i / 3) * 0.16 - 0.08]} ry={0} />
      ))}
    </group>
  );
}

const SFX_FOR_KIND: Record<string, Parameters<typeof playSfx>[0]> = {
  action: 'build', turn: 'turn', win: 'win', alert: 'error',
};

/** the delivery auction as the physical table shows it: one face-down card
 *  pile per bidder (size public, amount secret, bluff cards welcome), then
 *  every pile flips at once and the totals come up. */
function AuctionPanel({ view }: { view: ContainerView }) {
  const d = view.delivery!;
  const deliverer = view.players[d.deliverer];
  const bidders = view.players.filter((p) => p.seat !== d.deliverer);
  const revealed = d.stage === 'resolve';
  const high = revealed ? Math.max(0, ...Object.values(d.bids ?? {}).map((b) => b ?? 0)) : 0;
  return (
    <div className="cont-auction ig-glass" data-testid="cont-auction">
      <div className="cont-auction-head">
        <span className="cont-anchor-tag">⚓ ANCHOR ACTION · CONTAINER ISLAND</span>
        <b>DELIVERY AUCTION</b>
        <span className="cont-auction-cargo">
          {deliverer.name.toUpperCase()} DELIVERS
          {d.cargo.map((c, i) => <i key={i} style={{ background: CONT_PIECE_HEX[c] }} />)}
        </span>
      </div>
      <div className="cont-auction-piles">
        {bidders.map((p) => {
          const inRunoff = d.runoffAmong.includes(p.seat);
          const thinking = !revealed && d.bidsIn[p.seat] === false && (d.stage !== 'runoff' || inRunoff);
          const total = revealed ? (d.bids?.[p.seat] ?? 0) : null;
          // reveal lays the pile out as money cards + the bluff cards
          const cards: (number | 'bluff' | null)[] = revealed
            ? [...contBidCards(total ?? 0), ...Array<'bluff'>(d.bluffs?.[p.seat] ?? 0).fill('bluff')]
            : Array<null>(d.piles[p.seat] ?? 0).fill(null);
          const winner = revealed && d.tied.includes(p.seat);
          const outOfRunoff = d.stage === 'runoff' && !inRunoff;
          return (
            <div key={p.seat}
              className={'cont-auction-bidder' + (winner ? ' winner' : '') + (outOfRunoff ? ' dim' : '')}>
              <span className="cont-auction-name" style={{ borderColor: CONT_UI_HEX[p.color] }}>
                {p.name.toUpperCase()}
              </span>
              <div className="cont-auction-cards">
                {cards.length === 0 && !thinking && (
                  <span className="cont-auction-empty">{revealed ? '$0 · NO CARDS' : 'NO CARDS'}</span>
                )}
                {cards.map((c, i) => (
                  <div key={`${d.stage}-${i}`} className={'cont-bidcard' + (revealed ? ' flip' : '')}
                    style={{ animationDelay: `${i * 0.13}s` }}>
                    <div className="cont-bidcard-back" />
                    <div className="cont-bidcard-face">
                      {c === 'bluff'
                        ? <img src={S.cards.bluff} alt="Bluff card, worth nothing" />
                        : c !== null && <img src={S.cards.money[String(c)]} alt={`$${c} card`} />}
                    </div>
                  </div>
                ))}
              </div>
              <span className={'cont-auction-sub' + (thinking ? ' thinking' : '')}>
                {thinking
                  ? (d.stage === 'runoff' ? 'ADDING CASH…' : 'BUILDING A PILE…')
                  : revealed
                    ? <>TOTAL <b>${total}</b>{winner ? ' · HIGH BID' : ''}{(d.bluffs?.[p.seat] ?? 0) > 0 ? ` · ${d.bluffs![p.seat]} BLUFF` : ''}</>
                    : d.bidsIn[p.seat] ? `${cards.length} CARD${cards.length === 1 ? '' : 'S'} DOWN` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <div className="cont-auction-status">
        {d.stage === 'bidding' && 'SECRET BIDS · CASH FACE-DOWN, UP TO 2 BLUFF CARDS EACH'}
        {d.stage === 'runoff' && 'TIE AT THE TOP · TIED BIDDERS ADD FACE-DOWN CASH'}
        {revealed && `HIGH BID $${high} · ${deliverer.name.toUpperCase()} ACCEPTS AND COLLECTS $${high * 2}, OR PAYS $${high} TO KEEP THE CARGO`}
      </div>
    </div>
  );
}

/** one-line explainer under the narration for each anchor (docking) action */
const anchorNoteFor = (text: string): string | null => {
  if (/DOCKS AT THE OFF-SHORE BANK/.test(text)) return 'ANCHOR ACTION · AUCTION WINNINGS LOAD FREE FROM THE HOLDING AREA';
  if (/DOCKS AT .*'S HARBOR/.test(text)) return 'ANCHOR ACTION · ONE FREE PURCHASE AT THIS HARBOR';
  if (/DELIVERS TO CONTAINER ISLAND/.test(text)) return 'ANCHOR ACTION · MANDATORY CARGO AUCTION, THEN THE TURN ENDS';
  return null;
};

interface RFocus { seq: number; x: number; z: number; tight?: boolean }

/** board-art anchor for a focus sub-spot (exact slot the piece landed on) */
function subSpot(sub: NonNullable<Extract<ContFocus, { type: 'board' }>['sub']>): [number, number] {
  switch (sub.kind) {
    case 'factoryTrack': return S.pb.factoryTrack[Math.min(sub.index ?? 0, S.pb.factoryTrack.length - 1)];
    case 'warehouseTrack': return S.pb.warehouseTrack[Math.min(sub.index ?? 0, S.pb.warehouseTrack.length - 1)];
    case 'factoryLots': return [1356, 1430];
    case 'harborLots': return [1250, 570];
  }
}

function FocusFly({ focus, controls }: { focus: RFocus | null; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const camera = useThree((st) => st.camera);
  const anim = useRef<{ start: number; seq: number } | null>(null);
  const home = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const doneSeq = useRef(-1);
  const IN = 1.1, HOLD = 2.2, OUT = 1.1;
  useFrame(({ clock }) => {
    const c = controls.current;
    if (!focus || !c || focus.seq === doneSeq.current) return;
    if (anim.current?.seq !== focus.seq) {
      home.current ??= { pos: camera.position.clone(), target: c.target.clone() };
      anim.current = { start: clock.elapsedTime, seq: focus.seq };
    }
    const t = clock.elapsedTime - anim.current.start;
    const ease = (x: number) => x * x * (3 - 2 * x);
    // tight focus (an exact slot) gets a closer look than a whole-board focus
    const inPos = focus.tight
      ? new THREE.Vector3(focus.x, 8.5, focus.z + 6)
      : new THREE.Vector3(focus.x, 13, focus.z + 9.5);
    const inTarget = new THREE.Vector3(focus.x, 0, focus.z);
    const h = home.current!;
    if (t < IN) {
      const k = ease(t / IN);
      camera.position.lerpVectors(h.pos, inPos, k);
      c.target.lerpVectors(h.target, inTarget, k);
    } else if (t < IN + HOLD) {
      camera.position.copy(inPos);
      c.target.copy(inTarget);
    } else if (t < IN + HOLD + OUT) {
      const k = ease((t - IN - HOLD) / OUT);
      camera.position.lerpVectors(inPos, h.pos, k);
      c.target.lerpVectors(inTarget, h.target, k);
    } else {
      camera.position.copy(h.pos);
      c.target.copy(h.target);
      doneSeq.current = focus.seq;
      anim.current = null;
      home.current = null;
    }
    c.update();
  });
  return null;
}

/** pulsing ring at the action's spot while the camera dwells there */
function FocusRing({ focus, color }: { focus: RFocus | null; color: string }) {
  const mesh = useRef<THREE.Mesh>(null);
  const born = useRef<{ seq: number; t: number } | null>(null);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m || !focus) return;
    if (born.current?.seq !== focus.seq) born.current = { seq: focus.seq, t: clock.elapsedTime };
    const age = clock.elapsedTime - born.current.t;
    const LIFE = 4.4;
    const visible = age < LIFE;
    m.visible = visible;
    if (!visible) return;
    m.position.set(focus.x, 0.09, focus.z);
    const base = focus.tight ? 0.55 : 1; // slot-sized ring for exact spots
    const pulse = base * (1 + 0.28 * Math.sin(age * 5.2));
    m.scale.setScalar(pulse);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, Math.max(0, (LIFE - age) / 1.2));
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[1.7, 2.05, 48]} />
      <meshBasicMaterial color={color} transparent depthWrite={false} />
    </mesh>
  );
}

function CamOverride() {
  const camera = useThree((st) => st.camera);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('cam');
    if (!q) return;
    const [x, z, h, y] = q.split(',').map(Number);
    camera.position.set(x, y ?? h, z + h * 0.4);
    camera.lookAt(x, 0, z);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

/** factory-purchase ghosts: the bought containers visibly truck from the
 * seller's factory shelves to the buyer's harbor, so it is clear where the
 * goods went. The real pieces are already in place underneath. */
function TransferGhosts({ view, proto }: { view: ContainerView; proto: ContainerProto }) {
  const group = useRef<THREE.Group>(null);
  const run = useRef<{ seq: number; start: number } | null>(null);
  const seen = useRef(view.lastEvent.seq); // no replay on page load
  const transfer = view.lastEvent.transfer;
  const path = useMemo(() => {
    if (!transfer) return null;
    const from = boardSpot(view.players[transfer.from].color, [1356, 1430]); // seller factory shelves
    const to = boardSpot(view.players[transfer.to].color, [1250, 570]); // buyer harbor shelves
    return { from, to };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.lastEvent.seq]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    if (view.lastEvent.seq !== seen.current) {
      seen.current = view.lastEvent.seq;
      if (transfer && path) run.current = { seq: view.lastEvent.seq, start: clock.elapsedTime };
    }
    if (!run.current || !path) { g.visible = false; return; }
    const DUR = 1.6;
    const t = (clock.elapsedTime - run.current.start) / DUR;
    if (t >= 1) { g.visible = false; run.current = null; return; }
    g.visible = true;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const k = ease(Math.min(1, t));
    const x = path.from[0] + (path.to[0] - path.from[0]) * k;
    const z = path.from[1] + (path.to[1] - path.from[1]) * k;
    const lift = Math.sin(Math.PI * k) * 1.6; // an arc so the run reads over the boards
    g.position.set(x, lift, z);
  });
  if (!transfer) return null;
  return (
    <group ref={group} visible={false}>
      {transfer.colors.slice(0, 5).map((color, i) => (
        <ContainerPiece key={i} color={color}
          x={(i % 2 - 0.5) * 0.8} z={Math.floor(i / 2) * 0.75 - 0.7}
          y={i * 0.05} yaw={Math.PI / 2} proto={proto} />
      ))}
    </group>
  );
}

/** everything that needs the container mesh proto in one subtree */
function Pieces({ view }: { view: ContainerView }) {
  const proto = useContainerProto();
  const seats = view.players.map((p) => p.color);

  const nodes: React.ReactNode[] = [];

  // ---- supply piles (north band, exactly like the mod's table) ----
  for (const color of CONT_COLORS) {
    const n = view.supply.containers[color];
    const cx = S.supply.containers.xByColor[color];
    for (let i = 0; i < n; i++) {
      const layer = Math.floor(i / 10);
      const j = i % 10;
      const row = j % 2, col = Math.floor(j / 2);
      const [x, z] = w2r(cx + (col - 2) * 0.75, S.supply.containers.z[row]);
      nodes.push(<ContainerPiece key={`sup-${color}-${i}`} color={color} x={x} z={z}
        y={layer * proto.height} yaw={Math.PI / 2} proto={proto} />);
    }
    // factory supply: 3D building tiles in a short row per color
    const fn = view.supply.factories[color];
    const fx = S.supply.factories.xByColor[color];
    for (let i = 0; i < fn; i++) {
      const [x, z] = w2r(fx + (i - (fn - 1) / 2) * 0.5, S.supply.factories.z);
      nodes.push(<FactoryPiece key={`fsup-${color}-${i}`} color={color} x={x} z={z} />);
    }
  }
  // warehouse supply row (3D tiles)
  for (let i = 0; i < view.supply.warehouses; i++) {
    const [x0, x1] = S.supply.warehouses.x;
    const wx = x0 + (i / Math.max(1, 13)) * (x1 - x0);
    const [x, z] = w2r(wx, S.supply.warehouses.z);
    nodes.push(<WarehousePiece key={`wsup-${i}`} x={x} z={z} />);
  }

  // ---- bank lots ----
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
  // auction tokens: free ones at the supply spot, active ones on their lots
  let tokenIdx = 0;
  for (const a of view.bank.auctions) {
    const at = a.lotType === 'container' ? S.bankLots.containers[a.lot] : S.bankLots.cash[a.lot];
    const [x, z] = px2r(at[0], at[1]);
    nodes.push(<FlatImage key={`tok-${a.lotType}-${a.lot}`} url={S.auctionTokenArt.img} w={1.1} h={1.1}
      pos={[x + 1.15, 0.09, z - 1.1]} />);
    tokenIdx++;
  }
  for (let i = tokenIdx; i < view.bank.auctions.length + view.bank.tokensFree; i++) {
    const [wx, wz] = S.supply.bankSide.auctionTokens[i % 2];
    const [x, z] = w2r(wx, wz);
    nodes.push(<FlatImage key={`tokfree-${i}`} url={S.auctionTokenArt.img} w={1.1} h={1.1} pos={[x, 0.03, z]} />);
  }
  // bid tiles: in the supply when idle, next to the bidder's board when active
  const activeCash = view.bank.auctions.find((a) => a.lotType === 'container'); // cash-bid tile in use
  const activeCont = view.bank.auctions.find((a) => a.lotType === 'cash');
  const tileSpot = (active: typeof activeCash, url: string, idleAt: [number, number], key: string) => {
    if (active) {
      const bidder = view.players[active.bidder];
      const [x, z] = boardSpot(bidder.color, [S.pb.cx, -420]); // just seaward of the board
      nodes.push(<FlatImage key={key} url={url} w={2.6} h={2.6} pos={[x, 0.05, z]} />);
      if (active.lotType === 'container') {
        // cash bid: face-up money on the tile
        const denoms: number[] = [];
        let rest = active.bid;
        for (const d of [20, 10, 5, 2, 1]) while (rest >= d && denoms.length < 6) { denoms.push(d); rest -= d; }
        denoms.forEach((d, i) => nodes.push(
          <FlatImage key={`${key}-m${i}`} url={S.cards.money[String(d)]} w={1.1} h={1.55}
            pos={[x - 0.5 + (i % 3) * 0.55, 0.08 + i * 0.012, z + (i > 2 ? 0.5 : -0.3)]} />));
      } else {
        active.bidContainers.forEach((b, i) => nodes.push(
          <ContainerPiece key={`${key}-c${i}`} color={b.color}
            x={x + (b.from === 'harbor' ? -0.7 : 0.7)} z={z - 0.8 + Math.floor(i / 2) * 0.75}
            y={0.06} yaw={Math.PI / 2} proto={proto} />));
      }
    } else {
      const [x, z] = w2r(idleAt[0], idleAt[1]);
      nodes.push(<FlatImage key={key} url={url} w={2.4} h={2.4} pos={[x, 0.03, z]} />);
    }
  };
  tileSpot(activeCash, S.cards.bidCash, S.supply.bankSide.bidCash, 'tile-cash');
  tileSpot(activeCont, S.cards.bidContainers, S.supply.bankSide.bidContainers, 'tile-cont');

  // loan deck at the bank side
  {
    const [x, z] = w2r(S.supply.bankSide.loans[0], S.supply.bankSide.loans[1]);
    nodes.push(<FlatImage key="loandeck" url={S.cards.loan} w={1.5} h={1.5 * 1.4} pos={[x, 0.03, z]} />);
  }

  // ---- per player: island scoring, holding, board pieces, ships, loans ----
  for (const p of view.players) {
    const seatColor = p.color;
    // island scoring hex
    {
      const at = S.hexArt[`${seatColor}:scoring`];
      if (at) {
        const spots = packGrid(p.scoring.length, 3, 0.8, 1.5, 6);
        p.scoring.forEach((color, i) => {
          const [dx, dz, layer] = spots[i];
          const [x, z] = px2r(at[0], at[1]);
          nodes.push(<ContainerPiece key={`sc-${p.seat}-${i}`} color={color}
            x={x + dx} z={z + dz} y={layer * proto.height} yaw={Math.PI / 2} proto={proto} />);
        });
      }
    }
    // bank holding hex
    {
      const at = S.hexArt[`${seatColor}:holding`];
      if (at) {
        const spots = packGrid(p.holding.length, 2, 0.8, 1.5, 4);
        p.holding.forEach((color, i) => {
          const [dx, dz, layer] = spots[i];
          const [x, z] = px2r(at[0], at[1]);
          nodes.push(<ContainerPiece key={`ho-${p.seat}-${i}`} color={color}
            x={x + dx} z={z + dz} y={layer * proto.height} yaw={Math.PI / 2} proto={proto} />);
        });
      }
    }
    // factories on the build track (3D building tiles)
    p.factories.forEach((color, i) => {
      const at = S.pb.factoryTrack[i];
      const [x, z] = boardSpot(seatColor, at);
      const ry = BOARD_RY[S.boards[seatColor].yaw] ?? 0;
      nodes.push(<FactoryPiece key={`fac-${p.seat}-${i}`} color={color} x={x} z={z} ry={ry} />);
    });
    // warehouses (3D tiles)
    for (let i = 0; i < p.warehouses; i++) {
      const at = S.pb.warehouseTrack[i];
      const [x, z] = boardSpot(seatColor, at);
      const ry = BOARD_RY[S.boards[seatColor].yaw] ?? 0;
      nodes.push(<WarehousePiece key={`wh-${p.seat}-${i}`} x={x} z={z} ry={ry} />);
    }
    // the seat's player aid card, laid beside the board like the mod places it
    {
      const [x, z] = boardSpot(seatColor, [S.pb.cx, 2357]); // local (0, 7.9): the mod's aid spot
      const ry = BOARD_RY[S.boards[seatColor].yaw] ?? 0;
      nodes.push(<FlatImage key={`aid-${p.seat}`} url={S.cards.aid}
        w={4.3} h={4.3 * (477 / 1024)} pos={[x, 0.02, z]} ry={ry} />);
    }
    // factory lots
    for (const [price, list] of Object.entries(p.factoryLots)) {
      const at = S.pb.factoryLots[price];
      if (!at) continue;
      const yaw = S.boards[seatColor].yaw;
      list.forEach((color, i) => {
        const row = Math.floor(i / 2), col = i % 2;
        const local: [number, number] = [at[0] + (col - 0.5) * 230, at[1] - row * 130];
        const [x, z] = boardSpot(seatColor, local);
        const contYaw = BOARD_RY[yaw] ?? 0; // lie along the printed lot row
        nodes.push(<ContainerPiece key={`fl-${p.seat}-${price}-${i}`} color={color}
          x={x} z={z} yaw={contYaw} proto={proto} />);
      });
    }
    // harbor lots
    for (const [price, list] of Object.entries(p.harborLots)) {
      const at = S.pb.harborLots[price];
      if (!at) continue;
      const yaw = S.boards[seatColor].yaw;
      list.forEach((color, i) => {
        const row = Math.floor(i / 2), col = i % 2;
        const local: [number, number] = [at[0] + (col - 0.5) * 230, at[1] + row * 130];
        const [x, z] = boardSpot(seatColor, local);
        const contYaw = BOARD_RY[yaw] ?? 0; // lie along the printed lot row
        nodes.push(<ContainerPiece key={`hl-${p.seat}-${price}-${i}`} color={color}
          x={x} z={z} yaw={contYaw} proto={proto} />);
      });
    }
    // reserve tokens marking bid containers
    const res: [number, 'factory' | 'harbor'][] = [[p.reserves.factory, 'factory'], [p.reserves.harbor, 'harbor']];
    for (const [count, from] of res) {
      for (let i = 0; i < count; i++) {
        const anchor = from === 'factory' ? S.pb.factoryLots['1'] : S.pb.harborLots['2'];
        const local: [number, number] = [anchor[0] + 220 + i * 90, anchor[1] + 60];
        const [x, z] = boardSpot(seatColor, local);
        nodes.push(<FlatImage key={`rs-${p.seat}-${from}-${i}`} url={S.reserveTokenArt.img}
          w={0.7} h={0.7} pos={[x, 0.06, z]} />);
      }
    }
    // loan cards by the board (the mod keeps a colored loan pile per seat)
    for (let i = 0; i < p.loans; i++) {
      const local: [number, number] = [S.pb.px[0] + 260, 300 + i * 260];
      const [x, z] = boardSpot(seatColor, local);
      const ry = BOARD_RY[S.boards[seatColor].yaw] ?? 0;
      nodes.push(<FlatImage key={`loan-${p.seat}-${i}`} url={S.cards.loan} w={1.5} h={1.5 * 1.4}
        pos={[x, 0.04 + i * 0.01, z]} ry={ry} />);
    }
    // ship + cargo riding on its deck (cargo glides with the hull)
    const sp = shipPlace(view, p.seat);
    nodes.push(
      <Ship key={`ship-${p.seat}`} seatColor={seatColor} x={sp.x} z={sp.z} yaw={sp.yaw}>
        {p.ship.cargo.map((color, i) => (
          <ContainerPiece key={`cargo-${p.seat}-${i}`} color={color}
            x={Math.cos(sp.yaw) * (i - 2) * 0.62}
            z={-Math.sin(sp.yaw) * (i - 2) * 0.62}
            y={0.8} yaw={sp.yaw + Math.PI / 2} proto={proto} />
        ))}
      </Ship>,
    );
  }

  return (
    <group>
      {nodes}
      <TransferGhosts view={view} proto={proto} />
    </group>
  );
}

export function ContainerBoard({ view }: { view: ContainerView }) {
  const lastSeq = useRef(view.lastEvent.seq);
  useEffect(() => {
    if (view.lastEvent.seq === lastSeq.current) return;
    lastSeq.current = view.lastEvent.seq;
    const name = SFX_FOR_KIND[view.lastEvent.kind ?? ''];
    if (name) playSfx(name);
  }, [view.lastEvent.seq, view.lastEvent.kind]);

  const [statsSeat, setStatsSeat] = useState<number | null>(null);
  const [guide, setGuide] = useState(() => new URLSearchParams(location.search).has('guide'));
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // hold the auction outcome on screen for a beat after the piles clear
  const [auctionResult, setAuctionResult] = useState<{ seq: number; text: string } | null>(null);
  const hadDelivery = useRef(false);
  useEffect(() => {
    const has = !!view.delivery;
    if (hadDelivery.current && !has && /WINS THE DELIVERY|BUYS OUT THE DELIVERY/.test(view.lastEvent.text)) {
      setAuctionResult({ seq: view.lastEvent.seq, text: view.lastEvent.text });
      const t = setTimeout(() => setAuctionResult(null), 5200);
      hadDelivery.current = has;
      return () => clearTimeout(t);
    }
    hadDelivery.current = has;
  }, [view.delivery, view.lastEvent.seq, view.lastEvent.text]);

  const focus = useMemo<RFocus | null>(() => {
    const f = view.lastEvent.focus as ContFocus | null | undefined;
    if (!f) return null;
    let at: [number, number] | null = null;
    let tight = false;
    if (f.type === 'board') {
      if (f.sub) { at = boardSpot(view.players[f.seat].color, subSpot(f.sub)); tight = true; }
      else at = w2r(S.boards[view.players[f.seat].color].pos[0], S.boards[view.players[f.seat].color].pos[1]);
    } else if (f.type === 'ship') { const sp = shipPlace(view, f.seat); at = [sp.x, sp.z]; }
    else if (f.type === 'island') at = islandCenterR();
    else if (f.type === 'bank') at = bankCenterR();
    return at ? { seq: view.lastEvent.seq, x: at[0], z: at[1], tight } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.lastEvent.seq]);

  return (
    <div className="cont-board" data-testid="cont-board" aria-label="Container shared board">
      <Canvas shadows="soft" dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        camera={{ fov: 40, near: 0.1, far: 320, position: [0, 52, 44] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        style={{ background: '#05070c' }}>
        <color attach="background" args={['#05070c']} />
        <hemisphereLight intensity={0.6} color="#cdd8e8" groundColor="#0d1018" />
        <directionalLight position={[26, 48, 30]} intensity={2.0} color="#f2ecdd" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-left={-52} shadow-camera-right={52}
          shadow-camera-top={52} shadow-camera-bottom={-52}
          shadow-bias={-0.0002} />
        <pointLight position={[-30, 24, -22]} intensity={90} distance={140} decay={2} color="#8aa4cc" />
        <WaterMat />
        <PlayerBoards seats={view.players.map((p) => p.color)} />
        <Pieces view={view} />
        <FocusRing focus={focus}
          color={CONT_UI_HEX[view.players[view.turn]?.color] ?? '#e8b450'} />
        {new URLSearchParams(location.search).get('cam') ? (
          <CamOverride />
        ) : (
          <>
            <OrbitControls ref={controlsRef} makeDefault enablePan={false} minDistance={16} maxDistance={110}
              maxPolarAngle={Math.PI * 0.42} enableDamping dampingFactor={0.08}
              target={[0, 0, 2]} />
            <FocusFly focus={focus} controls={controlsRef} />
          </>
        )}
      </Canvas>

      {/* seat chips: public info only (cash is secret in Container) */}
      <div className="cont-hud-top">
        {view.players.map((p) => {
          const hex = CONT_UI_HEX[p.color];
          const active = view.phase === 'playing' && view.turn === p.seat;
          return (
            <button key={p.seat}
              className={'ig-glass cont-seat' + (active ? ' active' : '')}
              style={{ borderColor: hex }}
              onClick={() => setStatsSeat(p.seat)}>
              {active && <span className="cont-seat-turn">{view.delivery ? 'AUCTION' : 'ACTING'}</span>}
              <span className="cont-seat-name">{p.name.toUpperCase()}</span>
              <span className="cont-seat-sub">
                {view.phase === 'ended' && p.finalScore
                  ? `$${p.finalScore.total}`
                  : `SHIP ${p.ship.cargo.length}/5 · ISLAND ${p.scoring.length}${p.loans ? ` · LOANS ${p.loans}` : ''}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* supply counter: containers (the end trigger), factories, warehouses */}
      <div className="cont-supply ig-glass">
        <div className="cont-supply-line">
          <em>CONTAINERS</em>
          {CONT_COLORS.map((c) => (
            <span key={c} className={'cont-supply-chip' + (view.supply.containers[c] === 0 ? ' out' : '')}>
              <i style={{ background: { Blue: '#3d6fd0', White: '#e8e5da', Yellow: '#e3c93e', Red: '#cf4837', Green: '#4da84f' }[c] }} />
              {view.supply.containers[c]}
            </span>
          ))}
        </div>
        <div className="cont-supply-line">
          <em>FACTORIES</em>
          {CONT_COLORS.map((c) => (
            <span key={c} className={'cont-supply-chip' + (view.supply.factories[c] === 0 ? ' out' : '')}>
              <img src={S.factoryArt[c].img} alt="" />
              {view.supply.factories[c]}
            </span>
          ))}
          <em>WAREHOUSES</em>
          <span className={'cont-supply-chip' + (view.supply.warehouses === 0 ? ' out' : '')}>
            <img src={S.warehouseArt.img} alt="" />
            {view.supply.warehouses}
          </span>
        </div>
      </div>

      {/* turn narration banner (+ anchor-action explainer when docking) */}
      <div className="cont-banner ig-glass" key={view.lastEvent.seq} role="status" aria-live="polite">
        <span>{view.lastEvent.text}</span>
        {anchorNoteFor(view.lastEvent.text) && (
          <small className="cont-anchor-note">{anchorNoteFor(view.lastEvent.text)}</small>
        )}
      </div>

      {/* standing anchor reminder while a free harbor purchase is open */}
      {view.anchorBuy && !view.delivery && view.phase === 'playing' && (() => {
        const tp = view.players[view.turn];
        const loc = tp?.ship.loc;
        if (!tp || loc?.kind !== 'harbor') return null;
        return (
          <div className="cont-anchor-chip ig-glass">
            ⚓ {tp.name.toUpperCase()} HAS A FREE PURCHASE AT {view.players[loc.seat].name.toUpperCase()}'S HARBOR
          </div>
        );
      })()}

      {/* delivery auction: the card piles, the flip, the totals */}
      {view.delivery && <AuctionPanel view={view} />}

      {/* auction outcome flash once the piles clear */}
      {auctionResult && (
        <div className="cont-auction-result ig-glass" key={auctionResult.seq}>
          <span>AUCTION CONCLUDED</span>
          <b>{auctionResult.text}</b>
        </div>
      )}

      {/* seat detail modal */}
      {statsSeat !== null && view.players[statsSeat] && (() => {
        const p = view.players[statsSeat];
        return (
          <div className="ig-modal" onClick={() => setStatsSeat(null)}>
            <div className="ig-modal-card ig-glass cont-stats-modal" onClick={(e) => e.stopPropagation()}
              style={{ borderColor: CONT_UI_HEX[p.color] }}>
              <div className="ig-modal-head">
                <span className="ig-prompt-ring" style={{ borderColor: CONT_UI_HEX[p.color] }} />
                <b>{p.name.toUpperCase()}</b>
                <button className="ig-modal-x" onClick={() => setStatsSeat(null)}>✕</button>
              </div>
              <div className="cont-stats-grid">
                <div>FACTORIES · {p.factories.map((c) => c.toUpperCase()).join(' ') || 'NONE'}</div>
                <div>WAREHOUSES · {p.warehouses}</div>
                <div>FACTORY STOCK · {contLotCount(p.factoryLots)} / {p.factories.length * CONT_RULES.factoryLimitPer}</div>
                <div>HARBOR STOCK · {contLotCount(p.harborLots)} / {p.warehouses}</div>
                <div>SHIP · {p.ship.loc.kind.toUpperCase()} · {p.ship.cargo.length}/5</div>
                <div>ISLAND · {p.scoring.length} · HOLDING · {p.holding.length}</div>
                <div>LOANS · {p.loans}</div>
                <div>CASH · {p.cash === null ? 'SECRET' : `$${p.cash}`}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* host guide toggle: labels every region of the table */}
      <button className={'ig-glass cont-guide-toggle' + (guide ? ' on' : '')}
        onClick={() => setGuide((g) => !g)}>
        {guide ? 'HIDE GUIDE' : 'EXPLAIN THE BOARD'}
      </button>

      {guide && view.phase !== 'ended' && (
        <>
          <div className="cont-guide-note ig-glass" style={{ top: 84, left: '50%', transform: 'translateX(-50%)' }}>
            <b>THE COMPANIES</b>
            <span>Each chip: ship load, island containers, loans. Cash is SECRET in Container, even here. Tap a chip for full public stats.</span>
          </div>
          <div className="cont-guide-note ig-glass" style={{ top: 96, right: 12 }}>
            <b>THE SUPPLY, AND THE CLOCK</b>
            <span>Containers, factories, and warehouses left. When TWO container colors hit zero, the current turn finishes and the game ends.</span>
          </div>
          <div className="cont-guide-note ig-glass" style={{ bottom: 110, left: '50%', transform: 'translateX(-50%)' }}>
            <b>THE NARRATOR</b>
            <span>Every action is called out here, and the camera flies to where it happened with a pulsing ring.</span>
          </div>
          <div className="cont-guide-panel ig-glass">
            <h3>THE TABLE, REGION BY REGION</h3>
            <div className="goal">
              Most money wins. Cash stays hidden in hand; at the end it is joined by each
              player's island containers, valued by their SECRET scoring card, minus loans.
              The whole game is making the other players want your containers.
            </div>
            {[
              ['CONTAINER ISLAND · LEFT', 'Five colored hexes, one scoring area per company. Delivering a ship here auctions its cargo: everyone else bids secret cash, the deliverer collects the bid doubled, and the containers land in the winner\'s hex to score at the end.'],
              ['THE OFF-SHORE BANK · RIGHT', 'Three container lots (top squares) and three cash slots (bottom) that players auction against each other. The colored hexes are per-company holding areas for auction winnings, picked up later by ship. The loan deck sits beside it: $10 out, $1 interest per turn, $11 to settle.'],
              ['THE HARBOR BOARDS · EDGES', 'One per company. The green half is its factory district: factories on the track, containers priced $1 to $4. The pale half is its harbor: warehouses, containers priced $2 to $6, and the notched docks where rival ships tie up to buy.'],
              ['THE SUPPLY PILES · TOP', 'The shared stock of containers by color, spare factories, and warehouses. Producing drains it; when two colors run dry the game ends.'],
              ['THE OCEAN', 'Ships sail from any board to the open water, then onward to a rival harbor, the Bank, or Container Island. A ship never enters its own harbor: your goods must be bought by someone else.'],
              ['THE BID TILES + TOKENS', 'The two tiles near the Bank hold the current auction bids: cash on the ship tile, containers on the district tile. The round tokens mark which Bank lot is under auction.'],
            ].map(([t, d]) => (
              <div key={t} className="cont-guide-region">
                <b>{t}</b>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* end overlay */}
      {view.phase === 'ended' && (
        <div className="cont-end" role="alert">
          <div className="cont-end-title">
            {view.winners.map((w) => view.players[w].name.toUpperCase()).join(' · ')} WIN{view.winners.length === 1 ? 'S' : ''}
          </div>
          <div className="cont-end-scores">
            {[...view.players].sort((a, b) => (b.finalScore?.total ?? 0) - (a.finalScore?.total ?? 0)).map((p) => (
              <div key={p.seat} className="cont-end-row ig-glass" style={{ borderColor: CONT_UI_HEX[p.color] }}>
                <b>{p.name.toUpperCase()}</b>
                <span>${p.finalScore?.total ?? 0}</span>
                {p.finalScore && (
                  <small>
                    CASH {p.finalScore.cash} · ISLAND {p.finalScore.island} · LEFTOVERS {p.finalScore.leftovers}
                    {p.finalScore.loans !== 0 ? ` · LOANS ${p.finalScore.loans}` : ''}
                    {p.finalScore.discarded ? ` · DISCARDED ${p.finalScore.discarded.toUpperCase()}` : ''}
                  </small>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
