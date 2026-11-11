# Fleet aircraft carrier, about 1942. 250 m, island to starboard (-x), bow to -y, waterline at z = 0.
# Open bow and stern under the flight-deck round-downs, roller-door hangar sides, a port deck-edge
# elevator, twin 5-inch mounts fore and aft of the island and quad 40 mm mounts in the galleries.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _big_helpers import *

far_camera()              # the kit's preview camera clips at 100 m; this ship is seen from 400 m
install_even_unwrap()     # one texel density for the hull and for the hundreds of stamped parts
reset()

K = 0.14      # the kit's surface patterns were sized for a tank: stretch them seven times
PAINT = add_plating(rescale(paint('paint', wear=0.75, dirt=0.9, low=(0.3, 4.5), gloss=0.55), K), 7.0, 2.3, dark=0.22)
RED = add_plating(rescale(plain('antifoul', (0.25, 0.055, 0.04), rough=0.75, dirt=0.5, vary=0.2), K), 7.0, 2.3)
BOOT = rescale(plain('boot', (0.022, 0.022, 0.025), rough=0.6, dirt=0.4), K)
WOOD = rescale(wood('deck', colour=(0.38, 0.30, 0.20), plank=0.30 * K, length=9.0 * K, dirt=0.75), K)
for n_ in WOOD.node_tree.nodes:        # finer seams than the kit's planking: these planks are seen from far off
    if n_.type == 'TEX_BRICK':
        n_.inputs['Mortar Size'].default_value = 0.0032
        n_.inputs['Color1'].default_value = (0.84, 0.84, 0.84, 1)
        n_.inputs['Mortar'].default_value = (0.2, 0.2, 0.2, 1)
YELLOW = rescale(plain('yellow', (0.5, 0.36, 0.05), rough=0.6, dirt=0.7, rust=0.2), K)
MARK = rescale(plain('marking', (0.74, 0.73, 0.67), rough=0.75, dirt=0.7, vary=0.1), K)
DECK = rescale(plain('decksteel', (0.15, 0.165, 0.18), rough=0.68, dirt=0.6, rust=0.18), K)
DARK = rescale(plain('dark', (0.028, 0.028, 0.032), rough=0.85, dirt=0.3), K)
INNER = rescale(plain('inner', (0.16, 0.17, 0.17), rough=0.7, dirt=0.6), K)
GUNMETAL = rescale(plain('gunmetal', (0.07, 0.07, 0.075), rough=0.45, metal=0.9, dirt=0.3, vary=0.08), K)
BRONZE = rescale(plain('bronze', (0.42, 0.27, 0.10), rough=0.4, metal=0.9, dirt=0.3), K)
RUBBER = rescale(plain('rubber', (0.03, 0.03, 0.03), rough=0.88, dirt=0.6), K)
RAFT = rescale(plain('raft', (0.33, 0.31, 0.25), rough=0.92, dirt=0.7, vary=0.2), K)
SHUTTER = corrugated('shutter', (0.5, 0.5, 0.5), pitch=0.42, along='z', rust=0.2, dirt=0.3, mask=1.0, metal=0.0, k=K, depth=0.05)
GLASS = glass()

HD, FD, SB = 8.5, 17.0, 15.8            # hangar deck, flight deck, underside of the flight-deck slab
HX, HY0, HY1 = 13.3, -84.0, 104.0       # hangar half-width and ends
DHX, DHY = 9.5, -99.0                   # the narrower deckhouse ahead of the hangar
FY0, FY1 = -116.5, 119.5                # flight deck ends
RD, RDT = 3.6, 0.45                     # round-down radius and plate thickness
RY0, RY1 = FY0 + 3.5, FY1 - 3.5         # where the round-downs begin

S = []      # everything fixed, joined into the hull at the end


def add(ob, w=0.0, sharp=50):
    S.append(hard(ob, w, sharp=sharp))
    return ob


def keep(mb, name, sharp=40):
    ob = mb.obj(name, sharp=sharp)
    S.append(ob)
    return ob


# ---------------------------------------------------------------- hull form

def form(s):
    """Half-breadth at the waterline and at the deck, deck height, keel depth and section shape at s (0 bow, 1 stern)."""
    if s < 0.36:
        bw = 14 * (1 - (1 - s / 0.36) ** 2)
    elif s < 0.70:
        bw = 14.0
    else:
        bw = 14 * (1 - 0.62 * ((s - 0.70) / 0.30) ** 2.2)
    if s < 0.24:
        bd = 14 * (1 - (1 - s / 0.24) ** 3)
    elif s < 0.90:
        bd = 14.0
    else:
        t = (s - 0.90) / 0.10                    # a rounded cruiser stern
        close = 1 - 0.8 * clamp((t - 0.86) / 0.14) ** 2
        bd = 14 * (1 - 0.72 * t ** 2.6) * close
        bw = min(bw * close, bd * 0.96)
    zd = HD + 2.6 * (1 - s / 0.16) ** 2 if s < 0.16 else HD
    kd = 8.5
    if s < 0.05:
        kd = 8.5 * (0.5 + 0.5 * s / 0.05)
    elif s > 0.78:
        kd = 8.5 * (1 - 0.84 * ((s - 0.78) / 0.22) ** 1.5)
    n = lerp(1.7, 5.0, s / 0.36) if s < 0.36 else lerp(5.0, 2.4, (s - 0.68) / 0.32) if s > 0.68 else 5.0
    p = 1 + 0.9 * clamp((0.36 - s) / 0.2)
    return max(bw, 0.12), max(bd, 0.3), zd, kd, n, p


def sy(y):
    return (y + 125.0) / 250.0


def side_x(y, z):
    """Half-breadth of the hull at height z (above water) at station y."""
    bw, bd, zd, kd, n, p = form(sy(y))
    return bw + (bd - bw) * clamp(z / zd) ** p


def deck_z(y):
    return form(sy(y))[2]


def warp(s, z):
    """Raked stem and stern: how far a point at height z is carried along y."""
    out = 0.0
    if s < 0.12:
        k = (1 - s / 0.12) ** 2
        sh = (11.1 - max(z, 0.0)) * 0.33
        if z < 0:
            sh += 0.18 * (-z) + 0.45 * max(0.0, -z - 4.0) ** 2
        out += sh * k
    if s > 0.9:
        out -= (8.5 - z) * 0.22 * ((s - 0.9) / 0.1) ** 2
    return out


STA = [0, .006, .016, .03, .05, .075, .104, .135, .164, .20, .25, .30, .36, .44, .52, .60, .68, .74, .79, .835, .875, .916, .94, .96, .976, .986, .993, .9975, 1.0]
UNDER = 6


def section(s):
    bw, bd, zd, kd, n, p = form(s)
    y0 = -125 + 250 * s
    half = []
    for z in (zd, zd * 0.62, zd * 0.30, 0.9, 0.0):
        half.append((bw + (bd - bw) * (z / zd) ** p, z))
    for j in range(1, UNDER + 1):
        t = (math.pi / 2) * j / UNDER
        half.append((bw * math.cos(t) ** (2 / n) if j < UNDER else 0.0, -kd * math.sin(t) ** (2 / n)))
    ring = [Vector((x, y0 + warp(s, z), z)) for x, z in half]
    ring += [Vector((-x, y0 + warp(s, z), z)) for x, z in reversed(half[:-1])]
    return ring


RINGS = [section(s) for s in STA]
NR = len(RINGS[0])


def band(j):
    j = min(j, NR - 2 - j)
    return PAINT if j < 3 else BOOT if j == 3 else RED


# skinned in three lengths (cut where the sides are flat), so that no one piece of the atlas has to
# be the whole length of the ship
CUTS = (STA.index(.44), STA.index(.68))
skins = [(MB(), MB()), (MB(), MB()), (MB(), MB())]      # each length: topsides, bottom
for i in range(len(RINGS) - 1):
    a, b = RINGS[i], RINGS[i + 1]
    pair = skins[0] if i < CUTS[0] else skins[1] if i < CUTS[1] else skins[2]
    for j in range(NR - 1):       # wound so that every face looks outward, whatever the flare
        pair[band(j) is RED].poly([a[j], a[j + 1], b[j + 1], b[j]], band(j), shared=False)
