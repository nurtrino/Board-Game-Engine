# Four-engine heavy bomber, in flight. Low-mid wing, radial engines, glazed nose, stepped cockpit,
# dorsal and ventral turrets, waist and tail guns, tall single fin with a long dorsal fillet.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _air_helpers import *

reset()
far_clip()

PAINT = paint('paint', panel=0.7, gloss=0.42, dirt=0.6, wear=0.6)
PAINT_T = paint('paint-turret', gloss=0.42, dirt=0.5, wear=0.6)
SOOT = plain('soot', (0.05, 0.043, 0.04), rough=0.88, metal=0.4, rust=0.3, dirt=0.3)
BLADE = plain('blade', (0.028, 0.028, 0.03), rough=0.48, vary=0.06, dirt=0.2)
TIP = plain('blade-tip', (0.72, 0.45, 0.02), rough=0.5, vary=0.05, dirt=0.2)
GUN = plain('gunmetal', (0.085, 0.085, 0.09), rough=0.42, metal=0.9, dirt=0.3, vary=0.08)
ENGINE = plain('engine', (0.14, 0.14, 0.15), rough=0.5, metal=0.8, dirt=0.5)
HUB = plain('hub', (0.2, 0.2, 0.21), rough=0.4, metal=0.85, dirt=0.4)
DARK = plain('dark', (0.012, 0.012, 0.012), rough=0.95, vary=0.0, dirt=0.0, bump=0.0)
RUBBER = plain('rubber', (0.028, 0.028, 0.03), rough=0.85, vary=0.08, dirt=0.4, bump=0.15)
GLASS = glass()

# Built with the fuselage datum at z = 0; settle() lifts the lot at the end.
DIH = 4.5
static = []


def add(ob):
    static.append(ob)
    return ob


def row(plan, s):
    for a, b in zip(plan, plan[1:]):
        if a[0] <= s <= b[0]:
            u = (s - a[0]) / (b[0] - a[0])
            return tuple([s] + [a[k] + (b[k] - a[k]) * u for k in range(1, 5)])


# ---------------------------------------------------------------- fuselage

keys = []
for y, w, hh in [(-11.33, 0.03, 0.03), (-11.30, 0.11, 0.12), (-11.20, 0.37, 0.38), (-11.00, 0.60, 0.62), (-10.60, 0.84, 0.86), (-10.15, 0.96, 0.97)]:
    zc = -0.31 + (y + 11.33) / 1.18 * 0.065
    keys.append((y, w, zc + hh, zc - hh, zc, 2.0, 2.0))
keys += [
    (-9.40, 1.06, 0.84, -1.29, -0.22, 2.2, 2.3),
    (-8.40, 1.12, 0.90, -1.33, -0.20, 2.4, 2.6),
    (-7.85, 1.14, 0.93, -1.33, -0.18, 2.5, 2.8),
    (-7.35, 1.15, 1.53, -1.34, -0.14, 2.6, 3.0),
    (-6.90, 1.15, 1.60, -1.34, -0.12, 2.6, 3.2),
    (-5.50, 1.15, 1.60, -1.34, -0.10, 2.6, 3.4),
    (-3.00, 1.15, 1.50, -1.34, -0.10, 2.8, 3.4),
    (-0.50, 1.15, 1.36, -1.33, -0.10, 3.0, 3.4),
    (2.00, 1.12, 1.22, -1.26, -0.08, 3.4, 3.4),
    (4.50, 1.00, 1.06, -1.02, -0.02, 3.2, 3.0),
    (7.00, 0.76, 0.90, -0.68, 0.06, 2.6, 2.5),
    (9.00, 0.52, 0.76, -0.38, 0.14, 2.2, 2.2),
    (10.40, 0.36, 0.64, -0.16, 0.20, 2.0, 2.0),
    (11.05, 0.29, 0.58, -0.04, 0.25, 2.0, 2.0),
    (11.30, 0.22, 0.52, 0.04, 0.27, 2.0, 2.0),
    (11.42, 0.13, 0.42, 0.13, 0.275, 2.0, 2.0),
]
NOSE_YS = [-11.33, -11.30, -11.22, -11.08, -10.88, -10.62, -10.38, -10.15]
BODY_YS = [-10.15, -9.8, -9.4, -8.9, -8.4, -7.85, -7.35, -6.9, -6.2, -5.5, -4.6, -3.7, -2.8, -1.9, -1.0, -0.1, 0.8, 1.7, 2.6,
           3.5, 4.5, 5.5, 6.4, 7.3, 8.2, 9.0, 9.7, 10.4, 11.05, 11.3, 11.42]
