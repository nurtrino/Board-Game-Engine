// Dark Tower territory extraction, stage A+B:
//  A) calibrate a pixel->world transform from the 4 citadel badges
//  B) segment kingdom territories: fine flood-fill using ink+texture walls,
//     then MERGE fragments across borders that are not mostly drawn ink.
// Outputs an overlay of merged regions over the board art for inspection.
import sharp from 'sharp';
const REPO = process.cwd();
const ART = `${REPO}/client/public/darktower/boardart.webp`;
const OUT = process.argv[2] || null; // optional overlay png
const INK_MERGE = Number(process.argv[3] ?? 0.42); // merge if shared border < this frac ink
const N = 1024;

const scene = JSON.parse(await (await import('node:fs/promises')).readFile(`${REPO}/client/public/darktower/scene.json`, 'utf8'));
const CIT = { // known citadel world (x,z) and image cardinal + hue
  Red:    { world: [-0.54, -11.56], side: 'bottom' },
  Blue:   { world: [11.13, 0.68],  side: 'right' },
  Yellow: { world: [-0.99, 11.38], side: 'top' },
  Green:  { world: [-11.34, -0.77], side: 'left' },
};

const { data, info } = await sharp(ART).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const idx = (x, y) => (y * W + x) * C;
const cxp = W / 2, cyp = H / 2, R = W * 0.5 - 4;

// ---- A) find citadel badges: the citadel shield is the most saturated compact
// cluster in the rim annulus of each cardinal wedge. Image angle atan2(y-cy,x-cx):
// right=0, bottom=90, left=180, top=270. Red=bottom, Blue=right, Yellow=top, Green=left.
const CARD = { Red: 90, Blue: 0, Yellow: 270, Green: 180 };
function badge(angDeg) {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cxp, dy = y - cyp, dist = Math.hypot(dx, dy);
    if (dist < 0.66 * R || dist > 0.99 * R) continue;
    let da = ((Math.atan2(dy, dx) * 180 / Math.PI - angDeg + 540) % 360) - 180;
    if (Math.abs(da) > 22) continue;
    const i = idx(x, y), r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < 0.62 || mx < 120) continue;
    sx += x; sy += y; n++;
  }
  return n > 40 ? { x: sx / n, y: sy / n, n } : null;
}
const badges = {};
for (const k of Object.keys(CIT)) badges[k] = badge(CARD[k]);
console.log('badges', JSON.stringify(badges));
// fit worldX = ax*px + bx ; worldZ = ay*py + by  (axis aligned)
function fit(pairs) { // pairs of [p, w]
  const n = pairs.length; let sp = 0, sw = 0, spw = 0, spp = 0;
  for (const [p, w] of pairs) { sp += p; sw += w; spw += p * w; spp += p * p; }
  const a = (n * spw - sp * sw) / (n * spp - sp * sp); const b = (sw - a * sp) / n; return [a, b];
}
const [ax, bx] = fit(Object.keys(CIT).map((k) => [badges[k].x, CIT[k].world[0]]));
const [ay, by] = fit(Object.keys(CIT).map((k) => [badges[k].y, CIT[k].world[1]]));
const toWorld = (px, py) => [ax * px + bx, ay * py + by];
console.log('calib worldX=', ax.toFixed(4), '*px+', bx.toFixed(3), ' worldZ=', ay.toFixed(4), '*py+', by.toFixed(3));
for (const k of Object.keys(CIT)) { const w = toWorld(badges[k].x, badges[k].y); console.log(k, 'fit', w.map((v) => v.toFixed(2)), 'known', CIT[k].world); }

