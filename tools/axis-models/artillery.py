# 105 mm field howitzer, emplaced: split trails spread and dug in, shield up, ammunition laid out beside the left trail.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _guns_helpers import *

reset()

PAINT = paint('paint', low=(0.0, 0.8), dirt=1.0, wear=1.0)
RUBBER = plain('rubber', (0.035, 0.035, 0.035), rough=0.86, dirt=0.9, bump=0.15, low=(0.0, 0.45))
STEEL = plain('steel', (0.36, 0.36, 0.37), rough=0.3, metal=1.0, dirt=0.25, vary=0.08)
GUNMETAL = plain('gunmetal', (0.085, 0.085, 0.09), rough=0.42, metal=0.9, dirt=0.3, vary=0.08)
CRATE = wood('crate', colour=(0.45, 0.34, 0.19), plank=0.12, length=1.5, dirt=0.6)
BRASS = plain('brass', (0.80, 0.56, 0.20), rough=0.3, metal=0.9, dirt=0.2, vary=0.1)
SHELL = plain('shell', (0.105, 0.115, 0.06), rough=0.55, dirt=0.3, vary=0.1)
CANVAS = plain('canvas', (0.31, 0.29, 0.21), rough=0.95, vary=0.2, dirt=0.7, bump=0.5, fine_scale=140.0)
TOOLWOOD = plain('toolwood', (0.34, 0.23, 0.12), rough=0.7, dirt=0.6)
GLASS = glass()

TRACK = 0.90                 # wheel centre, x
WHEEL_R = 0.50
AXLE_Z = 0.50
PIN = (0, 0, 0.79)           # traverse pin over the axle
TRUN = (0, 0.30, 1.20)       # trunnions
ZB = 1.30                    # bore axis height at rest
BREECH_Y = 0.92              # rear face of the breech ring
MUZZLE_Y = BREECH_Y - 2.70
SPREAD = 25.0                # each trail, degrees out from straight back
TRAIL_LEN = 3.2

static = []


def add(ob, width=0.008, to=None):
    (static if to is None else to).append(hard(ob, width))
    return ob


# ---------------------------------------------------------------- hull: axle and lower carriage

add(cyl('axle', 0.06, 1.44, at=(0, 0, AXLE_Z), rot=(0, 90, 0), segs=10, mat=PAINT, caps=False), 0.0)
for s in (-1, 1):
    add(cyl('drum', 0.185, 0.10, at=(s * 0.722, 0, AXLE_Z), rot=(0, 90, 0), segs=14, mat=PAINT), 0.0)
    add(cyl('stub', 0.09, 0.12, at=(s * 0.62, 0, AXLE_Z), rot=(0, 90, 0), segs=10, mat=PAINT), 0.0)
    add(box('axle-seat', 0.10, 0.20, 0.10, at=(s * 0.36, 0, AXLE_Z + 0.03), mat=PAINT), 0.012)
saddle = prism('saddle', [(-0.25, 0.50), (-0.21, 0.72), (0.25, 0.72), (0.27, 0.46), (-0.20, 0.42)], -0.30, 0.30, PAINT)
add(saddle, 0.022)
static.append(hard(lathe('pintle-seat', [(0.30, 0.0), (0.30, 0.058), (0.288, 0.07), (0.0, 0.07)], segs=20, at=(0, 0, 0.72), mat=PAINT), 0.0, sharp=30))
static += copies(bolt(PAINT, 0.012, 0.012), ring_spots(frame((0, 0, 0.79)), 0.277, 10, 0.3))
static += copies(bolt(PAINT, 0.016, 0.014), [((x, -0.25 + (z - 0.5) * 0.04 / 0.22, z), (80, 0, 0)) for x in (-0.2, 0.2) for z in (0.56, 0.66)])
# travelling lock stub on the nose of the saddle
add(box('lock-lug', 0.08, 0.08, 0.10, at=(0, -0.27, 0.52), mat=PAINT), 0.012)

# ---------------------------------------------------------------- hull: split trails