FUS = Body(keys, NOSE_YS + BODY_YS[1:], n=36)
add(FUS.build('nose', GLASS, cap_start=True, cap_end=False, y1=-10.15))
add(FUS.build('fuselage', PAINT, cap_start=False, cap_end=True, y0=-10.15))

# nose framing: ribs from the tip ring back, and three hoops
for k in range(8):
    t = k * math.pi / 4 + math.pi / 8
    ys = NOSE_YS[2:]
    add(bar('nose-rib', [FUS.pt(y, t) for y in ys], [FUS.nrm(y, t) for y in ys], width=0.045, out=0.014, inn=0.008, mat=PAINT))
for y, wd in ((-11.22, 0.05), (-10.62, 0.05), (-10.15, 0.09)):
    ts = [2 * math.pi * i / FUS.n for i in range(FUS.n)]
    add(bar('nose-hoop', [FUS.pt(y, t) for t in ts], [FUS.nrm(y, t) for t in ts], width=wd, out=0.016, inn=0.008, mat=PAINT, closed=True))


def window(name, y0, y1, t0, t1, nt=3, mirror=True, off=0.009, frame=0.05):
    """A pane lying on the fuselage skin with a frame round it. t is the ring angle (0 = the +x side,
    pi/2 = the top)."""
    ys = sorted({y0, y1} | {y for y in FUS.ys if y0 < y < y1})
    ts = [t0 + (t1 - t0) * j / nt for j in range(nt + 1)]
    pane = grid_mesh(name, [[FUS.pt(y, t, off) for t in ts] for y in ys], GLASS)
    face_out(pane, lambda c: Vector((0, c.y, 0.1)))
    soft(pane, 50)
    edge = [(ys[0], t) for t in ts] + [(y, ts[-1]) for y in ys[1:]] + [(ys[-1], t) for t in reversed(ts[:-1])] + [(y, ts[0]) for y in reversed(ys[1:-1])]
    fr = bar(name + '-frame', [FUS.pt(y, t, off) for y, t in edge], [FUS.nrm(y, t) for y, t in edge], width=frame, out=0.012, inn=off + 0.006, mat=PAINT, closed=True)
    for ob in (pane, fr):
        add(both(ob) if mirror else ob)


# cockpit: two windscreen panes on the step, side windows and roof lights
H = math.pi / 2
window('windscreen', -7.83, -7.37, H - 0.66, H - 0.05, nt=4)
window('side-window', -7.30, -6.84, 0.50, 0.94)
window('side-window', -6.78, -6.32, 0.50, 0.94)
window('roof-light', -7.26, -6.86, 1.04, 1.38, nt=2)
# nose compartment, radio room and tail gunner
window('nose-window', -9.72, -9.12, 0.12, 0.52)
window('nose-window', -9.0, -8.5, 0.16, 0.50, nt=2)
window('radio-window', -0.55, 0.05, 0.38, 0.62, nt=2)
window('tail-window', 10.5, 10.98, 0.25, 1.0)
window('tail-light', 11.08, 11.38, 0.45, math.pi - 0.45, nt=5, mirror=False)
# waist gun windows
window('waist-window', 5.0, 5.9, 0.03, 0.50)
for sx in (-1, 1):
    add(shade(tube('waist-gun', (sx * 0.72, 5.42, 0.30), (sx * 1.62, 6.05, 0.22), 0.021, segs=7, mat=GUN), 40))
    add(shade(tube('waist-jacket', (sx * 0.72, 5.42, 0.30), (sx * 1.25, 5.79, 0.253), 0.036, segs=7, mat=GUN), 40))

# astrodome over the navigator
zt = FUS.top(-9.05)
rows = dome_rows((0, -9.05, zt - 0.05), 0.25, 0.25, 0.24, 14, 4)
dome = grid_mesh('astrodome', rows, GLASS, close_v=True)
face_out(dome, (0, -9.05, zt - 0.2))
add(soft(dome, 60))
add(mesh_obj('astro-cap', rows[-1], [tuple(range(len(rows[-1])))], GLASS))
add(hard(cyl('astro-ring', 0.27, 0.05, at=(0, -9.05, zt - 0.02), segs=14, mat=PAINT), 0.006))