for pair, ring, facing in ((skins[0], RINGS[0], (0, -1, 0)), (skins[2], RINGS[-1], (0, 1, 0))):       # stem and transom
    for j in range(NR // 2):
        k = NR - 1 - j
        pts = [ring[j], ring[j + 1], ring[k]] if j + 1 == k - 1 else [ring[j], ring[j + 1], ring[k - 1], ring[k]]
        pair[band(j) is RED].poly(pts, band(j), facing, shared=False)
for i, (upper, lower) in enumerate(skins):
    S.append(upper.obj(f'skin-{i}', sharp=62))
    S.append(unwrap_as(lower.obj(f'bottom-{i}', sharp=62), 0.5))      # the bottom is seldom seen: half the texel density

# weather decks: forecastle, fantail and the strip outside the hangar walls
mb = MB()
for i in range(len(STA) - 1):
    a, b = RINGS[i], RINGS[i + 1]
    ya, yb = a[0].y, b[0].y
    if STA[i + 1] <= sy(DHY) + 1e-6 or STA[i] >= sy(HY1) - 1e-6:
        mb.poly([a[0], a[-1], b[-1], b[0]], DECK, (0, 0, 1))
    else:
        inner = DHX if STA[i + 1] <= sy(HY0) + 1e-6 else HX
        for sgn in (1, -1):
            pa, pb = (a[0], b[0]) if sgn > 0 else (a[-1], b[-1])
            mb.poly([pa, pb, (sgn * (inner - 0.1), pb.y, pb.z), (sgn * (inner - 0.1), pa.y, pa.z)], DECK, (0, 0, 1))
# sheer strake: a raised belt along the deck edge
for i in range(len(STA) - 1):
    a, b = RINGS[i], RINGS[i + 1]
    for pa, pb in ((a[0], b[0]), (a[-1], b[-1])):
        sx = 1 if pa.x > 0 else -1
        o = Vector((sx * 0.12, 0, 0))
        mb.poly([pa + o + Vector((0, 0, 0.12)), pb + o + Vector((0, 0, 0.12)), pb + o - Vector((0, 0, 0.55)), pa + o - Vector((0, 0, 0.55))], PAINT, (sx, 0, 0))
        mb.poly([pa + o + Vector((0, 0, 0.12)), pb + o + Vector((0, 0, 0.12)), pb + Vector((-sx * 0.05, 0, 0.12)), pa + Vector((-sx * 0.05, 0, 0.12))], PAINT, (0, 0, 1))
        mb.poly([pa + o - Vector((0, 0, 0.55)), pb + o - Vector((0, 0, 0.55)), pb - Vector((0, 0, 0.67)), pa - Vector((0, 0, 0.67))], PAINT, (sx * 0.5, 0, -1))
keep(mb, 'decks')

# running gear below the water: four screws on shafts with struts, and the rudder
add(prism('rudder', [(111.5, -0.8), (117.6, -0.8), (117.2, -7.6), (112.6, -7.6)], -0.28, 0.28, RED), 0.08)
pb = [hard(lathe('boss', [(0.0, -1.3), (0.42, -0.9), (0.5, 0.0), (0.46, 0.7), (0.0, 1.5)], segs=8, rot=(90, 0, 0), mat=BRONZE), 0.0)]
for k in range(4):
    bl = box('blade', 0.95, 0.09, 1.55, at=(0, 0, 1.12), mat=BRONZE)
    xform(bl, rot=(0, 0, 28))
    xform(bl, rot=(0, k * 90, 0))
    pb.append(hard(bl, 0.03))
screw = join('screw', pb)
SCREWS = [(4.3, 106.0, -6.85), (-4.3, 106.0, -6.85), (9.0, 97.0, -6.85), (-9.0, 97.0, -6.85)]
S += copies(screw, [(p, (0, 0, 0)) for p in SCREWS])
mb = MB()
for x, y, z in SCREWS:
    mb.tube((x, y - 0.5, z), (x * 0.94, y - 24, z + 1.6), 0.26, RED, 6)
    for dx in (-1.3, 1.3):
        mb.beam((x, y - 1.6, z), (x + dx, y - 1.9, z + 3.3), 0.16, 0.7, RED, up=(0, 1, 0))
keep(mb, 'shafts')


# ---------------------------------------------------------------- hangar

PORT_DOORS = [(-81, -72, 'o'), (-68.5, -59.5, 'h'), (-56, -47, 'o'), (-43.5, -34.5, 'o'), (-31, -22, 'c'), (-17.5, 1.5, 'e'),
              (5, 14, 'o'), (17.5, 26.5, 'h'), (30, 39, 'o'), (42.5, 51.5, 'c'), (55, 64, 'o'), (67.5, 76.5, 'o'), (80, 89, 'h'), (92.5, 101.5, 'o')]
STBD_DOORS = [(-81, -72, 'o'), (-68.5, -59.5, 'o'), (-56, -47, 'h'), (-43.5, -34.5, 'c'), (17.5, 26.5, 'c'), (30, 39, 'o'),
              (42.5, 51.5, 'h'), (55, 64, 'o'), (67.5, 76.5, 'o'), (80, 89, 'c'), (92.5, 101.5, 'o')]
DZ0, DZ1 = 9.25, 13.95
RECESS = 2.4

mb = MB()
for sgn, doors in ((1, PORT_DOORS), (-1, STBD_DOORS)):
    holes = [(a, b, DZ0 if kind != 'e' else 8.9, DZ1) for a, b, kind in doors]
    for ya, yb in ((HY0, 3.0), (3.0, HY1)):
        part = MB()
        part.wall((sgn * HX, 0, 0), (0, 1, 0), (sgn, 0, 0), (ya, yb), (HD, SB), [h for h in holes if ya < h[0] < yb], PAINT, RECESS, DARK, PAINT)
        keep(part, 'hangar-side')
    for a, b, kind in doors:
        x0 = sgn * HX
        # the roller housing over each door, and the guides at its sides
        mb.box((min(x0, x0 + sgn * 0.3), a - 0.3, DZ1 + 0.05), (max(x0, x0 + sgn * 0.3), b + 0.3, DZ1 + 0.6), PAINT, drop='-x' if sgn > 0 else '+x')
        if kind in 'ch':
            top = DZ0 if kind == 'c' else lerp(DZ1, DZ0, 0.45)
            xs = sgn * (HX - 0.35)
            mb.poly([(xs, a, top), (xs, b, top), (xs, b, DZ1), (xs, a, DZ1)], SHUTTER, (sgn, 0, 0))
            mb.box((min(xs, xs - sgn * 0.25), a, top - 0.22), (max(xs, xs - sgn * 0.25) + 0.0, b, top), INNER, drop='+z')
        if kind != 'c':
            # structure seen inside: frames, a deck-head girder and the far bulkhead's stiffeners
            n = 3 if kind == 'e' else 2
            for i in range(1, n + 1):
                yy = lerp(a, b, i / (n + 1))
                mb.beam((sgn * (HX - 1.5), yy, DZ0), (sgn * (HX - 1.5), yy, DZ1), 0.5, 0.28, INNER, up=(0, 1, 0))
            mb.beam((sgn * (HX - 1.5), a, DZ1 - 0.5), (sgn * (HX - 1.5), b, DZ1 - 0.5), 0.3, 0.6, INNER)
            mb.beam((sgn * (HX - 1.5), a, DZ0 + 1.1), (sgn * (HX - 1.5), b, DZ0 + 1.1), 0.12, 0.12, INNER)
# ends of the hangar and the deckhouse ahead of it
for sgn in (1, -1):
    mb.wall((sgn * DHX, HY0, 0), (sgn, 0, 0), (0, -1, 0), (0, HX - DHX), (HD, SB), (), PAINT)
mb.wall((-HX, HY1, 0), (1, 0, 0), (0, 1, 0), (0, 2 * HX), (HD, SB), [(3.0, 11.0, 8.9, 13.6), (15.6, 23.6, 8.9, 13.6)], PAINT, 1.2, None, PAINT)
for a in (3.0, 15.6):
    mb.poly([(-HX + a, HY1 - 0.5, 8.9), (-HX + a + 8, HY1 - 0.5, 8.9), (-HX + a + 8, HY1 - 0.5, 13.6), (-HX + a, HY1 - 0.5, 13.6)], SHUTTER, (0, 1, 0))
dh = [(-DHX, HY0), (-DHX, DHY + 3.5), (-DHX + 3.0, DHY), (DHX - 3.0, DHY), (DHX, DHY + 3.5), (DHX, HY0)]
for (xa, ya), (xb, yb) in zip(dh, dh[1:]):
    mb.poly([(xa, ya, HD - 0.4), (xb, yb, HD - 0.4), (xb, yb, SB), (xa, ya, SB)], PAINT, ((xa + xb) / 2, (ya + yb) / 2 - HY0 + 1, 0))
hangar = keep(mb, 'hangar')

# watertight doors and portholes: the things that give the size away
door = MB()
door.box((-0.42, -0.05, 0.25), (0.42, 0.06, 2.05), PAINT, drop='+y')
door.box((-0.5, -0.02, 0.17), (0.5, 0.0, 2.13), INNER, drop='+y -y')
door.box((0.2, -0.09, 1.05), (0.3, -0.05, 1.25), DECK, drop='+y')
DOORS = []          # (at, rot): the door faces -y before rot
port = MB()
port.poly([(0.2 * math.cos(i * math.pi / 4), -0.03, 0.2 * math.sin(i * math.pi / 4)) for i in range(8)], DARK, (0, -1, 0))
port.poly([(0.29 * math.cos(i * math.pi / 4), -0.015, 0.29 * math.sin(i * math.pi / 4)) for i in range(8)], INNER, (0, -1, 0))
PORTS = []
for sgn in (1, -1):
    rz = -90 if sgn < 0 else 90     # -y turned to face outboard
    for y in range(-34, 52, 5):
        for z in (6.4, 3.9):
            PORTS.append(((sgn * 14.0, y + (1.6 if z < 5 else 0), z), (0, 0, rz)))
    for y in (-88, -93):
        DOORS.append(((sgn * DHX, y, HD + 0.05), (0, 0, rz)))
    for a, b, kind in (PORT_DOORS if sgn > 0 else STBD_DOORS)[::3]:
        DOORS.append(((sgn * HX, a - 1.7, HD + 0.1), (0, 0, rz)))
for x in (-12.4, -0.6, 0.9, 12.4):
    DOORS.append(((x, HY1, HD + 0.05), (0, 0, 180)))
for x in (-4.5, 4.5):
    DOORS.append(((x, DHY, deck_z(DHY) + 0.05), (0, 0, 0)))
for x in (-6.2, -1.5, 1.5, 6.2):
    PORTS.append(((x, DHY, 13.4), (0, 0, 0)))

# brackets under the flight-deck overhang, between the doors
br = MB()
br.poly([(0, -0.07, -2.0), (0, -0.07, 0), (3.0, -0.07, 0)], PAINT, (0, -1, 0))
br.poly([(0, 0.07, -2.0), (0, 0.07, 0), (3.0, 0.07, 0)], PAINT, (0, 1, 0))
br.poly([(0, -0.07, -2.0), (0, 0.07, -2.0), (3.0, 0.07, 0), (3.0, -0.07, 0)], PAINT, (1, 0, -1))
BRACKETS = []


# ---------------------------------------------------------------- flight deck

def wfd(y):
    if y < -90:
        return lerp(11.0, 16.5, clamp((y - FY0) / (-90 - FY0)))
    if y > 100:
        return lerp(16.5, 12.5, clamp((y - 100) / (FY1 - 100)))
    return 16.5


EL1 = (-69.3, -54.7, 16.2)      # forward elevator: y0, y1 and where its platform sits (lowered)
EL2 = (42.7, 57.3, FD)          # after elevator
ELX = 6.7
DE = (-17.2, 1.2, 16.6, 26.8)   # deck-edge elevator, port: y0, y1, x0, x1


def in_well(y0, y1):
    return any(e[0] - 1e-3 <= y0 and y1 <= e[1] + 1e-3 for e in (EL1, EL2))


decks = [MB(), MB(), MB()]
ys = sorted({RY0, -103.0, -90.0, DHY, HY0, EL1[0], EL1[1], -30.0, 0.0, 25.0, EL2[0], EL2[1], 80.0, 100.0, HY1, 110.0, RY1})
for ya, yb in zip(ys, ys[1:]):
    mb = decks[0] if yb <= -30 else decks[1] if yb <= 25 else decks[2]
    wa, wb = wfd(ya), wfd(yb)
    xa = [-wa, -wa + 0.5, -ELX, ELX, wa - 0.5, wa]
    xb = [-wb, -wb + 0.5, -ELX, ELX, wb - 0.5, wb]
    for c in range(5):
        if c == 2 and in_well(ya, yb):
            continue
        mb.poly([(xa[c], ya, FD), (xa[c + 1], ya, FD), (xb[c + 1], yb, FD), (xb[c], yb, FD)], DECK if c in (0, 4) else WOOD, (0, 0, 1))
    for sgn in (1, -1):
        mb.poly([(sgn * wa, ya, SB), (sgn * wb, yb, SB), (sgn * wb, yb, FD), (sgn * wa, ya, FD)], PAINT, (sgn, 0, 0))
        # underside: only where it shows
        inner = 0.0 if (yb <= DHY + 1e-3 or ya >= HY1 - 1e-3) else DHX if yb <= HY0 + 1e-3 else HX
        mb.poly([(sgn * inner, ya, SB), (sgn * wa, ya, SB), (sgn * wb, yb, SB), (sgn * inner, yb, SB)], PAINT, (0, 0, -1))
# the round-downs: the deck curls over at each end
for y_r, sg in ((RY0, -1), (RY1, 1)):
    mb = decks[0] if sg < 0 else decks[2]
    prev = None
    for phi in (0, 19, 38, 57, 76):
        t = math.radians(phi)
        yt, zt = y_r + sg * RD * math.sin(t), FD - RD * (1 - math.cos(t))
        yb_, zb = y_r + sg * (RD - RDT) * math.sin(t), FD - RD + (RD - RDT) * math.cos(t)
        w = wfd(yt)
        cur = (yt, zt, yb_, zb, w)
        if prev:
            (y0, z0, y0b, z0b, w0), (y1, z1, y1b, z1b, w1) = prev, cur
            mb.poly([(-w0, y0, z0), (w0, y0, z0), (w1, y1, z1), (-w1, y1, z1)], PAINT, (0, sg * 0.3, 1))
            mb.poly([(-w0, y0b, z0b), (w0, y0b, z0b), (w1, y1b, z1b), (-w1, y1b, z1b)], PAINT, (0, -sg * 0.3, -1))
            for sgn in (1, -1):
                mb.poly([(sgn * w0, y0, z0), (sgn * w1, y1, z1), (sgn * w1, y1b, z1b), (sgn * w0, y0b, z0b)], PAINT, (sgn, 0, 0))
        prev = cur
    yt, zt, yb_, zb, w = prev
    mb.poly([(-w, yt, zt), (w, yt, zt), (w, yb_, zb), (-w, yb_, zb)], PAINT, (0, sg, -0.2))
    w = wfd(y_r)
    mb.poly([(-w, y_r, SB), (w, y_r, SB), (w, y_r, FD - RDT), (-w, y_r, FD - RDT)], PAINT, (0, sg, 0))
# elevator wells and platforms
for (y0, y1, zp) in (EL1, EL2):
    mb = decks[0] if y1 < 0 else decks[2]
    for sgn in (1, -1):
        mb.poly([(sgn * ELX, y0, SB), (sgn * ELX, y1, SB), (sgn * ELX, y1, FD), (sgn * ELX, y0, FD)], DARK, (-sgn, 0, 0))
    for yy, f in ((y0, 1), (y1, -1)):
        mb.poly([(-ELX, yy, SB), (ELX, yy, SB), (ELX, yy, FD), (-ELX, yy, FD)], DARK, (0, f, 0))
    g = 0.14
    mb.box((-ELX + g, y0 + g, zp - 1.0), (ELX - g, y1 - g, zp), DECK, drop='-z')
    mb.box((-ELX + g + 0.4, y0 + g + 0.4, zp), (ELX - g - 0.4, y1 - g - 0.4, zp + 0.03), WOOD, drop='-z')
    mb.box((-ELX - 0.3, y0 - 0.3, zp - 1.1), (ELX + 0.3, y1 + 0.3, zp - 1.0), DARK, drop='-z -x +x -y +y')
for mb in decks:
    keep(mb, 'flightdeck')

# the deck-edge elevator: a platform hung outside the port side on two braced arms
mb = MB()
y0, y1, x0, x1 = DE
out = [(x0, y0), (x1 - 2.2, y0), (x1, y0 + 2.2), (x1, y1 - 2.2), (x1 - 2.2, y1), (x0, y1)]
mb.poly([(x, y, FD) for x, y in out], DECK, (0, 0, 1))
mb.poly([(x, y, FD - 0.9) for x, y in out], PAINT, (0, 0, -1))
for (xa, ya), (xb, yb) in zip(out, out[1:] + out[:1]):
    mb.poly([(xa, ya, FD - 0.9), (xb, yb, FD - 0.9), (xb, yb, FD), (xa, ya, FD)], PAINT, ((xa + xb) / 2 - 20, (ya + yb) / 2 + 8, 0))
ins = [(x0 + 0.4, y0 + 0.4), (x1 - 2.4, y0 + 0.4), (x1 - 0.4, y0 + 2.4), (x1 - 0.4, y1 - 2.4), (x1 - 2.4, y1 - 0.4), (x0 + 0.4, y1 - 0.4)]
mb.poly([(x, y, FD + 0.03) for x, y in ins], WOOD, (0, 0, 1))
for (xa, ya), (xb, yb) in zip(ins, ins[1:] + ins[:1]):
    mb.poly([(xa, ya, FD), (xb, yb, FD), (xb, yb, FD + 0.03), (xa, ya, FD + 0.03)], WOOD, ((xa + xb) / 2 - 20, (ya + yb) / 2 + 8, 0))
for yy in (y0 + 2.6, y1 - 2.6):
    mb.beam((14.1, yy, 8.2), (14.1, yy, SB), 0.5, 0.9, PAINT, up=(0, 1, 0))                 # guide rails up the side
    mb.lattice((14.2, yy, 9.2), (x1 - 2.5, yy, FD - 1.3), 1.5, 1.0, 5, PAINT, t=0.3)
    mb.beam((14.2, yy, FD - 1.25), (x1 - 1.0, yy, FD - 1.25), 0.4, 0.7, PAINT)
mb.beam((x1 - 2.6, y0 + 2.6, FD - 1.25), (x1 - 2.6, y1 - 2.6, FD - 1.25), 0.35, 0.6, PAINT)
mb.beam((20.0, y0 + 2.6, FD - 1.25), (20.0, y1 - 2.6, FD - 1.25), 0.35, 0.6, PAINT)
keep(mb, 'edge-elevator')

# markings: thin raised strips of paint
mb = MB()
MZ = 0.035


def stripe(x0, x1, y0, y1, z=FD):
    mb.box((x0, y0, z), (x1, y1, z + MZ), MARK, drop='-z')


y = -78.0
while y < 112:
    a, b = y, min(y + 6.0, 113.0)
    if not (b > EL1[0] - 0.4 and a < EL1[1] + 0.4):
        stripe(-0.3, 0.3, a, b)
    elif EL1[0] + 0.8 < a and b < EL1[1] - 0.8:
        stripe(-0.3, 0.3, a, b, EL1[2] + 0.03)
    y += 9.5
for x in (-10.0, 10.0):
    y = -84.0
    while y < 110:
        if not (x < 0 and -27 < y + 2 < 16):
            stripe(x - 0.22, x + 0.22, y, y + 4.0)
        y += 8.0
for a, b in ((-91.5, -91.0), (112.5, 113.0)):
    stripe(-10.2, 10.2, a, b)
GLYPH = {'1': ('.#.', '##.', '.#.', '.#.', '###'), '6': ('###', '#..', '###', '#.#', '###')}
for ch, ox in (('1', -5.25), ('6', 0.75)):
    for r, row in enumerate(GLYPH[ch]):
        c = 0
        while c < 3:
            if row[c] == '#':
                e = c
                while e < 3 and row[e] == '#':
                    e += 1
                stripe(ox + c * 1.5, ox + e * 1.5, -105.6 + (4 - r) * 1.8, -105.6 + (5 - r) * 1.8)
                c = e
            else:
                c += 1
keep(mb, 'markings')

# arrestor wires across the after deck, each on a pair of sheaves, and three crash barriers laid flat
mb = MB()
WIRES = [60.0 + 5.6 * i for i in range(9)]
SHEAVES = []
for y in WIRES:
    w = min(13.2, wfd(y) - 1.4)
    mb.tube((-w, y, FD + 0.09), (w, y, FD + 0.09), 0.055, GUNMETAL, 4)
    SHEAVES += [((-w, y, FD), (0, 0, 0)), ((w, y, FD), (0, 0, 0))]
for y in (6.0, 15.0, 24.0):
    for x in (-9.2, 12.6):
        mb.beam((x, y, FD + 0.12), (x, y + 3.4, FD + 0.12), 0.26, 0.2, PAINT, caps=True)
        mb.box((x - 0.3, y - 0.35, FD), (x + 0.3, y + 0.25, FD + 0.3), DECK, drop='-z')
    for k in (0.5, 1.6, 2.7):
        mb.tube((-9.2, y + k, FD + 0.06), (12.6, y + k, FD + 0.06), 0.04, GUNMETAL, 3)
keep(mb, 'wires')
S += copies(hard(box('sheave', 0.7, 0.5, 0.22, at=(0, 0, 0.11), mat=DECK), 0.04), SHEAVES)


# ---------------------------------------------------------------- catwalks, galleries, gun tubs

RAIL = Rails(PAINT, h=1.1, gap=2.6, t=0.075)
mb = MB()
CWZ = 15.92     # catwalk floor
TUBS = []       # centres of the 40 mm tubs (floor level)


def catwalk(sgn, y0, y1, step=13.0):
    n = max(1, round((y1 - y0) / step))
    pts = []
    for i in range(n + 1):
        y = lerp(y0, y1, i / n)
        pts.append((y, wfd(y)))
    for (ya, wa), (yb, wb) in zip(pts, pts[1:]):
        ia, oa, ib, ob_ = sgn * wa, sgn * (wa + 1.35), sgn * wb, sgn * (wb + 1.35)
        mb.poly([(ia, ya, CWZ), (oa, ya, CWZ), (ob_, yb, CWZ), (ib, yb, CWZ)], DECK, (0, 0, 1))
        mb.poly([(ia, ya, CWZ - 0.14), (oa, ya, CWZ - 0.14), (ob_, yb, CWZ - 0.14), (ib, yb, CWZ - 0.14)], PAINT, (0, 0, -1))
        mb.poly([(oa, ya, CWZ - 0.4), (ob_, yb, CWZ - 0.4), (ob_, yb, CWZ + 0.02), (oa, ya, CWZ + 0.02)], PAINT, (sgn, 0, 0))
    for yy, ww, f in ((pts[0][0], pts[0][1], -1), (pts[-1][0], pts[-1][1], 1)):
        mb.poly([(sgn * ww, yy, CWZ - 0.4), (sgn * (ww + 1.35), yy, CWZ - 0.4), (sgn * (ww + 1.35), yy, CWZ), (sgn * ww, yy, CWZ)], PAINT, (0, f, 0))
    line = [(sgn * (w + 1.3), y, CWZ) for y, w in pts]
    RAIL.run(mb, [(sgn * pts[0][1], pts[0][0], CWZ)] + line + [(sgn * pts[-1][1], pts[-1][0], CWZ)])
    # struts from the slab edge, and overhang brackets where there is hangar wall behind
    y = y0 + 1.0
    while y < y1:
        if HY0 + 2 < y < HY1 - 2 and wfd(y) > 16.4:
            BRACKETS.append(((sgn * HX, y, SB), (0, 0, 0 if sgn > 0 else 180)))
        y += 4.3


def gallery(sgn, y0, y1, tubs, xo=21.4, z=14.1):
    """A gun gallery hung below the deck edge: platform, bulwark, struts down to the hull side."""
    xi = HX
    mb.box((min(sgn * xi, sgn * xo), y0, z - 0.2), (max(sgn * xi, sgn * xo), y1, z), PAINT, top=DECK, drop='-x' if sgn > 0 else '+x')
    # the bulwark: a thin wall round the outside, seen from both sides
    t = 0.09
    walls = [((sgn * xo, y0), (sgn * xo, y1)), ((sgn * (xi + 3.4), y0), (sgn * xo, y0)), ((sgn * (xi + 3.4), y1), (sgn * xo, y1))]
    for (xa, ya), (xb, yb) in walls:
        lo = (min(xa, xb) - (t if xa == xb else 0), min(ya, yb) - (t if ya == yb else 0), z)
        hi = (max(xa, xb) + (t if xa == xb else 0), max(ya, yb) + (t if ya == yb else 0), z + 1.15)
        mb.box(lo, hi, PAINT, drop='-z')
    n = max(2, round((y1 - y0) / 5.5))
    for i in range(n + 1):
        y = lerp(y0 + 0.5, y1 - 0.5, i / n)
        mb.beam((sgn * (xo - 0.6), y, z - 0.2), (sgn * 13.85, y, HD + 0.1), 0.24, 0.34, PAINT, up=(0, 1, 0))
        mb.beam((sgn * (xo - 4.2), y, z - 0.2), (sgn * 13.85, y, HD + 0.1), 0.16, 0.2, PAINT, up=(0, 1, 0))
    mb.beam((sgn * (xo - 0.6), y0 + 0.5, z - 0.32), (sgn * (xo - 0.6), y1 - 0.5, z - 0.32), 0.25, 0.3, PAINT)
    for ty in tubs:
        TUBS.append((sgn * (xo - 2.45), ty, z))
    # a ladder up to the catwalk at each end
    for yy in (y0 + 0.7, y1 - 0.7):
        ladder(mb, (sgn * (wfd(yy) + 0.9), yy, z), (sgn * (wfd(yy) + 0.9), yy, CWZ + 0.9), PAINT, out=(0, 1, 0))


# port side
catwalk(1, -109.0, -80.5, 9.5)
gallery(1, -80.5, -56.0, (-74.0, -62.5))
catwalk(1, -56.0, DE[0] - 0.6)
catwalk(1, DE[1] + 0.6, 56.0)
gallery(1, 56.0, 80.5, (62.5, 74.0))
catwalk(1, 80.5, 100.0, 9.75)
# starboard side
catwalk(-1, -109.0, -72.0, 9.3)
gallery(-1, -72.0, -60.0, (-66.0,))
catwalk(-1, -60.0, -49.5)
catwalk(-1, 41.5, 56.0)
gallery(-1, 56.0, 68.0, (62.0,))
catwalk(-1, 68.0, 114.0, 9.2)
for y in list(range(-47, -23, 4)) + list(range(15, 41, 4)):
    BRACKETS.append(((-HX, y, SB), (0, 0, 180)))
keep(mb, 'catwalks')
S += copies(br.obj('bracket'), BRACKETS)


# ---------------------------------------------------------------- bow and stern under the round-downs

def supports(rows, y_end, rake, girders, y_in):
    """rows: (y, [column x...]) from inboard to the round-down. Columns, transverse girders, X bracing."""
    mb = MB()
    for y, xs in rows:
        fz, w = deck_z(y), wfd(y)
        mb.beam((-w + 0.4, y, SB - 0.4), (w - 0.4, y, SB - 0.4), 0.35, 0.8, PAINT)
        for x in xs:
            for sx in (-1, 1):
                mb.beam((sx * x, y, fz), (sx * x, y, SB - 0.8), 0.5, 0.5, PAINT, up=(0, 1, 0))
                mb.box((sx * x - 0.5, y - 0.5, fz), (sx * x + 0.5, y + 0.5, fz + 0.25), PAINT, drop='-z')
        outer = max(xs)
        for sx in (-1, 1):
            mb.beam((sx * outer, y, lerp(fz, SB, 0.52)), (sx * (w - 0.9), y, SB - 0.75), 0.3, 0.3, PAINT, up=(0, 1, 0))
            if len(xs) > 1:
                a, b = min(xs), outer
                mb.beam((sx * a, y, fz + 0.3), (sx * b, y, SB - 1.0), 0.2, 0.2, PAINT, up=(0, 1, 0))
                mb.beam((sx * b, y, fz + 0.3), (sx * a, y, SB - 1.0), 0.2, 0.2, PAINT, up=(0, 1, 0))
                if sx > 0:
                    mb.beam((-a, y, lerp(fz, SB, 0.5)), (a, y, lerp(fz, SB, 0.5)), 0.22, 0.22, PAINT)
            else:
                mb.beam((sx * outer, y, fz + 0.3), (-sx * outer, y, SB - 1.0), 0.2, 0.2, PAINT, up=(0, 1, 0))
    # fore-and-aft bracing between the rows
    for (ya, xa), (yb, xb) in zip(rows, rows[1:]):
        for sx in (-1, 1):
            a, b = max(xa), max(xb)
            mb.beam((sx * a, ya, deck_z(ya) + 0.3), (sx * b, yb, SB - 1.0), 0.2, 0.2, PAINT)
            mb.beam((sx * b, yb, deck_z(yb) + 0.3), (sx * a, ya, SB - 1.0), 0.2, 0.2, PAINT)
            mb.beam((sx * a, ya, lerp(deck_z(ya), SB, 0.5)), (sx * b, yb, lerp(deck_z(yb), SB, 0.5)), 0.2, 0.2, PAINT)
    # girders under the slab, and the raking struts that carry the round-down
    for x in girders:
        w = min(wfd(y_in), wfd(y_end)) - 0.6
        if abs(x) < w:
            mb.beam((x, y_in, SB - 0.35), (x, y_end, SB - 0.35), 0.3, 0.7, PAINT)
    y, xs = rows[-1]
    sg = 1 if y_end > 0 else -1
    for x0, x1 in rake:
        t = math.radians(52)
        top = (y_end + sg * (RD - RDT) * math.sin(t), FD - RD + (RD - RDT) * math.cos(t) - 0.1)
        for sx in (-1, 1):
            mb.beam((sx * x0, y, deck_z(y) + 0.2), (sx * x1, top[0], top[1]), 0.36, 0.36, PAINT)
        mb.beam((-x1 - 1.5, top[0], top[1]), (x1 + 1.5, top[0], top[1]), 0.3, 0.45, PAINT)
    return mb


keep(supports([(-103.5, [7.6, 2.6]), (-108.6, [6.2]), (RY0, [4.8])], RY0, [(4.8, 7.5), (2.9, 3.2)], (-10, -5, 0, 5, 10), DHY), 'bow-supports')
keep(supports([(108.5, [11.2, 4.2]), (112.4, [10.4, 3.9]), (RY1, [9.0, 3.2])], RY1, [(9.0, 9.8), (3.2, 3.6)], (-10, -5, 0, 5, 10), HY1), 'stern-supports')

# forecastle fittings: capstans, anchor cables, bitts, the anchors in their hawse pipes
mb = MB()
for sx in (-1, 1):
    add(cyl('capstan', 0.85, 1.1, at=(sx * 2.3, -106.0, deck_z(-106) + 0.55), segs=10, mat=PAINT), 0.1)
    add(cyl('capstan-top', 1.05, 0.25, at=(sx * 2.3, -106.0, deck_z(-106) + 1.2), segs=10, mat=DECK), 0.06)
    mb.beam((sx * 2.3, -106.9, deck_z(-106.9) + 0.14), (sx * 1.6, -118.6, deck_z(-118.6) + 0.14), 0.34, 0.2, GUNMETAL)
    mb.beam((sx * 2.3, -105.2, deck_z(-105.2) + 0.14), (sx * 2.6, -100.5, deck_z(-100.5) + 0.14), 0.34, 0.2, GUNMETAL)
    # anchor: shank, crown and flukes, hard against the flare
    ax, ay, az = side_x(-118.0, 6.6) + 0.25, -118.0, 6.6
    add(cyl('hawse', 0.75, 0.5, at=(sx * (ax - 0.1), ay, az + 1.5), rot=(0, sx * 68, -sx * 18), segs=10, mat=PAINT), 0.08)
    add(box('shank', 0.34, 0.4, 2.6, at=(sx * (ax + 0.05), ay, az + 0.3), rot=(0, sx * 16, 0), mat=GUNMETAL), 0.06)
    add(box('crown', 0.6, 2.6, 0.7, at=(sx * (ax - 0.3), ay, az - 1.0), rot=(0, sx * 16, 0), mat=GUNMETAL), 0.1)
    for dy in (-1.0, 1.0):
        add(box('fluke', 0.3, 0.6, 1.5, at=(sx * (ax - 0.05), ay + dy, az - 0.4), rot=(0, sx * 16, 0), mat=GUNMETAL), 0.08)
keep(mb, 'cables')
BITTS = []
for sx in (-1, 1):
    for y in (-112.0, -101.5, 107.0, 118.5):
        x = side_x(y, deck_z(y)) - 1.2
        BITTS += [((sx * x, y - 0.5, deck_z(y)), (0, 0, 0)), ((sx * x, y + 0.5, deck_z(y)), (0, 0, 0))]
S += copies(hard(cyl('bitt', 0.24, 0.8, at=(0, 0, 0.4), segs=6, mat=PAINT), 0.05), BITTS)
# guard rails round the forecastle and the fantail
mb = MB()
for sx in (-1, 1):
    RAIL.run(mb, [(sx * (side_x(y, deck_z(y)) - 0.25), y + warp(sy(y), deck_z(y)), deck_z(y)) for y in (-123.5, -121, -117, -112, -106, -100, -93, -86)])
    RAIL.run(mb, [(sx * (side_x(y, 8.5) - 0.25), y, HD) for y in (105.5, 110, 115, 119, 122, 123.6, 124.5)] + ([(0, 124.75, HD)] if sx > 0 else [(0, 124.75, HD)]))
keep(mb, 'deck-rails')


# ---------------------------------------------------------------- the island

XO, XI = -17.3, -10.9
XC = (XO + XI) / 2
IY0, IY1 = -24.0, 13.0
GX = -13.65          # the line the 5-inch mounts stand on

# the trunk under it, hung on the starboard side
mb = MB()
prof = [(XO, FD), (XO, 12.3), (-14.0, 9.6), (-HX, 9.6), (-HX, FD)]
for ya, f in ((-22.0, -1), (11.0, 1)):
    mb.poly([(x, ya, z) for x, z in prof], PAINT, (0, f, 0))
mb.poly([(XO, -22, FD), (XO, 11, FD), (XO, 11, 12.3), (XO, -22, 12.3)], PAINT, (-1, 0, 0))
mb.poly([(XO, -22, 12.3), (XO, 11, 12.3), (-14.0, 11, 9.6), (-14.0, -22, 9.6)], PAINT, (-1, 0, -1))
for y in (-16.5, -11, -5.5, 0, 5.5):
    mb.beam((XO - 0.1, y, 12.5), (XO - 0.1, y, FD), 0.3, 0.3, PAINT, up=(0, 1, 0))
    mb.beam((XO - 0.05, y, 12.4), (-14.05, y, 9.7), 0.3, 0.3, PAINT, up=(0, 1, 0))
keep(mb, 'trunk')

t1 = drop(box('island-1', XI - XO, IY1 - IY0, 5.2, at=(XC, (IY0 + IY1) / 2, FD + 2.6), mat=PAINT), '-z +z')
add(t1, 0.16)
t3 = drop(box('island-3', 5.6, 14.7, 2.6, at=(XC, -15.85, 23.5), mat=PAINT), '-z')
add(t3, 0.2)
t4 = drop(box('island-4', 4.8, 10.4, 2.6, at=(XC, -17.2, 26.1), mat=PAINT), '-z +z')
add(t4, 0.3)
for name, y0, y1 in (('house-fwd', -39.6, IY0), ('house-aft', IY1, 31.6)):
    add(drop(box(name, 5.3, y1 - y0, 2.6, at=(GX, (y0 + y1) / 2, FD + 1.3), mat=PAINT), '-z'), 0.14)

mb = MB()
irail = Rails(PAINT, h=1.05, gap=2.2, t=0.07)


def plate(x0, x1, y0, y1, z, rail='nsew', t=0.14):
    mb.box((x0, y0, z - t), (x1, y1, z), PAINT, top=DECK)
    if 'w' in rail:
        irail.run(mb, [(x0 + 0.06, y0 + 0.06, z), (x0 + 0.06, y1 - 0.06, z)])
    if 'e' in rail:
        irail.run(mb, [(x1 - 0.06, y0 + 0.06, z), (x1 - 0.06, y1 - 0.06, z)])
    if 's' in rail:
        irail.run(mb, [(x0 + 0.06, y0 + 0.06, z), (x1 - 0.06, y0 + 0.06, z)])
    if 'n' in rail:
        irail.run(mb, [(x0 + 0.06, y1 - 0.06, z), (x1 - 0.06, y1 - 0.06, z)])


def screen(x0, x1, y0, y1, z, h=1.1, sides='nsew', t=0.08):
    """A solid bulwark round a platform (two-sided)."""
    if 's' in sides:
        mb.box((x0, y0, z), (x1, y0 + t, z + h), PAINT, drop='-z')
    if 'n' in sides:
        mb.box((x0, y1 - t, z), (x1, y1, z + h), PAINT, drop='-z')
    if 'w' in sides:
        mb.box((x0, y0, z), (x0 + t, y1, z + h), PAINT, drop='-z')
    if 'e' in sides:
        mb.box((x1 - t, y0, z), (x1, y1, z + h), PAINT, drop='-z')


def windows(p0, p1, z0, z1, n, gap=1.15):
    """A strip of bridge windows on a wall from p0 to p1 (x, y), facing n."""
    a, b, nn = Vector((*p0, 0)), Vector((*p1, 0)), Vector((*n, 0))
    o = nn * 0.035
    mb.poly([a + o + Vector((0, 0, z0)), b + o + Vector((0, 0, z0)), b + o + Vector((0, 0, z1)), a + o + Vector((0, 0, z1))], GLASS, nn)
    d = (b - a)
    k = max(1, round(d.length / gap))
    d.normalize()
    o2 = nn * 0.07
    for i in range(k + 1):
        c = a.lerp(b, i / k)
        mb.poly([c - d * 0.09 + o2 + Vector((0, 0, z0 - 0.08)), c + d * 0.09 + o2 + Vector((0, 0, z0 - 0.08)),
                 c + d * 0.09 + o2 + Vector((0, 0, z1 + 0.08)), c - d * 0.09 + o2 + Vector((0, 0, z1 + 0.08))], PAINT, nn)
    for zz in (z0 - 0.08, z1 + 0.08):
        mb.poly([a + o2 + Vector((0, 0, zz - 0.07)), b + o2 + Vector((0, 0, zz - 0.07)), b + o2 + Vector((0, 0, zz + 0.07)), a + o2 + Vector((0, 0, zz + 0.07))], PAINT, nn)


# belt and inboard gallery on the base block
mb.box((XO - 0.07, IY0 - 0.07, 19.5), (XI + 0.07, IY1 + 0.07, 19.72), PAINT, drop='+z -z')
plate(XI, XI + 1.25, -21.5, 9.0, 19.6, rail='ens')
for y in range(-20, 9, 4):
    mb.beam((XI + 1.1, y, 19.46), (XI, y, 18.5), 0.12, 0.14, PAINT, up=(0, 1, 0))
ladder(mb, (XI + 0.75, 9.6, FD), (XI + 0.2, 9.6, 19.6), PAINT, out=(0, 1, 0))
# flag bridge level: the roof of the base block, widened into wings
plate(XO - 0.9, XI + 1.0, IY0 - 0.6, -7.2, 22.23, rail='n', t=0.17)
screen(XO - 0.9, XI + 1.0, IY0 - 0.6, -7.2, 22.23, 1.15, 'swe')
plate(XO - 0.05, XI + 0.05, -7.2, IY1 + 0.05, 22.23, rail='new', t=0.12)
windows((XC - 2.6, -23.2), (XC + 2.6, -23.2), 23.45, 24.3, (0, -1))
windows((XC + 2.8, -23.0), (XC + 2.8, -9.0), 23.45, 24.3, (1, 0))
windows((XC - 2.8, -23.0), (XC - 2.8, -9.0), 23.45, 24.3, (-1, 0))
# navigating bridge: wings out to both sides
plate(XO - 1.3, XI + 1.3, -23.8, -10.6, 24.83, rail='n', t=0.17)
screen(XO - 1.3, XI + 1.3, -23.8, -10.6, 24.83, 1.15, 'swe')
windows((XC - 2.1, -22.4), (XC + 2.1, -22.4), 25.95, 26.85, (0, -1), 1.0)
windows((XC + 2.4, -22.1), (XC + 2.4, -12.4), 25.95, 26.85, (1, 0))
windows((XC - 2.4, -22.1), (XC - 2.4, -12.4), 25.95, 26.85, (-1, 0))
for sx in (-1, 1):       # wing supports
    for y in (-22.5, -17, -11.5):
        mb.beam((XC + sx * 4.3, y, 24.66), (XC + sx * 2.85, y, 23.3), 0.12, 0.14, PAINT, up=(0, 1, 0))
        mb.beam((XC + sx * 4.0, y, 22.06), (XC + sx * 3.25, y, 21.0), 0.12, 0.14, PAINT, up=(0, 1, 0))
# compass platform and the forward director
plate(XO + 0.3, XI - 0.3, -22.9, -11.4, 27.43, rail='', t=0.17)
screen(XO + 0.3, XI - 0.3, -22.9, -11.4, 27.43, 1.0)
ladder(mb, (XI + 0.4, -8.2, 22.2), (XI + 0.4, -10.0, 24.8), PAINT, out=(1, 0, 0))
ladder(mb, (XC + 1.0, -11.0, 24.8), (XC + 1.0, -11.5, 27.4), PAINT, out=(0, 1, 0))
isl = keep(mb, 'island-decks')

for y in (-21.0, -13.5, -4.0, 3.5, 10.5):
    DOORS.append(((XI, y, FD + 0.02), (0, 0, 90)))
for y in (-18.0, -9.0, 1.0, 7.5):
    DOORS.append(((XI, y, 19.62), (0, 0, 90)))
for y in (-36.0, 22.0, 29.5):
    DOORS.append(((GX + 2.65, y, FD + 0.02), (0, 0, 90)))
DOORS.append(((XC, -8.5, 22.22), (0, 0, 180)))
for y in range(-22, 12, 4):
    PORTS.append(((XI, y + 2.5, 21.0), (0, 0, 90)))
    PORTS.append(((XO, y + 0.5, 21.0), (0, 0, -90)))
    PORTS.append(((XO, y + 2.5, 18.4), (0, 0, -90)))


def director(name, at):
    """Gun director: an armoured box on a barbette with rangefinder arms and a radar mattress."""
    x, y, z = at
    add(cyl(name + '-barbette', 1.55, 1.2, at=(x, y, z + 0.6), segs=14, mat=PAINT), 0.08)
    add(box(name, 2.9, 3.1, 2.0, at=(x, y, z + 2.2), mat=PAINT), 0.28)
    add(cyl(name + '-rf', 0.26, 5.4, at=(x, y - 0.4, z + 2.75), rot=(0, 90, 0), segs=8, mat=PAINT), 0.05)
    add(box(name + '-hood', 1.0, 0.9, 0.45, at=(x - 0.6, y + 0.5, z + 3.4), mat=PAINT), 0.1)
    add(box(name + '-slit', 1.6, 0.05, 0.3, at=(x, y - 1.56, z + 2.5), mat=GLASS), 0.0)
    m2 = MB()
    c = Vector((x, y - 0.3, z + 4.55))
    for dz in (-0.75, 0, 0.75):
        m2.beam(c + Vector((-1.3, 0, dz)), c + Vector((1.3, 0, dz)), 0.09, 0.09, GUNMETAL)
    for dx in (-1.3, -0.43, 0.43, 1.3):
        m2.beam(c + Vector((dx, 0, -0.75)), c + Vector((dx, 0, 0.75)), 0.09, 0.09, GUNMETAL)
    m2.poly([c + Vector((-1.3, 0.12, -0.75)), c + Vector((1.3, 0.12, -0.75)), c + Vector((1.3, 0.12, 0.75)), c + Vector((-1.3, 0.12, 0.75))], INNER, (0, -1, 0))
    m2.poly([c + Vector((-1.3, 0.14, -0.75)), c + Vector((1.3, 0.14, -0.75)), c + Vector((1.3, 0.14, 0.75)), c + Vector((-1.3, 0.14, 0.75))], INNER, (0, 1, 0))
    m2.beam((x, y + 0.2, z + 3.2), (x, y - 0.2, z + 4.5), 0.2, 0.2, PAINT)
    keep(m2, name + '-radar')


director('director-fwd', (XC, -18.4, 27.4))
director('director-aft', (XC, 10.2, 22.2))

# funnel: raked a little, with a dark cap, grating, steam pipes and searchlight platforms
FYC = 1.2
rings = [superellipse(2.4, 6.2, 2.7, 24, at=(XC, FYC + 0.07 * (z - 22.2), z)) for z in (22.1, 26.0, 30.0, 33.2)]
add(loft('funnel', rings, cap_start=False, cap_end=False, mat=PAINT), 0.0, sharp=62)
FTOP = FYC + 0.07 * 11.0
top = FTOP
caprings = [superellipse(2.4 + a, 6.2 + a, 2.7, 24, at=(XC, top + 0.07 * dz, 33.2 + dz)) for a, dz in ((0.0, 0.0), (0.28, 0.25), (0.28, 1.45), (0.1, 1.6), (-0.25, 1.6), (-0.3, 0.9))]
add(loft('funnel-cap', caprings, cap_start=False, cap_end=True, mat=DARK), 0.0, sharp=40)
for z in (25.2, 29.4):
    band_ = [superellipse(2.4 + a, 6.2 + a, 2.7, 24, at=(XC, FYC + 0.07 * (z + dz - 22.2), z + dz)) for a, dz in ((0.0, -0.05), (0.1, 0.0), (0.1, 0.3), (0.0, 0.35))]
    add(loft('funnel-band', band_, cap_start=False, cap_end=False, mat=PAINT), 0.0, sharp=40)
mb = MB()
for dy in (-4.2, -2.1, 0, 2.1, 4.2):
    mb.beam((XC - 2.2, top + dy + 0.1, 34.72), (XC + 2.2, top + dy + 0.1, 34.72), 0.12, 0.12, GUNMETAL)
for dx in (-0.55, 0.55):
    mb.tube((XC + dx, FYC + 6.35, 22.2), (XC + dx, top + 6.5, 35.6), 0.2, PAINT, 6, caps=True)
mb.tube((XC, FYC - 6.3, 22.2), (XC, top - 6.45, 33.6), 0.16, PAINT, 5, caps=True)
ladder(mb, (XC + 2.42, FYC + 3.2, 22.2), (XC + 2.42, FYC + 3.2 + 0.8, 33.2), PAINT, out=(1, 0, 0))
for sx in (-1, 1):       # searchlight platforms
    x0, x1 = (XC + 2.2, XI + 1.2) if sx > 0 else (XO - 1.2, XC - 2.2)
    mb.box((x0, -1.0, 27.3), (x1, 4.0, 27.42), PAINT, top=DECK)
    irail.run(mb, [(x0 if sx < 0 else x1, -1.0, 27.42), (x0 if sx < 0 else x1, 4.0, 27.42)])
    irail.run(mb, [(x0, -1.0, 27.42), (x1, -1.0, 27.42)])
    irail.run(mb, [(x0, 4.0, 27.42), (x1, 4.0, 27.42)])
    xm = (x0 + x1) / 2 + sx * 0.5
    mb.beam((xm + sx * 0.8, 0.0, 27.3), (XC + sx * 2.4, 0.0, 25.6), 0.12, 0.14, PAINT, up=(0, 1, 0))
    mb.beam((xm + sx * 0.8, 3.0, 27.3), (XC + sx * 2.4, 3.0, 25.6), 0.12, 0.14, PAINT, up=(0, 1, 0))
    add(cyl('light-post', 0.14, 0.7, at=(xm, 1.5, 27.75), segs=6, mat=PAINT), 0.0)
    add(cyl('searchlight', 0.6, 0.75, at=(xm, 1.5, 28.6), rot=(0, 90 + sx * 12, 0), segs=12, mat=PAINT), 0.06)
    add(cyl('searchlight-glass', 0.52, 0.04, at=(xm + sx * 0.385, 1.5, 28.6 + 0.08), rot=(0, 90 + sx * 12, 0), segs=12, mat=GLASS), 0.0)
keep(mb, 'funnel-fittings')

# tripod mast: platform for the air-search radar, yard, topmast
MY = -10.0
mb = MB()
mb.tube((XC, MY, 24.8), (XC, MY, 44.0), 0.42, PAINT, 8, r2=0.26)
mb.tube((XC, MY, 44.0), (XC, MY, 49.5), 0.16, PAINT, 5, r2=0.08, caps=True)
for sx in (-1, 1):
    mb.tube((XC + sx * 2.3, MY + 3.4, 22.2), (XC + sx * 0.2, MY + 0.25, 37.6), 0.27, PAINT, 6, r2=0.2)
    mb.tube((XC + sx * 1.6, MY + 2.45, 27.0), (XC, MY, 27.6), 0.1, PAINT, 3)
    mb.tube((XC + sx * 1.0, MY + 1.55, 32.3), (XC, MY, 32.9), 0.1, PAINT, 3)
mb.tube((XC - 1.6, MY + 2.45, 27.0), (XC + 1.6, MY + 2.45, 27.0), 0.1, PAINT, 3)
PY0, PY1, PZ = MY - 6.0, MY + 1.6, 37.6
mb.box((XC - 2.3, PY0, PZ - 0.14), (XC + 2.3, PY1, PZ), PAINT, top=DECK)
irail.run(mb, [(XC - 2.24, PY0 + 0.06, PZ), (XC + 2.24, PY0 + 0.06, PZ), (XC + 2.24, PY1 - 0.06, PZ), (XC - 2.24, PY1 - 0.06, PZ)], closed=True)
for sx in (-1, 1):
    mb.beam((XC + sx * 2.1, PY0 + 0.3, PZ - 0.14), (XC + sx * 0.3, MY - 0.2, PZ - 3.6), 0.14, 0.14, PAINT)
    mb.beam((XC + sx * 2.1, PY1 - 0.3, PZ - 0.14), (XC + sx * 0.3, MY + 0.2, PZ - 2.4), 0.14, 0.14, PAINT)
mb.beam((XC, PY0 + 0.4, PZ - 0.14), (XC, MY - 0.3, PZ - 4.2), 0.16, 0.16, PAINT)
# yard with braces and a lookout platform above
YZ = 42.6
mb.tube((XC - 7.0, MY, YZ), (XC + 7.0, MY, YZ), 0.13, PAINT, 5, caps=True)
for sx in (-1, 1):
    mb.tube((XC + sx * 6.2, MY, YZ), (XC, MY, YZ + 3.2), 0.035, GUNMETAL, 3)
    mb.tube((XC + sx * 5.0, MY, YZ), (XC, MY, YZ - 2.4), 0.05, PAINT, 3)
    mb.tube((XC + sx * 6.6, MY, YZ), (XC + sx * 6.6, MY, YZ - 1.2), 0.05, PAINT, 3)
mb.box((XC - 0.9, MY - 0.9, 45.2), (XC + 0.9, MY + 0.9, 45.32), PAINT)
irail.h = 0.9
irail.run(mb, [(XC - 0.85, MY - 0.85, 45.32), (XC + 0.85, MY - 0.85, 45.32), (XC + 0.85, MY + 0.85, 45.32), (XC - 0.85, MY + 0.85, 45.32)], closed=True)
irail.h = 1.05
mb.tube((XC, MY + 0.2, 40.0), (XC, MY + 3.6, 42.4), 0.07, PAINT, 3)          # gaff
mb.box((XC - 0.5, MY - 0.25, 49.3), (XC + 0.5, MY + 0.25, 49.9), PAINT)       # homing beacon
ladder(mb, (XC + 0.45, MY - 0.05, 24.8), (XC + 0.3, MY - 0.05, PZ), PAINT, w=0.4, out=(1, 0, 0))
# signal halyards from the yard to the flag bags
for sx in (-1, 1):
    for k in (2.5, 4.4, 6.2):
        mb.tube((XC + sx * k, MY, YZ - 0.1), (XC + sx * 2.6, MY + 4.5 + k * 0.3, 22.4), 0.022, GUNMETAL, 3)
keep(mb, 'mast')
add(cyl('radar-post', 0.36, 1.5, at=(XC, MY - 4.2, PZ + 0.75), segs=8, mat=PAINT), 0.05)

# air-search radar: a mattress aerial, turning
RP = (XC, MY - 4.2, PZ + 1.5)
mb = MB()
c = Vector(RP) + Vector((0, -0.55, 2.7))
W2, H2 = 2.6, 2.3
for i in range(5):
    z = lerp(-H2, H2, i / 4)
    mb.beam(c + Vector((-W2, 0, z)), c + Vector((W2, 0, z)), 0.11, 0.11, GUNMETAL)
for i in range(6):
    x = lerp(-W2, W2, i / 5)
    mb.beam(c + Vector((x, 0, -H2)), c + Vector((x, 0, H2)), 0.11, 0.11, GUNMETAL)
for i in range(4):
    x = lerp(-W2, W2, (i + 0.5) / 4)
    for j in range(3):
        z = lerp(-H2, H2, (j + 0.5) / 3)
        mb.beam(c + Vector((x - 0.5, -0.25, z)), c + Vector((x + 0.5, -0.25, z)), 0.06, 0.06, GUNMETAL)
        mb.beam(c + Vector((x, -0.25, z)), c + Vector((x, 0, z)), 0.05, 0.05, GUNMETAL)
mb.tube(Vector(RP), Vector(RP) + Vector((0, 0, 2.7)), 0.2, PAINT, 6, caps=True)
mb.beam(Vector(RP) + Vector((0, 0, 2.7)), c, 0.3, 0.3, PAINT, caps=True)
mb.beam(Vector(RP) + Vector((0, 0, 0.6)), c + Vector((0, 0, -H2)), 0.12, 0.12, PAINT)
mb.beam(Vector(RP) + Vector((0, 0.1, 2.7)), c + Vector((-W2 * 0.8, 0, H2 * 0.6)), 0.08, 0.08, PAINT)
mb.beam(Vector(RP) + Vector((0, 0.1, 2.7)), c + Vector((W2 * 0.8, 0, H2 * 0.6)), 0.08, 0.08, PAINT)
mb.box((RP[0] - 0.5, RP[1] - 0.5, RP[2]), (RP[0] + 0.5, RP[1] + 0.5, RP[2] + 0.5), PAINT, drop='-z')
radar = mb.obj('radar')
pivot(radar, RP)
tag(radar, 'radar', rpm=6)

# aircraft crane aft of the island
CY = 17.6
add(cyl('crane-post', 0.85, 2.6, at=(GX, CY, 19.6 + 1.3), segs=12, mat=PAINT), 0.08)
add(box('crane-cab', 2.5, 3.0, 2.1, at=(GX, CY + 0.2, 23.25), mat=PAINT), 0.18)
add(box('crane-window', 1.7, 0.05, 0.7, at=(GX, CY + 1.72, 23.6), mat=GLASS), 0.0)
mb = MB()
tip = Vector((GX + 0.6, CY + 14.6, 31.2))
mb.lattice((GX, CY + 1.4, 23.0), tip, 1.5, 0.5, 9, PAINT, t=0.2)
mb.beam((GX - 0.8, CY - 0.9, 24.3), (GX, CY - 0.3, 27.8), 0.16, 0.16, PAINT)
mb.beam((GX + 0.8, CY - 0.9, 24.3), (GX, CY - 0.3, 27.8), 0.16, 0.16, PAINT)
mb.beam((GX, CY + 1.0, 24.3), (GX, CY - 0.3, 27.8), 0.16, 0.16, PAINT)
for dx in (-0.12, 0.12):
    mb.tube((GX + dx, CY - 0.3, 27.8), tip + Vector((dx, 0, 0.2)), 0.035, GUNMETAL, 3)
mb.tube(tip, tip + Vector((0, 0, -5.0)), 0.035, GUNMETAL, 3)
mb.box((tip.x - 0.25, tip.y - 0.2, tip.z - 5.8), (tip.x + 0.25, tip.y + 0.2, tip.z - 5.0), GUNMETAL)
keep(mb, 'crane')

# whip aerials along the starboard deck edge, and the landing signal platform aft to port
mb = MB()
for y in (-99.5, -84.5, 76.5, 91.5):
    x = -(wfd(y) + 0.9)
    mb.lattice((x, y, CWZ), (x, y, CWZ + 9.5), 0.5, 0.14, 7, PAINT, t=0.07)
    mb.tube((x, y, CWZ + 9.5), (x, y, CWZ + 12.5), 0.025, PAINT, 3)
lx = wfd(104.0)
mb.box((lx, 100.6, FD - 0.5), (lx + 2.4, 105.6, FD - 0.36), PAINT, top=DECK)
mb.box((lx + 0.2, 100.6, FD - 0.36), (lx + 2.4, 100.7, FD + 1.9), RAFT, drop='-z')
RAIL.run(mb, [(lx + 2.34, 100.7, FD - 0.36), (lx + 2.34, 105.54, FD - 0.36), (lx, 105.54, FD - 0.36)])
mb.beam((lx + 2.2, 103.5, FD - 0.5), (HX + 1.5, 103.5, SB - 0.1), 0.14, 0.14, PAINT, up=(0, 1, 0))
keep(mb, 'aerials')
# deck-edge rail between the catwalk ends and the island, starboard
mb = MB()
RAIL.run(mb, [(-16.42, -49.5, FD), (-16.42, -40.0, FD)])
RAIL.run(mb, [(-16.42, 32.0, FD), (-16.42, 41.5, FD)])
keep(mb, 'edge-rails')

# life rafts, slung in pairs under the catwalks and on the island
raft = hard(box('raft', 0.42, 3.2, 1.5, mat=RAFT), 0.16)
RAFTS = []
for sgn in (1, -1):
    for y in list(range(-50, -18, 8)) + list(range(8, 54, 8)) + list(range(84, 100, 8)) + list(range(-104, -84, 8)):
        if sgn < 0 and -52 < y < 42:
            continue
        RAFTS.append(((sgn * (wfd(y) + 1.62), y, CWZ - 0.25), (0, sgn * 12, 0)))
for y in (-2.5, 4.5):
    RAFTS.append(((XO - 0.24, y - 8, 20.6), (0, 0, 0)))
    RAFTS.append(((XO - 0.24, y - 8, 18.6), (0, 0, 0)))
S += copies(raft, RAFTS)


# ---------------------------------------------------------------- the small things

mb = MB()
# catapult tracks forward
for x in (-8.7, 8.7):
    mb.box((x - 0.28, -111.0, FD), (x + 0.28, -72.0, FD + 0.03), DECK, drop='-z')
    mb.box((x - 0.5, -72.6, FD), (x + 0.5, -71.4, FD + 0.12), DECK, drop='-z')
# boats in the after boat pockets, on davits
BOATS = []
for sgn in (1, -1):
    for by in (86.0,) if sgn > 0 else (86.0, 71.5):
        BOATS.append(((sgn * 16.3, by, 10.6), (0, 0, 0)))
        for dy in (-2.6, 2.6):
            mb.beam((sgn * 13.9, by + dy, HD), (sgn * 14.6, by + dy, 12.6), 0.22, 0.3, PAINT, up=(0, 1, 0))
            mb.beam((sgn * 14.6, by + dy, 12.6), (sgn * 16.4, by + dy, 13.3), 0.2, 0.26, PAINT, up=(0, 1, 0))
            mb.tube((sgn * 16.3, by + dy, 13.25), (sgn * 16.3, by + dy, 11.1), 0.03, GUNMETAL, 3)
# accommodation ladder, port side, down to a landing stage at the waterline
ax0, ax1 = 14.15, 15.35
top_, bot_ = Vector((0, 26.5, HD + 0.2)), Vector((0, 41.5, 1.2))
for x in (ax0, ax1):
    mb.beam((x, top_.y, top_.z), (x, bot_.y, bot_.z), 0.1, 0.34, PAINT)
    mb.tube((x, top_.y, top_.z + 1.0), (x, bot_.y, bot_.z + 1.0), 0.035, PAINT, 3)
mb.poly([(ax0, top_.y, top_.z - 0.05), (ax1, top_.y, top_.z - 0.05), (ax1, bot_.y, bot_.z - 0.05), (ax0, bot_.y, bot_.z - 0.05)], DECK, (0, 0.5, 1))
mb.poly([(ax0, top_.y, top_.z - 0.1), (ax1, top_.y, top_.z - 0.1), (ax1, bot_.y, bot_.z - 0.1), (ax0, bot_.y, bot_.z - 0.1)], PAINT, (0, -0.5, -1))
mb.box((ax0, 41.5, 1.0), (ax1 + 0.5, 44.0, 1.14), PAINT, top=DECK)
mb.box((14.0, 24.3, HD + 0.08), (ax1 + 0.2, 26.5, HD + 0.2), PAINT, top=DECK)
for yy, zz in ((top_.y, top_.z), (34.0, 4.95), (bot_.y, bot_.z)):
    mb.tube((ax1, yy, zz), (ax1, yy, zz + 1.0), 0.035, PAINT, 3)
    mb.tube((ax0, yy, zz), (ax0, yy, zz + 1.0), 0.035, PAINT, 3)
mb.tube((ax1 + 0.2, 34.0, 4.9), (14.3, 30.0, HD + 2.2), 0.03, GUNMETAL, 3)
mb.tube((ax1 + 0.4, 43.0, 1.1), (14.3, 38.0, HD + 2.2), 0.03, GUNMETAL, 3)
# a pipe run and a rubbing strake along each side
for sgn in (1, -1):
    mb.beam((sgn * 14.07, -36, 7.45), (sgn * 14.07, 58, 7.45), 0.14, 0.2, PAINT)
    mb.beam((sgn * 14.05, -30, 1.9), (sgn * 14.05, 50, 1.9), 0.1, 0.3, PAINT)
# island fittings: flag bags, lockers, 20 mm guns, lamps, aerials, the small radar aloft
for sx in (-1, 1):
    mb.box((XC + sx * 2.3 - 0.45, -5.9, 22.23), (XC + sx * 2.3 + 0.45, -3.6, 23.3), PAINT, drop='-z')
    mb.tube((XC + sx * 4.0, -22.6, 24.83), (XC + sx * 4.0, -22.6, 26.1), 0.07, PAINT, 4)
    add(cyl('lamp', 0.3, 0.42, at=(XC + sx * 4.0, -22.75, 26.2), rot=(90, 0, 0), segs=8, mat=PAINT), 0.04)
    add(cyl('lamp-glass', 0.25, 0.03, at=(XC + sx * 4.0, -22.975, 26.2), rot=(90, 0, 0), segs=8, mat=GLASS), 0.0)
    add(cyl('pelorus', 0.5, 1.0, at=(XC + sx * 3.7, -12.4, 25.33), segs=10, mat=PAINT), 0.06)
    add(box('pelorus-head', 0.4, 0.55, 0.35, at=(XC + sx * 3.7, -12.4, 26.0), mat=GUNMETAL), 0.06)
    mb.tube((XC + sx * 2.6, -22.5, 28.4), (XC + sx * 3.0, -23.2, 33.5), 0.022, PAINT, 3)
mb.tube((XC, MY, 46.5), (XC, MY - 0.7, 46.5), 0.08, PAINT, 4)
mb.box((XC - 0.75, MY - 0.95, 46.2), (XC + 0.75, MY - 0.75, 46.9), GUNMETAL)
ladder(mb, (XO - 0.06, 6.0, FD - 3.5), (XO - 0.06, 6.0, 22.2), PAINT, out=(-1, 0, 0))
ladder(mb, (XI + 0.06, -23.0, 19.6), (XI + 0.06, -23.0, 22.2), PAINT, out=(1, 0, 0))
keep(mb, 'fittings')
LOCKERS = [((XI + 0.6, y, FD), (0, 0, 0)) for y in (-17.0, -6.5, -1.0, 6.5)] + [((GX + 3.25, y, FD), (0, 0, 0)) for y in (-33.0, -28.5, 16.5, 25.0)]
LOCKERS += [((-15.6, y, FD), (0, 0, 0)) for y in (-48.5, 40.5)]
S += copies(hard(drop(box('locker', 0.9, 2.2, 1.05, at=(0, 0, 0.525), mat=PAINT), '-z'), 0.07), LOCKERS)
VENTS = [((GX - 1.7, -37.5, FD + 2.6), (0, 0, 0)), ((GX + 1.7, -31.5, FD + 2.6), (0, 0, 0)), ((GX - 1.8, 21.5, FD + 2.6), (0, 0, 0)), ((GX + 1.8, 14.5, FD + 2.6), (0, 0, 0)),
         ((XC - 2.6, 5.5, 22.23), (0, 0, 0)), ((XC + 2.6, 8.0, 22.23), (0, 0, 0))]
S += copies(hard(lathe('vent', [(0.26, 0.0), (0.26, 0.7), (0.5, 0.78), (0.5, 0.95), (0.0, 1.08)], segs=8, mat=PAINT), 0.0), VENTS)

# a ship's boat: lofted shell with a canvas cover
bs = [(-4.2, 0.05, 0.75), (-3.0, 0.75, 0.2), (-0.5, 1.15, 0.0), (2.4, 1.05, 0.05), (4.2, 0.6, 0.35)]
rings_ = [[(-hw, y, 1.25), (-hw * 0.82, y, k + 0.3), (0, y, k), (hw * 0.82, y, k + 0.3), (hw, y, 1.25)] for y, hw, k in bs]
bm_ = MB()
for a, b in zip(rings_, rings_[1:]):
    for i in range(4):
        cx = (a[i][0] + a[i + 1][0]) / 2
        bm_.poly([a[i], a[i + 1], b[i + 1], b[i]], PAINT, (cx, 0, -0.6))
    bm_.poly([a[0], a[4], b[4], b[0]], RAFT, (0, 0, 1))
bm_.poly(rings_[0], PAINT, (0, -1, 0))
bm_.poly(rings_[-1], PAINT, (0, 1, 0))
S += copies(bm_.obj('boat', sharp=50), BOATS)

# two deck tractors
tr = MB()
tr.box((-0.7, -1.25, 0.3), (0.7, 1.25, 0.95), YELLOW)
tr.box((-0.55, 0.2, 0.95), (0.55, 1.0, 1.25), DARK, drop='-z')
tr.box((-0.2, -1.6, 0.35), (0.2, -1.25, 0.5), DECK)
for sx in (-1, 1):
    for wy in (-0.8, 0.8):
        tr.tube((sx * 0.6, wy, 0.36), (sx * 0.88, wy, 0.36), 0.36, RUBBER, 7, caps=True)
S += copies(tr.obj('tractor', sharp=45), [((-7.0, -14.0, FD), (0, 0, 25)), ((5.5, 34.0, FD), (0, 0, -160))])


# ---------------------------------------------------------------- aircraft on deck

def plane_mesh():
    p = MB()
    fus = [(-3.95, 0.40, 0.40, 0.0), (-3.6, 0.72, 0.72, 0.0), (-2.4, 0.74, 0.78, 0.0), (-0.6, 0.6, 0.82, 0.08), (1.6, 0.4, 0.58, 0.12), (4.1, 0.1, 0.26, 0.24)]
    n = 10
    rs = [[Vector((rx * math.cos(2 * math.pi * i / n), y, zc + rz * math.sin(2 * math.pi * i / n))) for i in range(n)] for y, rx, rz, zc in fus]
    for a, b in zip(rs, rs[1:]):
        for i in range(n):
            j = (i + 1) % n
            c = (a[i] + a[j] + b[i] + b[j]) / 4
            p.poly([a[i], a[j], b[j], b[i]], PAINT, (c.x, 0, c.z - 0.1))
    p.poly(rs[0], DARK, (0, -1, 0))
    p.poly(rs[-1], PAINT, (0, 1, 0))
    p.tube((0, -3.95, 0), (0, -4.4, 0), 0.24, PAINT, 6, r2=0.03)
    for k in range(3):
        a = math.radians(90 + k * 120)
        p.beam((0, -4.12, 0), (1.55 * math.cos(a), -4.12, 1.55 * math.sin(a)), 0.05, 0.26, DARK, up=(0, 1, 0))
    for sx in (-1, 1):
        # wing: root and tip sections
        r = [(sx * 0.45, -2.25, -0.28), (sx * 0.45, 0.25, -0.34), (sx * 0.45, 0.25, -0.5), (sx * 0.45, -2.25, -0.56)]
        t = [(sx * 5.6, -1.45, 0.22), (sx * 5.6, -0.05, 0.2), (sx * 5.6, -0.05, 0.1), (sx * 5.6, -1.45, 0.1)]
        p.poly([r[0], r[1], t[1], t[0]], PAINT, (0, 0, 1))
        p.poly([r[3], r[2], t[2], t[3]], PAINT, (0, 0, -1))
        p.poly([r[0], r[3], t[3], t[0]], PAINT, (0, -1, 0))
        p.poly([r[1], r[2], t[2], t[1]], PAINT, (0, 1, 0))
        p.poly(t, PAINT, (sx, 0, 0))
        r = [(sx * 0.1, 3.0, 0.36), (sx * 0.1, 4.0, 0.36), (sx * 0.1, 4.0, 0.26), (sx * 0.1, 3.0, 0.26)]
        t = [(sx * 2.0, 3.35, 0.38), (sx * 2.0, 3.95, 0.38), (sx * 2.0, 3.95, 0.32), (sx * 2.0, 3.35, 0.32)]
        p.poly([r[0], r[1], t[1], t[0]], PAINT, (0, 0, 1))
        p.poly([r[3], r[2], t[2], t[3]], PAINT, (0, 0, -1))
        p.poly([r[0], r[3], t[3], t[0]], PAINT, (0, -1, 0))
        p.poly([r[1], r[2], t[2], t[1]], PAINT, (0, 1, 0))
        p.poly(t, PAINT, (sx, 0, 0))
        # undercarriage
        p.tube((sx * 1.45, -1.55, -0.4), (sx * 1.45, -1.75, -1.5), 0.07, DECK, 3)
        w0, w1 = Vector((sx * 1.45 - 0.11, -1.75, -1.55)), Vector((sx * 1.45 + 0.11, -1.75, -1.55))
        p.tube(w0, w1, 0.42, RUBBER, 8, caps=True)
    fin = [(3.0, 0.4), (3.7, 1.6), (4.15, 1.6), (4.2, 0.3)]
    for sx in (-1, 1):
        p.poly([(sx * 0.04, y, z) for y, z in fin], PAINT, (sx, 0, 0))
    p.poly([(-0.04, 3.0, 0.4), (0.04, 3.0, 0.4), (0.04, 3.7, 1.6), (-0.04, 3.7, 1.6)], PAINT, (0, -1, 0.5))
    p.poly([(-0.04, 3.7, 1.6), (0.04, 3.7, 1.6), (0.04, 4.15, 1.6), (-0.04, 4.15, 1.6)], PAINT, (0, 0, 1))
    p.poly([(-0.04, 4.15, 1.6), (0.04, 4.15, 1.6), (0.04, 4.2, 0.3), (-0.04, 4.2, 0.3)], PAINT, (0, 1, 0))
    can = [(-1.9, 0.38, 0.6, 0.2, 0.98), (-1.0, 0.44, 0.68, 0.3, 1.26), (0.9, 0.3, 0.6, 0.14, 0.86)]
    cr = [[Vector((-b, y, zb)), Vector((-t_, y, zt)), Vector((t_, y, zt)), Vector((b, y, zb))] for y, b, zb, t_, zt in can]
    for a, b in zip(cr, cr[1:]):
        for i, f in ((0, (-1, 0, 0.3)), (1, (0, 0, 1)), (2, (1, 0, 0.3))):
            p.poly([a[i], a[i + 1], b[i + 1], b[i]], GLASS, f)
    p.poly(cr[0], GLASS, (0, -1, 0.3))
    p.poly(cr[-1], GLASS, (0, 1, 0.3))
    p.tube((0, 3.55, 0.0), (0, 3.75, -0.62), 0.05, DECK, 3)
    p.tube((-0.06, 3.75, -0.66), (0.06, 3.75, -0.66), 0.17, RUBBER, 6, caps=True)
    ob = p.obj('plane', sharp=38)
    xform(ob, rot=(-11.3, 0, 0))
    lo = min(v.co.z for v in ob.data.vertices)
    xform(ob, at=(0, 0, -lo))
    return ob


plane = plane_mesh()
print('plane triangles', tris([plane]))
SPOTS = []
for i in range(4):
    y = 73.0 + i * 10.6
    SPOTS.append(((7.4, y, FD), (0, 0, -38)))
    SPOTS.append(((-7.4, y + 1.5, FD), (0, 0, 38)))
SPOTS.append(((3.6, -43.0, FD), (0, 0, 0)))
SPOTS.append(((-3.2, -31.0, FD), (0, 0, 0)))
S += copies(plane, SPOTS)


# ---------------------------------------------------------------- guns

def tub_mesh():
    prof = [(2.32, -0.1), (2.32, 1.25), (2.2, 1.25), (2.2, 0.0)]
    n = 14
    rings = [[(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), h) for i in range(n)] for r, h in prof]
    return shade(loft('tub', rings, cap_start=False, cap_end=False, mat=PAINT), 50)