for s in (-1, 1):
    hinge = Vector((s * 0.27, 0.27, 0.60))
    flat = Vector((s * math.sin(R(SPREAD)), math.cos(R(SPREAD)), 0.0))
    p0 = hinge + flat * 0.04
    p1 = hinge + flat * TRAIL_LEN
    p1.z = 0.17
    d, side, up = beam_frame(p0, p1)
    length = (p1 - p0).length

    def at(t, across=0.0, rise=0.0):
        return p0 + d * t + side * across + up * rise

    def half_h(t):
        return (0.24 + (0.14 - 0.24) * t / length) / 2

    def half_w(t):
        return (0.15 + (0.12 - 0.15) * t / length) / 2

    # hinge: lugs on the saddle, the pin, and the knuckle on the trail
    add(cyl('hinge-pin', 0.03, 0.36, at=tuple(hinge), segs=6, mat=STEEL), 0.0)
    add(cyl('knuckle', 0.085, 0.20, at=tuple(hinge), segs=10, mat=PAINT), 0.0)
    for z in (0.47, 0.73):
        add(box('hinge-lug', 0.20, 0.22, 0.045, at=(s * 0.255, 0.22, z), mat=PAINT), 0.0)
    # box girder with top and bottom flange plates
    stations = [0.0, length * 0.42, length]
    add(beam('trail', [at(t) for t in stations], [(2 * half_w(t), 2 * half_h(t)) for t in stations], PAINT), 0.012)
    for sign in (-1, 1):
        add(beam('flange', [at(t, 0, sign * half_h(t)) for t in stations], [(2 * half_w(t) + 0.034, 0.014) for t in stations], PAINT), 0.0)
    # rivet line along the outer edge of the top flange
    places = []
    for i in range(11):
        t = 0.18 + i * (length - 0.5) / 10
        places.append(spot(basis(at(t, s * (half_w(t) + 0.004), half_h(t) + 0.007), side, d, up)))
    static += copies(rivet(PAINT, 0.01, 4), places)
    # stiffening bands round the girder
    for t in (0.55, 1.45, 2.3):
        m = basis(at(t), side, d, up)
        add(place(box('band', 2 * half_w(t) + 0.04, 0.05, 2 * half_h(t) + 0.03, mat=PAINT), m), 0.0)
    # lifting handles on the outer face
    for t in (1.9, 2.65):
        a, b = at(t - 0.11, s * half_w(t), 0.01), at(t + 0.11, s * half_w(t), 0.01)
        out = side * s * 0.065
        static.append(rod('grab', a, a + out, 0.011, 4, PAINT, caps=False))
        static.append(rod('grab', b, b + out, 0.011, 4, PAINT, caps=False))
        static.append(rod('grab', a + out, b + out, 0.011, 4, PAINT))

    # spade: float plate on the ground, blade dug in behind it, gussets up to the trail
    sp = basis((p1.x, p1.y, 0.0), Vector((flat.y, -flat.x, 0.0)), flat, Vector((0, 0, 1)))
    add(place(box('float', 0.42, 0.40, 0.024, at=(0, -0.12, 0.012), mat=PAINT), sp), 0.006)
    add(place(box('blade', 0.50, 0.026, 0.40, at=(0, 0.12, 0.045), rot=(-14, 0, 0), mat=PAINT), sp), 0.006)
    add(place(box('blade-lip', 0.50, 0.07, 0.022, at=(0, 0.185, 0.235), rot=(-14, 0, 0), mat=PAINT), sp), 0.0)
    add(place(box('trail-end', 0.15, 0.18, 0.17, at=(0, 0.02, 0.165), mat=PAINT), sp), 0.012)
    for x in (-0.15, 0.15):
        gus = slab('gusset', [(-0.30, 0.022), (0.085, 0.022), (0.135, 0.21), (-0.02, 0.15)], 0.016, PAINT, sp @ frame((x, 0, 0), (0, 0, 90)))
        add(gus, 0.0)
    if s < 0:
        # trail handspike in its socket
        add(place(cyl('spike-socket', 0.036, 0.24, at=(0, 0.0, 0.285), rot=(-74, 0, 0), segs=8, mat=PAINT), sp), 0.0)
        static.append(rod('handspike', sp @ Vector((0, 0.02, 0.29)), sp @ Vector((0, 0.74, 0.497)), 0.021, 6, TOOLWOOD))
        static.append(rod('spike-ferrule', sp @ Vector((0, 0.68, 0.48)), sp @ Vector((0, 0.76, 0.503)), 0.025, 6, STEEL))
    else:
        # towing eye (lunette)
        static.append(rod('lunette-shank', sp @ Vector((0, 0.05, 0.185)), sp @ Vector((0, 0.36, 0.185)), 0.032, 8, PAINT))
        static.append(place(shade(torus('lunette', 0.062, 0.022, 12, 5, at=(0, 0.42, 0.185), mat=STEEL), 70), sp))
        add(place(box('lunette-plate', 0.13, 0.03, 0.12, at=(0, 0.125, 0.19), rot=(-14, 0, 0), mat=PAINT), sp), 0.006)
    # stowage along the top of the trail
    if s > 0:
        a, b = at(0.75, 0.0, half_h(0.75) + 0.04), at(2.55, 0.0, half_h(2.55) + 0.04)
        static.append(rod('rammer', a, b, 0.019, 6, TOOLWOOD))
        static.append(rod('rammer-head', a - d * 0.10, a + d * 0.02, 0.05, 8, TOOLWOOD))
        for t in (1.0, 2.3):
            m = basis(at(t, 0, half_h(t) + 0.025), side, d, up)
            add(place(box('clip', 0.075, 0.03, 0.065, mat=PAINT), m), 0.0)
    else:
        a, b = at(0.9, 0.0, half_h(0.9) + 0.032), at(1.75, 0.0, half_h(1.75) + 0.032)
        static.append(rod('shovel-shaft', a, b, 0.016, 6, TOOLWOOD))
        m = basis(at(0.80, 0, half_h(0.8) + 0.028), side, d, up)
        add(place(box('shovel-blade', 0.17, 0.24, 0.016, mat=STEEL), m), 0.004)
        for t in (1.2, 1.65):
            m = basis(at(t, 0, half_h(t) + 0.022), side, d, up)
            add(place(box('clip', 0.06, 0.03, 0.055, mat=PAINT), m), 0.0)

