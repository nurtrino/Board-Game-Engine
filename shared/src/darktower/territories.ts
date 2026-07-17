// Dark Tower territory graph — generated from games/dark-tower/golden/territories.json
// by tools/tts-extract/extract-dt-territories.mjs (segmented from the board art).
// Do not edit by hand; regenerate and re-run the emit in that tool's notes.
import type { DtSeat } from './state.js';

export type DtNodeKind = 'empty' | 'tomb' | 'ruin' | 'bazaar' | 'sanctuary' | 'citadel' | 'darktower' | 'frontier';
export interface DtNode { id: string; kind: DtNodeKind; kingdom: DtSeat | null; wx: number; wz: number; }

export const DT_NODES: DtNode[] = [
  { id: "t0", kind: "darktower", kingdom: "Green", wx: -0.47, wz: 0.05 },
  { id: "t1", kind: "empty", kingdom: "Blue", wx: 6.01, wz: 4.76 },
  { id: "t2", kind: "citadel", kingdom: "Yellow", wx: 0.75, wz: 11.19 },
  { id: "t3", kind: "empty", kingdom: "Yellow", wx: 1.81, wz: 10.72 },
  { id: "t4", kind: "empty", kingdom: "Yellow", wx: 3.24, wz: 10.29 },
  { id: "t5", kind: "empty", kingdom: "Green", wx: -10.64, wz: 4.86 },
  { id: "t6", kind: "empty", kingdom: "Yellow", wx: 0.56, wz: 9.87 },
  { id: "t7", kind: "empty", kingdom: "Yellow", wx: -1.01, wz: 9.31 },
  { id: "t8", kind: "empty", kingdom: "Yellow", wx: 4.53, wz: 9.34 },
  { id: "t9", kind: "tomb", kingdom: "Yellow", wx: 2.47, wz: 8.88 },
  { id: "t10", kind: "sanctuary", kingdom: "Yellow", wx: -3.55, wz: 9.1 },
  { id: "t11", kind: "empty", kingdom: "Yellow", wx: 0.63, wz: 8.54 },
  { id: "t12", kind: "empty", kingdom: "Yellow", wx: 4.32, wz: 8.2 },
  { id: "t13", kind: "empty", kingdom: "Yellow", wx: -1.62, wz: 8.02 },
  { id: "t14", kind: "ruin", kingdom: "Yellow", wx: -4.14, wz: 7.67 },
  { id: "t15", kind: "empty", kingdom: "Green", wx: -7.77, wz: 7.19 },
  { id: "t16", kind: "empty", kingdom: "Yellow", wx: 3.54, wz: 7.1 },
  { id: "t17", kind: "empty", kingdom: "Yellow", wx: -5.65, wz: 7.03 },
  { id: "t18", kind: "bazaar", kingdom: "Yellow", wx: -0.58, wz: 6.51 },
  { id: "t19", kind: "empty", kingdom: "Yellow", wx: -2.89, wz: 6.92 },
  { id: "t20", kind: "empty", kingdom: "Yellow", wx: 6.15, wz: 6.65 },
  { id: "t21", kind: "empty", kingdom: "Yellow", wx: 1.81, wz: 5.82 },
  { id: "t22", kind: "empty", kingdom: "Yellow", wx: -2.86, wz: 6.02 },
  { id: "t23", kind: "empty", kingdom: "Yellow", wx: 4.79, wz: 5.39 },
  { id: "t24", kind: "empty", kingdom: "Green", wx: -5.33, wz: 4.96 },
  { id: "t25", kind: "empty", kingdom: "Yellow", wx: -0.8, wz: 5.07 },
  { id: "t26", kind: "empty", kingdom: "Yellow", wx: 2.85, wz: 5.03 },
  { id: "t27", kind: "empty", kingdom: "Yellow", wx: 1.07, wz: 4.81 },
  { id: "t28", kind: "empty", kingdom: "Green", wx: -9.65, wz: 4.31 },
  { id: "t29", kind: "tomb", kingdom: "Green", wx: -8.1, wz: 4.41 },
  { id: "t30", kind: "ruin", kingdom: "Blue", wx: 7.26, wz: 3.88 },
  { id: "t31", kind: "empty", kingdom: "Yellow", wx: -2.12, wz: 3.57 },
  { id: "t32", kind: "empty", kingdom: "Green", wx: -6.18, wz: 2.75 },
  { id: "t33", kind: "darktower", kingdom: "Yellow", wx: -0.6, wz: 2.31 },
  { id: "t34", kind: "empty", kingdom: "Green", wx: -11.43, wz: 1.63 },
  { id: "t35", kind: "empty", kingdom: "Blue", wx: 3.73, wz: 1.87 },
  { id: "t36", kind: "empty", kingdom: "Yellow", wx: 1.45, wz: 2.06 },
  { id: "t37", kind: "empty", kingdom: "Green", wx: -2.51, wz: 1.96 },
  { id: "t38", kind: "empty", kingdom: "Blue", wx: 3.11, wz: 1.38 },
  { id: "t39", kind: "sanctuary", kingdom: "Blue", wx: 10.36, wz: 1.64 },
  { id: "t40", kind: "darktower", kingdom: "Blue", wx: 1.78, wz: -0.02 },
  { id: "t41", kind: "empty", kingdom: "Blue", wx: 8.92, wz: 0.64 },
  { id: "t42", kind: "empty", kingdom: "Green", wx: -2.75, wz: -0.1 },
  { id: "t43", kind: "empty", kingdom: "Green", wx: -9.4, wz: 1.18 },
  { id: "t44", kind: "bazaar", kingdom: "Blue", wx: 6.79, wz: 0.47 },
  { id: "t45", kind: "bazaar", kingdom: "Green", wx: -6.62, wz: -0.04 },
  { id: "t46", kind: "empty", kingdom: "Blue", wx: 5.7, wz: -0.09 },
  { id: "t47", kind: "empty", kingdom: "Green", wx: -8.55, wz: -0.21 },
  { id: "t48", kind: "empty", kingdom: "Green", wx: -7.54, wz: -0.47 },
  { id: "t49", kind: "citadel", kingdom: "Green", wx: -9.85, wz: -0.15 },
  { id: "t50", kind: "citadel", kingdom: "Blue", wx: 10.28, wz: -0.13 },
  { id: "t51", kind: "empty", kingdom: "Blue", wx: 4.41, wz: -0.28 },
  { id: "t52", kind: "empty", kingdom: "Blue", wx: 2.84, wz: -1.69 },
  { id: "t53", kind: "empty", kingdom: "Green", wx: -3.95, wz: -1.61 },
  { id: "t54", kind: "empty", kingdom: "Blue", wx: 10.11, wz: -1.39 },
  { id: "t55", kind: "tomb", kingdom: "Blue", wx: 8.37, wz: -1.5 },
  { id: "t56", kind: "empty", kingdom: "Red", wx: 1.58, wz: -2.31 },
  { id: "t57", kind: "empty", kingdom: "Green", wx: -4.87, wz: -1.97 },
  { id: "t58", kind: "empty", kingdom: "Blue", wx: 6.75, wz: -1.83 },
  { id: "t59", kind: "darktower", kingdom: "Red", wx: -0.38, wz: -2.36 },
  { id: "t60", kind: "empty", kingdom: "Green", wx: -5.94, wz: -2.09 },
  { id: "t61", kind: "empty", kingdom: "Green", wx: -8.35, wz: -2.43 },
  { id: "t62", kind: "empty", kingdom: "Green", wx: -2.7, wz: -2.43 },
  { id: "t63", kind: "empty", kingdom: "Blue", wx: 6.37, wz: -2.94 },
  { id: "t64", kind: "empty", kingdom: "Green", wx: -10.55, wz: -3.61 },
  { id: "t65", kind: "ruin", kingdom: "Green", wx: -5.55, wz: -3.2 },
  { id: "t66", kind: "empty", kingdom: "Red", wx: 1.12, wz: -3.71 },
  { id: "t67", kind: "empty", kingdom: "Green", wx: -8.45, wz: -4.21 },
  { id: "t68", kind: "empty", kingdom: "Blue", wx: 6.1, wz: -4.14 },
  { id: "t69", kind: "empty", kingdom: "Green", wx: -11.5, wz: -4.7 },
  { id: "t70", kind: "empty", kingdom: "Red", wx: 1.46, wz: -4.4 },
  { id: "t71", kind: "sanctuary", kingdom: "Green", wx: -9.39, wz: -4.48 },
  { id: "t72", kind: "empty", kingdom: "Green", wx: -5.63, wz: -5.29 },
  { id: "t73", kind: "empty", kingdom: "Red", wx: 2.6, wz: -4.79 },
  { id: "t74", kind: "empty", kingdom: "Red", wx: 4.65, wz: -5.17 },
  { id: "t75", kind: "empty", kingdom: "Red", wx: -1.32, wz: -4.94 },
  { id: "t76", kind: "empty", kingdom: "Red", wx: 1.34, wz: -5.38 },
  { id: "t77", kind: "empty", kingdom: "Blue", wx: 6.03, wz: -5.85 },
  { id: "t78", kind: "empty", kingdom: "Red", wx: -2.71, wz: -10.6 },
  { id: "t79", kind: "bazaar", kingdom: "Red", wx: -1.88, wz: -6.38 },
  { id: "t80", kind: "empty", kingdom: "Green", wx: -7.56, wz: -7.26 },
  { id: "t81", kind: "ruin", kingdom: "Red", wx: 2.41, wz: -6.52 },
  { id: "t82", kind: "empty", kingdom: "Red", wx: 7.01, wz: -7.14 },
  { id: "t83", kind: "empty", kingdom: "Red", wx: -0.09, wz: -7.24 },
  { id: "t84", kind: "empty", kingdom: "Red", wx: 3.82, wz: -7.57 },
  { id: "t85", kind: "empty", kingdom: "Red", wx: -6.52, wz: -8.07 },
  { id: "t86", kind: "empty", kingdom: "Red", wx: -1.92, wz: -8.59 },
  { id: "t87", kind: "sanctuary", kingdom: "Red", wx: 6.01, wz: -8.57 },
  { id: "t88", kind: "empty", kingdom: "Red", wx: -1.04, wz: -8.54 },
  { id: "t89", kind: "tomb", kingdom: "Red", wx: -4.92, wz: -8.97 },
  { id: "t90", kind: "empty", kingdom: "Red", wx: 0.58, wz: -9.07 },
  { id: "t91", kind: "empty", kingdom: "Red", wx: -0.64, wz: -9.61 },
  { id: "t92", kind: "empty", kingdom: "Red", wx: 6.55, wz: -9.76 },
  { id: "t93", kind: "empty", kingdom: "Red", wx: 1.1, wz: -10.03 },
  { id: "t94", kind: "empty", kingdom: "Red", wx: -1.73, wz: -11.07 },
  { id: "t95", kind: "citadel", kingdom: "Red", wx: -0.07, wz: -11.19 },
  { id: "t96", kind: "empty", kingdom: "Red", wx: 1.04, wz: -11.17 },
  { id: "f0", kind: "frontier", kingdom: null, wx: 5.47, wz: -6.12 },
  { id: "f1", kind: "frontier", kingdom: null, wx: -6.38, wz: -5.87 },
  { id: "f2", kind: "frontier", kingdom: null, wx: -6.51, wz: 5.73 },
  { id: "f3", kind: "frontier", kingdom: null, wx: 5.93, wz: 5.35 },
];
export const DT_EDGES: [string, string][] = [["t2", "t3"], ["t3", "t4"], ["t2", "t7"], ["t2", "t6"], ["t3", "t6"], ["t6", "t7"], ["t3", "t9"], ["t6", "t9"], ["t4", "t8"], ["t10", "t7"], ["t4", "t9"], ["t11", "t6"], ["t11", "t7"], ["t12", "t4"], ["t12", "t8"], ["t12", "t9"], ["t11", "t9"], ["t13", "t7"], ["t10", "t14"], ["t11", "t13"], ["t14", "t17"], ["t11", "t18"], ["t13", "t19"], ["t13", "t18"], ["t18", "t19"], ["t14", "t19"], ["t19", "t22"], ["t18", "t21"], ["t21", "t26"], ["t18", "t22"], ["t18", "t25"], ["t22", "t25"], ["t18", "t27"], ["t21", "t27"], ["t25", "t27"], ["t26", "t27"], ["t25", "t31"], ["t27", "t33"], ["t25", "t33"], ["t31", "t33"], ["t27", "t36"], ["t33", "t36"], ["t35", "t38"], ["t34", "t5"], ["t38", "t40"], ["t1", "t39"], ["t34", "t43"], ["t37", "t42"], ["t39", "t41"], ["t32", "t45"], ["t41", "t44"], ["t43", "t45"], ["t44", "t46"], ["t35", "t46"], ["t43", "t48"], ["t45", "t48"], ["t35", "t51"], ["t43", "t47"], ["t46", "t51"], ["t42", "t45"], ["t39", "t50"], ["t41", "t50"], ["t43", "t49"], ["t47", "t48"], ["t47", "t49"], ["t1", "t50"], ["t38", "t51"], ["t34", "t49"], ["t40", "t51"], ["t42", "t53"], ["t45", "t53"], ["t40", "t52"], ["t51", "t52"], ["t49", "t5"], ["t44", "t55"], ["t41", "t55"], ["t45", "t57"], ["t53", "t57"], ["t50", "t54"], ["t41", "t54"], ["t54", "t55"], ["t44", "t58"], ["t55", "t58"], ["t1", "t54"], ["t46", "t58"], ["t56", "t59"], ["t45", "t60"], ["t57", "t60"], ["t42", "t62"], ["t47", "t61"], ["t49", "t61"], ["t48", "t61"], ["t49", "t64"], ["t5", "t64"], ["t58", "t63"], ["t53", "t62"], ["t60", "t65"], ["t57", "t65"], ["t59", "t66"], ["t56", "t66"], ["t61", "t67"], ["t63", "t68"], ["t56", "t70"], ["t66", "t70"], ["t59", "t75"], ["t66", "t75"], ["t70", "t73"], ["t70", "t75"], ["t70", "t76"], ["t73", "t76"], ["t75", "t76"], ["t75", "t79"], ["t76", "t79"], ["t79", "t83"], ["t76", "t83"], ["t81", "t83"], ["t83", "t86"], ["t85", "t89"], ["t83", "t88"], ["t86", "t88"], ["t83", "t90"], ["t88", "t90"], ["t88", "t91"], ["t86", "t91"], ["t90", "t91"], ["t90", "t93"], ["t91", "t93"], ["t86", "t94"], ["t91", "t94"], ["t91", "t95"], ["t93", "t95"], ["t93", "t96"], ["t94", "t95"], ["t95", "t96"], ["t78", "t94"], ["t78", "t96"], ["t78", "t95"], ["f0", "t56"], ["f0", "t70"], ["f0", "t73"], ["f0", "t74"], ["f0", "t76"], ["f0", "t81"], ["f0", "t82"], ["f0", "t83"], ["f0", "t84"], ["f0", "t87"], ["f0", "t90"], ["f0", "t92"], ["f0", "t93"], ["f0", "t78"], ["f0", "t96"], ["f0", "t46"], ["f0", "t51"], ["f0", "t58"], ["f0", "t55"], ["f0", "t54"], ["f0", "t1"], ["f0", "t63"], ["f0", "t52"], ["f0", "t68"], ["f0", "t77"], ["f1", "t53"], ["f1", "t57"], ["f1", "t45"], ["f1", "t48"], ["f1", "t60"], ["f1", "t61"], ["f1", "t49"], ["f1", "t64"], ["f1", "t5"], ["f1", "t62"], ["f1", "t65"], ["f1", "t67"], ["f1", "t69"], ["f1", "t71"], ["f1", "t72"], ["f1", "t80"], ["f1", "t59"], ["f1", "t75"], ["f1", "t79"], ["f1", "t78"], ["f1", "t85"], ["f1", "t86"], ["f1", "t83"], ["f1", "t89"], ["f1", "t94"], ["f2", "t7"], ["f2", "t10"], ["f2", "t13"], ["f2", "t14"], ["f2", "t17"], ["f2", "t19"], ["f2", "t18"], ["f2", "t22"], ["f2", "t25"], ["f2", "t31"], ["f2", "t5"], ["f2", "t15"], ["f2", "t28"], ["f2", "t24"], ["f2", "t29"], ["f2", "t32"], ["f2", "t34"], ["f2", "t37"], ["f2", "t42"], ["f2", "t43"], ["f2", "t45"], ["f3", "t1"], ["f3", "t30"], ["f3", "t35"], ["f3", "t38"], ["f3", "t39"], ["f3", "t44"], ["f3", "t41"], ["f3", "t46"], ["f3", "t2"], ["f3", "t3"], ["f3", "t4"], ["f3", "t9"], ["f3", "t8"], ["f3", "t11"], ["f3", "t12"], ["f3", "t16"], ["f3", "t20"], ["f3", "t18"], ["f3", "t21"], ["f3", "t23"], ["f3", "t26"], ["f3", "t27"], ["f3", "t36"], ["t73", "t74"], ["t74", "t82"], ["t81", "t84"], ["t78", "t89"], ["t82", "t87"], ["t87", "t92"], ["t1", "t30"], ["t68", "t77"], ["t12", "t16"], ["t12", "t20"], ["t20", "t23"], ["t15", "t5"], ["t24", "t32"], ["t28", "t5"], ["t28", "t29"], ["t64", "t69"], ["t67", "t71"], ["t65", "t72"], ["t72", "t80"], ["t0", "t42"]];

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