def twin_mount():
    """Twin 5-inch dual-purpose mount, facing -y, standing on z = 0."""
    parts = [hard(drop(cyl('ring', 2.25, 0.3, at=(0, 0, 0.15), segs=16, mat=PAINT), '-z'), 0.05)]
    house = prism('house', [(-2.05, 0.3), (-2.4, 1.5), (-1.25, 2.85), (2.35, 2.85), (2.35, 0.3)], -2.3, 2.3, PAINT)
    parts.append(hard(house, 0.12))
    for sx in (-1, 1):
        parts.append(hard(box('port', 0.62, 0.3, 1.5, at=(sx * 1.07, -1.95, 1.95), rot=(-40, 0, 0), mat=DARK), 0.0))
        parts.append(hard(box('hood', 0.5, 0.9, 0.5, at=(sx * 2.32, -0.6, 2.2), mat=PAINT), 0.08))
        parts.append(hard(box('hood-glass', 0.3, 0.04, 0.24, at=(sx * 2.36, -1.06, 2.22), mat=GLASS), 0.0))
        parts.append(hard(box('side-door', 0.05, 0.8, 1.3, at=(sx * 2.32, 1.2, 1.1), mat=PAINT), 0.03))
    parts.append(hard(box('rear-door', 1.0, 0.06, 1.5, at=(0, 2.37, 1.2), mat=PAINT), 0.03))
    parts.append(hard(box('hatch', 0.9, 0.9, 0.08, at=(-1.2, 1.2, 2.88), mat=PAINT), 0.03))
    parts.append(hard(box('sight', 0.7, 0.9, 0.4, at=(0, 0.2, 3.03), mat=PAINT), 0.08))
    parts.append(hard(cyl('vent', 0.28, 0.3, at=(1.3, 1.5, 2.98), segs=8, mat=PAINT), 0.04))
    return join('turret.sec', parts)