# ---------------------------------------------------------------- hull: ammunition beside the left trail

def round_105(with_shell=True):
    """A 105 mm round standing on its base at the origin (or just its fired case)."""
    if with_shell:
        whole = lathe('round', [(0.0, 0.0), (0.061, 0.0), (0.061, 0.014), (0.0535, 0.02), (0.0535, 0.372), (0.0525, 0.374), (0.0525, 0.57),
                                (0.045, 0.67), (0.028, 0.75), (0.013, 0.795), (0.0, 0.80)], segs=10)
        two_tone(shade(whole, 40), BRASS, SHELL, 0.373)
        whole.data.materials.append(STEEL)        # bare fuze in the nose
        for p in whole.data.polygons:
            if p.center.z > 0.76:
                p.material_index = 2
        return whole
    return shade(lathe('spent', [(0.0, 0.0), (0.061, 0.0), (0.061, 0.014), (0.0535, 0.02), (0.0535, 0.372), (0.049, 0.372), (0.049, 0.08), (0.0, 0.08)], segs=10, mat=BRASS), 40)


CX = -1.56
for spot_ in ((CX, 1.70, 0), (CX - 0.385, 1.74, 0), (CX - 0.17, 1.66, 0.266)):
    # each crate has its own piece of the atlas: the plank pattern is laid in model space
    static.append(xform(crate('ammo-crate', 0.36, 0.90, 0.25, CRATE, rope=CANVAS), spot_))
# an open crate with two rounds in it, its lid leaning against the far side
OC = (-1.56, 0.66)
add(box('open-floor', 0.36, 0.90, 0.018, at=(OC[0], OC[1], 0.009), mat=CRATE), 0.0)
for x in (-0.171, 0.171):
    add(box('open-side', 0.018, 0.90, 0.25, at=(OC[0] + x, OC[1], 0.125), mat=CRATE), 0.003)
