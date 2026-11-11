# Single-engine fighter, in flight. Low wing, liquid-cooled inline engine behind a long pointed
# spinner, belly radiator, bubble canopy, three guns in each wing. Undercarriage up.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _air_helpers import *

reset()
far_clip()

PAINT = paint('paint', panel=0.7, gloss=0.42, dirt=0.6, wear=0.6)
SPIN = paint('paint-prop', gloss=0.42, dirt=0.4, wear=0.6)
SOOT = plain('soot', (0.05, 0.043, 0.04), rough=0.88, metal=0.4, rust=0.25, dirt=0.3)
BLADE = plain('blade', (0.028, 0.028, 0.03), rough=0.48, vary=0.06, dirt=0.2)
TIP = plain('blade-tip', (0.72, 0.45, 0.02), rough=0.5, vary=0.05, dirt=0.2)
GUN = plain('gunmetal', (0.085, 0.085, 0.09), rough=0.42, metal=0.9, dirt=0.3, vary=0.08)
DARK = plain('dark', (0.012, 0.012, 0.012), rough=0.95, vary=0.0, dirt=0.0, bump=0.0)
LEATHER = plain('leather', (0.16, 0.10, 0.055), rough=0.7, dirt=0.3)
GLASS = glass()

# Built with the thrust line at z = 0; settle() lifts the lot at the end.
DIH = 5.0
static = []


def add(ob):
    static.append(ob)
    return ob


# ---------------------------------------------------------------- fuselage

FUS = Body([
    (-4.18, 0.352, 0.352, -0.470, 0.00, 2.0, 2.4),
    (-4.00, 0.372, 0.380, -0.500, -0.01, 2.1, 2.5),
    (-3.60, 0.405, 0.412, -0.530, -0.03, 2.3, 2.7),
    (-3.00, 0.430, 0.442, -0.565, -0.05, 2.5, 3.0),
    (-2.30, 0.440, 0.472, -0.615, -0.06, 2.7, 3.4),
    (-1.60, 0.440, 0.505, -0.675, -0.08, 3.0, 4.0),
    (-0.60, 0.440, 0.520, -0.715, -0.10, 3.2, 4.2),
    (0.40, 0.425, 0.500, -0.715, -0.10, 3.2, 4.0),
    (1.20, 0.385, 0.455, -0.640, -0.08, 3.7, 3.6),
    (2.20, 0.300, 0.400, -0.470, -0.03, 3.7, 3.2),
    (3.20, 0.200, 0.360, -0.300, 0.03, 2.8, 2.6),
    (4.00, 0.100, 0.345, -0.170, 0.09, 2.2, 2.1),
    (4.42, 0.040, 0.340, -0.100, 0.12, 2.0, 2.0),
], [-4.18, -4.08, -3.92, -3.7, -3.45, -3.15, -2.85, -2.55, -2.25, -1.95, -1.65, -1.35, -1.0, -0.65, -0.3, 0.05,
    0.4, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6, 3.95, 4.2, 4.42], n=36)

fus = FUS.build('fuselage', PAINT)
n_side = (len(FUS.ys) - 1) * FUS.n
mat_faces(fus, DARK, lambda p: p.index == n_side)      # the carburettor intake under the spinner
add(fus)

# ---------------------------------------------------------------- wing


def row(plan, s):
    for a, b in zip(plan, plan[1:]):
        if a[0] <= s <= b[0]:
            u = (s - a[0]) / (b[0] - a[0])
            return tuple([s] + [a[k] + (b[k] - a[k]) * u for k in range(1, 5)])


S_TIP = 5.6 / math.cos(R(DIH))
WPLAN = [(0.0, -2.36, 2.96, 0.145, 1.0), (0.95, -2.063, 2.477, 0.142, 0.8), (S_TIP, -1.78, 1.28, 0.11, -1.0)]
WPLAN = [row(WPLAN, 0.2)] + WPLAN[1:]
WING = Foil((0, 0, -0.47), (math.cos(R(DIH)), 0, math.sin(R(DIH))), (0, 1, 0), (-math.sin(R(DIH)), 0, math.cos(R(DIH))),
            WPLAN, tip_r=0.55, tip_mid=0.42, camber=0.02, hinge=0.76,
            surfaces=[(-1, 2.95, True, True), (2.95, 5.0, True, True)])