def twin_guns():
    parts = []
    for sx in (-1, 1):
        b = lathe('barrel', [(0.0, 0.0), (0.33, 0.0), (0.33, 1.1), (0.2, 1.25), (0.165, 1.5), (0.12, 5.1), (0.14, 5.12), (0.14, 5.3), (0.075, 5.3), (0.075, 5.0), (0.0, 5.0)],
                  segs=10, at=(sx * 1.07, -1.4, 1.62), rot=(90, 0, 0), mat=PAINT)
        parts.append(hard(b, 0.0, sharp=35))
        parts.append(hard(box('bloomer', 0.8, 0.5, 0.95, at=(sx * 1.07, -1.9, 1.62), mat=RAFT), 0.12))
    return join('guns.sec', parts)


def quad_mount():
    """Quad 40 mm mount, facing -y, standing on z = 0."""
    m = MB()
    n = 12
    ring = [(1.4 * math.cos(2 * math.pi * i / n), 1.4 * math.sin(2 * math.pi * i / n)) for i in range(n)]
    m.poly([(x, y, 0.2) for x, y in ring], DECK, (0, 0, 1))
    for (xa, ya), (xb, yb) in zip(ring, ring[1:] + ring[:1]):
        m.poly([(xa, ya, 0.0), (xb, yb, 0.0), (xb, yb, 0.2), (xa, ya, 0.2)], PAINT, (xa + xb, ya + yb, 0))
    m.box((-0.55, -0.6, 0.2), (0.55, 0.7, 0.75), PAINT, drop='-z')
    for sx in (-1, 1):
        m.box((sx * 0.86 - 0.08, -0.55, 0.2), (sx * 0.86 + 0.08, 0.55, 1.4), PAINT, drop='-z')
        # shield: a cranked plate each side of the guns
        a, b, c = Vector((sx * 0.98, -1.0, 0.45)), Vector((sx * 1.5, -0.7, 0.45)), Vector((sx * 0.98, -1.0, 1.75))
        d = Vector((sx * 1.5, -0.7, 1.6))
        m.poly([a, b, d, c], PAINT, (0, -1, 0))
        m.poly([a + Vector((0, 0.06, 0)), b + Vector((0, 0.06, 0)), d + Vector((0, 0.06, 0)), c + Vector((0, 0.06, 0))], PAINT, (0, 1, 0))
        m.box((sx * 1.15 - 0.2, 0.5, 0.2), (sx * 1.15 + 0.2, 0.95, 0.75), DECK, drop='-z')        # layer's and trainer's seats
        m.box((sx * 1.15 - 0.2, 0.9, 0.75), (sx * 1.15 + 0.2, 0.97, 1.2), DECK, drop='-z')
    m.box((-1.0, 0.9, 0.2), (1.0, 1.6, 0.3), DECK, drop='-z')                                    # loaders' step
    return m.obj('aa', sharp=45)


