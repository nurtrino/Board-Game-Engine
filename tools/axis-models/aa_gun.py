# 40 mm automatic anti-aircraft gun on its four-wheel carriage, emplaced: outriggers swung out, the carriage
# lifted on four levelling jacks until the wheels hang clear, ammunition laid out beside it.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _guns_helpers import *

reset()

PAINT = paint('paint', low=(0.0, 0.8), dirt=1.0, wear=1.0)
TREAD = tread_plate(paint('tread', low=(0.0, 0.8), dirt=1.2, wear=1.4), pitch=0.065)
RUBBER = plain('rubber', (0.035, 0.035, 0.035), rough=0.86, dirt=0.9, bump=0.15, low=(0.0, 0.45))
STEEL = plain('steel', (0.36, 0.36, 0.37), rough=0.3, metal=1.0, dirt=0.25, vary=0.08)
GUNMETAL = plain('gunmetal', (0.085, 0.085, 0.09), rough=0.42, metal=0.9, dirt=0.3, vary=0.08)
CRATE = wood('crate', colour=(0.45, 0.34, 0.19), plank=0.10, length=1.2, dirt=0.6)
BRASS = plain('brass', (0.80, 0.56, 0.20), rough=0.3, metal=0.9, dirt=0.2, vary=0.1)
SHELL = plain('shell', (0.105, 0.115, 0.06), rough=0.55, dirt=0.3, vary=0.1)
CANVAS = plain('canvas', (0.31, 0.29, 0.21), rough=0.95, vary=0.2, dirt=0.7, bump=0.5, fine_scale=140.0)
TOOLWOOD = plain('toolwood', (0.34, 0.23, 0.12), rough=0.7, dirt=0.6)

LIFT = 0.10                  # how far the jacks hold the tyres off the ground
WHEEL_R = 0.43
AXLE_Z = LIFT + WHEEL_R
WX, WY = 0.74, 1.55          # wheel centres
DECK = 0.98                  # top of the turntable platform
PIVOT = (0, 0, 0.86)         # centre of the turntable
TRUN = (0, -0.05, 1.83)      # trunnions
ZB = 1.85                    # bore axis at rest
FRONT = -0.40                # front face of the breech casing
TIP = FRONT - 2.37           # end of the flash hider

static = []


def add(ob, width=0.008, to=None):
    (static if to is None else to).append(hard(ob, width))
    return ob


# ---------------------------------------------------------------- hull: cruciform carriage

add(beam('chassis', [(0, -1.98, 0.61), (0, -0.62, 0.62), (0, 0.62, 0.62), (0, 1.98, 0.61)], [(0.24, 0.20), (0.40, 0.26), (0.40, 0.26), (0.24, 0.20)], PAINT), 0.014)
for sy in (-1, 1):
    add(box('chassis-cap', 0.30, 0.03, 0.24, at=(0, sy * 1.99, 0.61), mat=PAINT), 0.006)
static.append(hard(lathe('base', [(0.58, 0.0), (0.58, 0.18), (0.60, 0.18), (0.60, 0.22), (0.50, 0.22), (0.50, 0.36), (0.0, 0.36)], segs=20, at=(0, 0, 0.50), mat=PAINT), 0.0, sharp=30))
static += copies(bolt(PAINT, 0.015, 0.014, 4), ring_spots(frame((0, 0, 0.72)), 0.55, 12, 0.2))
# rivet lines along the girder
places = []
for sx in (-1, 1):
    for i in range(7):
        y = 0.72 + i * 0.19
        w = 0.20 - (y - 0.62) / 1.36 * 0.08
        for sy in (-1, 1):
            places.append(((sx * (w - 0.025), sy * y, 0.749 - (y - 0.62) / 1.36 * 0.04), (0, 0, 0)))
static += copies(rivet(PAINT, 0.011, 4), places)
# stowage locker on the front of the girder, under the sweep of the platform
add(box('locker', 0.42, 0.50, 0.15, at=(0, -1.30, 0.80), mat=PAINT), 0.012)
add(box('locker-lid', 0.44, 0.52, 0.016, at=(0, -1.30, 0.882), mat=PAINT), 0.004)
for x in (-0.12, 0.12):
    add(box('locker-latch', 0.03, 0.014, 0.05, at=(x, -1.565, 0.85), mat=STEEL), 0.0)