# ---------------------------------------------------------------- wing

S_TIP = 15.75 / math.cos(R(DIH))
WPLAN = [(0.0, -5.50, 5.90, 0.18, 3.0), (S_TIP, -3.25, 1.95, 0.11, 0.5)]
WPLAN = [row(WPLAN, 0.7), WPLAN[1]]
WING = Foil((0, 0, -0.72), (math.cos(R(DIH)), 0, math.sin(R(DIH))), (0, 1, 0), (-math.sin(R(DIH)), 0, math.cos(R(DIH))),
            WPLAN, tip_r=1.15, tip_mid=0.45, camber=0.015, hinge=0.76,
            surfaces=[(-1, 9.2, False, True), (9.2, 14.55, True, True)], gw=0.012, gd=0.022)
wing = WING.build('wing', PAINT, extra=(1.6, 2.5, 3.36, 4.3, 5.2, 6.2, 7.12, 7.9, 8.5, 8.95, 10.3, 11.4, 12.5, 13.5))
WING.lead_faces(wing, RUBBER, 1.6, 14.55, k=4)
WING.lead_faces(wing, GLASS, 8.5, 8.95, k=3)          # landing light behind a clear leading edge
add(both(wing))
add(both(wing_fillet('fillet', FUS, WING, PAINT, r_le=0.12, r_te=0.42, tail=1.3, x0=1.1, sink=0.03)))
p = WING.pt(S_TIP - 0.07, 0.42, 1)
add(both(soft(sphere('nav-light', 0.05, at=(p.x + 0.02, p.y, p.z - 0.012), scale=(1.0, 2.2, 0.8), segs=8, rings=6, mat=GLASS))))

# ---------------------------------------------------------------- tail

TAIL = Foil((0, 0, 0.30), (1, 0, 0), (0, 1, 0), (0, 0, 1),
            [(0.0, 7.55, 3.45, 0.12, 0), (6.55, 9.15, 1.45, 0.10, 0)], tip_r=0.75, tip_mid=0.5, camber=0.0,
            hinge=(0, 9.95, 6.55, 9.95), surfaces=[(0.55, 99, True, True)], gw=0.012, gd=0.02)
tail = TAIL.build('tailplane', PAINT, extra=(0.8, 2.4, 4.1))
TAIL.lead_faces(tail, RUBBER, 0.8, 5.8, k=4)
add(both(tail))

FIN = Foil((0, 0, 0.2), (0, 0, 1), (0, 1, 0), (1, 0, 0),
           [(0.0, 0.6, 10.65, 0.018, 0), (0.55, 1.6, 9.65, 0.019, 0), (1.7, 7.55, 3.68, 0.07, 0), (4.1, 9.55, 1.55, 0.09, 0)],
           tip_r=0.8, tip_mid=0.5, camber=0.0, hinge=(0, 9.93, 4.1, 10.35), surfaces=[(0.62, 99, True, True)],
           gw=0.012, gd=0.02, hmin=0.45)
fin = FIN.build('fin', PAINT, extra=(1.1, 2.5))
FIN.lead_faces(fin, RUBBER, 1.7, 3.3, k=4)
add(fin)

# ---------------------------------------------------------------- engines

NAC_X = (3.35, 7.10)
HUBS = {}
EXH = {}
right = []       # the two nacelles on the +x side; mirrored afterwards


