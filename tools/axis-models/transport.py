# Wartime cargo and troop transport. A full-bodied merchant hull with a midships house three decks
# high, one tall funnel, five hatches worked by three masts of derricks, landing craft and shrouded
# lorries as deck cargo, a gun on a raised tub at each end and four light AA tubs on the house.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _ships_small import *

reset()
M = ship_mats(deck=(0.105, 0.1, 0.095))
P = M.PAINT
PLANK = wood('wood', colour=(0.36, 0.27, 0.17), plank=0.13, length=3.2)
CRATE = plain('crate', (0.38, 0.28, 0.16), rough=0.82, dirt=0.6, vary=0.22, bump=0.4)
RUBBER = plain('rubber', (0.03, 0.03, 0.03), rough=0.86, dirt=0.9, bump=0.15)
DRUM = plain('drum', (0.07, 0.085, 0.055), rough=0.6, metal=0.3, rust=0.5, dirt=0.6)
TARP = plain('tarp', (0.15, 0.17, 0.115), rough=0.95, vary=0.25, dirt=0.8, bump=0.5, fine_scale=140.0)
S = []


def add(*obs):
    S.extend(obs)
    return obs[0]


def count(label):
    print(f'   .. {label}: {tris(S)} static triangles so far')


# ---------------------------------------------------------------- hull

deck_z = curve([(-67.5, 8.5), (-58, 7.35), (-45, 6.15), (-30, 5.5), (-10, 5.2), (20, 5.2), (40, 5.55), (55, 6.1), (67.5, 6.8)])
deck_half = curve([(-67.5, 0.0), (-66, 1.5), (-63.5, 3.45), (-60, 5.35), (-55, 7.05), (-49, 8.15), (-42, 8.62), (-35, 8.75), (38, 8.75), (48, 8.3),
                   (55, 7.3), (60, 6.0), (63.5, 4.55), (65.8, 3.0), (67, 1.65), (67.5, 0.0)])
wl_half = curve([(-66.3, 0.0), (-64.5, 1.45), (-61.5, 3.5), (-57, 5.75), (-51, 7.55), (-44, 8.5), (-36, 8.75), (36, 8.75), (46, 8.2), (53, 6.9),
                 (58, 5.0), (61.5, 2.8), (63.5, 1.2), (64.5, 0.0)])
keel_z = curve([(-67.5, 8.5), (-66.9, 4.2), (-66.3, 0.0), (-65.6, -3.5), (-64.3, -6.2), (-62, -7.6), (-59, -8.0), (55, -8.0), (57.5, -6.5), (59, -3.6),
                (60.5, -2.2), (62.5, -1.0), (64.5, 0.0), (66.2, 2.5), (67.2, 4.8), (67.5, 6.8)])
full = curve([(-66.3, 1.3), (-58, 2.2), (-45, 4.2), (-30, 5.0), (30, 5.0), (45, 4.0), (55, 2.4), (60, 1.6), (64.5, 1.3)])
flare = curve([(-67.5, 1.7), (-55, 1.5), (-40, 1.0), (40, 1.0), (55, 1.4), (67.5, 1.7)])
YS = [-67.5, -67.2, -66.8, -66.3, -65.6, -64.6, -63.2, -61.5, -59.5, -57, -54, -50, -45, -39, -32, -24, -16, -8, 0, 8, 16, 24, 32, 39, 45, 50, 54, 57,
      59.2, 59.95, 60.05, 61, 62.3, 63.5, 64.5, 65.5, 66.3, 66.9, 67.3, 67.5]
BULWARK = 1.05
H = Hull(YS, deck_z, deck_half, wl_half, keel_z, full, flare, lip=lambda y: BULWARK if y < 60.0 else 0.12, lip_w=0.11, boot=(-0.4, 0.55))
add(H.build('shell', M.RED, M.BOOT, P, M.DECK, split=(0,)))
dz = H.deck

add(both(H.strake(frange(-30, 34, 5.0), lambda y: -7.2, 0.45, 0.08, M.RED, name='bilge-keel')))
add(both(H.strake(frange(-62, 62, 5.0), lambda y: dz(y) - 0.02, 0.1, 0.22, P, name='belting')))
add(xform(propeller(M, 2.6, 4), at=(0, 61.0, -5.0)))
add(lat([(0.9, 0.0), (0.6, 1.6), (0.42, 2.6)], at=(0, 58.2, -5.0), mat=M.RED, rot=(-90, 0, 0), segs=8))
add(hard(prism('rudder', [(62.1, -0.7), (64.7, -0.7), (64.5, -7.7), (62.3, -7.9)], -0.16, 0.16, mat=M.RED), 0.06))
add(bx(0.4, 6.2, 0.3, (0, 59.6, -7.85), M.RED), bx(0.3, 0.3, 7.0, (0, 62.2, -4.4), M.RED))
# freeing ports along the bulwark and its stays inside
add(*stamp(panel(M.SOOT, 1.1, 0.28), [H.side(y, dz(y) + 0.22, s, out=0.006) for s in (1, -1) for y in frange(-54, 54, 6.0)]))
add(*stamp(gusset(M, 0.42, 0.95, 0.04), [((s * (H.edge(y) - 0.12), y, dz(y) + 0.98), (0, 0, 180 if s > 0 else 0)) for s in (-1, 1) for y in frange(-62, 58, 4.0)]))
count('hull')