# axles, brake drums, steering tie rod
for sy in (-1, 1):
    y = sy * WY
    static.append(rod('axle', (-0.60, y, AXLE_Z), (0.60, y, AXLE_Z), 0.05, 8, PAINT, caps=False))
    add(box('axle-bracket', 0.34, 0.24, 0.16, at=(0, y, 0.50), mat=PAINT), 0.014)
    for sx in (-1, 1):
        add(cyl('drum', 0.17, 0.09, at=(sx * 0.60, y, AXLE_Z), rot=(0, 90, 0), segs=12, mat=PAINT), 0.0)
        add(box('spring-seat', 0.10, 0.34, 0.05, at=(sx * 0.36, y, AXLE_Z + 0.07), mat=PAINT), 0.0)
static.append(rod('tie-rod', (-0.56, -WY - 0.15, AXLE_Z - 0.02), (0.56, -WY - 0.15, AXLE_Z - 0.02), 0.014, 5, STEEL, caps=False))
for sx in (-1, 1):
    static.append(rod('tie-arm', (sx * 0.56, -WY - 0.15, AXLE_Z - 0.02), (sx * 0.58, -WY, AXLE_Z - 0.02), 0.016, 5, PAINT, caps=False))



def jack(x, y, top, r_screw=0.028):
    """A levelling jack: dished pad on the ground, screw up to the carriage, tommy bar on top."""
    static.append(hard(revolve('jack-pad', [(0.18, 0.0), (0.18, 0.018), (0.07, 0.05), (0.07, 0.085), (0.0, 0.085)], 10, at=(x, y, 0), mat=PAINT), 0.0, sharp=30))
    static.append(rod('jack-screw', (x, y, 0.08), (x, y, top), r_screw, 6, STEEL, caps=False))
    static.append(rod('jack-head', (x, y, top), (x, y, top + 0.05), 0.04, 6, PAINT))
    static.append(rod('jack-bar', (x - 0.13, y, top + 0.03), (x + 0.13, y, top + 0.03), 0.011, 5, STEEL))


# fore and aft jacks on the ends of the girder
for sy in (-1, 1):
    add(box('jack-housing', 0.17, 0.16, 0.30, at=(0, sy * 2.085, 0.60), mat=PAINT), 0.014)
    jack(0, sy * 2.085, 0.76)
# outriggers: swung out square to the girder, pinned, braced back to it, a jack at each tip
for sx in (-1, 1):
    add(box('outrigger-hinge', 0.20, 0.36, 0.24, at=(sx * 0.60, 0, 0.615), mat=PAINT), 0.014)
    add(cyl('outrigger-pin', 0.028, 0.30, at=(sx * 0.66, 0.11, 0.615), segs=6, mat=STEEL), 0.0)
    add(beam('outrigger', [(sx * 0.62, 0, 0.62), (sx * 1.90, 0, 0.52)], [(0.18, 0.20), (0.12, 0.13)], PAINT), 0.012)
    for t in (0.3, 0.72):
        x = 0.62 + 1.28 * t
        add(box('outrigger-band', 0.05, 0.21 - 0.06 * t, 0.23 - 0.07 * t, at=(sx * x, 0, 0.62 - 0.10 * t), mat=PAINT), 0.0)
    for sy in (-1, 1):
        static.append(rod('brace', (sx * 1.36, sy * 0.07, 0.56), (sx * 0.17, sy * 1.02, 0.63), 0.02, 6, PAINT, caps=False))
        add(box('brace-lug', 0.07, 0.07, 0.06, at=(sx * 0.19, sy * 1.02, 0.63), mat=PAINT), 0.0)
    add(cyl('jack-housing', 0.062, 0.30, at=(sx * 1.97, 0, 0.53), segs=10, mat=PAINT), 0.0)
    jack(sx * 1.97, 0, 0.70)