// ---- B) walls
const gray = new Float64Array(W * H);
for (let p = 0; p < W * H; p++) { const i = p * C; gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; }
const II = new Float64Array((W + 1) * (H + 1));
for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += gray[y * W + x]; II[(y + 1) * (W + 1) + (x + 1)] = II[y * (W + 1) + (x + 1)] + row; } }
const boxMean = (x, y, r) => { const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
  return (II[y1 * (W + 1) + x1] - II[y0 * (W + 1) + x1] - II[y1 * (W + 1) + x0] + II[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
const ink = new Uint8Array(W * H);   // strong drawn boundary ink
const wall = new Uint8Array(W * H);  // ink + texture edges (for fine segmentation)
const frontier = new Uint8Array(W * H); // tan diagonal bands
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const p = y * W + x, i = p * C, r = data[i], g = data[i + 1], b = data[i + 2];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const dist = Math.hypot(x - cxp, y - cyp);
  const isInk = mx < 80 && (mx - mn) < 42;
  const adaptive = gray[p] < boxMean(x, y, 7) - 16 && gray[p] < 150;
  // frontier: sandy tan, and only along the diagonals (|angle mod 90 - 45| small)
  const ang = (Math.atan2(y - cyp, x - cxp) * 180 / Math.PI + 360) % 90;
  const diag = Math.abs(ang - 45) < 15;
  const tan = r > 150 && g > 110 && b < 130 && r - b > 55 && (mx - mn) < 130;
  if (dist < R && diag && tan) frontier[p] = 1;
  if (isInk) ink[p] = 1;
  if (isInk || adaptive || dist > R || dist < W * 0.05) wall[p] = 1;
}
// dilate wall by 1 to close gaps
const wallD = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x;
  if (wall[p] || (x && wall[p - 1]) || (x < W - 1 && wall[p + 1]) || (y && wall[p - W]) || (y < H - 1 && wall[p + W])) wallD[p] = 1; }

// fine flood fill (exclude frontier so bands don't merge with kingdoms)
const label = new Int32Array(W * H); let next = 0; const st = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x;
  if (wallD[p] || frontier[p] || label[p]) continue;
  next++; label[p] = next; st.length = 0; st.push(p);
  while (st.length) { const q = st.pop(), qx = q % W, qy = (q / W) | 0;
    for (const nq of [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, qy > 0 ? q - W : -1, qy < H - 1 ? q + W : -1])
      if (nq >= 0 && !wallD[nq] && !frontier[nq] && !label[nq]) { label[nq] = next; st.push(nq); } }
}
// region stats
const stat = new Map();
const add = (l, x, y) => { let s = stat.get(l); if (!s) { s = { a: 0, sx: 0, sy: 0 }; stat.set(l, s); } s.a++; s.sx += x; s.sy += y; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const l = label[y * W + x]; if (l) add(l, x, y); }
// drop tiny speckle regions (set to 0)
const MINSP = 60;
for (const [l, s] of stat) if (s.a < MINSP) { s.dead = true; }

// adjacency + ink fraction along shared borders (scan wall pixels' 2 sides)
const adj = new Map(); // key "a|b" -> {shared, inkShared}
const key = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const p = y * W + x; if (!wallD[p]) continue;
  // labels on opposite sides horizontally & vertically
  const pairs = [[label[p - 1], label[p + 1]], [label[p - W], label[p + W]]];
  const isInk = ink[p] ? 1 : 0;
  for (const [la, lb] of pairs) { if (la && lb && la !== lb && !stat.get(la)?.dead && !stat.get(lb)?.dead) {
    const kk = key(la, lb); let e = adj.get(kk); if (!e) { e = { shared: 0, inkShared: 0 }; adj.set(kk, e); }
    e.shared++; e.inkShared += isInk; } }
}
const MINAREA = Number(process.argv[4] ?? 4200); // absorb regions smaller than this
// union-find merge across low-ink borders
const parent = new Map();
const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
for (const [l, s] of stat) if (!s.dead) parent.set(l, l);
const edges = [...adj.entries()].map(([k, e]) => ({ k, ...e, frac: e.inkShared / e.shared })).filter((e) => e.shared > 6);
for (const e of edges.sort((a, b) => a.frac - b.frac)) {
  if (e.frac >= INK_MERGE) continue;
  const [a, b] = e.k.split('|').map(Number);
  if (!parent.has(a) || !parent.has(b)) continue;
  const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb);
}
// root area + root adjacency (shared border between merged regions)
const rootArea = () => { const m = new Map(); for (const [l, s] of stat) { if (s.dead) continue; const r = find(l); m.set(r, (m.get(r) || 0) + s.a); } return m; };
const rootAdj = () => { const m = new Map(); // root -> Map(neighborRoot -> sharedLen)
  for (const [k, e] of adj) { const [a, b] = k.split('|').map(Number); if (!parent.has(a) || !parent.has(b)) continue;
    const ra = find(a), rb = find(b); if (ra === rb) continue;
    if (!m.has(ra)) m.set(ra, new Map()); if (!m.has(rb)) m.set(rb, new Map());
    m.get(ra).set(rb, (m.get(ra).get(rb) || 0) + e.shared); m.get(rb).set(ra, (m.get(rb).get(ra) || 0) + e.shared); }
  return m; };