def quad_guns():
    m = MB()
    z = 1.2
    m.box((-0.78, -0.75, z - 0.26), (0.78, 0.85, z + 0.26), PAINT)
    for x in (-0.6, -0.26, 0.26, 0.6):
        m.tube((x, -0.75, z), (x, -1.55, z), 0.1, PAINT, 5)
        m.tube((x, -1.55, z), (x, -3.05, z), 0.052, GUNMETAL, 5)
        m.tube((x, -3.05, z), (x, -3.35, z), 0.06, GUNMETAL, 5, r2=0.1)
        m.box((x - 0.07, -0.2, z + 0.26), (x + 0.07, 0.5, z + 0.75), GUNMETAL, drop='-z')        # ammunition guides
    return m.obj('aa.guns', sharp=45)


turret = twin_mount()
tguns = twin_guns()
TPIV = (0, -1.4, 1.62)
pivot(tguns, TPIV)
tag(turret, 'yaw', speed=0.8)
tag(tguns, 'pitch', min=-5, max=80, recoil=0.3)
aa = quad_mount()
aguns = quad_guns()
APIV = (0, 0.1, 1.2)
pivot(aguns, APIV)
tag(aa, 'yaw', aims='air', speed=1.6)
tag(aguns, 'pitch', min=0, max=85, recoil=0.08)


