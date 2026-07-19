// Container scene data + coordinate helpers shared by the TV board and the
// device tableau. scene.json is written by tools/tts-extract/extract-container.mjs
// (mat affine fitted from the island hex rings; player-board calibration from
// the mod's own placed objects).

import scene from '../../public/container/scene.json';
import type { ContColor, ContainerSeat } from '@bge/shared';

export const CONT_SCENE = scene as unknown as ContScene;

export interface ContScene {
  mat: { img: string; px: [number, number]; transform: { ax: number; bx: number; az: number; bz: number } };
  boards: Record<string, { img: string; px: [number, number]; pos: [number, number]; yaw: number }>;
  pb: {
    px: [number, number]; s: number; cx: number; cy: number;
    factoryTrack: [number, number][];
    warehouseTrack: [number, number][];
    factoryLots: Record<string, [number, number]>;
    harborLots: Record<string, [number, number]>;
    docks: [number, number][];
  };
  models: { ship: { mesh: string; tex: string | null }; container: { mesh: string; tex: Record<string, string> } };
  shipTint: Record<string, string>;
  shipStarts: Record<string, [number, number]>;
  factoryArt: Record<string, { img: string; px: [number, number] }>;
  warehouseArt: { img: string; px: [number, number] };
  auctionTokenArt: { img: string; px: [number, number] };
  reserveTokenArt: { img: string; px: [number, number] };
  scoreDiscArt: { img: string; px: [number, number] };
  hexArt: Record<string, [number, number]>;
  bankLots: { containers: [number, number][]; cash: [number, number][] };
  supply: {
    containers: { z: [number, number]; xByColor: Record<string, number> };
    factories: { z: number; xByColor: Record<string, number> };
    warehouses: { z: number; x: [number, number] };
    bankSide: {
      loans: [number, number]; bidCash: [number, number]; bidContainers: [number, number];
      auctionTokens: [number, number][]; reserves: [number, number];
    };
  };
  cards: {
    money: Record<string, string>; bluff: string; loan: string;
    scoring: Record<string, string>; aid: string; bidCash: string; bidContainers: string;
  };
}

const { ax, bx, az, bz } = CONT_SCENE.mat.transform;
const [MW, MH] = CONT_SCENE.mat.px;

/** render-space (three.js) scale: x follows the fitted world scale; z is the
 * fitted |az| so the mat renders at its true fitted world footprint. */
export const RSX = ax;
export const RSZ = -az; // az < 0 (art top = world north)

/** mat art px -> render XZ (render z = -world z, the usual TTS mirror) */
export const px2r = (px: number, py: number): [number, number] => [
  (px - MW / 2) * RSX,
  (py - MH / 2) * RSZ,
];
/** TTS world XZ -> mat art px */
export const w2px = (wx: number, wz: number): [number, number] => [
  (wx - bx) / ax,
  (wz - bz) / az,
];
/** TTS world XZ -> render XZ */
export const w2r = (wx: number, wz: number): [number, number] => {
  const [px, py] = w2px(wx, wz);
  return px2r(px, py);
};
export const MAT_RW = MW * RSX;
export const MAT_RH = MH * RSZ;

/** board art px -> board-local world offset (brown-board frame) */
export const pb2local = (px: number, py: number): [number, number] => [
  -(px - CONT_SCENE.pb.cx) * CONT_SCENE.pb.s,
  (py - CONT_SCENE.pb.cy) * CONT_SCENE.pb.s,
];

/** rotate a board-local offset into world by the seat board's yaw */
export const yawRot = (yaw: number, [x, z]: [number, number]): [number, number] => {
  switch (((yaw % 360) + 360) % 360) {
    case 0: return [x, z];
    case 90: return [z, -x];
    case 180: return [-x, -z];
    default: return [-z, x]; // 270
  }
};

/** a spot on a seat's board (given in board art px) -> render XZ */
export const boardSpot = (seatColor: string, artPx: [number, number]): [number, number] => {
  const b = CONT_SCENE.boards[seatColor];
  const local = pb2local(artPx[0], artPx[1]);
  const [dx, dz] = yawRot(b.yaw, local);
  return w2r(b.pos[0] + dx, b.pos[1] + dz);
};

/** container piece colors (approximate the mod diffuse tones; DOM tableau) */
export const CONT_PIECE_HEX: Record<ContColor, string> = {
  Blue: '#3d6fd0', White: '#e8e5da', Yellow: '#e3c93e', Red: '#cf4837', Green: '#4da84f',
};

export const CONT_SEAT_ORDER: ContainerSeat[] = ['Brown', 'Pink', 'Teal', 'Purple', 'Orange'];

/** greedy money-card breakdown of an amount, capped for display */
export const moneyDenoms = (amount: number, cap = 9): number[] => {
  const out: number[] = [];
  let rest = amount;
  for (const d of [20, 10, 5, 2, 1]) while (rest >= d && out.length < cap) { out.push(d); rest -= d; }
  return out;
};

/** UI-legible seat hexes (the mod's Brown hand color is too dark for chips) */
export const CONT_UI_HEX: Record<ContainerSeat, string> = {
  Brown: '#8a5a33', Pink: '#f570ce', Teal: '#21b19b', Purple: '#b45cf0', Orange: '#f4641d',
};

/** island / bank focus anchors (render XZ), derived from the fitted hexes */
export const islandCenterR = (): [number, number] => {
  const pts = Object.entries(CONT_SCENE.hexArt).filter(([k]) => k.endsWith(':scoring')).map(([, v]) => v);
  const px = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const py = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return px2r(px, py);
};
export const bankCenterR = (): [number, number] => {
  const pts = Object.entries(CONT_SCENE.hexArt).filter(([k]) => k.endsWith(':holding')).map(([, v]) => v);
  const px = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const py = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return px2r(px, py);
};