def nacelle(xn, inboard):
    s = WING.s_of(xn)
    le, ch, tc, tw = WING.sec(s)
    yle = WING.pt(s, 0.0).y
    zc = (WING.pt(s, 0.3, 1).z + WING.pt(s, 0.3, -1).z) / 2 - 0.16
    yr = yle - (1.10 if inboard else 0.92)       # back of the cowl
    if inboard:
        K = [(yr - 0.06, 0.640, 0.640, -0.640, 0.0, 2.0, 2.0), (yr + 0.50, 0.640, 0.630, -0.660, 0.0, 2.0, 2.1),
             (yle + 0.20, 0.620, 0.580, -0.700, -0.03, 2.0, 2.2), (yle + 1.20, 0.580, 0.420, -0.740, -0.10, 2.0, 2.3),
             (yle + 2.40, 0.500, 0.180, -0.700, -0.20, 2.0, 2.3), (yle + 3.40, 0.360, -0.050, -0.560, -0.28, 2.0, 2.2),
             (yle + 4.20, 0.160, -0.200, -0.400, -0.30, 2.0, 2.0)]
    else:
        K = [(yr - 0.06, 0.640, 0.640, -0.640, 0.0, 2.0, 2.0), (yr + 0.50, 0.640, 0.630, -0.655, 0.0, 2.0, 2.1),
             (yle + 0.20, 0.610, 0.580, -0.670, -0.03, 2.0, 2.2), (yle + 1.00, 0.520, 0.440, -0.620, -0.08, 2.0, 2.2),
             (yle + 1.90, 0.360, 0.220, -0.460, -0.12, 2.0, 2.1), (yle + 2.70, 0.140, 0.020, -0.220, -0.10, 2.0, 2.0)]
    K = [(y, w, zc + a, zc + b, zc + c, n1, n2) for (y, w, a, b, c, n1, n2) in K]
    ys = []
    for a, b in zip(K, K[1:]):
        ys += [a[0], (a[0] + b[0]) / 2]
    ys.append(K[-1][0])
    NB = Body(K, ys, n=20, x0=xn)
    right.append(NB.build('nacelle', PAINT, cap_start=False))      # its front is inside the cowl
    # cowl: a ring with a rolled lip, open at the front on the engine
    prof = [(0.60, -0.03), (0.705, 0.0), (0.722, 0.30), (0.716, 0.70), (0.682, 1.02), (0.622, 1.18), (0.56, 1.25),
            (0.505, 1.262), (0.468, 1.22), (0.452, 1.10), (0.452, 0.93), (0.0001, 0.93)]
    cowl = loft('cowl', [[(xn + r * math.cos(2 * math.pi * i / 24), yr - h, zc + r * math.sin(2 * math.pi * i / 24)) for i in range(24)] for r, h in prof],
                cap_start=False, cap_end=False, mat=PAINT)
    weld(cowl, 1e-3)
    face_out(cowl, lambda c: Vector((xn, c.y, zc)) if math.hypot(c.x - xn, c.z - zc) > 0.6 else Vector((c.x * 2 - xn, c.y, c.z * 2 - zc)))
    soft(cowl, 50)
    mat_faces(cowl, DARK, lambda p: math.hypot(p.center.x - xn, p.center.z - zc) < 0.458 or p.center.y > yr + 0.005)
    right.append(cowl)
    # engine: crankcase, reduction gear and nine cylinders
    right.append(hard(cyl('crankcase', 0.21, 0.22, at=(xn, yr - 1.02, zc), rot=(90, 0, 0), segs=12, mat=ENGINE), 0.02))
    right.append(hard(cyl('gearcase', 0.13, 0.46, at=(xn, yr - 1.25, zc), rot=(90, 0, 0), segs=10, r2=0.11, mat=ENGINE), 0.01))
    pot = shade(cyl('cylinder', 0.075, 0.25, segs=8, mat=ENGINE), 40)
    right.extend(copies(pot, [((xn + 0.32 * math.cos(R(a)), yr - 1.0, zc + 0.32 * math.sin(R(a))), (0, 90 - a, 0)) for a in range(0, 360, 40)]))
    # cooling gills round the back of the cowl
    gill = shade(box('gill', 0.272, 0.25, 0.008, mat=PAINT), 40)
    right.extend(copies(gill, [((xn + 0.712 * math.cos(R(a)), yr + 0.09, zc + 0.712 * math.sin(R(a))), (4, 90 - a, 0)) for a in [11.25 + 22.5 * i for i in range(16)]]))
    # exhaust collector pipe down the outer side to the turbo under the nacelle
    zb = NB.bot(yle + 1.25)
    right.append(shade(tube('exhaust-pipe', (xn + 0.47, yr + 0.02, zc - 0.47), (xn + 0.36, yle + 1.0, zb + 0.16), 0.075, segs=8, mat=SOOT), 40))
    right.append(hard(cyl('turbo', 0.25, 0.07, at=(xn, yle + 1.3, zb + 0.0), segs=16, mat=SOOT), 0.012))
    right.append(hard(cyl('turbo-hub', 0.09, 0.06, at=(xn, yle + 1.3, zb - 0.05), segs=10, mat=SOOT), 0.008))
    HUBS[xn] = Vector((xn, yr - 1.48, zc))
    # the hub dome stays with the engine: the stage hides the propeller itself in flight
    right.append(soft(lathe('hub', [(0.15, -0.16), (0.165, -0.02), (0.16, 0.12), (0.115, 0.21), (0.0, 0.25)], segs=14, at=tuple(HUBS[xn]), rot=(90, 0, 0), mat=HUB), 50))
    EXH[xn] = Vector((xn, yle + 1.75, zb - 0.06))