// absorb: repeatedly merge the smallest sub-MINAREA region into its biggest neighbour
for (let pass = 0; pass < 12; pass++) {
  const area = rootArea(), nbr = rootAdj();
  const smalls = [...area.entries()].filter(([, a]) => a < MINAREA).sort((x, y) => x[1] - y[1]);
  if (!smalls.length) break;
  let did = 0;
  for (const [r] of smalls) { const rr = find(r); if (area.get(rr) >= MINAREA) continue;
    const ns = nbr.get(rr); if (!ns || !ns.size) continue;
    let best = -1, bestLen = -1; for (const [nb, len] of ns) { const nn = find(nb); if (nn === rr) continue; if (len > bestLen) { bestLen = len; best = nn; } }
    if (best >= 0) { parent.set(rr, best); did++; } }
  if (!did) break;
}
const merged = new Map();
for (const [l, s] of stat) { if (s.dead) continue; const r = find(l);
  let m = merged.get(r); if (!m) { m = { a: 0, sx: 0, sy: 0, parts: [] }; merged.set(r, m); }
  m.a += s.a; m.sx += s.sx; m.sy += s.sy; m.parts.push(l); }
const terr = [...merged.entries()].filter(([, m]) => m.a > MINAREA * 0.5).map(([r, m]) => ({ r, a: m.a, x: m.sx / m.a, y: m.sy / m.a }));
console.log('fine regions', next, 'merged territories', terr.length);

// ---- frontier bands as 4 nodes (cluster the frontier mask by diagonal)
const bandStat = [0, 1, 2, 3].map(() => ({ a: 0, sx: 0, sy: 0 }));
const bandOfPx = new Int8Array(W * H).fill(-1);
for (let p = 0; p < W * H; p++) { if (!frontier[p]) continue; const x = p % W, y = (p / W) | 0;
  // bucket by cardinal quadrant so each diagonal band sits fully inside one
  // bucket (boundaries at 0/90/180/270 fall BETWEEN the bands, not on them).
  const ang = (Math.atan2(y - cyp, x - cxp) * 180 / Math.PI + 360) % 360; const bi = Math.min(3, Math.floor(ang / 90));
  bandOfPx[p] = bi; const s = bandStat[bi]; s.a++; s.sx += x; s.sy += y; }

// ---- classify territories by matching building world positions
const anchors = scene.buildings.map((b) => ({ kind: b.kind, x: b.pos[0], z: b.pos[2] }));
const kingdomOfWorld = (x, z) => { const a = (Math.atan2(z, x) * 180 / Math.PI + 360) % 360; // world: +X right, +Z up(top)
  if (a > 45 && a <= 135) return 'Yellow'; if (a > 135 && a <= 225) return 'Green'; if (a > 225 && a <= 315) return 'Red'; return 'Blue'; };
const rootId = new Map(); terr.forEach((t, i) => rootId.set(t.r, i));
const nodes = terr.map((t, i) => { const [wx, wz] = toWorld(t.x, t.y);
  return { id: `t${i}`, i, kind: 'empty', kingdom: kingdomOfWorld(wx, wz), wx: +wx.toFixed(2), wz: +wz.toFixed(2), rr: Math.hypot(wx, wz), px: Math.round(t.x), py: Math.round(t.y) }; });
