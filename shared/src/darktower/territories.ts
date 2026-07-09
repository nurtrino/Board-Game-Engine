// Dark Tower territory graph — generated from games/dark-tower/golden/territories.json
// by tools/tts-extract/extract-dt-territories.mjs (segmented from the board art).
// Do not edit by hand; regenerate and re-run the emit in that tool's notes.
import type { DtSeat } from './state.js';

export type DtNodeKind = 'empty' | 'tomb' | 'ruin' | 'bazaar' | 'sanctuary' | 'citadel' | 'darktower' | 'frontier';
export interface DtNode { id: string; kind: DtNodeKind; kingdom: DtSeat | null; wx: number; wz: number; }

export const DT_NODES: DtNode[] = [
  { id: "t0", kind: "darktower", kingdom: "Yellow", wx: 0.43, wz: 0.47 },
  { id: "t1", kind: "empty", kingdom: "Yellow", wx: 1.41, wz: 10.77 },
  { id: "t2", kind: "empty", kingdom: "Yellow", wx: 3.27, wz: 10.25 },
  { id: "t3", kind: "empty", kingdom: "Yellow", wx: -3.51, wz: 10.52 },
  { id: "t4", kind: "sanctuary", kingdom: "Yellow", wx: -5.31, wz: 9.95 },
  { id: "t5", kind: "empty", kingdom: "Yellow", wx: 4.65, wz: 9.54 },
  { id: "t6", kind: "citadel", kingdom: "Yellow", wx: -1.06, wz: 9.41 },
  { id: "t7", kind: "empty", kingdom: "Yellow", wx: 0.63, wz: 8.62 },
  { id: "t8", kind: "tomb", kingdom: "Yellow", wx: 2.4, wz: 8.9 },
  { id: "t9", kind: "empty", kingdom: "Yellow", wx: -3.63, wz: 9.06 },
  { id: "t10", kind: "empty", kingdom: "Yellow", wx: 4.3, wz: 8.24 },
  { id: "t11", kind: "empty", kingdom: "Yellow", wx: -1.39, wz: 8.12 },
  { id: "t12", kind: "ruin", kingdom: "Yellow", wx: -4, wz: 7.68 },
  { id: "t13", kind: "empty", kingdom: "Yellow", wx: 6.4, wz: 6.97 },
  { id: "t14", kind: "empty", kingdom: "Green", wx: -7.69, wz: 7.11 },
  { id: "t15", kind: "empty", kingdom: "Yellow", wx: -2.7, wz: 6.62 },
  { id: "t16", kind: "empty", kingdom: "Yellow", wx: -5.63, wz: 6.94 },
  { id: "t17", kind: "bazaar", kingdom: "Yellow", wx: -0.61, wz: 6.55 },
  { id: "t18", kind: "ruin", kingdom: "Blue", wx: 9.07, wz: 4.98 },
  { id: "t19", kind: "empty", kingdom: "Yellow", wx: 4.27, wz: 4.8 },
  { id: "t20", kind: "empty", kingdom: "Green", wx: -5.28, wz: 4.91 },
  { id: "t21", kind: "empty", kingdom: "Yellow", wx: -2.5, wz: 4.94 },
  { id: "t22", kind: "empty", kingdom: "Yellow", wx: -0.7, wz: 5.06 },
  { id: "t23", kind: "empty", kingdom: "Green", wx: -6.37, wz: 2.83 },
  { id: "t24", kind: "tomb", kingdom: "Green", wx: -8.17, wz: 2.8 },
  { id: "t25", kind: "empty", kingdom: "Green", wx: -9.83, wz: 2.34 },
  { id: "t26", kind: "empty", kingdom: "Yellow", wx: -0.56, wz: 2.33 },
  { id: "t27", kind: "empty", kingdom: "Blue", wx: 3.97, wz: 1.68 },
  { id: "t28", kind: "empty", kingdom: "Green", wx: -2.5, wz: 1.95 },
  { id: "t29", kind: "sanctuary", kingdom: "Blue", wx: 7.68, wz: 1.31 },
  { id: "t30", kind: "citadel", kingdom: "Blue", wx: 10.3, wz: 0.64 },
  { id: "t31", kind: "darktower", kingdom: "Blue", wx: 1.83, wz: -0.03 },
  { id: "t32", kind: "darktower", kingdom: "Green", wx: -2.76, wz: -0.13 },
  { id: "t33", kind: "bazaar", kingdom: "Blue", wx: 6.78, wz: 0.54 },
  { id: "t34", kind: "bazaar", kingdom: "Green", wx: -6.56, wz: 0 },
  { id: "t35", kind: "empty", kingdom: "Blue", wx: 5.72, wz: -0.28 },
  { id: "t36", kind: "citadel", kingdom: "Green", wx: -8.55, wz: -0.19 },
  { id: "t37", kind: "empty", kingdom: "Green", wx: -7.53, wz: -0.61 },
  { id: "t38", kind: "empty", kingdom: "Blue", wx: 4.39, wz: -0.29 },
  { id: "t39", kind: "empty", kingdom: "Blue", wx: 7.73, wz: -1.69 },
  { id: "t40", kind: "empty", kingdom: "Blue", wx: 10.21, wz: -1.36 },
  { id: "t41", kind: "empty", kingdom: "Green", wx: -2.54, wz: -2.25 },
  { id: "t42", kind: "empty", kingdom: "Red", wx: 1.58, wz: -2.32 },
  { id: "t43", kind: "darktower", kingdom: "Red", wx: -0.36, wz: -2.38 },
  { id: "t44", kind: "empty", kingdom: "Green", wx: -8.28, wz: -2.52 },
  { id: "t45", kind: "empty", kingdom: "Blue", wx: 9.5, wz: -2.71 },
  { id: "t46", kind: "ruin", kingdom: "Green", wx: -7.09, wz: -2.98 },
  { id: "t47", kind: "empty", kingdom: "Blue", wx: 6.36, wz: -3.01 },
  { id: "t48", kind: "empty", kingdom: "Green", wx: -10.49, wz: -4.59 },
  { id: "t49", kind: "empty", kingdom: "Blue", wx: 7.83, wz: -3.58 },
  { id: "t50", kind: "tomb", kingdom: "Blue", wx: 9.15, wz: -4.24 },
  { id: "t51", kind: "sanctuary", kingdom: "Green", wx: -9.44, wz: -4.09 },
  { id: "t52", kind: "empty", kingdom: "Red", wx: -2.84, wz: -4.55 },
  { id: "t53", kind: "empty", kingdom: "Blue", wx: 6.23, wz: -4.43 },
  { id: "t54", kind: "empty", kingdom: "Red", wx: 6.03, wz: -6.26 },
  { id: "t55", kind: "empty", kingdom: "Green", wx: -6.64, wz: -6.35 },
  { id: "t56", kind: "empty", kingdom: "Blue", wx: 7.42, wz: -5.31 },
  { id: "t57", kind: "empty", kingdom: "Red", wx: -1.45, wz: -5.11 },
  { id: "t58", kind: "bazaar", kingdom: "Red", wx: -2.07, wz: -6.45 },
  { id: "t59", kind: "empty", kingdom: "Red", wx: 2.4, wz: -6.5 },
  { id: "t60", kind: "empty", kingdom: "Red", wx: -3.39, wz: -7.59 },
  { id: "t61", kind: "empty", kingdom: "Red", wx: -0.01, wz: -7.2 },
  { id: "t62", kind: "ruin", kingdom: "Red", wx: 3.53, wz: -7.52 },
  { id: "t63", kind: "empty", kingdom: "Red", wx: 1.72, wz: -7.87 },
  { id: "t64", kind: "empty", kingdom: "Red", wx: -6.23, wz: -7.83 },
  { id: "t65", kind: "empty", kingdom: "Red", wx: 3.31, wz: -8.97 },
  { id: "t66", kind: "empty", kingdom: "Red", wx: -2.25, wz: -9.17 },
  { id: "t67", kind: "empty", kingdom: "Red", wx: 1.19, wz: -9.97 },
  { id: "t68", kind: "tomb", kingdom: "Red", wx: -4.92, wz: -10.41 },
  { id: "t69", kind: "empty", kingdom: "Red", wx: -3.02, wz: -10.55 },
  { id: "t70", kind: "sanctuary", kingdom: "Red", wx: 4.4, wz: -10.19 },
  { id: "t71", kind: "empty", kingdom: "Red", wx: 2.01, wz: -10.89 },
  { id: "t72", kind: "citadel", kingdom: "Red", wx: -0.92, wz: -11.12 },
  { id: "f0", kind: "frontier", kingdom: null, wx: 5.36, wz: -5.81 },
  { id: "f1", kind: "frontier", kingdom: null, wx: -6.33, wz: -5.79 },
  { id: "f2", kind: "frontier", kingdom: null, wx: -5.98, wz: 5.41 },
  { id: "f3", kind: "frontier", kingdom: null, wx: 5.31, wz: 5.51 },
];
export const DT_EDGES: [string, string][] = [["t0","t1"], ["t0","t3"], ["t0","t2"], ["t1","t2"], ["t0","t6"], ["t3","t6"], ["t1","t6"], ["t0","t4"], ["t3","t4"], ["t0","t5"], ["t2","t5"], ["t1","t7"], ["t6","t7"], ["t1","t8"], ["t3","t9"], ["t4","t9"], ["t6","t9"], ["t7","t8"], ["t2","t8"], ["t10","t2"], ["t10","t5"], ["t10","t8"], ["t11","t6"], ["t11","t9"], ["t0","t13"], ["t12","t9"], ["t13","t5"], ["t11","t7"], ["t11","t12"], ["t10","t13"], ["t12","t16"], ["t12","t15"], ["t11","t15"], ["t17","t7"], ["t11","t17"], ["t15","t17"], ["t17","t8"], ["t13","t8"], ["t19","t8"], ["t17","t21"], ["t15","t21"], ["t17","t22"], ["t17","t19"], ["t21","t22"], ["t13","t19"], ["t14","t20"], ["t14","t24"], ["t19","t22"], ["t24","t25"], ["t20","t23"], ["t18","t29"], ["t22","t26"], ["t19","t26"], ["t23","t24"], ["t21","t26"], ["t27","t29"], ["t18","t30"], ["t20","t28"], ["t29","t35"], ["t27","t35"], ["t27","t31"], ["t29","t30"], ["t23","t28"], ["t29","t33"], ["t33","t35"], ["t28","t32"], ["t23","t32"], ["t24","t34"], ["t23","t34"], ["t32","t34"], ["t25","t36"], ["t24","t36"], ["t24","t37"], ["t34","t37"], ["t36","t37"], ["t27","t38"], ["t35","t38"], ["t31","t38"], ["t30","t39"], ["t29","t39"], ["t30","t40"], ["t33","t39"], ["t39","t40"], ["t32","t41"], ["t36","t48"], ["t42","t43"], ["t35","t39"], ["t36","t44"], ["t37","t44"], ["t37","t46"], ["t39","t45"], ["t34","t46"], ["t40","t45"], ["t44","t48"], ["t44","t46"], ["t44","t51"], ["t48","t51"], ["t35","t47"], ["t39","t47"], ["t32","t46"], ["t38","t47"], ["t41","t46"], ["t39","t49"], ["t45","t49"], ["t41","t55"], ["t42","t54"], ["t46","t55"], ["t47","t49"], ["t45","t50"], ["t49","t50"], ["t43","t52"], ["t47","t53"], ["t49","t53"], ["t43","t57"], ["t52","t57"], ["t46","t51"], ["t49","t56"], ["t53","t56"], ["t42","t59"], ["t54","t59"], ["t43","t59"], ["t43","t61"], ["t50","t56"], ["t59","t61"], ["t57","t61"], ["t57","t58"], ["t52","t58"], ["t51","t55"], ["t52","t60"], ["t58","t60"], ["t58","t61"], ["t54","t62"], ["t59","t62"], ["t60","t64"], ["t48","t55"], ["t61","t63"], ["t59","t63"], ["t62","t63"], ["t60","t61"], ["t62","t65"], ["t60","t66"], ["t61","t66"], ["t54","t65"], ["t63","t65"], ["t61","t67"], ["t63","t67"], ["t64","t68"], ["t60","t68"], ["t65","t67"], ["t66","t68"], ["t66","t72"], ["t66","t67"], ["t67","t72"], ["t65","t70"], ["t66","t69"], ["t68","t69"], ["t65","t71"], ["t67","t71"], ["t70","t71"], ["t69","t72"], ["t71","t72"], ["f0","t42"], ["f0","t54"], ["f0","t59"], ["f0","t62"], ["f0","t65"], ["f0","t70"], ["f0","t47"], ["f0","t53"], ["f0","t56"], ["f0","t50"], ["f1","t32"], ["f1","t41"], ["f1","t55"], ["f1","t46"], ["f1","t51"], ["f1","t48"], ["f1","t52"], ["f1","t60"], ["f1","t64"], ["f1","t68"], ["f2","t0"], ["f2","t4"], ["f2","t9"], ["f2","t12"], ["f2","t16"], ["f2","t21"], ["f2","t14"], ["f2","t20"], ["f2","t24"], ["f2","t23"], ["f2","t28"], ["f2","t32"], ["f3","t18"], ["f3","t27"], ["f3","t31"], ["f3","t0"], ["f3","t5"], ["f3","t10"], ["f3","t13"], ["f3","t8"], ["f3","t19"], ["f3","t22"], ["f3","t26"]];