for y in (-0.441, 0.441):
    add(box('open-end', 0.324, 0.018, 0.25, at=(OC[0], OC[1] + y, 0.125), mat=CRATE), 0.003)
    add(box('open-handle', 0.14, 0.02, 0.025, at=(OC[0], OC[1] + y * 1.045, 0.155), mat=CANVAS), 0.0)
add(box('open-divider', 0.324, 0.02, 0.13, at=(OC[0], OC[1] + 0.05, 0.08), mat=CRATE), 0.0)
add(box('open-lid', 0.36, 0.90, 0.018, at=(OC[0] + 0.238, OC[1] + 0.03, 0.176), rot=(0, 75, 0), mat=CRATE), 0.003)
rounds = [((OC[0] - 0.082, OC[1] - 0.405, 0.15), (-90, 0, 0)), ((OC[0] + 0.082, OC[1] - 0.405, 0.15), (-90, 0, 0)),
          ((-1.16, 1.50, 0.012), (0, 0, 10)), ((-1.07, 1.66, 0.012), (0, 0, 50)), ((-1.25, 1.68, 0.012), (0, 0, 80))]
static += stamps(round_105(), rounds)      # three materials on each: not for copies()
add(box('groundsheet', 0.46, 0.56, 0.012, at=(-1.165, 1.60, 0.006), rot=(0, 0, 6), mat=CANVAS), 0.0)
# fired cases thrown clear behind the breech
spent = [((0.36, 1.62, 0.058), (90, 0, 35)), ((0.62, 2.02, 0.058), (90, 0, -70)), ((0.22, 2.28, 0.058), (90, 0, 100)),
         ((0.80, 2.46, 0.058), (90, 0, 15))]
static += stamps(round_105(False), spent)

report('hull', static)
hull = join('hull', static)
tag(hull, 'none')

# ---------------------------------------------------------------- wheels

wheel = disc_wheel('wheel', WHEEL_R, 0.24, 0.275, PAINT, RUBBER, segs=18, lugs=18, two_sided=True, hub=0.09, nuts=5)
report('wheel', [wheel])
wheel.location = (TRACK, 0, AXLE_Z)
tag(wheel, 'spin', radius=WHEEL_R)
instance(wheel, 'wheel.L', at=(-TRACK, 0, AXLE_Z))

# ---------------------------------------------------------------- mount: upper carriage, shield, handwheels, sight

mp = []
add(cyl('turntable', 0.25, 0.06, at=(0, 0, 0.82), segs=16, mat=PAINT), 0.0, mp)
add(box('carriage-floor', 0.40, 0.74, 0.04, at=(0, 0.07, 0.87), mat=PAINT), 0.008, mp)
CHEEK = [(-0.30, 0.85), (0.44, 0.85), (0.47, 1.12), (0.40, 1.30), (0.20, 1.30), (-0.30, 0.99)]
for s in (-1, 1):
    add(prism('cheek', CHEEK, s * 0.185, s * 0.215, PAINT), 0.008, mp)
    mp.append(hard(lathe('trunnion-cap', [(0.088, 0.0), (0.088, 0.04), (0.076, 0.052), (0.0, 0.052)], segs=12, at=(s * 0.213, TRUN[1], TRUN[2]), rot=(0, 90 * s, 0), mat=PAINT), 0.0, sharp=30))
    add(cyl('trunnion-end', 0.04, 0.02, at=(s * 0.27, TRUN[1], TRUN[2]), rot=(0, 90, 0), segs=8, mat=STEEL), 0.0, mp)
    mp += copies(bolt(PAINT, 0.011, 0.012), ring_spots(frame((s * 0.262, TRUN[1], TRUN[2]), (0, 90 * s, 0)), 0.066, 6))
    # flange along the sloping top edge of the cheek
    add(beam('cheek-flange', [(s * 0.2, -0.30, 0.995), (s * 0.2, 0.20, 1.305)], (0.05, 0.016), PAINT), 0.0, mp)
    add(box('shield-bracket', 0.05, 0.07, 0.15, at=(s * 0.212, -0.305, 0.93), mat=PAINT), 0.0, mp)