def child(ob, par, at):
    ob.parent = par
    ob.location = at
    return ob


def place(base, guns, name, gname, i, at, rz, gpiv, muzzles, kind):
    """One mount: the shared base mesh, its shared gun mesh as a child, and its muzzle markers."""
    b = base if i == 1 else instance(base, f'{name}.{i}')
    b.name = f'{name}.{i}'
    b.location = at
    b.rotation_euler = (0, 0, math.radians(rz))
    g = guns if i == 1 else instance(guns, f'{gname}.{i}')
    g.name = f'{gname}.{i}'
    g.location = (0, 0, 0)
    child(g, b, gpiv)
    for k, m in enumerate(muzzles):
        e = marker(f'muzzle.{name}.{i}.{k + 1}', (0, 0, 0), kind=kind)
        child(e, g, (m[0] - gpiv[0], m[1] - gpiv[1], m[2] - gpiv[2]))
    return b


MOUNTS = [((GX, -44.6, FD), 0), ((GX, -35.2, FD + 2.6), 0), ((GX, 27.2, FD + 2.6), 180), ((GX, 36.6, FD), 180)]
for i, (at, rz) in enumerate(MOUNTS, 1):
    place(turret, tguns, 'turret.sec', 'guns.sec', i, at, rz, TPIV, [(-1.07, -6.7, 1.62), (1.07, -6.7, 1.62)], 'naval')