// each building anchor claims its nearest still-empty territory IN ITS OWN
// kingdom (so a building near a frontier can't jump into the neighbour) — this
// yields exactly one tomb/ruin/bazaar/sanctuary/citadel per kingdom.
for (const an of anchors) { const ak = kingdomOfWorld(an.x, an.z); let best = null, bd = 1e9;
  for (const n of nodes) { if (n.kind !== 'empty' || n.kingdom !== ak) continue; const d = Math.hypot(n.wx - an.x, n.wz - an.z); if (d < bd) { bd = d; best = n; } }
  if (best) best.kind = an.kind; }
// dark tower space: per kingdom, the still-empty territory nearest the hub
for (const K of ['Red', 'Blue', 'Yellow', 'Green']) { const cand = nodes.filter((n) => n.kingdom === K && n.kind === 'empty').sort((a, b) => a.rr - b.rr)[0]; if (cand) cand.kind = 'darktower'; }
const fnodes = bandStat.map((s, bi) => { const px = s.sx / s.a, py = s.sy / s.a; const [wx, wz] = toWorld(px, py);
  return { id: `f${bi}`, kind: 'frontier', wx: +wx.toFixed(2), wz: +wz.toFixed(2), px: Math.round(px), py: Math.round(py) }; });

// ---- adjacency: grow every disc pixel to its nearest territory (across walls),
// then two territories are adjacent if their filled areas touch.
const pixRoot = new Int32Array(W * H).fill(-1);
for (let p = 0; p < W * H; p++) { const l = label[p]; if (!l || stat.get(l)?.dead) continue; const r = find(l); if (rootId.has(r)) pixRoot[p] = rootId.get(r); }
const owner = new Int32Array(W * H).fill(-3); const bfs = new Int32Array(W * H); let bn = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; const d = Math.hypot(x - cxp, y - cyp);
  if (d >= R || d < W * 0.05 || frontier[p]) { owner[p] = -3; continue; }
  if (pixRoot[p] >= 0) { owner[p] = pixRoot[p]; bfs[bn++] = p; } else owner[p] = -1; }
for (let h = 0; h < bn; h++) { const p = bfs[h], x = p % W, y = (p / W) | 0, o = owner[p];
  for (const nq of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1])
    if (nq >= 0 && owner[nq] === -1) { owner[nq] = o; bfs[bn++] = nq; } }
const eset = new Set(); const addE = (a, b) => { if (a !== b) eset.add(a < b ? `${a}~${b}` : `${b}~${a}`); };
// Kingdoms connect ONLY through frontiers (rulebook): keep a territory<->territory
// edge only when both are in the same kingdom.
for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const p = y * W + x, a = owner[p]; if (a < 0) continue;
  const rgt = owner[p + 1], dn = owner[p + W];
  if (rgt >= 0 && rgt !== a && nodes[a].kingdom === nodes[rgt].kingdom) addE(`t${a}`, `t${rgt}`);
  if (dn >= 0 && dn !== a && nodes[a].kingdom === nodes[dn].kingdom) addE(`t${a}`, `t${dn}`); }
// Each frontier band separates two kingdoms along its length, but at the hub the
// four bands converge and touch every kingdom. So: gather territories bordering
// a band only in its OUTER length (dist > 0.30R), decide the band's two kingdoms
// by border frequency there, then connect the band to bordering territories of
// exactly those two kingdoms.
const bandBorder = [0, 1, 2, 3].map(() => new Map()); // bi -> Map(territoryIdx -> borderPixels)
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const p = y * W + x; const bi = bandOfPx[p]; if (bi < 0) continue;
  if (Math.hypot(x - cxp, y - cyp) < 0.30 * R) continue;
  for (const nq of [p - 1, p + 1, p - W, p + W]) { const o = owner[nq]; if (o >= 0) bandBorder[bi].set(o, (bandBorder[bi].get(o) || 0) + 1); } }