add(box('front-transom', 0.37, 0.04, 0.13, at=(0, -0.28, 0.93), mat=PAINT), 0.006, mp)

# the shield: a left and a right half, each a near-upright lower plate and an upper plate raked back
T_PLATE = 0.022
LOW_HINGE, LOW_RAKE, LOW_H = (-0.36, 0.52), 8.0, 0.64
UP_RAKE, UP_H = 24.0, 0.62
kink = (LOW_HINGE[0] + LOW_H * math.sin(R(LOW_RAKE)), LOW_HINGE[1] + LOW_H * math.cos(R(LOW_RAKE)))
LOW = [(0.19, 0.0), (0.58, 0.0), (0.655, 0.09), (0.655, LOW_H), (0.19, LOW_H)]
UPPER = [(0.19, 0.0), (0.90, 0.0), (0.90, 0.34), (0.76, UP_H), (0.26, UP_H), (0.19, UP_H - 0.07)]
PORT = [(0.33, 0.25), (0.45, 0.25), (0.45, 0.31), (0.45, 0.37), (0.33, 0.37), (0.33, 0.31)]
rivets = []
for s in (-1, 1):
    side_m = Matrix.Diagonal((s, 1, 1, 1))
    low_r = frame((0, LOW_HINGE[0], LOW_HINGE[1]), (-LOW_RAKE, 0, 0))
    up_r = frame((0, kink[0], kink[1]), (-UP_RAKE, 0, 0))
    low_m, up_m = side_m @ low_r, side_m @ up_r
    add(slab('shield-low', LOW, T_PLATE, PAINT, low_m), 0.005, mp)
    if s < 0:
        add(slab_hole('shield-up', UPPER, PORT, T_PLATE, PAINT, up_m), 0.005, mp)
        # sliding shutter parked above the sight port, on its two guides
        add(place(box('shutter', 0.15, 0.012, 0.10, at=(0.39, -T_PLATE / 2 - 0.008, 0.445), mat=PAINT), up_m), 0.003, mp)
        for u in (0.305, 0.475):
            add(place(box('shutter-guide', 0.022, 0.016, 0.28, at=(u, -T_PLATE / 2 - 0.008, 0.36), mat=PAINT), up_m), 0.0, mp)
    else:
        add(slab('shield-up', UPPER, T_PLATE, PAINT, up_m), 0.005, mp)
    # angle iron along the joint and stiffening ribs on the back
    add(place(box('joint', 0.50, 0.035, 0.035, at=(0.42, T_PLATE / 2 + 0.012, LOW_H - 0.005), mat=PAINT), low_m), 0.0, mp)
    for u in (0.235, 0.61):
        add(place(box('rib', 0.032, 0.036, LOW_H - 0.10, at=(u, T_PLATE / 2 + 0.018, LOW_H / 2 - 0.01), mat=PAINT), low_m), 0.0, mp)
    for u in (0.235, 0.65):
        add(place(box('rib', 0.032, 0.036, UP_H - 0.09, at=(u, T_PLATE / 2 + 0.018, UP_H / 2 - 0.005), mat=PAINT), up_m), 0.0, mp)
    add(place(box('top-lip', 0.50, 0.03, 0.03, at=(0.51, T_PLATE / 2 + 0.012, UP_H - 0.02), mat=PAINT), up_m), 0.0, mp)
    # rivets on the face, over the ribs (the inner column starts above the folded flap)
    for i in range(5):
        rivets.append(spot(low_r, (s * 0.235, -T_PLATE / 2, 0.32 + i * 0.065), (90, 0, 0)))
        rivets.append(spot(low_r, (s * 0.61, -T_PLATE / 2, 0.12 + i * 0.115), (90, 0, 0)))
        for u in (0.235, 0.65):
            rivets.append(spot(up_r, (s * u, -T_PLATE / 2, 0.07 + i * 0.12), (90, 0, 0)))
    for i in range(3):
        rivets.append(spot(up_r, (s * 0.86, -T_PLATE / 2, 0.05 + i * 0.12), (90, 0, 0)))
        rivets.append(spot(up_r, (s * (0.35 + i * 0.12), -T_PLATE / 2, UP_H - 0.035), (90, 0, 0)))
        rivets.append(spot(low_r, (s * (0.33 + i * 0.095), -T_PLATE / 2, LOW_H - 0.03), (90, 0, 0)))
    # lower flap, folded up against the face on its hinges and held by a latch
    add(place(box('flap', 0.40, 0.018, 0.25, at=(0.39, -T_PLATE / 2 - 0.016, 0.135), mat=PAINT), low_m), 0.004, mp)
    for u in (0.27, 0.51):
        add(place(cyl('flap-hinge', 0.016, 0.09, at=(u, -T_PLATE / 2 - 0.012, 0.0), rot=(0, 90, 0), segs=6, mat=PAINT), low_m), 0.0, mp)
    add(place(box('flap-latch', 0.03, 0.02, 0.07, at=(0.39, -T_PLATE / 2 - 0.03, 0.27), mat=STEEL), low_m), 0.0, mp)
    for u in (0.24, 0.54):
        rivets.append(spot(low_r, (s * u, -T_PLATE / 2 - 0.025, 0.21), (90, 0, 0)))
        rivets.append(spot(low_r, (s * u, -T_PLATE / 2 - 0.025, 0.06), (90, 0, 0)))
    # stays from the back of the plates to the cheeks
    mp.append(rod('stay', up_m @ Vector((0.50, T_PLATE / 2, 0.24)), (s * 0.215, 0.33, 1.27), 0.014, 5, PAINT, caps=False))
    mp.append(rod('stay', low_m @ Vector((0.47, T_PLATE / 2, 0.36)), (s * 0.215, -0.12, 0.985), 0.014, 5, PAINT, caps=False))
    mp.append(rod('stay', up_m @ Vector((0.82, T_PLATE / 2, 0.16)), low_m @ Vector((0.61, T_PLATE / 2, 0.45)), 0.012, 5, PAINT, caps=False))