# tow bar hinged to the rear axle, its eye resting on the ground
for sx in (-1, 1):
    static.append(rod('towbar', (sx * 0.17, 1.66, 0.50), (sx * 0.035, 2.78, 0.075), 0.026, 6, PAINT, caps=False))
static.append(rod('towbar-tie', (-0.105, 2.20, 0.295), (0.105, 2.20, 0.295), 0.018, 5, PAINT, caps=False))
add(box('towbar-head', 0.11, 0.14, 0.07, at=(0, 2.82, 0.068), rot=(-22, 0, 0), mat=PAINT), 0.01)
static.append(shade(torus('tow-eye', 0.058, 0.02, 12, 5, at=(0, 2.94, 0.035), mat=STEEL), 70))

# ---------------------------------------------------------------- ammunition

def round_40():
    """A 40 mm round standing on its base at the origin."""
    whole = revolve('round', [(0.0, 0.0), (0.031, 0.0), (0.028, 0.012), (0.0265, 0.24), (0.021, 0.28), (0.02, 0.311), (0.02, 0.39), (0.011, 0.435), (0.0, 0.447)], 6)
    return two_tone(shade(whole, 40), BRASS, SHELL, 0.31)


def clip_of_four():
    """Four rounds in their charger, as they stand in the feed guides: pointing -y, stacked upward from the origin."""
    one = round_40()
    parts = []
    for i in range(4):
        me = one.data.copy()
        o = link(bpy.data.objects.new('clip-round', me))
        parts.append(xform(o, (0, 0, i * 0.066), (90, 0, 0)))
    bpy.data.objects.remove(one)
    parts.append(shade(box('charger', 0.07, 0.014, 0.262, at=(0, 0.006, 0.099), mat=STEEL), 40))
    return join('clip', parts)


CLIP_IN_GUN = ((0, 0.47, ZB + 0.265), (0, 0, 0))
clips = stamps(clip_of_four(), [CLIP_IN_GUN,
                                ((-1.60, 1.38, 0.345), (0, 90, 8)),        # lying across the nearest box
                                ((-1.30, 0.80, 0.046), (0, 90, -18))])      # on the groundsheet
static += clips[1:]
for spot_ in ((-1.50, 1.12, 0), (-1.90, 1.06, 0), (-1.88, 1.10, 0.316)):
    # each box has its own piece of the atlas: the plank pattern is laid in model space
    static.append(xform(crate('ammo-box', 0.36, 0.62, 0.30, CRATE, rope=CANVAS), spot_))
add(box('groundsheet', 0.74, 0.80, 0.012, at=(-1.24, 0.62, 0.006), rot=(0, 0, -6), mat=CANVAS), 0.0)
# fired cases, thrown out forward from the chute under the gun
spent = shade(revolve('spent', [(0.0, 0.0), (0.031, 0.0), (0.0265, 0.24), (0.021, 0.28), (0.021, 0.311), (0.0, 0.311)], 5, mat=BRASS), 40)
static += stamps(spent, [((0.30, -1.74, 0.03), (90, 0, 20)), ((-0.36, -1.92, 0.03), (90, 0, -65)), ((0.50, -2.22, 0.03), (90, 0, 110)),
                         ((-0.24, -2.40, 0.03), (90, 0, -30)), ((0.22, -2.60, 0.03), (90, 0, 160)), ((-0.58, -2.26, 0.03), (90, 0, 75))])

report('hull', static)
hull = join('hull', static)
tag(hull, 'none')

# road wheels: left on the carriage, hanging just clear of the ground. One mesh drawn four times; they are
# fixed to the hull (the gun does not drive anywhere in battle), the left pair turned round to face outward.
wheel = disc_wheel('wheel', WHEEL_R, 0.20, 0.235, PAINT, RUBBER, segs=14, lugs=14, two_sided=False, hub=0.085, nuts=5, disc_segs=14, lite=True)
report('one wheel', [wheel])
wheel.location = (WX, -WY, AXLE_Z)
tag(wheel, 'none')
parent(wheel, hull)
for label, sx, sy in (('wheel.RR', 1, 1), ('wheel.FL', -1, -1), ('wheel.RL', -1, 1)):
    parent(instance(wheel, label, at=(sx * WX, sy * WY, AXLE_Z), rot=(0, 0, 0 if sx > 0 else 180)), hull)