for xn in NAC_X:
    nacelle(xn, xn == NAC_X[0])
add(both(join('nacelles', right)))

# ---------------------------------------------------------------- ventral ball turret and tail guns

BALL = Vector((0, 1.9, FUS.bot(1.9) - 0.10))
add(soft(sphere('ball', 0.56, at=tuple(BALL), segs=20, rings=12, mat=PAINT)))
add(hard(cyl('ball-ring', 0.50, 0.16, at=(0, 1.9, FUS.bot(1.9) - 0.01), segs=20, mat=PAINT), 0.012))
cap = lathe('ball-window', [(0.0, 0.568)] + [(0.568 * math.sin(R(a)), 0.568 * math.cos(R(a))) for a in (6, 12, 18, 24)] + [(0.2, 0.50)], segs=14, mat=GLASS)
xform(cap, at=tuple(BALL), rot=(-112, 0, 0))
add(soft(cap, 50))
gd = Vector((0, math.cos(R(22)), -math.sin(R(22))))
for sx in (-1, 1):
    a = BALL + Vector((sx * 0.30, 0, 0)) + gd * 0.25
    add(shade(tube('ball-gun', a, a + gd * 0.72, 0.021, segs=7, mat=GUN), 40))
    add(shade(tube('ball-jacket', a, a + gd * 0.42, 0.036, segs=7, mat=GUN), 40))

for sx in (-1, 1):
    add(shade(tube('tail-gun', (sx * 0.075, 11.28, 0.275), (sx * 0.075, 11.98, 0.262), 0.021, segs=7, mat=GUN), 40))
    add(shade(tube('tail-jacket', (sx * 0.075, 11.28, 0.275), (sx * 0.075, 11.66, 0.268), 0.036, segs=7, mat=GUN), 40))
add(hard(box('tail-mount', 0.24, 0.12, 0.14, at=(0, 11.42, 0.275), mat=DARK), 0.01))

# ---------------------------------------------------------------- masts, aerials, pitot

zt = FUS.top(-4.4)
MAST = Vector((0, -4.46, zt + 0.62))
add(strut('mast', (0, -4.4, zt - 0.03), MAST, 0.16, 0.07, 0.03, 0.014, PAINT))
fin_le = FIN.pt(3.2, 0.0)
add(tube('aerial-wire', MAST - Vector((0, 0, 0.02)), fin_le + Vector((0, 0.03, 0)), 0.006, segs=5, mat=GUN))
zb = FUS.bot(-8.7)
add(strut('belly-mast', (0, -8.7, zb + 0.03), (0, -8.64, zb - 0.42), 0.13, 0.06, 0.026, 0.012, PAINT))
add(soft(sphere('loop-aerial', 0.16, at=(0, -7.2, FUS.bot(-7.2) - 0.10), scale=(0.55, 1.9, 0.6), segs=10, rings=6, mat=PAINT)))
for sx in (-1, 1):
    p = FUS.side(-10.0, -0.75, sx)
    add(strut('pitot-mast', p - Vector((sx * 0.02, 0, 0)), p + Vector((sx * 0.16, -0.02, -0.05)), 0.09, 0.06, 0.02, 0.014, PAINT))
    add(tube('pitot', p + Vector((sx * 0.16, -0.30, -0.05)), p + Vector((sx * 0.16, 0.02, -0.05)), 0.011, segs=6, mat=GUN))

hull = join('hull', static)
tag(hull, 'none')

# ---------------------------------------------------------------- propellers

PR = 1.765
ORDER = [-NAC_X[1], -NAC_X[0], NAC_X[0], NAC_X[1]]