mp += copies(rivet(PAINT, 0.011, 4), rivets)

# elevating gear on the right: gearbox on the cheek, handwheel facing the layer, pinion under the arc
add(box('elev-box', 0.10, 0.20, 0.17, at=(0.262, 0.08, 1.02), mat=PAINT), 0.012, mp)
mp.append(rod('elev-shaft', (0.30, 0.10, 1.03), (0.42, 0.44, 1.08), 0.016, 6, PAINT))
eh, _ = along((0.30, 0.10, 1.03), (0.42, 0.44, 1.08))
eh.translation = Vector((0.425, 0.455, 1.082))
mp.append(handwheel('elev-wheel', 0.135, eh, STEEL, PAINT, spokes=4, grip_mat=TOOLWOOD))
add(box('pinion-box', 0.10, 0.14, 0.09, at=(0.11, 0.30, 0.90), mat=PAINT), 0.008, mp)
# traversing gear on the left: worm box at the turntable, handwheel behind the shield
add(box('trav-box', 0.11, 0.20, 0.13, at=(-0.262, -0.08, 0.935), mat=PAINT), 0.012, mp)
mp.append(rod('trav-shaft', (-0.30, -0.02, 0.96), (-0.40, 0.42, 1.03), 0.016, 6, PAINT))
th, _ = along((-0.30, -0.02, 0.96), (-0.40, 0.42, 1.03))
th.translation = Vector((-0.403, 0.435, 1.032))
mp.append(handwheel('trav-wheel', 0.12, th, STEEL, PAINT, spokes=3, grip_mat=TOOLWOOD))