# the island and bow tubs stand on their own platforms
TUBS.append((GX, -28.0, FD + 2.6))
mb = MB()
BOWY = -120.4
bz = deck_z(BOWY) + 0.35
disc = [(2.36 * math.cos(2 * math.pi * i / 14), BOWY + 2.36 * math.sin(2 * math.pi * i / 14)) for i in range(14)]
mb.poly([(x, y, bz) for x, y in disc], DECK, (0, 0, 1))
mb.poly([(x, y, bz - 0.25) for x, y in disc], PAINT, (0, 0, -1))
for (xa, ya), (xb, yb) in zip(disc, disc[1:] + disc[:1]):
    mb.poly([(xa, ya, bz - 0.25), (xb, yb, bz - 0.25), (xb, yb, bz), (xa, ya, bz)], PAINT, (xa + xb, ya + yb - 2 * BOWY, 0))
for sx in (-1, 1):
    for dy in (-1.2, 1.0):
        yy = BOWY + dy
        mb.beam((sx * 2.0, yy, bz - 0.25), (sx * (side_x(yy, 8.0) - 0.05), yy + warp(sy(yy), 8.0), 8.0), 0.18, 0.18, PAINT, up=(0, 1, 0))
mb.tube((0, -124.6, deck_z(-124.6)), (0, -124.9, deck_z(-124.6) + 4.2), 0.06, PAINT, 4, r2=0.03)          # jackstaff
mb.tube((0, 124.4, HD), (0, 125.0, HD + 5.0), 0.06, PAINT, 4, r2=0.03)                                  # ensign staff
keep(mb, 'bow-platform')
TUBS.append((0.0, BOWY, bz))
TUBS.append((3.9, 121.4, HD))
TUBS.append((-3.9, 121.4, HD))
S += copies(tub_mesh(), [(t, (0, 0, 0)) for t in TUBS])