# ---------------------------------------------------------------- forecastle: windlass, anchors, bow gun tub

wy = -60.4
wz = dz(wy)
add(bx(3.4, 1.7, 0.35, (0, wy, wz + 0.17), P, w=0.03), bx(1.0, 1.5, 0.9, (0, wy, wz + 0.8), P, w=0.05), cy(0.32, 0.9, (0, wy + 0.9, wz + 0.85), P, rot=(90, 0, 0), segs=8))
for s in (-1, 1):
    add(cy(0.6, 0.5, (s * 1.0, wy, wz + 0.95), M.STEEL, rot=(0, 90, 0), segs=10), cy(0.42, 0.5, (s * 1.95, wy, wz + 0.95), M.STEEL, rot=(0, 90, 0), segs=8))
    add(bx(0.16, 1.3, 1.0, (s * 1.45, wy, wz + 0.7), P), cy(0.1, 4.4, (0, wy, wz + 0.95), M.STEEL, rot=(0, 90, 0), segs=5))
    add(cy(0.4, 0.2, (s * 1.45, -64.9, dz(-64.9) + 0.08), M.STEEL, segs=8, w=0.03))
    add(*chain(M, [(s * 1.42, -64.8, dz(-64.8) + 0.16), (s * 1.05, -62.0, dz(-62) + 0.16), (s * 1.0, -61.0, wz + 1.15)], 0.36))
    add(bx(0.4, 0.6, 0.3, (s * 1.2, -63.2, dz(-63.2) + 0.15), M.STEEL, w=0.03))
add(*stamp(anchor(M), [(H.side(-64.6, dz(-64.6) - 3.6, s, out=0.05)[0], H.side(-64.6, dz(-64.6) - 3.6, s)[1], (1.35, 1.35, 1.35)) for s in (1, -1)]))
add(*stamp(cy(0.48, 0.16, rot=(0, 90, 0), segs=8, mat=M.STEEL, w=0.04), [H.side(-64.6, dz(-64.6) - 1.0, s, out=0.02) for s in (1, -1)]))
add(tube([(0, -67.2, dz(-67.2) + BULWARK), (0, -67.4, dz(-67.2) + BULWARK + 3.0)], 0.04, P, segs=4, name='jackstaff'))

mount, gun, mtr, mmz = open_gun(M, length=4.2, bore=0.09, shield=True)
tag(mount, 'yaw', speed=0.7)
tag(gun, 'pitch', min=-5, max=60, recoil=0.3)
BGY, SGY = -63.6, 56.2
BGZ = dz(BGY) + 2.5
SGZ = dz(SGY) + 2.75 + 1.3
TUB = tub(M, 2.55, 1.1, t=0.07, segs=16, floor=0.1)
add(*stamp(TUB, [((0, BGY, BGZ - 0.1), (0, 0, 0)), ((0, SGY, SGZ - 0.1), (0, 0, 0), (1.2, 1.2, 1.0))]))
add(cy(1.05, 2.5, (0, BGY, BGZ - 1.3), P, segs=12, w=0.04))
for s in (-1, 1):
    for yy in (BGY - 1.5, BGY + 1.7):
        add(tube([(s * 1.75, yy, BGZ - 0.1), (s * min(1.9, H.edge(yy) - 0.5), yy, dz(yy))], 0.09, P, segs=5, name='tub-leg'))
add(*stamp(gusset(M, 1.45, 1.3), [((1.05 * math.cos(R(a)), BGY + 1.05 * math.sin(R(a)), BGZ - 0.1), (0, 0, a)) for a in (45, 135, 225, 315)]))
add(ladder(M, (0.9, BGY + 4.3, dz(BGY + 4.3)), (0.9, BGY + 2.5, BGZ)))
mount_set(mount, gun, [((0, BGY, BGZ), 0), ((0, SGY, SGZ), 180)], muzzles=[mmz], kind='naval', mname='muzzle.{i}')
add(*stamp(locker(M, 0.8, 0.5, 0.7), [((s * 1.7, BGY + 1.0, BGZ), (0, 0, 0)) for s in (-1, 1)] + [((s * 2.2, SGY - 1.2, SGZ), (0, 0, 0)) for s in (-1, 1)]))
count('forecastle')