# ---------------------------------------------------------------- mount: turntable, platform, frames, seats

mp = []
mp.append(hard(lathe('ring', [(0.535, 0.0), (0.535, 0.06), (0.50, 0.075), (0.0, 0.075)], segs=20, at=(0, 0, 0.86), mat=PAINT), 0.0, sharp=30))
OUTLINE = [(-0.54, -0.82), (0.54, -0.82), (0.84, -0.52), (0.84, 0.72), (0.56, 1.0), (-0.56, 1.0), (-0.84, 0.72), (-0.84, -0.52)]
deck = loft('deck', [[(x, y, DECK - 0.04) for x, y in OUTLINE], [(x, y, DECK) for x, y in OUTLINE]], mat=TREAD)
add(deck, 0.006, mp)
# kick rail round the sides and back, bearers under the plate
RAIL = [(0.84, -0.52), (0.84, 0.72), (0.56, 1.0), (-0.56, 1.0), (-0.84, 0.72), (-0.84, -0.52)]
for (x0, y0), (x1, y1) in zip(RAIL, RAIL[1:]):
    add(beam('kick-rail', [(x0 * 0.99, y0 * 0.99, DECK + 0.02), (x1 * 0.99, y1 * 0.99, DECK + 0.02)], (0.016, 0.045), PAINT), 0.0, mp)
for sx in (-1, 1):
    for y in (-0.45, 0.5):
        add(box('bearer', 0.58, 0.06, 0.07, at=(sx * 0.52, y, DECK - 0.075), mat=PAINT), 0.0, mp)

# side frames carrying the trunnions: plate A-frames with a lightening hole and flanged edges
F_OUT = [(-0.48, DECK), (0.38, DECK), (0.38, 1.12), (0.07, 1.80), (0.05, 1.90), (-0.05, 1.95), (-0.15, 1.90), (-0.17, 1.80), (-0.48, 1.12)]
F_IN = [(-0.33, 1.17), (0.23, 1.17), (0.23, 1.21), (0.00, 1.60), (-0.03, 1.63), (-0.05, 1.64), (-0.07, 1.63), (-0.10, 1.60), (-0.33, 1.21)]
FX = 0.235
for s in (-1, 1):
    add(slab_hole('frame', F_OUT, F_IN, 0.03, PAINT, frame((s * FX, 0, 0), (0, 0, 90))), 0.006, mp)
    add(beam('frame-flange', [(s * FX, 0.385, 1.12), (s * FX, 0.075, 1.80)], (0.016, 0.075), PAINT, up=(1, 0, 0)), 0.0, mp)
    add(beam('frame-flange', [(s * FX, -0.485, 1.12), (s * FX, -0.175, 1.80)], (0.016, 0.075), PAINT, up=(1, 0, 0)), 0.0, mp)
    add(box('frame-foot', 0.09, 0.90, 0.03, at=(s * FX, -0.05, DECK + 0.015), mat=PAINT), 0.0, mp)
    mp.append(hard(lathe('trunnion-cap', [(0.115, 0.0), (0.115, 0.045), (0.10, 0.06), (0.0, 0.06)], segs=12, at=(s * (FX + 0.015), TRUN[1], TRUN[2]), rot=(0, 90 * s, 0), mat=PAINT), 0.0, sharp=30))
    mp += copies(bolt(PAINT, 0.012, 0.012), ring_spots(frame((s * (FX + 0.073), TRUN[1], TRUN[2]), (0, 90 * s, 0)), 0.085, 6))
    add(cyl('trunnion-end', 0.045, 0.02, at=(s * (FX + 0.083), TRUN[1], TRUN[2]), rot=(0, 90, 0), segs=8, mat=STEEL), 0.0, mp)
# cross-tie between the frames at the back, low
mp.append(rod('frame-tie', (-FX, 0.33, 1.08), (FX, 0.33, 1.08), 0.022, 6, PAINT, caps=False))