# sight on the left: bracket off the trunnion, direct telescope looking through the port, panoramic head above
add(box('sight-bracket', 0.05, 0.11, 0.22, at=(-0.265, 0.30, 1.36), mat=PAINT), 0.008, mp)
add(box('sight-arm', 0.15, 0.06, 0.05, at=(-0.325, 0.30, 1.445), mat=PAINT), 0.008, mp)
add(box('sight-mount', 0.085, 0.13, 0.10, at=(-0.39, 0.27, 1.43), mat=GUNMETAL), 0.01, mp)
mp.append(rod('telescope', (-0.39, 0.42, 1.435), (-0.39, -0.07, 1.44), 0.026, 8, GUNMETAL))
mp.append(rod('eyecup', (-0.39, 0.47, 1.434), (-0.39, 0.41, 1.435), 0.034, 8, RUBBER, r2=0.027))
add(box('telescope-lens', 0.03, 0.006, 0.03, at=(-0.39, -0.073, 1.44), mat=GLASS), 0.0, mp)
mp.append(rod('pano-stem', (-0.39, 0.30, 1.48), (-0.39, 0.30, 1.74), 0.022, 8, GUNMETAL))
add(box('pano-head', 0.06, 0.075, 0.08, at=(-0.39, 0.295, 1.77), mat=GUNMETAL), 0.008, mp)
add(box('pano-lens', 0.04, 0.006, 0.04, at=(-0.39, 0.256, 1.775), mat=GLASS), 0.0, mp)
mp.append(rod('pano-eyepiece', (-0.39, 0.31, 1.53), (-0.39, 0.40, 1.50), 0.016, 6, GUNMETAL))

report('mount', mp)
mount = join('mount', mp)
pivot(mount, PIN)
tag(mount, 'yaw', min=-25, max=25, speed=0.4)

# ---------------------------------------------------------------- gun: barrel, breech, cradle, recoil gear

gp = []
gp.append(hard(cyl('trunnion', 0.052, 0.40, at=TRUN, rot=(0, 90, 0), segs=10, mat=PAINT, caps=False), 0.0))
for s in (-1, 1):
    add(cyl('trunnion-boss', 0.08, 0.03, at=(s * 0.14, TRUN[1], TRUN[2]), rot=(0, 90, 0), segs=10, mat=PAINT), 0.0, gp)
cradle = prism('cradle', [(-0.80, 1.07), (-0.80, 1.20), (0.50, 1.20), (0.50, 1.04), (-0.34, 1.04), (-0.72, 1.07)], -0.125, 0.125, PAINT)
add(cradle, 0.014, gp)
add(box('cradle-rail', 0.29, 1.26, 0.03, at=(0, -0.15, 1.19), mat=PAINT), 0.006, gp)
# recoil cylinder poking out of the front of the cradle, with its flange and rod nut
gp.append(hard(lathe('recoil-cyl', [(0.0, -0.02), (0.085, -0.02), (0.085, 0.0), (0.066, 0.0), (0.066, 0.17), (0.058, 0.19), (0.03, 0.19), (0.03, 0.24), (0.0, 0.24)], segs=12, at=(0, -0.80, 1.13), rot=(90, 0, 0), mat=PAINT), 0.0, sharp=35))
# sleigh the barrel rides on, and the yokes tying barrel, sleigh and recuperator together
add(box('sleigh', 0.215, 1.46, 0.06, at=(0, -0.105, 1.225), mat=PAINT), 0.01, gp)
YOKE = [(-0.115, 1.17), (0.115, 1.17), (0.135, 1.26), (0.135, 1.37), (0.085, 1.565), (-0.085, 1.565), (-0.135, 1.37), (-0.135, 1.26)]
add(slab('yoke', YOKE, 0.075, PAINT, frame((0, -0.775, 0))), 0.012, gp)
add(slab('yoke-rear', YOKE, 0.06, PAINT, frame((0, 0.42, 0))), 0.012, gp)
# recuperator above the barrel
gp.append(hard(lathe('recuperator', [(0.0, 0.0), (0.066, 0.0), (0.066, 1.42), (0.058, 1.46), (0.032, 1.47), (0.032, 1.52), (0.0, 1.52)], segs=12, at=(0, 0.52, 1.487), rot=(90, 0, 0), mat=PAINT), 0.0, sharp=35))
add(cyl('recup-band', 0.074, 0.05, at=(0, -0.30, 1.487), rot=(90, 0, 0), segs=12, mat=PAINT), 0.0, gp)
add(cyl('filler', 0.02, 0.035, at=(0, -0.55, 1.56), segs=6, mat=STEEL), 0.0, gp)
# barrel: slight taper, step at the jacket, muzzle ring, open bore
barrel = lathe('barrel', [(0.0, 0.30), (0.116, 0.30), (0.116, 0.74), (0.105, 0.79), (0.099, 1.55), (0.091, 1.60), (0.080, 2.60),
                          (0.096, 2.615), (0.096, 2.70), (0.054, 2.70), (0.054, 2.42), (0.0, 2.42)], segs=16, at=(0, BREECH_Y, ZB), rot=(90, 0, 0), mat=PAINT)