def hub_of(x):
    h = HUBS[abs(x)]
    return Vector((x, h.y, h.z))


h0 = hub_of(ORDER[0])
pp = []
for a in (180, 60, -60):
    b = blade('blade', PR, BLADE, TIP, root=0.07, chord=0.30, beta75=31)
    xform(b, at=tuple(h0), rot=(0, a, 0))
    pp.append(b)
prop = join('prop', pp)
pivot(prop, h0)
parent(prop, hull)
tag(prop, 'prop', rpm=1200)
for i, x in enumerate(ORDER):
    if i:
        parent(instance(prop, f'prop.{i + 1}', at=tuple(hub_of(x))), hull)
    prop_disc(f'disc.{i + 1}', PR, tuple(hub_of(x)), hull)
    e = EXH[abs(x)]
    marker(f'exhaust.{i + 1}', (x, e.y, e.z), hull)

# ---------------------------------------------------------------- dorsal turret

TY = -5.75
TZ = FUS.top(TY)
tp = [hard(cyl('turret-ring', 0.58, 0.16, at=(0, TY, TZ + 0.0), segs=20, mat=PAINT_T), 0.012)]
rows = dome_rows((0, TY, TZ + 0.07), 0.52, 0.52, 0.47, 16, 4)
dome = grid_mesh('turret-dome', rows, GLASS, close_v=True)
face_out(dome, (0, TY, TZ - 0.2))
tp.append(soft(dome, 60))
tp.append(hard(cyl('turret-cap', 0.13, 0.03, at=(0, TY, rows[-1][0].z + 0.004), segs=16, mat=PAINT_T), 0.006))
for j in (2, 6, 10, 14):
    pts = [r[j] for r in rows]
    tp.append(bar('turret-rib', pts, [p - Vector((0, TY, TZ - 0.1)) for p in pts], width=0.05, out=0.012, inn=0.008, mat=PAINT_T))
turret = join('turret.top', tp)
pivot(turret, (0, TY, TZ))
parent(turret, hull)
tag(turret, 'yaw', aims='air', speed=1.5)

TRUN = Vector((0, TY - 0.05, TZ + 0.27))
gp = []
for sx in (-1, 1):
    a = TRUN + Vector((sx * 0.19, 0.25, 0))
    gp.append(hard(box('breech', 0.07, 0.42, 0.10, at=tuple(a - Vector((0, 0.08, 0))), mat=GUN), 0.008))
    gp.append(shade(tube('barrel', a + Vector((0, -1.12, 0)), a, 0.021, segs=7, mat=GUN), 40))
    gp.append(shade(tube('jacket', a + Vector((0, -0.74, 0)), a, 0.036, segs=7, mat=GUN), 40))
guns = join('guns.top', gp)
pivot(guns, TRUN)
parent(guns, turret)
tag(guns, 'pitch', min=0, max=80, recoil=0.05)
marker('muzzle.top', tuple(TRUN + Vector((0, -0.90, 0))), guns, kind='mg')

# ---------------------------------------------------------------- markings and markers

for sx, tag_ in ((-1, 'L'), (1, 'R')):
    for side, where in ((1, 'top'), (-1, 'under')):
        foil_decal(f'decal.wing.{where}.{tag_}', WING, WING.s_of(10.9), 0.47, 2.2, side, sx, hull)
    p, n = FUS.side(3.3, -0.05, sx), FUS.side_n(3.3, -0.05, sx)
    place_decal(f'decal.fuselage.{tag_}', 1.5, p, n, (0, 0, 1), hull)
    foil_decal(f'decal.fin.{tag_}', FIN, 2.55, 0.42, 1.2, sx, 1, hull, kind='fin', up=(0, 0, 1))
marker('bomb', (0, -2.9, FUS.bot(-2.9) - 0.06), hull)
mt = marker('muzzle.tail', (0, 12.0, 0.262), hull, kind='mg')
mt.rotation_euler = (0, 0, math.pi)          # the tail guns fire aft

dz = settle()
check_decals()
if os.environ.get('AXM_DRY') == '1':
    print('  triangles', tris(baked_meshes()))
    quick_views('bomber')
    sys.exit(0)
print(f'  fuselage datum at z = {dz:.3f}')

# ---------------------------------------------------------------- panel lines and soot