export type DtBoardAction = 'move' | 'tomb' | 'bazaar' | 'sanctuary' | 'frontier' | 'tower';

/** The printed tower button that resolves a pawn's occupied board space. */
export const dtActionForNode = (id: string): DtBoardAction | null => {
  const kind = DT_NODE.get(id)?.kind;
  if (!kind) return null;
  if (kind === 'tomb' || kind === 'ruin') return 'tomb';
  if (kind === 'sanctuary' || kind === 'citadel') return 'sanctuary';
  if (kind === 'darktower') return 'tower';
  if (kind === 'empty') return 'move';
  return kind;
};

export interface DtMovementPlayer {
  color: DtSeat;
  quad: number;
  node: string;
  brasskey: number;
  silverkey: number;
  goldkey: number;
}

export const dtTowerReady = (p: DtMovementPlayer): boolean =>
  p.quad >= 4 && !!p.brasskey && !!p.silverkey && !!p.goldkey;

/**
 * Current-or-adjacent destinations that obey the board's one-way kingdom
 * circuit. `anchor` is the node occupied at turn start, so repeated drag/drop
 * messages cannot walk a pawn several graph edges before resolving its space.
 */
export function dtLegalDestinations(p: DtMovementPlayer, anchor = p.node): string[] {
  const from = DT_NODE.get(anchor);
  if (!from) return [];
  const currentKingdom = dtKingdomAt(p.color, p.quad);
  const forwardFrontier = DT_FORWARD_FRONTIER.get(currentKingdom);
  const candidates = [anchor, ...dtAdjacent(anchor)];
  const out: string[] = [];

  for (const id of candidates) {
    const to = DT_NODE.get(id);
    if (!to) continue;

    // A crossed frontier is the starting point for the following turn, but is
    // behind the pawn now: it must step off into the newly entered kingdom.
    if (id === anchor && from.kind === 'frontier' && anchor !== forwardFrontier) continue;
    if (to.kind === 'citadel' && to.kingdom !== p.color) continue;
    if (to.kind === 'darktower' && !(to.kingdom === p.color && dtTowerReady(p))) continue;

    if (to.kind === 'frontier') {
      if (p.quad >= 4 || id !== forwardFrontier) continue;
    } else if (from.kind === 'frontier') {
      if (to.kingdom !== currentKingdom) continue;
    } else if (to.kingdom && to.kingdom !== currentKingdom) {
      continue;
    }
    out.push(id);
  }
  return out;
}

/** Nearest exact graph node to a legacy free-position pawn. */
export function dtNearestNode(spot: { x: number; z: number }, fallback: string): string {
  if (!Number.isFinite(spot?.x) || !Number.isFinite(spot?.z)) return fallback;
  let best = fallback;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const n of DT_NODES) {
    const d = (n.wx - spot.x) ** 2 + (n.wz - spot.z) ** 2;
    if (d < bestDistance) { best = n.id; bestDistance = d; }
  }
  return best;
}