# gear housing across the front of the frames, with the two equilibrator spring cases reaching forward from it
add(box('gearbox', 0.43, 0.25, 0.20, at=(0, -0.42, DECK + 0.10), mat=PAINT), 0.014, mp)
for s in (-1, 1):
    mp.append(hard(lathe('equilibrator', [(0.07, 0.0), (0.07, 0.56), (0.062, 0.585), (0.03, 0.585), (0.03, 0.62), (0.0, 0.62)], segs=10, at=(s * 0.14, -0.50, DECK + 0.115), rot=(90, 0, 0), mat=PAINT), 0.0, sharp=30))
    add(box('equil-saddle', 0.17, 0.05, 0.10, at=(s * 0.14, -0.78, DECK + 0.05), mat=PAINT), 0.0, mp)
# pinion housing on the right frame, where the elevating arc runs
add(box('pinion-box', 0.11, 0.16, 0.14, at=(FX + 0.01, -0.06, 1.40), mat=PAINT), 0.01, mp)

# layers' seats, footrests and hand cranks, one set each side
for s in (-1, 1):
    sx = s * 0.57
    mp.append(rod('seat-post', (sx, 0.36, DECK), (sx, 0.36, 1.39), 0.03, 6, PAINT, caps=False))
    mp.append(rod('seat-arm', (s * FX, 0.20, 1.20), (sx, 0.36, 1.32), 0.024, 6, PAINT, caps=False))
    add(box('seat-pan', 0.36, 0.34, 0.03, at=(sx, 0.38, 1.40), mat=PAINT), 0.008, mp)
    add(box('seat-pad', 0.31, 0.29, 0.035, at=(sx, 0.38, 1.43), mat=CANVAS), 0.012, mp)
    add(box('seat-back', 0.34, 0.03, 0.22, at=(sx, 0.565, 1.57), rot=(-12, 0, 0), mat=PAINT), 0.008, mp)
    for x in (-0.12, 0.12):
        mp.append(rod('seat-stay', (sx + x, 0.54, 1.41), (sx + x, 0.575, 1.50), 0.012, 4, PAINT, caps=False))
    add(box('footrest', 0.26, 0.13, 0.014, at=(sx, -0.34, 1.12), rot=(22, 0, 0), mat=TREAD), 0.0, mp)
    mp.append(rod('footrest-post', (sx, -0.34, DECK), (sx, -0.34, 1.115), 0.018, 5, PAINT, caps=False))
    # crank pedestal: column, gearbox, shaft across to the frame, crank wheel facing the seat
    cx = s * 0.52
    mp.append(rod('crank-column', (cx, -0.16, DECK), (cx, -0.16, 1.47), 0.035, 7, PAINT, caps=False))
    add(box('crank-box', 0.15, 0.17, 0.16, at=(cx, -0.16, 1.54), mat=PAINT), 0.012, mp)
    mp.append(rod('crank-shaft', (cx, -0.18, 1.52), (s * FX, -0.18, 1.52), 0.016, 5, PAINT, caps=False))
    mp.append(rod('crank-axle', (cx, -0.08, 1.55), (cx, -0.02, 1.55), 0.018, 6, STEEL, caps=False))
    mp.append(handwheel('crank', 0.13, frame((cx, -0.02, 1.55), (-90, 0, 0)), STEEL, PAINT, spokes=2, r=0.011, grip_mat=TOOLWOOD))
mp += copies(bolt(PAINT, 0.013, 0.012, 4), [((x, y, DECK + 0.03), (0, 0, 0)) for x in (-FX - 0.028, FX + 0.028) for y in (-0.44, -0.2, 0.04, 0.3)])

report('mount', mp)
mount = join('mount', mp)
pivot(mount, PIVOT)
tag(mount, 'yaw', aims='air', speed=1.4)

# ---------------------------------------------------------------- gun: breech casing, feed guides, barrel, sights