wing = WING.build('wing', PAINT, extra=(1.95, 4.0))
add(both(wing))

fil = wing_fillet('fillet', FUS, WING, PAINT, r_le=0.05, r_te=0.21, tail=0.6, x0=0.4)
add(both(fil))

# guns: three blast tubes in each leading edge
GUN_X = (2.05, 2.25, 2.45)
for sx in (-1, 1):
    for i, x in enumerate(GUN_X):
        le = WING.pt(WING.s_of(x), 0.0)
        out = (0.20, 0.14, 0.10)[i]
        add(shade(tube('gun-fairing', (sx * x, le.y - 0.05, le.z), (sx * x, le.y + 0.16, le.z), 0.036, segs=10, mat=PAINT), 40))
        add(shade(tube('gun', (sx * x, le.y - out, le.z), (sx * x, le.y + 0.05, le.z), 0.019, segs=8, mat=GUN), 40))
MUZZLE = WING.pt(WING.s_of(GUN_X[1]), 0.0) + Vector((0, -0.16, 0))

# pitot head under the right wing
pp = WING.at(4.35, -1.15, -1)
add(strut('pitot-mast', pp + Vector((0, 0, 0.02)), pp + Vector((0, -0.03, -0.15)), 0.07, 0.05, 0.016, 0.012, PAINT))
add(tube('pitot', pp + Vector((0, -0.34, -0.15)), pp + Vector((0, 0.0, -0.15)), 0.009, segs=6, mat=GUN))

# ---------------------------------------------------------------- tail

TAIL = Foil((0, 0, 0.30), (1, 0, 0), (0, 1, 0), (0, 0, 1),
            [(0.0, 3.20, 1.24, 0.10, 0), (2.01, 3.58, 0.72, 0.09, 0)], tip_r=0.30, tip_mid=0.5, camber=0.0,
            hinge=(0, 3.99, 2.01, 3.99), surfaces=[(0.17, 9, True, True)], gw=0.006, gd=0.012)
add(both(TAIL.build('tailplane', PAINT)))

FIN = Foil((0, 0, -0.10), (0, 0, 1), (0, 1, 0), (1, 0, 0),
           [(0.0, 2.25, 2.68, 0.05, 0), (0.45, 2.40, 2.53, 0.052, 0), (0.80, 3.50, 1.42, 0.088, 0), (1.85, 4.00, 0.82, 0.09, 0)],
           tip_r=0.36, tip_mid=0.5, camber=0.0, hinge=(0, 4.42, 1.85, 4.42), surfaces=[(-1, 9, True, True)],
           gw=0.006, gd=0.012, hmin=0.45)
add(FIN.build('fin', PAINT, cap_root=True))

# ---------------------------------------------------------------- radiator scoop under the belly

SC = Body([
    (-0.42, 0.235, -0.640, -1.000, -0.86, 2.6, 2.6),
    (-0.25, 0.250, -0.600, -1.035, -0.85, 2.6, 2.8),
    (0.35, 0.265, -0.600, -1.045, -0.85, 2.6, 2.8),
    (1.00, 0.260, -0.550, -0.960, -0.78, 2.5, 2.8),
    (1.80, 0.225, -0.450, -0.770, -0.63, 2.4, 2.6),
    (2.50, 0.170, -0.360, -0.570, -0.48, 2.2, 2.4),
    (3.00, 0.100, -0.290, -0.410, -0.36, 2.0, 2.0),
], [-0.42, -0.33, -0.2, 0.05, 0.35, 0.7, 1.05, 1.4, 1.8, 2.15, 2.5, 2.78, 3.0], n=20)
rings = [SC.ring(y) for y in SC.ys]
mouth = rings[0]
c0 = sum(mouth, Vector()) / len(mouth)
inner = [c0 + (p - c0) * 0.84 for p in mouth]
rings = [[p + Vector((0, 0.16, 0)) for p in inner], inner] + rings
scoop = soft(loft('scoop', rings, True, True, PAINT), 50)
mat_faces(scoop, DARK, lambda p: p.index < SC.n or p.index == (len(rings) - 1) * SC.n)
add(scoop)