def chord_line(lm, ch, foil, f, s0, s1, width=0.016, strength=0.8):
    a, b = foil.pt(s0, f), foil.pt(s1, f)
    lm.seg(ch, (a.x, a.y), (b.x, b.y), width, strength, mirror=True)


def rib(lm, ch, foil, s, f0=0.05, f1=0.74, width=0.016, strength=0.8):
    a, b = foil.pt(s, f0), foil.pt(s, f1)
    lm.seg(ch, (a.x, a.y), (b.x, b.y), width, strength, mirror=True)


plan = LineMap(-16.2, 16.2, -11.8, 12.4, 0.009)
for ch in (0, 1):
    for f in (0.14, 0.36, 0.58):
        chord_line(plan, ch, WING, f, 1.5, 14.6)
    for i in range(9):
        rib(plan, ch, WING, 1.9 + i * 1.5)
    chord_line(plan, ch, TAIL, 0.3, 0.6, 5.7)
    for s in (1.6, 3.0, 4.4):
        rib(plan, ch, TAIL, s, 0.06, 0.6)
# top: fuel fillers, engine access panels, fuselage joints and hatches
for xn in NAC_X:
    plan.circle(0, (xn + 1.2, WING.pt(WING.s_of(xn + 1.2), 0.3).y), 0.09, 0.016, mirror=True)
for y in (-8.4, -4.9, -1.0, 1.0, 6.4):
    plan.seg(0, (-1.0, y), (1.0, y), 0.018)
plan.rect(0, -0.33, -0.55, 0.33, 0.15, 0.016)
# underneath: bomb doors, wheel doors under the inner nacelles, tail wheel doors, landing lights, hatches
plan.rect(1, -0.66, -4.55, 0.66, -1.25, 0.022)
plan.seg(1, (0, -4.55), (0, -1.25), 0.022)
for s_ in (-1, 1):
    plan.seg(1, (s_ * 0.33, -4.55), (s_ * 0.33, -1.25), 0.012, 0.6)
xn = NAC_X[0]
yle = WING.pt(WING.s_of(xn), 0.0).y
plan.rect(1, xn - 0.36, yle + 0.75, xn + 0.36, yle + 2.9, 0.02, mirror=True)
plan.seg(1, (xn, yle + 0.75), (xn, yle + 2.9), 0.016, mirror=True)
plan.rect(1, -0.2, 6.3, 0.2, 7.2, 0.018)
plan.seg(1, (0, 6.3), (0, 7.2), 0.014)
plan.rect(1, -0.3, -9.9, 0.3, -9.2, 0.016)
plan.circle(1, (9.6, WING.pt(WING.s_of(9.6), 0.25).y), 0.16, 0.018, mirror=True)
for y in (-8.4, -4.9, 1.0, 6.4):
    plan.seg(1, (-1.0, y), (1.0, y), 0.018)
# exhaust and oil blown back over and under the wing behind each engine
for xn in NAC_X:
    s = WING.s_of(xn)
    y0, y1 = WING.pt(s, 0.12).y, WING.pt(s, 1.0).y + 0.3
    for dx, k in ((-0.42, 0.75), (0.42, 0.85)):
        plan.streak((xn + dx, y0), (xn + dx, y1), 0.16, 0.36, k, mirror=True)

side = LineMap(-11.8, 12.4, -2.4, 5.2, 0.008)
for y in (-8.4, -4.9, -1.0, 1.0, 6.4, 9.0):
    side.seg(0, (y, FUS.bot(y)), (y, FUS.top(y)), 0.018)
side.rect(0, -8.35, -0.95, -7.75, 0.2, 0.016)           # crew door
side.rect(0, 6.9, -0.45, 7.55, 0.55, 0.016)             # rear door
side.rect(0, 10.5, 1.5, 11.1, 2.6, 0.014)               # rudder tab

add_linework(PAINT, plan, side, dz)

views = ((-38, 16, 0.9), (142, 20, 0.9), (-40, -25, 0.9), (-60, 8, 0.5))
hide_special()
finish('bomber', size=2048, views=views)
air_views('bomber', views=((-40, -25, 0.9), (160, -32, 0.9), (-90, 2, 0.9), (14, 6, 0.55)))
if os.environ.get('AXM_DRAFT') == '1':
    check_views('bomber')