gp = []
gp.append(hard(cyl('trunnion', 0.06, 0.46, at=TRUN, rot=(0, 90, 0), segs=10, mat=PAINT, caps=False), 0.0))
CASE = [(FRONT, ZB - 0.15), (FRONT, ZB + 0.13), (-0.22, ZB + 0.19), (0.46, ZB + 0.19), (0.60, ZB + 0.10), (0.60, ZB - 0.10), (0.44, ZB - 0.21), (-0.28, ZB - 0.21)]
add(prism('casing', CASE, -0.15, 0.15, PAINT), 0.016, gp)
# side covers with their bolts, the hand operating lever on the right, the rear buffer
bolts = []
for s in (-1, 1):
    add(box('side-cover', 0.014, 0.50, 0.22, at=(s * 0.155, 0.10, ZB - 0.01), mat=PAINT), 0.004, gp)
    add(cyl('trunnion-boss', 0.095, 0.04, at=(s * 0.165, TRUN[1], TRUN[2]), rot=(0, 90, 0), segs=10, mat=PAINT), 0.0, gp)
    for y in (0.02, 0.18, 0.32):
        for z in (ZB - 0.095, ZB + 0.075):
            bolts.append(((s * 0.162, y, z), (0, 90 * s, 0)))
gp += copies(bolt(PAINT, 0.011, 0.01, 4), bolts)
gp.append(rod('cocking-lever', (0.165, 0.34, ZB - 0.06), (0.20, 0.50, ZB + 0.15), 0.014, 5, STEEL))
gp.append(shade(sphere('lever-knob', 0.026, at=(0.203, 0.51, ZB + 0.16), segs=8, rings=5, mat=STEEL), 70))
add(cyl('lever-boss', 0.035, 0.03, at=(0.165, 0.34, ZB - 0.06), rot=(0, 90, 0), segs=8, mat=STEEL), 0.0, gp)
gp.append(hard(lathe('buffer', [(0.06, 0.0), (0.06, 0.05), (0.04, 0.07), (0.0, 0.07)], segs=10, at=(0, 0.60, ZB), rot=(-90, 0, 0), mat=PAINT), 0.0, sharp=30))
add(box('breech-top', 0.20, 0.16, 0.012, at=(0, -0.10, ZB + 0.196), mat=STEEL), 0.003, gp)
# case chute under the back of the casing
add(box('case-chute', 0.12, 0.74, 0.06, at=(0, 0.07, ZB - 0.235), mat=PAINT), 0.008, gp)
add(box('chute-mouth', 0.13, 0.05, 0.075, at=(0, -0.305, ZB - 0.235), mat=PAINT), 0.0, gp)
add(box('chute-back', 0.12, 0.16, 0.06, at=(0, 0.49, ZB - 0.19), rot=(-34, 0, 0), mat=PAINT), 0.006, gp)

# autoloader on top: the tray, and the front and rear feed guides the clips are dropped into
add(box('loader-tray', 0.17, 0.50, 0.05, at=(0, 0.25, ZB + 0.21), mat=PAINT), 0.008, gp)
GUIDE_TOP = ZB + 0.56
for y, length in ((0.455, 0.07), (0.17, 0.09)):
    for s in (-1, 1):
        add(box('feed-guide', 0.012, length, GUIDE_TOP - ZB - 0.21, at=(s * 0.043, y, (GUIDE_TOP + ZB + 0.21) / 2), mat=PAINT), 0.0, gp)
        add(box('guide-flare', 0.012, length, 0.075, at=(s * 0.058, y, GUIDE_TOP + 0.03), rot=(0, s * 24, 0), mat=PAINT), 0.0, gp)
add(box('guide-back', 0.098, 0.012, GUIDE_TOP - ZB - 0.21, at=(0, 0.496, (GUIDE_TOP + ZB + 0.21) / 2), mat=PAINT), 0.0, gp)
for s in (-1, 1):
    gp.append(rod('guide-tie', (s * 0.05, 0.42, GUIDE_TOP - 0.05), (s * 0.05, 0.215, GUIDE_TOP - 0.05), 0.008, 4, PAINT, caps=False))
gp.append(clips[0])