// The two kingdoms a band separates are the cardinal quadrants flanking its
// diagonal (robust geometry, not border frequency). Connect the band to
// bordering territories of BOTH; if a side has none bordering, link its nearest.
const D2R = Math.PI / 180;
const bandK = fnodes.map((f) => { const th = Math.atan2(f.wz, f.wx) / D2R;
  return [-45, 45].map((o) => kingdomOfWorld(Math.cos((th + o) * D2R), Math.sin((th + o) * D2R))); });
for (let bi = 0; bi < 4; bi++) { const f = fnodes[bi];
  for (const K of bandK[bi]) {
    const bordering = [...bandBorder[bi]].filter(([o, c]) => nodes[o].kingdom === K && c >= 2);
    if (bordering.length) { for (const [o] of bordering) addE(`t${o}`, `f${bi}`); }
    else { let best = null, bd = 1e9; for (const n of nodes) { if (n.kingdom !== K) continue; const d = Math.hypot(n.wx - f.wx, n.wz - f.wz); if (d < bd) { bd = d; best = n; } } if (best) addE(best.id, `f${bi}`); }
  } }
console.log('band kingdoms', JSON.stringify(bandK));
const gedges = [...eset].map((e) => e.split('~'));

const allNodes = [...nodes.map((n) => ({ id: n.id, kind: n.kind, kingdom: n.kingdom, wx: n.wx, wz: n.wz, px: n.px, py: n.py })), ...fnodes];
const graph = { calib: { ax, bx, ay, by, N }, nodes: allNodes, edges: gedges };
await (await import('node:fs/promises')).writeFile(process.env.GRAPH_OUT || `${REPO}/games/dark-tower/golden/territories.json`, JSON.stringify(graph, null, 1));
const kc = {}; for (const n of nodes) kc[n.kingdom] = (kc[n.kingdom] || 0) + 1;
const tc = {}; for (const n of allNodes) tc[n.kind] = (tc[n.kind] || 0) + 1;
console.log('nodes', allNodes.length, 'edges', gedges.length, 'by kingdom', JSON.stringify(kc), 'by type', JSON.stringify(tc));

// ---- typed overlay
const TYPECOL = { empty: [120, 200, 255], tomb: [180, 120, 220], ruin: [150, 150, 150], bazaar: [90, 160, 255], sanctuary: [120, 255, 160], citadel: [255, 220, 60], darktower: [255, 60, 60], frontier: [255, 140, 0] };
if (OUT) {
  const nodeById = new Map(allNodes.map((n) => [n.id, n]));
  const base = await sharp(ART).resize(N, N, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const out = Buffer.from(base);
  for (let p = 0; p < W * H; p++) { let col = null;
    if (bandOfPx[p] >= 0) col = TYPECOL.frontier;
    else if (owner[p] >= 0) col = TYPECOL[nodes[owner[p]].kind] || TYPECOL.empty;
    if (col) { out[p*3]=(out[p*3]+col[0])>>1; out[p*3+1]=(out[p*3+1]+col[1])>>1; out[p*3+2]=(out[p*3+2]+col[2])>>1; } }
  for (const [a,b] of gedges){const na=nodeById.get(a),nb=nodeById.get(b);if(!na||!nb)continue;for(let s=0;s<=40;s++){const x=Math.round(na.px+(nb.px-na.px)*s/40),y=Math.round(na.py+(nb.py-na.py)*s/40);const q=(y*W+x)*3;if(q>=0&&q<out.length){out[q]=255;out[q+1]=255;out[q+2]=255;}}}
  for (const n of allNodes){for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const q=((n.py+dy)*W+(n.px+dx))*3;if(q>=0&&q<out.length){out[q]=10;out[q+1]=10;out[q+2]=10;}}}
  await sharp(out,{raw:{width:W,height:H,channels:3}}).png().toFile(OUT);
  console.log('wrote overlay', OUT);
}