# ---------------------------------------------------------------- exhausts

stub = lathe('stub', [(0.0, 0.0), (0.043, 0.0), (0.040, 0.21), (0.029, 0.21), (0.029, 0.16), (0.0, 0.16)], segs=7, rot=(-90, 0, 0), mat=SOOT)
shade(stub, 50)
places = []
STUB_Y = [-3.80 + i * 0.165 for i in range(6)]
for sx in (-1, 1):
    for y in STUB_Y:
        p = FUS.side(y, 0.035, sx)
        places.append(((p.x - sx * 0.05, y, 0.035), (-7, 0, -sx * 32)))
static += copies(stub, places)
for sx in (-1, 1):
    ys = [-3.93, -3.4, -2.9, -2.62]
    add(bar('exhaust-shroud', [FUS.side(y, 0.035, sx) for y in ys], [FUS.side_n(y, 0.035, sx) for y in ys], width=0.13, out=0.006, inn=0.01, mat=SOOT))

# ---------------------------------------------------------------- canopy

NA = 16
CY = [-1.0, -0.86, -0.68, -0.48, -0.27, -0.06, 0.15, 0.36, 0.53, 0.66, 0.75, 0.80]
CA = pchip([-1.0, -0.55, -0.05, 0.36, 0.64, 0.80], [0.315, 0.345, 0.33, 0.26, 0.15, 0.035])
CH = pchip([-1.0, -0.72, -0.38, -0.05, 0.28, 0.57, 0.80], [0.955, 1.01, 1.025, 1.0, 0.905, 0.745, 0.515])
crows = []
for y in CY:
    a = CA(y)
    zb = FUS.z_at(y, a) - 0.012
    h = CH(y) - zb
    r = []
    for i in range(NA + 1):
        t = math.pi * i / NA
        c, s = math.cos(t), math.sin(t)
        r.append(Vector((a * math.copysign(abs(c) ** (2 / 2.2), c), y, zb + h * abs(s) ** (2 / 2.2))))
    crows.append(r)
bubble = grid_mesh('bubble', crows, GLASS)
face_out(bubble, lambda c: Vector((0, c.y, 0.45)))
add(soft(bubble, 50))