# barrel: recoil spring housing out of the casing, long thin tapered tube, conical flash hider
barrel = lathe('barrel', [(0.0, 0.0), (0.105, 0.0), (0.105, 0.05), (0.088, 0.07), (0.088, 0.56), (0.096, 0.57), (0.096, 0.63), (0.062, 0.67),
                          (0.048, 0.70), (0.048, 0.80), (0.043, 0.82), (0.031, 2.07), (0.037, 2.08), (0.037, 2.12), (0.066, 2.36), (0.066, 2.37),
                          (0.054, 2.37), (0.024, 2.13), (0.0, 2.13)], segs=14, at=(0, FRONT, ZB), rot=(90, 0, 0), mat=PAINT)
gp.append(hard(barrel, 0.0, sharp=32))
gp += copies(bolt(PAINT, 0.011, 0.012), ring_spots(frame((0, FRONT, ZB), (90, 0, 0)), 0.126, 6, 0.52))

# elevating arc on the right of the casing, centred on the trunnions, running through the pinion box
AX = 0.185
add(arc_bar('elev-arc', (AX, TRUN[1], TRUN[2]), 0.43, 14, 108, 0.03, 0.06, 9, GUNMETAL), 0.0, gp)
add(box('arc-lug', 0.03, 0.10, 0.12, at=(AX - 0.012, -0.44, ZB - 0.115), mat=PAINT), 0.0, gp)
add(box('arc-lug', 0.03, 0.07, 0.22, at=(AX - 0.012, 0.03, ZB - 0.30), mat=PAINT), 0.0, gp)

# ring sights: a cross bar over the casing, and on each end a sight arm with the cartwheel foresight and the peep
SZ = ZB + 0.30
gp.append(rod('sight-bar', (-0.52, -0.30, ZB + 0.19), (0.52, -0.30, ZB + 0.19), 0.017, 6, PAINT))
for x in (-0.11, 0.11):
    add(box('sight-post', 0.035, 0.05, 0.07, at=(x, -0.30, ZB + 0.165), mat=PAINT), 0.0, gp)
for s in (-1, 1):
    x = s * 0.52
    gp.append(rod('sight-arm', (x, -0.46, ZB + 0.19), (x, 0.20, ZB + 0.19), 0.012, 5, PAINT))
    gp.append(rod('ring-stem', (x, -0.44, ZB + 0.19), (x, -0.44, SZ - 0.10), 0.008, 4, PAINT, caps=False))
    gp.append(shade(torus('ring-sight', 0.10, 0.006, 14, 3, at=(x, -0.44, SZ), rot=(90, 0, 0), mat=GUNMETAL), 70))
    gp.append(shade(torus('ring-inner', 0.045, 0.005, 10, 3, at=(x, -0.44, SZ), rot=(90, 0, 0), mat=GUNMETAL), 70))
    for a in (45, 135):
        dx, dz = 0.1 * math.cos(R(a)), 0.1 * math.sin(R(a))
        gp.append(rod('ring-spoke', (x - dx, -0.44, SZ - dz), (x + dx, -0.44, SZ + dz), 0.004, 3, GUNMETAL, caps=False))
    gp.append(rod('peep-stem', (x, 0.18, ZB + 0.19), (x, 0.18, SZ - 0.022), 0.008, 4, PAINT, caps=False))
    gp.append(shade(torus('peep', 0.02, 0.006, 8, 3, at=(x, 0.18, SZ), rot=(90, 0, 0), mat=GUNMETAL), 70))

report('gun', gp)
gun = join('gun', gp)
pivot(gun, TRUN)
parent(gun, mount)
tag(gun, 'pitch', min=-5, max=88, recoil=0.2)
marker('muzzle', (0, TIP - 0.02, ZB), gun, kind='flak')

VIEWS = ((-38, 16), (142, 20), (-60, 8, 0.5))
if os.environ.get('AXM_MORE'):             # extra looks while working on it: "azimuth,elevation,distance;..."
    VIEWS += tuple(tuple(float(v) for v in item.split(',')) for item in os.environ['AXM_MORE'].split(';'))
finish('aaGun', size=2048, views=VIEWS)
