"""Exact zone borders for Axis & Allies, measured from the printed map.

The map art is the authority. Coastlines come from the artwork (water is blue), borders from the
printed lines (a marker-seeded watershed on edge strength, one seed per named space), so every
pixel of the board belongs to exactly one space and nothing is traced by hand.

Run:  python tools/axis-zones.py            (needs numpy, opencv-python, scikit-image, scipy)
Out:  client/src/axis/regions-data.json     outlines and holes per space, art pixels
      games/axis-allies/golden/regions.json  the same file, kept with the other goldens
      tmp/zones-check-*.jpg                  overlays for judging the fit by eye
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi
from skimage.segmentation import watershed

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / 'client/public/axis/map-full.jpg'
MAP = json.loads((ROOT / 'shared/src/axis/map-data.json').read_text(encoding='utf8'))
OLD = json.loads((ROOT / 'games/axis-allies/golden/regions.hand-traced.json').read_text(encoding='utf8'))['regions'] \
    if (ROOT / 'games/axis-allies/golden/regions.hand-traced.json').exists() else {}
K = 2  # work at half resolution

img_full = cv2.imread(str(ART))
H_FULL, W_FULL = img_full.shape[:2]
img = cv2.resize(img_full, (W_FULL // K, H_FULL // K), interpolation=cv2.INTER_AREA)
H, W = img.shape[:2]
print(f'art {W_FULL}x{H_FULL}, working at {W}x{H}')

# ---------- water ----------
hsv = cv2.cvtColor(cv2.GaussianBlur(img, (0, 0), 1.2), cv2.COLOR_BGR2HSV)
hh, ss, vv = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
water = ((hh >= 96) & (hh <= 124) & (ss >= 70) & (vv >= 70)).astype(np.uint8)
water = cv2.morphologyEx(water, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
water = cv2.morphologyEx(water, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
# The scan has a blank paper margin on every side, and the board wraps left to right (the Americas
# are split across the two edges). Paper is neither land nor sea: left in, it joins both edges and
# the whole Arctic into one landmass.
paper = ((vv >= 232) & (ss <= 34)).astype(np.uint8)
n_p, lab_p, stats_p, _ = cv2.connectedComponentsWithStats(paper, connectivity=8)
edge = set(np.unique(lab_p[0, :])) | set(np.unique(lab_p[-1, :])) | set(np.unique(lab_p[:, 0])) | set(np.unique(lab_p[:, -1]))
edge.discard(0)
offmap = np.isin(lab_p, list(edge)).astype(np.uint8)
offmap = cv2.dilate(offmap, np.ones((5, 5), np.uint8))
print(f'off-map paper: {offmap.mean() * 100:.1f}% of the scan')
# The printed sea-zone lines, labels and the mobilization chart sit on the water: fill them in.
n, lab, stats, _ = cv2.connectedComponentsWithStats(1 - water, connectivity=4)
land_seed = np.zeros_like(water)

territories = MAP['territories']
zones = MAP['seaZones']
ids = [t['id'] for t in territories] + [z['id'] for z in zones]
index = {id_: i + 1 for i, id_ in enumerate(ids)}
is_sea = {id_: id_.startswith('sz-') for id_ in ids}


def at(center):
    return int(round(center[0] / K)), int(round(center[1] / K))


# ---------- printed lines ----------
# A border on this map is a thin stroke in its owner's colour (crimson, yellow, tan, grey), and a
# sea-zone line is a pale stroke on blue. Either way it is a few pixels wide and differs sharply
# from the ground on both sides, which terrain grain does not once it is lightly blurred.
lab_small = cv2.cvtColor(cv2.GaussianBlur(img, (0, 0), 1.0), cv2.COLOR_BGR2LAB)
lab_big = cv2.merge([cv2.medianBlur(lab_small[..., c], 31) for c in range(3)])
diff = lab_small.astype(np.float32) - lab_big.astype(np.float32)
# A stroke keeps one colour offset along its length; grain flips sign from pixel to pixel. Averaging
# the signed offset along short segments in every direction keeps strokes and cancels grain.
LEN = 19
contrast = np.zeros((H, W), np.float32)
chroma = np.zeros((H, W), np.float32)
for k in range(12):
    theta = np.pi * k / 12
    kern = np.zeros((LEN, LEN), np.float32)
    c0 = LEN // 2
    dx, dy = np.cos(theta) * c0, np.sin(theta) * c0
    cv2.line(kern, (int(round(c0 - dx)), int(round(c0 - dy))), (int(round(c0 + dx)), int(round(c0 + dy))), 1.0, 1)
    kern /= kern.sum()
    m = [cv2.filter2D(diff[..., c], cv2.CV_32F, kern) for c in range(3)]
    contrast = np.maximum(contrast, np.sqrt(0.6 * m[0] ** 2 + 1.3 * m[1] ** 2 + 1.3 * m[2] ** 2))
    chroma = np.maximum(chroma, np.sqrt(m[1] ** 2 + m[2] ** 2))

# Lettering, zone numbers and value rings are ink on top of the map, not borders: small white marks.
white = ((vv >= 218) & (ss <= 42)).astype(np.uint8)
n_i, lab_i, stats_i, _ = cv2.connectedComponentsWithStats(cv2.dilate(white, np.ones((3, 3), np.uint8)), connectivity=8)
small = np.zeros(n_i, bool)
for c in range(1, n_i):
    small[c] = max(stats_i[c, cv2.CC_STAT_WIDTH], stats_i[c, cv2.CC_STAT_HEIGHT]) < 70
ink = cv2.dilate(small[lab_i].astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))


WEAK = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
CLOSE = int(sys.argv[5]) if len(sys.argv) > 5 else 9


def strokes(likelihood, threshold, min_len):
    """Binary line mask with hysteresis: a stroke is kept where it is strong, and followed through
    its fainter stretches as long as they stay connected to a strong part. Speckle is dropped and
    small gaps are bridged."""
    strong = (likelihood >= threshold).astype(np.uint8)
    weak = (likelihood >= threshold * WEAK).astype(np.uint8)
    strong[ink == 1] = 0
    weak[ink == 1] = 0
    n, lab, stats, _ = cv2.connectedComponentsWithStats(weak, connectivity=8)
    has_strong = np.zeros(n, bool)
    has_strong[np.unique(lab[strong == 1])] = True
    keep = np.zeros(n, bool)
    for c in range(1, n):
        keep[c] = has_strong[c] and max(stats[c, cv2.CC_STAT_WIDTH], stats[c, cv2.CC_STAT_HEIGHT]) >= min_len
    m = keep[lab].astype(np.uint8)
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE, CLOSE)))


LAND_T = float(sys.argv[1]) if len(sys.argv) > 1 else 9.0
SEA_T = float(sys.argv[2]) if len(sys.argv) > 2 else 7.0
land_lines = strokes(contrast, LAND_T, 36)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
pale = cv2.GaussianBlur(gray, (0, 0), 1.0) - cv2.medianBlur(cv2.GaussianBlur(gray, (0, 0), 1.0).astype(np.uint8), 31).astype(np.float32)
sat = cv2.GaussianBlur(hsv[..., 1].astype(np.float32), (0, 0), 1.0)
unsat = cv2.medianBlur(sat.astype(np.uint8), 31).astype(np.float32) - sat
sea_like = np.clip(pale, 0, None) + 0.5 * np.clip(unsat, 0, None)
sea_lines = strokes(sea_like, SEA_T, 40)
# The flood that settles shared pockets and line pixels climbs the real stroke strength, so the
# faint hatching printed on neutral ground gives way long before a solid border does.
land_cost = cv2.GaussianBlur(np.clip(contrast, 0, 60), (0, 0), 1.0) + 1
sea_cost = cv2.GaussianBlur(np.clip(sea_like, 0, 60), (0, 0), 1.0) + 1


# ---------- seeds ----------
def nearest_in(mask, x, y, reach):
    """Nearest pixel of mask to (x, y) within reach, or None."""
    x0, x1, y0, y1 = max(0, x - reach), min(W, x + reach + 1), max(0, y - reach), min(H, y + reach + 1)
    ys, xs = np.nonzero(mask[y0:y1, x0:x1])
    if len(xs) == 0:
        return None
    d = (xs + x0 - x) ** 2 + (ys + y0 - y) ** 2
    i = int(np.argmin(d))
    return int(xs[i] + x0), int(ys[i] + y0)


land = ((water == 0) & (offmap == 0)).astype(np.uint8)
# Land specks in the sea that are really printed ink (zone numbers, lines) are removed: a land
# component counts only if it is big enough, or a territory is seeded on or beside it.
n_l, lab_l, stats_l, _ = cv2.connectedComponentsWithStats(land, connectivity=8)
seeded = set()
seed_xy = {}
for t in territories:
    x, y = at(t['center'])
    p = (x, y) if land[y, x] else nearest_in(land, x, y, 90)
    if p is None:
        print('!! no land near', t['id'])
        continue
    seed_xy[t['id']] = p
    seeded.add(int(lab_l[p[1], p[0]]))
keep = np.zeros(n_l, bool)
for c in range(1, n_l):
    keep[c] = c in seeded or stats_l[c, cv2.CC_STAT_AREA] >= 60
land = keep[lab_l].astype(np.uint8)
water = ((land == 0) & (offmap == 0)).astype(np.uint8)
for z in zones:
    x, y = at(z['center'])
    p = (x, y) if water[y, x] else nearest_in(water, x, y, 60)
    if p is None:
        print('!! no water near', z['id'])
        continue
    seed_xy[z['id']] = p

HINTS = json.loads((ROOT / 'games/axis-allies/golden/zone-hints.json').read_text(encoding='utf8'))
walls = np.zeros((H, W), np.uint8)
for name, line in HINTS.get('cuts', {}).items():
    cv2.polylines(walls, [np.array([[q[0] / K, q[1] / K] for q in line], np.int32)], False, 1, thickness=3)
hand_seat, extra_seats = {}, {}
for id_, q in HINTS.get('seats', {}).items():
    pts = q if isinstance(q[0], list) else [q]
    hand_seat[id_] = (int(pts[0][0] / K), int(pts[0][1] / K))
    extra_seats[id_] = [(int(x / K), int(y / K)) for x, y in pts[1:]]
walled = set(HINTS.get('walled', [])) | set(hand_seat)
shared = []
name_of_index = {v: k for k, v in index.items()}
neutral = {t['id'] for t in territories if t.get('originalOwner') is None}
SNAP = int(sys.argv[3]) if len(sys.argv) > 3 else 8


def fill(mask, lines, cost, members):
    """Two passes.
    1. Topology. Where the print is clean, each area enclosed by printed lines belongs to the one
       seed inside it. Where it is not (dark forest, hatched neutral ground), the hints file gives
       rough strokes that act as walls, and the flood fills between them from a point seed.
    2. Snap. Every region is shrunk back from its edges and flooded again over the stroke
       strength alone, so each border settles on the strongest printed line near it."""
    lines = (lines | walls) & mask
    free = ((mask == 1) & (lines == 0)).astype(np.uint8)
    n, cc, stats, _ = cv2.connectedComponentsWithStats(free, connectivity=4)
    n_m, mass, _, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    room = cv2.distanceTransform(free, cv2.DIST_L2, 3)
    owners = {}
    points = {}
    for id_ in members:
        if id_ not in seed_xy:
            continue
        x, y = hand_seat.get(id_, seed_xy[id_])
        if id_ in walled:
            # a seat given by hand is used exactly: moving it to open ground could cross a wall
            points[id_] = (x, y) if id_ in hand_seat else (nearest_in(((room >= 4) & (mass == mass[y, x])).astype(np.uint8), x, y, 40) or (x, y))
            continue
        comp = 0
        # The open area the label sits in. Lettering leaves tiny pockets of its own and a roundel's
        # inside is a pocket of about 700 px, so a real home must be bigger than that. It must also
        # be on the same landmass: an island never borrows the mainland.
        order = ((16, 2500), (28, 2500), (44, 2500), (64, 2500), (90, 2500), (90, 300), (90, 40), (90, 1))
        if id_ in neutral:
            order = ((16, 2500), (28, 2500), (16, 250), (28, 250), (44, 250), (64, 250), (90, 250), (90, 40), (90, 1))
        for reach, floor in order:
            x0, x1, y0, y1 = max(0, x - reach), min(W, x + reach + 1), max(0, y - reach), min(H, y + reach + 1)
            win = cc[y0:y1, x0:x1]
            same = mass[y0:y1, x0:x1] == mass[y, x]
            near = [int(c) for c in np.unique(win[same]) if c and stats[c, cv2.CC_STAT_AREA] >= floor]
            if near:
                comp = max(near, key=lambda c: stats[c, cv2.CC_STAT_AREA])
                break
        if not comp:
            points[id_] = (x, y)
            continue
        owners.setdefault(comp, []).append(id_)
    lut = np.zeros(n, np.int32)
    for comp, here in owners.items():
        if len(here) == 1:
            lut[comp] = index[here[0]]
        else:
            shared.append(here)
            for id_ in here:
                x, y = seed_xy[id_]
                points[id_] = nearest_in(((room >= 5) & (cc == comp)).astype(np.uint8), x, y, 36) or (x, y)
    # The board wraps. A sizeable pocket with no seed that runs off one side edge is the rest of
    # whatever runs off the other edge at the same height (Mexico, the Pacific zones).
    on = mask == 1
    left = np.where(on.any(axis=1), on.argmax(axis=1), -1)
    right = np.where(on.any(axis=1), W - 1 - on[:, ::-1].argmax(axis=1), -1)
    for side, other, step in ((left, right, 3), (right, left, -3)):
        votes = {}
        for y in range(H):
            if side[y] < 0:
                continue
            here = int(cc[y, min(W - 1, max(0, side[y] + step))])
            there = int(cc[y, min(W - 1, max(0, other[y] - step))])
            if here and there and here not in owners and lut[there] != 0 and stats[here, cv2.CC_STAT_AREA] >= 2500:
                votes.setdefault(here, {}).setdefault(int(lut[there]), 0)
                votes[here][int(lut[there])] += 1
        for comp, tally in votes.items():
            label, rows = max(tally.items(), key=lambda kv: kv[1])
            if rows >= 20:
                lut[comp] = label
                print(f'   wrap: a piece on one edge joined to {name_of_index[label]}')
    markers = lut[cc]
    flat = cost.copy()
    flat[ink == 1] = 0
    patch = np.zeros((H, W), np.uint8)
    for id_, q in points.items():
        cv2.circle(markers, q, 6, index[id_], -1)
        for extra in extra_seats.get(id_, []):
            if mask[extra[1], extra[0]]:
                cv2.circle(markers, extra, 6, index[id_], -1)
        x, y = seed_xy[id_]
        cv2.circle(patch, (x, y), 20, 1, -1)
        cv2.circle(patch, (x, y + 24), 15, 1, -1)
    flat[(patch == 1) & (lines == 0)] = 0
    hard = flat.copy()
    hard[walls == 1] = 1000
    markers[(mask == 0) | (walls == 1)] = 0
    first = watershed(hard, markers, mask=mask.astype(bool))
    if SNAP <= 0:
        return first
    edge = cv2.morphologyEx(first.astype(np.float32), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0
    band = cv2.dilate(edge.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * SNAP + 1, 2 * SNAP + 1)))
    second = first.copy()
    second[(band == 1) | (mask == 0)] = 0
    # A piece thinner than the band (a coastal strip, an islet) would vanish in the shrink and be
    # swallowed by a neighbour. Each such piece keeps its own middle instead.
    inner = ((edge == 0) & (mask == 1) & (first > 0)).astype(np.uint8)
    n_p, piece = cv2.connectedComponents(inner, connectivity=4)
    depth = cv2.distanceTransform(inner, cv2.DIST_L2, 3)
    idx = np.arange(n_p)
    alive = ndi.sum((second > 0).astype(np.float32), piece, idx)
    deepest = ndi.maximum(depth, piece, idx)
    lost = (alive == 0)
    lost[0] = False
    keep = lost[piece] & (depth >= 0.6 * deepest[piece]) & (inner == 1)
    second[keep] = first[keep]
    second[mask == 0] = 0
    return watershed(flat, second, mask=mask.astype(bool))


labels = np.zeros((H, W), np.int32)
land_labels = fill(land, land_lines, land_cost, [t['id'] for t in territories])
sea_labels = fill(water, sea_lines, sea_cost, [z['id'] for z in zones])
labels[land == 1] = land_labels[land == 1]
labels[water == 1] = sea_labels[water == 1]
print(f'{len(shared)} pockets shared by more than one seed:', ' | '.join(', '.join(h) for h in shared))
dbg = img.copy()
dbg[land_lines == 1] = (0, 255, 255)
dbg[sea_lines == 1] = (255, 0, 255)
cv2.imwrite(str(ROOT / 'tmp/zones-lines.jpg'), dbg, [cv2.IMWRITE_JPEG_QUALITY, 80])

# ---------- land with no seed: outlying islands of a territory, or rocks in a sea zone ----------
old_mask = {}
for id_, rings in OLD.items():
    if is_sea.get(id_, True):
        continue
    m = np.zeros((H, W), np.uint8)
    for ring in rings:
        cv2.fillPoly(m, [np.array([[p[0] / K, p[1] / K] for p in ring], np.int32)], 1)
    old_mask[id_] = m
for t in territories:
    if t['id'] in seed_xy:
        x, y = seed_xy[t['id']]
        if labels[y, x] == 0 or not (labels == index[t['id']]).any():
            labels[lab_l[y, x] == lab_l] = index[t['id']]
unl = ((labels == 0) & (land == 1)).astype(np.uint8)
n_u, lab_u, stats_u, _ = cv2.connectedComponentsWithStats(unl, connectivity=8)
land_only = np.where(land == 1, labels, 0)
dist, (iy, ix) = ndi.distance_transform_edt(land_only == 0, return_indices=True)
adopted = 0
for c in range(1, n_u):
    comp = lab_u == c
    area = int(stats_u[c, cv2.CC_STAT_AREA])
    best, share = None, 0.0
    for id_, m in old_mask.items():
        s = float(m[comp].mean())
        if s > share:
            best, share = id_, s
    ys, xs = np.nonzero(comp)
    j = int(np.argmin(dist[ys, xs]))
    near_d = float(dist[ys[j], xs[j]])
    near = int(land_only[iy[ys[j], xs[j]], ix[ys[j], xs[j]]])
    # An islet beside a territory belongs to it. Only a piece far from any labelled land falls back
    # on where the old rough outline put it.
    if near and near_d <= 45:
        labels[comp] = near
        adopted += 1
    elif best and share >= 0.5:
        labels[comp] = index[best]
        adopted += 1
    # otherwise it stays 0 and is given to the sea around it below
print(f'{adopted} outlying land pieces joined to a territory')

# Water with no seed (lakes, the Caspian) and leftover rocks take the nearest label.
hole = labels == 0
if hole.any():
    _, (iy, ix) = ndi.distance_transform_edt(hole, return_indices=True)
    labels[hole] = labels[iy[hole], ix[hole]]
labels[offmap == 1] = 0

# ---------- island territories get room to stand on ----------
# A territory that is only a speck of land cannot be tapped or hold pieces. It takes the water
# around its islands and its printed roundel, the way the cardboard map treats the island box.
for t in territories:
    i = index[t['id']]
    area = int((labels == i).sum()) * K * K
    if area >= 26000:
        continue
    m = (labels == i).astype(np.uint8)
    x, y = at(t['center'])
    cv2.circle(m, (x, y), 30, 1, -1)
    reach = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * 44 + 1, 2 * 44 + 1)))
    take = (reach == 1) & (water == 1)
    labels[take] = i

# ---------- outlines ----------
EPS = 1.6  # art pixels


def rings_of(mask):
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    outer, holes = [], []
    if hierarchy is None:
        return outer, holes
    for c, h in zip(contours, hierarchy[0]):
        if len(c) < 4:
            continue
        pts = c.astype(np.float32) * K + K / 2.0
        if cv2.contourArea(pts) < 500:
            continue
        simple = cv2.approxPolyDP(pts, EPS, True).reshape(-1, 2)
        if len(simple) < 3:
            continue
        ring = [[int(round(float(p[0]))), int(round(float(p[1])))] for p in simple]
        (holes if h[3] >= 0 else outer).append(ring)
    return outer, holes


regions, holes = {}, {}
for id_ in ids:
    m = (labels == index[id_]).astype(np.uint8)
    if not m.any():
        print('!! empty region', id_)
        continue
    # close hairline gaps the simplifier would otherwise open between neighbours
    o, h = rings_of(m)
    o.sort(key=lambda r: -cv2.contourArea(np.array(r, np.float32)))
    regions[id_] = o
    if h:
        holes[id_] = h

points = sum(len(r) for rs in regions.values() for r in rs) + sum(len(r) for rs in holes.values() for r in rs)
out = {'art': {'width': W_FULL, 'height': H_FULL}, 'source': 'tools/axis-zones.py', 'regions': regions, 'holes': holes}
text = json.dumps(out, separators=(',', ':'))
(ROOT / 'client/src/axis/regions-data.json').write_text(text, encoding='utf8')
(ROOT / 'games/axis-allies/golden/regions.json').write_text(text, encoding='utf8')
print(f'{len(regions)} regions, {points} points, {len(text) // 1024} KB')

# ---------- self check: every label sits in its own region, and no region is a sliver ----------
name_of = {v: k for k, v in index.items()}
wrong = []
for s_ in territories + zones:
    x, y = at(s_['center'])
    x, y = seed_xy.get(s_['id'], (x, y))
    got = name_of.get(int(labels[y, x]), None)
    if got != s_['id']:
        wrong.append(f"{s_['id']} is drawn as {got}")
areas = {id_: int((labels == index[id_]).sum()) * K * K for id_ in ids}
slivers = [f'{id_} ({a})' for id_, a in sorted(areas.items(), key=lambda kv: kv[1]) if a < 9000]
print(f'{len(wrong)} labels outside their own region:', '; '.join(wrong[:40]))
print(f'{len(slivers)} regions smaller than 9000 px:', ', '.join(slivers[:40]))

# ---------- adjacency check against the rules map ----------
def touching(a_mask, radius=5):
    grown = cv2.dilate(a_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * radius + 1, 2 * radius + 1)))
    return set(int(v) for v in np.unique(labels[grown == 1]))


name = {v: k for k, v in index.items()}
drawn = {}
for id_ in ids:
    m = (labels == index[id_]).astype(np.uint8)
    drawn[id_] = {name[v] for v in touching(m) if v and name[v] != id_}
problems = []
for s in territories + zones:
    want = set(s.get('adj', [])) | set(s.get('coastTo', []))
    have = drawn.get(s['id'], set())
    missing = sorted(want - have)
    if missing:
        problems.append(f"{s['id']}: rules say it borders {', '.join(missing)} but the drawn zones do not touch")
print(f'{len(problems)} rule borders not present in the drawn zones')
for p in problems[:60]:
    print('  ', p)

# ---------- overlays for the eye ----------
(ROOT / 'tmp').mkdir(exist_ok=True)
rng = np.random.default_rng(7)
palette = rng.integers(60, 255, size=(len(ids) + 1, 3)).astype(np.uint8)
tint = palette[labels]
edges = (cv2.morphologyEx(labels.astype(np.float32), cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8)) > 0)
view = (img * 0.62 + tint * 0.38).astype(np.uint8)
view[edges] = (255, 255, 255)
view[offmap == 1] = (40, 40, 40)
for id_ in ids:
    if id_ in seed_xy:
        cv2.circle(view, seed_xy[id_], 4, (255, 0, 255), -1)
cv2.imwrite(str(ROOT / 'tmp/zones-check-full.jpg'), view, [cv2.IMWRITE_JPEG_QUALITY, 82])
cols, rows = 3, 2
for r in range(rows):
    for c in range(cols):
        crop = view[r * H // rows:(r + 1) * H // rows, c * W // cols:(c + 1) * W // cols]
        cv2.imwrite(str(ROOT / f'tmp/zones-check-{r}-{c}.jpg'), crop, [cv2.IMWRITE_JPEG_QUALITY, 80])
print('overlays written to tmp/zones-check-*.jpg')