gp.append(hard(barrel, 0.0, sharp=35))
# breech ring, sliding block out to the right, breech face and operating handle
add(box('breech-ring', 0.31, 0.40, 0.33, at=(0, BREECH_Y - 0.20, ZB), mat=PAINT), 0.022, gp)
add(box('breech-block', 0.12, 0.15, 0.20, at=(0.185, BREECH_Y - 0.17, ZB), mat=STEEL), 0.008, gp)
add(box('breech-face', 0.15, 0.014, 0.16, at=(0, BREECH_Y + 0.004, ZB), mat=STEEL), 0.004, gp)
add(cyl('firing-lock', 0.024, 0.04, at=(0, BREECH_Y + 0.02, ZB), rot=(90, 0, 0), segs=8, mat=GUNMETAL), 0.0, gp)
add(box('breech-lug', 0.13, 0.12, 0.10, at=(0, BREECH_Y - 0.33, ZB + 0.19), mat=PAINT), 0.01, gp)
add(cyl('handle-boss', 0.032, 0.04, at=(0.09, BREECH_Y - 0.17, ZB + 0.18), segs=8, mat=STEEL), 0.0, gp)
gp.append(rod('breech-handle', (0.09, BREECH_Y - 0.17, ZB + 0.195), (0.235, BREECH_Y + 0.03, ZB + 0.215), 0.013, 6, STEEL))
gp.append(shade(sphere('handle-knob', 0.027, at=(0.24, BREECH_Y + 0.04, ZB + 0.216), segs=8, rings=5, mat=STEEL), 70))
# firing lock on the left of the breech ring: cover plate, its bolts, the lever the lanyard hooks to
add(box('lock-plate', 0.012, 0.17, 0.13, at=(-0.161, BREECH_Y - 0.15, ZB - 0.02), mat=PAINT), 0.0, gp)
gp += copies(bolt(PAINT, 0.01, 0.01, 4), [((-0.167, BREECH_Y - 0.15 + dy, ZB - 0.02 + dz), (0, -90, 0)) for dy in (-0.065, 0.065) for dz in (-0.045, 0.045)])
gp.append(rod('firing-lever', (-0.17, BREECH_Y - 0.12, ZB - 0.02), (-0.205, BREECH_Y + 0.04, ZB - 0.11), 0.01, 5, STEEL))
# elevating arc under the cradle, centred on the trunnions so it runs through the pinion box
add(arc_bar('elev-arc', (0.11, TRUN[1], TRUN[2]), 0.275, 22, 116, 0.035, 0.05, 8, STEEL), 0.0, gp)
add(box('arc-web', 0.03, 0.10, 0.14, at=(0.11, 0.08, 1.02), rot=(-25, 0, 0), mat=PAINT), 0.0, gp)

report('gun', gp)
gun = join('gun', gp)
pivot(gun, TRUN)
parent(gun, mount)
tag(gun, 'pitch', min=-3, max=45, recoil=0.9)
marker('muzzle', (0, MUZZLE_Y - 0.02, ZB), gun, kind='cannon')

VIEWS = ((-38, 16), (142, 20), (-60, 8, 0.5))
if os.environ.get('AXM_MORE'):             # extra looks while working on it: "azimuth,elevation,distance;..."
    VIEWS += tuple(tuple(float(v) for v in item.split(',')) for item in os.environ['AXM_MORE'].split(';'))
finish('artillery', size=2048, views=VIEWS)