arch = crows[0]
K = 6
BR = Vector((0.16, -1.52, FUS.z_at(-1.52, 0.16) - 0.012))
BL = Vector((-BR.x, BR.y, BR.z))
TR, TL = arch[K], arch[NA - K]
front = mesh_obj('windscreen', [BL, BR, TR, TL], [(0, 1, 2, 3)], GLASS)
face_out(front, (0, -0.8, 0.3))
add(front)
nf = front.data.polygons[0].normal.copy()
for sx, corner, pts in ((1, BR, arch[:K + 1]), (-1, BL, list(reversed(arch[NA - K:])))):
    q = fan('quarter-light', corner, pts, GLASS)
    face_out(q, (0, -0.8, 0.5))
    add(soft(q, 50))
    nq = (pts[0] - corner).cross(pts[K // 2] - corner).normalized()
    if nq.x * sx < 0:
        nq = -nq
    add(bar('sill-front', [corner, pts[0]], nq + Vector((0, 0, 0.6)), width=0.04, mat=PAINT))
top = mesh_obj('screen-top', arch[K:NA - K + 1], [tuple(range(NA - 2 * K + 1))], PAINT)
face_out(top, (0, -0.8, 0.3))
add(top)
add(bar('screen-frame', [BL, BR, TR, TL], nf, width=0.042, out=0.014, inn=0.012, mat=PAINT, closed=True))
add(bar('arch', arch, [(p - Vector((0, p.y, 0.5))) for p in arch], width=0.05, out=0.014, inn=0.012, mat=PAINT))
for j in (0, NA):
    pts = [r[j] for r in crows]
    nr = [FUS.nrm(p.y, FUS.t_of_x(p.y, p.x)) for p in pts]
    add(bar('sill', pts, nr, width=0.05, out=0.02, inn=0.012, mat=PAINT))

# the pilot, his seat armour and the coaming over the instrument panel
add(soft(sphere('head', 0.115, at=(0, -0.42, 0.82), scale=(0.95, 1.05, 1.0), segs=12, rings=8, mat=LEATHER)))
add(soft(sphere('shoulders', 0.2, at=(0, -0.40, 0.52), scale=(1.25, 0.7, 0.85), segs=12, rings=6, mat=LEATHER)))
add(hard(box('seat-armour', 0.44, 0.025, 0.46, at=(0, -0.20, 0.64), rot=(8, 0, 0), mat=DARK), 0.004))
add(hard(box('coaming', 0.46, 0.34, 0.07, at=(0, -1.10, 0.61), rot=(-6, 0, 0), mat=DARK), 0.01))
add(hard(box('gunsight', 0.06, 0.08, 0.10, at=(0, -1.10, 0.69), mat=DARK), 0.004))

# aerial mast behind the canopy
zt = FUS.top(1.2)
add(strut('aerial', (0, 1.2, zt - 0.03), (0, 1.14, zt + 0.62), 0.11, 0.05, 0.022, 0.01, PAINT))
add(tube('aerial-wire', (0, 1.14, zt + 0.60), FIN.pt(1.62, 0.0) + Vector((0, 0.02, 0)), 0.004, segs=4, mat=GUN))

# navigation lights on the wing tips
for sx in (-1, 1):
    p = WING.pt(S_TIP - 0.035, 0.42, 1)
    add(soft(sphere('nav-light', 0.03, at=(sx * (p.x + 0.012), p.y, p.z - 0.008), scale=(1.0, 2.2, 0.8), segs=8, rings=6, mat=GLASS)))

# The spinner is part of the hull, not of the propeller: the stage hides the propeller and shows the
# blur disc when the aircraft is flying, and a spinner that vanished with the blades would leave a
# hole in the nose. It is a body of revolution, so it looks the same turning or still.
HUB = Vector((0, -4.50, 0))
PR = 1.70
spinner = lathe('spinner', [(0.355, 0.0), (0.352, 0.08), (0.332, 0.22), (0.285, 0.38), (0.212, 0.53), (0.125, 0.64), (0.05, 0.705), (0.0, 0.72)],
                segs=24, at=(0, -4.185, 0), rot=(90, 0, 0), mat=SPIN)
add(soft(spinner, 50))

hull = join('hull', static)
tag(hull, 'none')

# ---------------------------------------------------------------- propeller

pparts = []
for i in range(4):
    b = blade('blade', PR, BLADE, TIP, chord=0.29, beta75=33)
    xform(b, at=tuple(HUB), rot=(0, 90 * i, 0))
    pparts.append(b)
prop = join('prop', pparts)
pivot(prop, HUB)
parent(prop, hull)
tag(prop, 'prop', rpm=1400)
prop_disc('disc', PR, tuple(HUB), hull)

# ---------------------------------------------------------------- markings and markers

for sx, tag_ in ((-1, 'L'), (1, 'R')):
    for side, where in ((1, 'top'), (-1, 'under')):
        foil_decal(f'decal.wing.{where}.{tag_}', WING, WING.s_of(3.55), 0.46, 1.1, side, sx, hull)
    p, n = FUS.side(1.75, -0.05, sx), FUS.side_n(1.75, -0.05, sx)
    place_decal(f'decal.fuselage.{tag_}', 0.8, p, n, (0, 0, 1), hull)
    foil_decal(f'decal.fin.{tag_}', FIN, 1.22, 0.44, 0.6, sx, 1, hull, kind='fin', up=(0, 0, 1))
    marker(f'muzzle.{tag_}', (sx * MUZZLE.x, MUZZLE.y, MUZZLE.z), hull, kind='mg')
    marker(f'exhaust.{tag_}', (sx * 0.50, -3.3, 0.03), hull)

dz = settle()
check_decals()
if os.environ.get('AXM_DRY') == '1':
    print('  triangles', tris(baked_meshes()))
    quick_views('fighter')
    sys.exit(0)
print(f'  thrust line at z = {dz:.3f}')

# ---------------------------------------------------------------- panel lines and soot


def chord_line(lm, ch, foil, f, s0, s1, width=0.01, strength=0.8):
    a, b = foil.pt(s0, f), foil.pt(s1, f)
    lm.seg(ch, (a.x, a.y), (b.x, b.y), width, strength, mirror=True)


def rib(lm, ch, foil, s, f0=0.04, f1=0.74, width=0.01, strength=0.8):
    a, b = foil.pt(s, f0), foil.pt(s, f1)
    lm.seg(ch, (a.x, a.y), (b.x, b.y), width, strength, mirror=True)


plan = LineMap(-5.9, 5.9, -5.1, 5.1, 0.006)
for ch in (0, 1):
    chord_line(plan, ch, WING, 0.30, 0.75, 5.0)
    for s in (1.0, 1.72, 2.72, 3.5, 4.3):
        rib(plan, ch, WING, s)
    chord_line(plan, ch, TAIL, 0.30, 0.25, 1.7)
    rib(plan, ch, TAIL, 0.9, 0.05, 0.6)
# top: gun bays, fuel fillers, cowl and fuselage joints
plan.rect(0, 1.84, -1.52, 2.66, -0.82, 0.012, mirror=True)
plan.seg(0, (2.25, -1.52), (2.25, -0.82), 0.01, mirror=True)
plan.circle(0, (1.2, -1.0), 0.065, 0.012, mirror=True)
for y in (-3.3, -2.3, 2.95):
    plan.seg(0, (-0.5, y), (0.5, y), 0.012)
plan.seg(0, (0.0, -4.15), (0.0, -2.3), 0.01)
# underneath: wheel bays and leg doors, shell chutes, radiator flap, tail wheel doors
plan.poly(1, [(2.02, -1.56), (2.02, -1.30), (1.0, -1.04), (0.60, -1.0), (0.60, -1.84), (1.0, -1.80)], 0.014, mirror=True)
plan.poly(1, [(0.60, -1.0), (0.03, -1.0), (0.03, -1.84), (0.60, -1.84)], 0.014, closed=False, mirror=True)
for x in GUN_X:
    plan.seg(1, (x, -1.12), (x, -1.0), 0.035, mirror=True)
    le = WING.pt(WING.s_of(x), 0.0)
    plan.streak((x, le.y + 0.02), (x, le.y + 1.0), 0.03, 0.07, 0.55, mirror=True)
plan.rect(1, -0.17, 2.2, 0.17, 2.82, 0.014)
plan.rect(1, -0.075, 3.5, 0.075, 4.05, 0.012)
plan.seg(1, (0, 3.5), (0, 4.05), 0.01)
for y in (-3.3, -2.3):
    plan.seg(1, (-0.5, y), (0.5, y), 0.012)
plan.rect(1, -0.2, -3.9, 0.2, -3.4, 0.012)

side = LineMap(-5.0, 5.0, -1.2, 2.0, 0.005)
for z in (0.19, -0.30):
    side.seg(0, (-4.15, z), (-2.3, z), 0.012)
side.seg(0, (-2.3, -0.62), (-2.3, 0.47), 0.012)
side.seg(0, (-3.3, -0.30), (-3.3, 0.19), 0.01)
side.seg(0, (2.95, -0.33), (2.95, 0.36), 0.012)
side.rect(0, 1.02, -0.5, 1.26, -0.2, 0.01)
side.rect(0, 4.60, 0.42, 4.90, 0.86, 0.01)
side.streak((-2.95, 0.03), (0.2, -0.08), 0.06, 0.19, 0.8)

add_linework(PAINT, plan, side, dz)

views = ((-38, 16), (142, 20), (-40, -25), (-60, 8, 0.5))
hide_special()
finish('fighter', size=2048, views=views)
air_views('fighter')
if os.environ.get('AXM_DRAFT') == '1':
    check_views('fighter')