def tub_rot(t):
    x, y, z = t
    if abs(y) > 110:
        return 0 if y < 0 else 180
    if abs(x - GX) < 0.1:
        return 0
    return 90 if x > 0 else -90


AAM = [(-0.6, -3.4, 1.2), (-0.26, -3.4, 1.2), (0.26, -3.4, 1.2), (0.6, -3.4, 1.2)]
order = sorted(TUBS, key=lambda t: (t[1], t[0]))
for i, t in enumerate(order, 1):
    place(aa, aguns, 'aa', 'aa.guns', i, t, tub_rot(t), APIV, AAM, 'flak')

# 20 mm guns in rows along the catwalks: fixed, part of the ship
m20 = MB()
m20.tube((0, 0, 0), (0, 0, 1.15), 0.09, PAINT, 5, r2=0.06)
m20.beam((0, 0.45, 1.05), (0, -1.35, 1.75), 0.07, 0.07, GUNMETAL)
m20.box((-0.11, -0.05, 1.3), (0.11, 0.25, 1.52), GUNMETAL)
for sx in (-1, 1):
    m20.poly([(sx * 0.08, -0.32, 0.95), (sx * 0.5, -0.24, 0.95), (sx * 0.5, -0.24, 1.75), (sx * 0.08, -0.32, 1.75)], PAINT, (0, -1, 0))
    m20.poly([(sx * 0.08, -0.29, 0.95), (sx * 0.5, -0.21, 0.95), (sx * 0.5, -0.21, 1.75), (sx * 0.08, -0.29, 1.75)], PAINT, (0, 1, 0))
OER = []
for sgn, runs in ((1, ((-104, -86), (-48, -24), (10, 34), (88, 98))), (-1, ((-104, -78), (44, 54), (72, 110)))):
    for a, b in runs:
        y = a
        while y <= b:
            OER.append(((sgn * (wfd(y) + 0.75), y, CWZ), (0, 0, 90 * sgn)))
            y += 3.0
for y in (6.4, 8.9, 11.6):
    OER.append(((XO + 0.55, y, 22.23), (0, 0, -90)))
    OER.append(((XI - 0.55, y, 22.23), (0, 0, 90)))
S += copies(m20.obj('oerlikon', sharp=45), OER)

S += copies(door.obj('door'), DOORS)
S += copies(port.obj('porthole'), PORTS)
S += RAIL.build()
S += irail.build()

# what the shared strut patches look like is settled by these strips on the island's outboard side
S.append(shared_tail((XO, 6.7, 17.5), (0, 1, 0), (-1, 0, 0), only=[PAINT, GUNMETAL, DECK]))
hull = join('hull', S)
tag(hull, 'none')
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.parent is None and o is not hull:
        parent(o, hull)

marker('smoke.1', (XC, FTOP, 35.4), hull)
marker('launch', (0, FY0 + 2.0, FD), hull)
marker('land', (0, FY1 - 2.0, FD), hull)
decal('flag-deck', 14, 9, (0, -86.2, FD + 0.005), par=hull, kind='flag').hide_render = True     # or it shades the deck under it in the bake

if os.environ.get('AXM_UVTEST'):      # how well does it unwrap? (no bake)
    weight_all()
    even_unwrap(baked_meshes(), 0.003)
    sys.exit(0)

VIEWS = ((-35, 18, 0.62), (150, 25, 0.62), (-90, 6, 0.88), (-25, 12, 0.3))
finish('carrier', size=int(os.environ.get('AXM_SIZE', 4096)), views=VIEWS, tint=(0.17, 0.2, 0.23))
if os.environ.get('AXM_SHOTS'):
    shots('carrier', [
        ((-60, -190, 30), (0, -100, 12), 50),       # bow, starboard quarter
        ((70, 200, 26), (0, 105, 11), 50),          # stern, port quarter
        ((-75, -50, 40), (-12, -8, 24), 50),        # island
        ((0, -30, 330), (0, 0, 17), 50),            # straight down
        ((90, -40, 22), (14, -10, 13), 50),         # port side, deck-edge elevator
        ((-35, 95, 30), (-2, 92, 17), 50),          # aircraft aft
    ])
if os.environ.get('AXM_BOW'):
    shots('carrier', [((-28, -152, 14), (0, -121, 6), 70), ((22, 150, 14), (0, 123, 6), 70), ((-45, -20, 45), (-13, -16, 25), 80)], suffix='-bow')
if os.environ.get('AXM_KEEL'):
    shots('carrier', [((-120, 190, -45), (0, 60, -2), 50), ((-110, -190, -30), (0, -70, 0), 50)], ground=False, suffix='-keel')