export const DT_NODE = new Map<string, DtNode>(DT_NODES.map((n) => [n.id, n]));
export const DT_ADJ = new Map<string, string[]>(DT_NODES.map((n) => [n.id, []]));
for (const [a, b] of DT_EDGES) { DT_ADJ.get(a)!.push(b); DT_ADJ.get(b)!.push(a); }
export const dtAdjacent = (id: string): string[] => DT_ADJ.get(id) ?? [];

// --- movement topology -----------------------------------------------------
// Kingdom-to-kingdom travel is one-way CCW (rulebook p19): a player leaves home
// into the first foreign kingdom "to the right" and circles back. Order:
// Arisilon(Red) -> Zenon(Green) -> Durnin(Yellow) -> Brynthia(Blue) -> home.
export const DT_KINGDOM_ORDER: DtSeat[] = ['Red', 'Green', 'Yellow', 'Blue'];
export const dtCcwNext = (k: DtSeat): DtSeat => DT_KINGDOM_ORDER[(DT_KINGDOM_ORDER.indexOf(k) + 1) % 4];
/** Which kingdom a player is in after `quad` frontier crossings from home. */
export const dtKingdomAt = (home: DtSeat, quad: number): DtSeat =>
  DT_KINGDOM_ORDER[(DT_KINGDOM_ORDER.indexOf(home) + Math.min(Math.max(quad, 0), 4)) % 4];