# ---------------------------------------------------------------- hatches, masts, derricks

HATCHES = [(-50.5, 8.0, 5.6), (-34.6, 10.4, 6.2), (-19.0, 8.4, 6.2), (19.6, 10.4, 6.2), (38.0, 9.0, 6.0)]     # y, length, width
tops = []
for hy, hl, hw in HATCHES:
    zt = dz(hy) + 1.05
    y0, y1, xh = hy - hl / 2, hy + hl / 2, hw / 2
    add(slab(rect(xh, y0, y1), dz(hy) - 0.5, zt, P, w=0.04, name='coaming'))
    add(wall([(x, y, zt - 0.2) for x, y in rect(xh + 0.07, y0 - 0.07, y1 + 0.07)], 0.16, 0.07, M.STEEL, closed=True, name='batten'))
    tarp = loft('tarp', [[(-xh - 0.03, y, zt - 0.02), (xh + 0.03, y, zt - 0.02), (xh + 0.03, y, zt + 0.08), (0, y, zt + 0.3), (-xh - 0.03, y, zt + 0.08)] for y in (y0 - 0.03, y1 + 0.03)], mat=M.CANVAS)
    add(hard(tarp, 0.03))
    ang = deg(math.atan2(0.22, xh))
    for s in (-1, 1):
        for y in frange(y0 + 1.0, y1 - 1.0, 2.2):
            add(bx(xh + 0.1, 0.09, 0.03, (s * xh / 2, y, zt + 0.205), M.STEEL, rot=(0, s * ang, 0)))
    tops.append(zt + 0.3)
    add(*stamp(gusset(M, 0.28, 0.55, 0.06), [((s * xh, y, zt - 0.22), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in frange(y0 + 0.5, y1 - 0.5, 1.6)]))
count('hatches')

WINCH = join('winch', [bx(1.5, 1.3, 0.2, (0, 0, 0.1), P), cy(0.36, 0.8, (0, 0, 0.62), M.STEEL, rot=(0, 90, 0), segs=6), bx(0.12, 0.9, 0.85, (-0.5, 0, 0.55), P), bx(0.12, 0.9, 0.85, (0.5, 0, 0.55), P),
                       cy(0.26, 0.4, (0.95, 0, 0.62), M.STEEL, rot=(0, 90, 0), segs=6), bx(0.5, 0.6, 0.6, (-0.95, 0.1, 0.45), P)])
winches, cowls, blocks = [], [], []
MASTS = [(-42.4, 20.5), (-26.3, 21.5), (29.0, 20.5)]
for my, mh in MASTS:
    z0 = dz(my)
    add(bx(5.8, 3.0, 2.7, (0, my, z0 + 1.3), P, w=0.06, name='mast-house'), bx(6.1, 3.3, 0.1, (0, my, z0 + 2.7), P, w=0.02))
    add(tube([(0, my, z0 + 2.7), (0, my, z0 + mh * 0.6), (0, my, z0 + mh)], 0.5, P, segs=8, radii=[0.52, 0.42, 0.3], name='mast'))
    ct = z0 + mh - 4.2
    add(bx(6.4, 0.55, 0.22, (0, my, ct), P, w=0.03), bx(1.8, 1.6, 0.1, (0, my, ct + 0.16), P))
    add(*stamp(gusset(M, 2.6, 1.5, 0.06), [((0.3, my, ct - 0.1), (0, 0, 0)), ((-0.3, my, ct - 0.1), (0, 0, 180))]))
    add(tube([(0, my, z0 + mh), (0, my, z0 + mh + 5.0)], 0.16, P, segs=6, radii=[0.17, 0.08], name='topmast'))
    add(cy(0.12, 0.2, (0, my, z0 + mh + 5.1), M.STEEL, segs=6))
    add(bx(0.05, 0.05, mh - 7.5, (0.0, my + 0.5, z0 + 2.7 + (mh - 7.5) / 2), P))
    for s in (-1, 1):
        for yy in (my - 3.4, my + 3.4):
            add(wire((s * 3.1, my, ct), (s * (H.edge(yy) - 0.1), yy, dz(yy) + BULWARK), 0.03, M.WIRE))
        add(wire((s * 0.15, my, z0 + mh + 4.6), (s * 3.15, my, ct + 0.1), 0.02, M.WIRE))
        add(bx(0.06, 0.8, 1.8, (s * 2.93, my + 0.4, z0 + 1.1), P))
        for yy in (my - 2.9, my + 2.9):
            winches.append(((s * 1.9, yy, z0), (0, 0, 90)))
        cowls.append(((s * 2.2, my - 0.8, z0 + 2.75), (0, 0, 0)))
        cowls.append(((s * 2.2, my + 0.8, z0 + 2.75), (0, 0, 180)))
add(*stamp(WINCH, winches))
add(*stamp(cowl(M, 2.4, 0.42), cowls))

# booms: (mast index, fore or aft, elevation, length, head spread)
BOOMS = [(0, -1, 34, 13.0, 2.3), (0, 1, 26, 13.5, 2.6), (1, -1, 58, 13.5, 1.5), (1, 1, 30, 12.5, 2.4), (2, -1, 28, 14.0, 2.5), (2, 1, 40, 13.0, 2.2)]
for mi, dr, el, bl, spread in BOOMS:
    my, mh = MASTS[mi]
    z0 = dz(my)
    ct = z0 + mh - 4.2
    for s in (-1, 1):
        foot = Vector((s * 1.3, my + dr * 1.75, z0 + 3.3))
        add(cy(0.16, 0.6, (foot.x, foot.y, foot.z - 0.3), P, segs=6))
        hd = Vector((s * spread, foot.y + dr * bl * math.cos(R(el)), foot.z + bl * math.sin(R(el))))
        add(tube([foot, (foot + hd) / 2, hd], 0.2, P, segs=6, radii=[0.15, 0.21, 0.13], name='boom'))
        add(wire(hd, (s * 2.6, my + dr * 0.1, ct + 0.1), 0.028, M.WIRE))
        add(wire(hd, (s * 1.2, my + dr * 0.3, ct - 3.5), 0.022, M.WIRE))
        hook = Vector((hd.x, hd.y, max(z0 + 3.4, hd.z - 3.2)))
        add(wire(hd, hook, 0.028, M.WIRE))
        blocks.append((tuple(hook), (0, 0, 0)))
        blocks.append(((hd.x, hd.y, hd.z - 0.3), (0, 0, 0)))
        gy = hd.y + dr * 1.5
        add(wire(hd, (s * (H.edge(gy) - 0.1), gy, dz(gy) + BULWARK), 0.022, M.WIRE))
add(*stamp(bx(0.16, 0.3, 0.42, mat=M.STEEL, name='block'), blocks))
count('masts and derricks')

# ---------------------------------------------------------------- the midships house

MD = 5.0
BD, CD, TD = 8.0, 10.7, 13.3
T1 = rect(6.9, -12.5, 9.5)
add(slab(T1, MD, BD - 0.12, P, w=0.06, name='house-1'))
BDP = rect(8.05, -13.1, 10.4)
add(slab(BDP, BD - 0.12, BD, P, w=0.02, name='boat-deck'), slab(offset(BDP, -0.1), BD, BD + 0.02, PLANK))
for s in (-1, 1):
    for y in frange(-12.6, 9.9, 3.2):
        add(tube([(s * 7.9, y, dz(y)), (s * 7.9, y, BD - 0.1)], 0.07, P, segs=5, caps=False, name='stanchion'))
T2 = rect(5.5, -12.0, 8.3)
add(slab(T2, BD, CD - 0.12, P, w=0.06, name='house-2'))
CDP = sym([(-12.7, 8.8), (-9.5, 8.8), (-9.5, 5.75), (8.9, 5.75)])
add(slab(CDP, CD - 0.12, CD, P, w=0.02, name='bridge-deck'), slab(offset(CDP, -0.1), CD, CD + 0.02, PLANK))
WH = rect(4.3, -12.2, -5.4)
add(slab(WH, CD, TD - 0.12, P, w=0.06, name='wheelhouse'))
add(slab(offset(WH, 0.3), TD - 0.12, TD, P, w=0.02, name='wheelhouse-roof'), slab(offset(WH, 0.15), TD, TD + 0.02, PLANK))
add(wall([(x, y, TD) for x, y in offset(WH, 0.27)], 1.05, 0.05, P, closed=True, w=0.012, name='top-screen'))
front = lambda x, y, ln: y < -5.6
add(*stamp(bx(0.05, 0.7, 0.7, mat=M.GLASS, name='window'), edge_places(WH, CD + 1.6, step=1.05, pick=front)))
add(*stamp(bx(0.07, 0.82, 0.06, mat=P, name='sill'), edge_places(WH, CD + 1.2, step=1.05, out=0.02, pick=front)))
add(*stamp(bx(0.2, 1.06, 0.05, mat=P, name='visor'), edge_places(WH, CD + 2.05, step=1.05, out=0.08, pick=front)))
# wing bridges: screens, brackets, lamps
wing = wall([(5.7, -12.68, CD), (8.78, -12.68, CD), (8.78, -9.52, CD), (5.7, -9.52, CD)], 1.15, 0.05, P, w=0.012, name='wing')
add(both(wing))
add(*stamp(gusset(M, 3.1, 1.7, 0.06), [((s * 5.52, y, CD - 0.12), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-12.4, -9.8)]))
for s in (-1, 1):
    add(xform(searchlight(M, 0.24), at=(s * 8.2, -11.1, CD + 0.7)), cy(0.08, 0.7, (s * 8.2, -11.1, CD + 0.35), P, segs=6))
    add(bx(0.4, 0.4, 1.1, (s * 3.0, -11.6, TD + 0.55), P, w=0.03))
add(cy(0.16, 1.2, (0, -11.3, TD + 0.6), M.STEEL, segs=6), cy(0.24, 0.22, (0, -11.3, TD + 1.25), M.BRONZE, segs=8))
# casing and funnel
CAS = rect(2.7, -4.6, 5.8)
add(slab(CAS, CD, CD + 2.3, P, w=0.06, name='casing'), slab(offset(CAS, 0.12), CD + 2.3, CD + 2.4, P, w=0.02))
FB = (0, 1.3, CD + 2.35)
FH = 8.6
add(funnel(M, 1.7, 2.25, FH, rake=3.0, cap=1.2, base=FB, n=2.2, taper=0.97))
fk = math.tan(R(3.0))
add(tube([(0.4, FB[1] - 2.3 + fk * 0.5, FB[2] + 0.5), (0.4, FB[1] - 2.26 + fk * FH, FB[2] + FH + 0.6)], 0.09, P, segs=5, name='steam-pipe'))
add(tube([(-0.4, FB[1] - 2.3 + fk * 0.5, FB[2] + 0.5), (-0.4, FB[1] - 2.27 + fk * FH * 0.8, FB[2] + FH * 0.8)], 0.07, P, segs=5, name='whistle-pipe'))
add(cy(0.11, 0.6, (-0.4, FB[1] - 2.5 + fk * FH * 0.8, FB[2] + FH * 0.8), M.BRONZE, rot=(90, 0, 0), segs=6))
add(bx(1.6, 0.9, 0.08, (0, FB[1] - 2.8 + fk * FH * 0.8, FB[2] + FH * 0.8 - 0.5), P))
for s in (-1, 1):
    for yy in (-3.6, 5.2):
        add(wire((s * 1.3, FB[1] + fk * FH * 0.7, FB[2] + FH * 0.7), (s * 2.6, yy, CD + 2.4), 0.022, M.WIRE))
    add(bx(1.4, 1.8, 0.5, (s * 1.2, -2.9, CD + 2.6), P, rot=(0, s * 14, 0), w=0.03))
smoke = (0, FB[1] + fk * FH, FB[2] + FH + 0.1)
big = cowl(M, 3.0, 0.55)
add(*stamp(big, [((s * 2.0, yy, CD + 2.4), (0, 0, s * (20 if yy < 0 else 160))) for s in (-1, 1) for yy in (-3.9, 4.9)] + [((s * 4.4, 9.3, BD), (0, 0, 180)) for s in (-1, 1)]))
# signal mast on the wheelhouse
SY = -6.1
add(tube([(0, SY, TD), (0, SY, TD + 9.5)], 0.16, P, segs=6, radii=[0.18, 0.08], name='signal-mast'))
add(tube([(-2.6, SY, TD + 7.0), (2.6, SY, TD + 7.0)], 0.05, P, segs=4, name='signal-yard'))
add(bx(1.4, 0.25, 0.5, (0, SY - 0.3, TD + 8.2), P, w=0.03))
for s in (-1, 1):
    add(wire((s * 2.5, SY, TD + 7.0), (s * 3.9, SY + 0.6, TD + 1.05), 0.018, M.WIRE), wire((s * 1.2, SY, TD + 7.0), (s * 1.7, SY + 0.7, TD + 1.05), 0.018, M.WIRE))
add(wire((0, SY, TD + 9.3), (0, MASTS[1][0], dz(MASTS[1][0]) + MASTS[1][1] + 4.6), 0.02, M.WIRE), wire((0, SY, TD + 9.3), (0, MASTS[2][0], dz(MASTS[2][0]) + MASTS[2][1] + 4.6), 0.02, M.WIRE))
count('house')

# boats on the boat deck
bt = boat(M, 8.2, 2.5, 1.1)
bplaces, dplaces = [], []
for s in (-1, 1):
    for by in (-6.3, 3.6):
        bplaces.append(((s * 6.75, by, BD + 0.55), (0, 0, 0)))
        for yy in (by - 3.2, by + 3.2):
            dplaces.append(((s * 7.85, yy, BD), (0, 0, 180 if s > 0 else 0)))
            add(wire((s * 6.95, yy, BD + 3.5), (s * 6.78, yy + (0.5 if yy < by else -0.5), BD + 1.85), 0.022, M.WIRE))
        for yy in (by - 2.0, by + 2.0):
            add(bx(2.0, 0.14, 0.6, (s * 6.75, yy, BD + 0.3), P))
add(*stamp(bt, bplaces))
add(*stamp(davit(M, 3.7, 0.9, 0.1), dplaces))

# light AA in tubs: two on the wheelhouse top, two on pedestals aft
aa, aag, atr, amz = oerlikon(M)
tag(aa, 'yaw', aims='air', speed=1.6)
tag(aag, 'pitch', min=0, max=85, recoil=0.08)
AA = [((2.75, -8.0, TD + 0.1), 0), ((-2.75, -8.0, TD + 0.1), 0), ((4.15, 6.9, CD + 1.5), 180), ((-4.15, 6.9, CD + 1.5), 180)]
mount_set(aa, aag, AA, muzzles=[amz], kind='flak', mname='muzzle.aa.{i}')
add(*stamp(tub(M, 1.4, 1.05, segs=12), [((p[0], p[1], p[2] - 0.08), (0, 0, 0)) for p, _ in AA]))
for (x, y, z), _ in AA[2:]:
    add(cy(0.9, 1.45, (x, y, CD + 0.72), P, segs=10, w=0.03))
add(*stamp(locker(M, 0.7, 0.45, 0.6), [((p[0] * 0.45, p[1] + 1.8, TD if p[1] < 0 else CD), (0, 0, 0)) for p, _ in AA]))

# doors, scuttles, ladders
dplaces = [((s * 6.9, y, MD + 0.2), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-9.5, -1.5, 6.5)]
dplaces += [((x, -12.5, MD + 0.2), (0, 0, -90)) for x in (-3.5, 3.5)] + [((x, 9.5, MD + 0.2), (0, 0, 90)) for x in (-3.5, 3.5)]
dplaces += [((s * 5.5, y, BD), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-8.0, 4.5)]
dplaces += [((s * 4.3, -6.3, CD), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1)]
add(*stamp(door(M, 0.8, 1.85), dplaces))
ports = [((s * 6.9, y, MD + 1.8), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-11.3, -7.6, -5.6, -3.6, 0.5, 2.5, 4.5, 8.4)]
ports += [((x, -12.5, MD + 1.8), (0, 0, -90)) for x in (-5.6, -1.5, 0, 1.5, 5.6)] + [((x, 9.5, MD + 1.8), (0, 0, 90)) for x in (-5.6, -1.5, 1.5, 5.6)]
ports += [((s * 5.5, y, BD + 1.6), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-10.6, -6.0, -4.0, -2.0, 0.0, 2.2, 6.6)]
ports += [((x, -12.0, BD + 1.6), (0, 0, -90)) for x in (-4.2, -2.1, 0, 2.1, 4.2)] + [((x, 8.3, BD + 1.6), (0, 0, 90)) for x in (-3.5, 0, 3.5)]
ports += [H.side(y, dz(y) - 1.6, s) for s in (1, -1) for y in frange(-13, 9.8, 2.85)]
ports += [H.side(y, dz(y) - 1.6, s) for s in (1, -1) for y in (50.5, 53.0, 55.5, 58.0, -61.5, -58.5)]
add(*stamp(porthole(M, 0.27), ports))
add(ladder(M, (6.2, 12.3, dz(12)), (6.2, 10.35, BD)), ladder(M, (-6.2, 12.3, dz(12)), (-6.2, 10.35, BD)))
add(ladder(M, (5.9, 8.9, BD), (5.9, 7.0, CD)), ladder(M, (-3.6, -3.4, CD), (-3.6, -5.3, TD)))
add(ladder(M, (5.9, -15.0, dz(-15)), (5.9, -13.05, BD)), ladder(M, (-5.9, -15.0, dz(-15)), (-5.9, -13.05, BD)))
count('boats and fittings')

# ---------------------------------------------------------------- aft house and stern gun

AH = sym([(51.6, 4.6), (59.4, 4.6), (59.9, 3.9)])
az = dz(55.5)
add(slab(AH, az - 0.6, az + 2.65, P, w=0.06, name='aft-house'), slab(offset(AH, 0.2), az + 2.65, az + 2.75, P, w=0.02), slab(offset(AH, 0.08), az + 2.75, az + 2.77, M.DECK))
add(cy(1.5, 1.25, (0, SGY, SGZ - 0.72), P, segs=14, w=0.04))
add(*stamp(gusset(M, 1.55, 1.1), [((1.5 * math.cos(R(a)), SGY + 1.5 * math.sin(R(a)), SGZ - 0.1), (0, 0, a)) for a in (0, 60, 120, 180, 240, 300)]))
add(ladder(M, (3.0, 50.0, dz(50)), (3.0, 51.5, az + 2.75)), ladder(M, (-1.2, 52.2, az + 2.75), (-1.2, 53.6, SGZ)))
add(*stamp(door(M, 0.8, 1.85), [((s * 4.6, 55.0, az), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1)] + [((1.5, 51.6, az), (0, 0, -90))]))
add(xform(capstan(M, 0.5, 1.0), at=(0, 63.3, dz(63.3))))
add(tube([(0, 67.2, dz(67.2)), (0, 67.7, dz(67.2) + 3.4)], 0.04, P, segs=4, name='ensign-staff'))
add(*stamp(bitts(M), [((s * x, y, dz(y)), (0, 0, 0), (1.4, 1.4, 1.4)) for s in (-1, 1) for x, y in ((3.6, 62.2), (7.4, 46.5), (7.6, -15.5), (6.0, -56.5))]))
add(*stamp(mushroom(M, 0.9, 0.42), [((s * x, y, dz(y)), (0, 0, 0)) for s in (-1, 1) for x, y in ((5.2, -56.0), (6.6, -46.5), (7.2, -29.5), (7.3, 14.0), (7.0, 33.5), (6.4, 47.5), (2.5, 61.8))]))
count('stern')

# ---------------------------------------------------------------- deck cargo


def landing_craft():
    parts = [hard(prism('lc-hull', [(-5.5, 1.5), (-4.7, 0.25), (-3.9, 0.0), (4.9, 0.0), (5.4, 0.5), (5.4, 1.5)], -1.6, 1.6, mat=P), 0.06)]
    parts.append(bx(2.7, 0.1, 1.75, (0, -5.28, 1.25), M.STEEL, rot=(-32, 0, 0)))
    parts.append(hard(loft('lc-cover', [[(-1.45, y, 1.5), (1.45, y, 1.5), (1.45, y, 1.62), (0, y, 1.8), (-1.45, y, 1.62)] for y in (-4.6, 2.3)], mat=M.CANVAS), 0.03))
    parts.append(bx(1.7, 1.5, 0.45, (0, 3.3, 1.7), P))
    parts.append(bx(0.7, 0.08, 0.6, (-0.75, 2.5, 1.8), P))
    for s in (-1, 1):
        parts.append(cy(0.42, 0.3, (s * 0.95, 4.7, 1.62), P, segs=6))
        parts.append(bx(0.1, 9.6, 0.14, (s * 1.63, 0.0, 1.2), M.STEEL))
    return join('landing-craft', parts)


def lorry():
    parts = [soft(bevel(prism('shroud', [(-3.1, 0.75), (-3.1, 1.5), (-2.0, 1.62), (-1.7, 2.35), (-0.75, 2.45), (-0.65, 2.85), (3.1, 2.85), (3.15, 0.75)], -1.15, 1.15, mat=TARP), 0.14, 1), 70)]
    for s in (-1, 1):
        for y in (-2.2, 1.3, 2.4):
            parts.append(cy(0.5, 0.3, (s * 0.95, y, 0.5), RUBBER, rot=(0, 90, 0), segs=6))
    for y in (-1.2, 1.4):
        parts.append(bx(2.42, 0.07, 0.03, (0, y, 2.87 if y > -0.6 else 2.42), M.STEEL))
    return join('lorry', parts)


lc = landing_craft()
lplaces = []
for hi in (1, 3):
    hy = HATCHES[hi][0]
    for s in (-1, 1):
        lplaces.append(((s * 1.72, hy + 0.2, tops[hi] + 0.12), (0, 0, 0 if hi == 1 else 180)))
        for yy in (hy - 2.6, hy + 3.0):
            add(bx(3.3, 0.25, 0.5, (s * 1.72, yy, tops[hi] - 0.02), CRATE))
add(*stamp(lc, lplaces))
lr = lorry()
vplaces = []
for hi in (2, 4):
    hy = HATCHES[hi][0]
    for s in (-1, 1):
        vplaces.append(((s * 1.45, hy + s * 0.25, tops[hi] - 0.12), (0, 0, 0 if hi == 2 else 180)))
add(*stamp(lr, vplaces))
# crates and drums on the fore hatch and along the bulwarks
h1y, h1t = HATCHES[0][0], tops[0] - 0.2
cr = bx(1.2, 1.6, 1.0, (0, 0, 0.5), CRATE, name='crate')
cplaces = [((x, h1y + y, h1t + z), (0, 0, r_), (sx, 1, sz)) for x, y, z, r_, sx, sz in (
    (-1.9, -2.6, 0.02, 0, 1, 1), (-0.5, -2.7, 0.0, 4, 1, 1), (0.95, -2.5, -0.02, -3, 1, 1.2), (-1.3, -2.6, 1.02, 2, 1, 0.8), (2.2, -2.2, -0.08, 90, 1, 1),
    (-1.9, -0.6, 0.02, 0, 1.2, 1.3), (1.6, 0.2, -0.05, 6, 1.3, 1.0), (1.6, 0.2, 0.95, -4, 1.0, 0.7), (-0.3, 1.9, 0.06, 90, 1, 1), (-2.0, 2.6, 0.0, 0, 0.9, 0.8))]
cplaces += [((s * 6.9, y, dz(y)), (0, 0, 90), (1, 1, 1)) for s in (-1, 1) for y in (-31.5, -29.5, 16.0, 44.5)]
cplaces += [((s * 6.9, y, dz(y) + 1.0), (0, 0, 90), (0.8, 0.9, 0.7)) for s in (-1, 1) for y in (-30.5, 44.5)]
add(*stamp(cr, cplaces))
dr_ = cy(0.3, 0.9, (0, 0, 0.45), DRUM, segs=6, name='drum')
drp = [((0.6 + i * 0.66, h1y + 2.3 + j * 0.66, h1t - 0.12), (0, 0, 0)) for i in range(3) for j in range(3)]
drp += [((s * (7.6 - j * 0.66), y + i * 0.66, dz(y)), (0, 0, 0)) for s in (-1, 1) for y in (-38.5, 21.0) for i in range(5) for j in range(2)]
add(*stamp(dr_, drp))
# life rafts on launching skids abreast the masts
rf = raft(M, 3.0, 1.6)
rplaces = []
for s in (-1, 1):
    for ry in (-24.0, 26.6):
        z0 = dz(ry)
        rplaces.append(((s * 7.25, ry, z0 + 2.85), (0, s * 38, 0)))
        for yy in (ry - 0.9, ry + 0.9):
            add(tube([(s * 6.0, yy, z0 + 3.55), (s * 8.75, yy, z0 + 1.4)], 0.06, P, segs=4, name='skid'))
            add(tube([(s * 6.2, yy, z0 + 3.4), (s * 6.2, yy, z0)], 0.06, P, segs=4, name='skid-post'), tube([(s * 7.9, yy, z0 + 2.05), (s * 7.9, yy, z0)], 0.06, P, segs=4, name='skid-post'))
add(*stamp(rf, rplaces))
count('deck cargo')

# ---------------------------------------------------------------- railings

rails = Rails()
for s in (-1, 1):
    rails.run([(s * (H.edge(y) - 0.2), y, dz(y) + 0.12) for y in frange(60.3, 67.0, 2.2)] + [(0, 67.25, dz(67.3) + 0.12)], last=(s > 0))
    rails.run([(s * 7.95, y, BD) for y in (-13.0, -10.0, -2.9, 0.2, 7.0, 10.3)] + [(s * 6.9, 10.3, BD)], last=False)
    rails.run([(s * 5.7, -9.4, CD), (s * 5.7, 8.8, CD)], last=True)
    rails.run([(s * 4.7, 51.5, az + 2.75), (s * 4.7, 59.4, az + 2.75), (s * 3.9, 60.0, az + 2.75)], last=True)
rails.run([(5.4, 10.3, BD), (-5.4, 10.3, BD)], last=True)
rails.run([(7.0, -13.0, BD), (-7.0, -13.0, BD)], last=True)
rails.run([(5.7, 8.8, CD), (-5.7, 8.8, CD)], last=False)
rails.run([(3.9, 60.0, az + 2.75), (-3.9, 60.0, az + 2.75)], last=False)
add(*rails.build(P))
count('rails')

for o_ in (mount, gun, aa, aag):
    print(f'   .. {o_.name}: {tris([o_])} triangles each')
hull = join('hull', S)
tag(hull, 'none')
marker('smoke.1', smoke, hull)

lift_for_debug()
even_texels()
finish('transport', size=4096, tint=(0.2, 0.225, 0.25), views=((-35, 14, 0.55), (150, 22, 0.6), (-90, 6, 0.85), (-25, 10, 0.3), (155, 14, 0.3)))