// each frontier connects two kingdoms; its CCW direction is from -> to.
export interface DtFrontierDir { from: DtSeat; to: DtSeat }
export const DT_FRONTIER_DIR = new Map<string, DtFrontierDir>();
for (const n of DT_NODES) {
  if (n.kind !== 'frontier') continue;
  const ks = [...new Set(dtAdjacent(n.id).map((id) => DT_NODE.get(id)!.kingdom).filter(Boolean))] as DtSeat[];
  const [a, b] = ks;
  DT_FRONTIER_DIR.set(n.id, dtCcwNext(a) === b ? { from: a, to: b } : { from: b, to: a });
}
/** The frontier a player in kingdom `k` crosses to advance (its `from` === k). */
export const DT_FORWARD_FRONTIER = new Map<DtSeat, string>();
for (const [fid, dir] of DT_FRONTIER_DIR) DT_FORWARD_FRONTIER.set(dir.from, fid);

export const DT_CITADEL_NODE = new Map<DtSeat, string>();
export const DT_DARKTOWER_NODE = new Map<DtSeat, string>();
for (const n of DT_NODES) {
  if (n.kind === 'citadel' && n.kingdom) DT_CITADEL_NODE.set(n.kingdom, n.id);
  if (n.kind === 'darktower' && n.kingdom) DT_DARKTOWER_NODE.set(n.kingdom, n.id);
}
