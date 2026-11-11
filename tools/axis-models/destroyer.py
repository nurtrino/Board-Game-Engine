# Fleet destroyer. Flush deck with a strong sheer forward, five single 5-inch gunhouses, two
# quintuple torpedo mounts between and abaft two raked funnels, twin 40 mm in tubs, depth charges aft.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _ships_small import *

reset()
M = ship_mats()
P = M.PAINT
S = []          # everything fixed to the hull


def add(*obs):
    S.extend(obs)
    return obs[0]


def count(label):
    print(f'   .. {label}: {tris(S)} static triangles so far')


# ---------------------------------------------------------------- hull

deck_z = curve([(-57.5, 7.1), (-50, 5.65), (-42, 4.6), (-34, 3.9), (-24, 3.48), (-10, 3.27), (10, 3.17), (35, 3.12), (50, 3.2), (57.5, 3.4)])
deck_half = curve([(-57.5, 0.0), (-56, 0.62), (-54, 1.35), (-51, 2.3), (-47.5, 3.2), (-43.5, 4.0), (-39, 4.7), (-34, 5.25), (-28, 5.65), (-21, 5.9),
                   (-12, 6.0), (14, 6.0), (26, 5.85), (36, 5.45), (44, 4.9), (50, 4.35), (54, 3.9), (56, 3.5), (57, 3.1), (57.5, 2.6)])
wl_half = curve([(-53.7, 0.0), (-52.0, 0.4), (-49.5, 0.95), (-45.5, 1.8), (-40.5, 2.8), (-34.5, 3.9), (-27.5, 4.85), (-20, 5.5), (-11, 5.9), (2, 6.0),
                 (18, 5.9), (30, 5.6), (40, 5.1), (48, 4.45), (54, 3.8), (57.5, 2.7)])
keel_z = curve([(-57.5, 7.1), (-56.3, 4.6), (-54.95, 2.0), (-53.7, 0.0), (-52.6, -1.7), (-51, -3.0), (-48.5, -3.75), (-45, -4.0), (26, -4.0), (34, -3.6),
                (42, -2.7), (49, -1.7), (54, -1.0), (57.5, -0.7)])
full = curve([(-53.7, 1.15), (-48, 1.5), (-40, 2.1), (-30, 2.8), (-15, 3.6), (20, 3.6), (40, 4.2), (57.5, 5.0)])
flare = curve([(-57.5, 2.0), (-45, 1.8), (-35, 1.5), (-20, 1.2), (0, 1.0), (57.5, 1.0)])
YS = [-57.5, -57.05, -56.5, -55.8, -55.0, -54.2, -53.2, -52, -50.5, -48.5, -46, -43, -39.5, -36, -32, -28, -23, -17, -11, -5, 1, 7, 13, 19, 25, 30,
      35, 39.5, 43.5, 47, 50, 52.5, 54.5, 56, 57, 57.5]
H = Hull(YS, deck_z, deck_half, wl_half, keel_z, full, flare, lip=lambda y: 0.1)
add(H.build('shell', M.RED, M.BOOT, P, M.DECK, split=(1,)))
dz = H.deck
L1, L2, L3 = 6.3, 8.7, 11.1

# under water: bilge keels, shafts, brackets, screws, rudder
add(both(H.strake(frange(-20, 22, 3.5), lambda y: -3.1, 0.5, 0.07, M.RED, name='bilge-keel')))
for s in (-1, 1):
    add(tube([(s * 1.9, 35.5, -3.0), (s * 2.3, 50.4, -3.0)], 0.14, M.STEEL, segs=6, name='shaft'))
    add(bx(0.1, 0.5, 1.7, (s * 2.0, 49.2, -2.2), M.RED, rot=(0, s * -22, 0)), bx(0.1, 0.5, 1.7, (s * 2.75, 49.2, -2.2), M.RED, rot=(0, s * 24, 0)))
    add(cy(0.24, 0.9, (s * 2.3, 49.3, -3.0), M.RED, rot=(90, 0, 0), segs=8))
add(*stamp(propeller(M, 1.45), [((2.3, 50.9, -3.0), (0, 0, 0)), ((-2.3, 50.9, -3.0), (0, 0, 0), (-1, 1, 1))]))
add(hard(prism('rudder', [(52.7, -0.8), (55.7, -0.8), (55.5, -3.9), (53.0, -4.1)], -0.13, 0.13, mat=M.RED), 0.05))
# a degaussing cable run along the shell under the deck edge
add(both(H.strake(frange(-53, 56, 4.2), lambda y: dz(y) - 0.55, 0.07, 0.13, P, name='cable')))
count('hull')

# ---------------------------------------------------------------- forecastle

add(tube([(0, -57.15, dz(-57.15)), (0, -57.3, dz(-57.15) + 2.6)], 0.035, P, segs=4, name='jackstaff'))
add(cy(0.22, 0.2, (0, -57.0, dz(-57.0) + 0.2), M.STEEL, rot=(90, 0, 0), segs=8))
bw = [(2.7, -47.4, dz(-47.4) - 0.2), (0, -49.7, dz(-49.7) - 0.2), (-2.7, -47.4, dz(-47.4) - 0.2)]
add(wall(bw, 1.0, 0.07, P, w=0.02, name='breakwater'))
add(*stamp(gusset(M, 0.5, 0.6), [((s * 1.35, -48.5, dz(-48.5) + 0.7), (0, 0, 90 + s * -40)) for s in (-1, 1)] + [((s * 2.4, -47.6, dz(-47.6) + 0.7), (0, 0, 90 + s * -40)) for s in (-1, 1)]))
add(xform(capstan(M, 0.42, 0.85), at=(0, -51.6, dz(-51.6))))
for s in (-1, 1):
    add(cy(0.3, 0.16, (s * 0.85, -54.7, dz(-54.7) + 0.06), M.STEEL, segs=8, w=0.03))
    add(*chain(M, [(s * 0.85, -54.6, dz(-54.6) + 0.14), (s * 0.7, -52.6, dz(-52.6) + 0.14), (s * 0.4, -51.75, dz(-51.75) + 0.3)]))
    add(bx(0.3, 0.5, 0.22, (s * 0.76, -53.4, dz(-53.4) + 0.1), M.STEEL, w=0.03))
    add(cy(0.14, 0.25, (s * 0.75, -50.6, dz(-50.6) + 0.1), M.STEEL, segs=6))
add(*stamp(anchor(M), [H.side(-54.1, dz(-54.1) - 2.6, s, out=0.04) for s in (1, -1)]))
add(*stamp(cy(0.36, 0.14, rot=(0, 90, 0), segs=8, mat=M.STEEL, w=0.03), [H.side(-54.1, dz(-54.1) - 0.75, s, out=0.02) for s in (1, -1)]))
add(*stamp(bitts(M), [((s * x, y, dz(y)), (0, 0, 0)) for s in (-1, 1) for x, y in ((1.15, -52.6), (3.8, -40.2), (5.2, -9.5), (5.3, 17.3), (3.3, 53.6))]))
add(*stamp(chock(M), [((s * (H.edge(y) - 0.32), y, dz(y) + 0.08), (0, 0, 0)) for s in (-1, 1) for y in (-54.4, -51.0, -38.5, -8.0, 19.0, 55.0)]))
add(*stamp(hatch(M), [((x, y, dz(y)), (0, 0, 0)) for x, y in ((-1.4, -46.5), (1.9, -38.9), (-4.3, -23.5), (4.2, 22.5), (2.3, 38.2), (-2.4, 46.2), (0, 49.6))]))

ports = [H.side(y, dz(y) - 1.25, s, out=0.0) for s in (1, -1) for y in frange(-50.5, -14.5, 2.4)]
ports += [H.side(y, dz(y) - 3.4, s, out=0.0) for s in (1, -1) for y in frange(-46, -28, 3.0)]
ports += [H.side(y, dz(y) - 1.3, s, out=0.0) for s in (1, -1) for y in frange(22, 46, 4.0)]
count('forecastle')

# ---------------------------------------------------------------- upperworks


def level(outline, z0, z1, over=0.12, w=0.05, name='house'):
    """A deckhouse block with an overhanging deck edge and a dark deck laid on top."""
    add(slab(outline, z0, z1 - 0.1, P, w=w, name=name))
    add(slab(offset(outline, over), z1 - 0.1, z1, P, w=0.02, name=name + '-edge'))
    add(slab(offset(outline, over - 0.1), z1, z1 + 0.02, M.DECK, name=name + '-deck'))


A_OUT = sym([(-39.2, 0.9), (-38.8, 1.75), (-38.0, 2.45), (-36.7, 3.0), (-34.8, 3.25), (-9.0, 3.25), (-7.6, 2.7), (15.4, 2.7), (16.0, 2.3)])
level(A_OUT, 2.9, L1, name='house-a')
C_OUT = sym([(18.5, 2.3), (19.0, 2.8), (35.0, 2.8), (36.2, 2.2), (36.7, 1.2)])
level(C_OUT, 2.9, L1, name='house-c')
B_OUT = sym([(-32.4, 1.1), (-31.9, 2.1), (-31.0, 2.8), (-29.7, 3.2), (-23.2, 3.2)])
add(slab(B_OUT, L1, L2 - 0.1, P, w=0.05, name='bridge-base'))
W_OUT = sym([(-32.6, 1.15), (-32.1, 2.2), (-31.15, 2.95), (-29.8, 3.35), (-28.3, 3.35), (-27.9, 5.1), (-25.3, 5.1), (-24.9, 3.35), (-23.0, 3.35)])
add(slab(W_OUT, L2 - 0.1, L2, P, w=0.02, name='bridge-deck'))
add(slab(offset(W_OUT, -0.1), L2, L2 + 0.02, M.DECK, name='bridge-deck-top'))
PH = sym([(-32.0, 1.0), (-31.55, 1.9), (-30.75, 2.55), (-29.6, 2.95), (-25.2, 2.95)])
add(slab(PH, L2, L3 - 0.1, P, w=0.05, name='pilot-house'))
add(slab(offset(PH, 0.16), L3 - 0.1, L3, P, w=0.02, name='pilot-roof'))
add(slab(offset(PH, 0.02), L3, L3 + 0.02, M.DECK, name='pilot-roof-top'))
add(wall([(x, y, L3) for x, y in offset(PH, 0.14)], 1.1, 0.05, P, closed=True, w=0.012, name='bridge-screen'))
# windows round the pilot house, with a sun visor over them
add(*stamp(bx(0.05, 0.62, 0.55, mat=M.GLASS), edge_places(PH, L2 + 1.55, step=0.95, out=0.0, pick=lambda x, y, ln: y < -25.6)))
add(*stamp(bx(0.16, 0.9, 0.04, mat=P), edge_places(PH, L2 + 1.92, step=0.95, out=0.06, pick=lambda x, y, ln: y < -25.6)))
add(*stamp(bx(0.04, 0.95, 0.05, mat=P), edge_places(PH, L2 + 1.2, step=0.95, out=0.02, pick=lambda x, y, ln: y < -25.6)))
# bridge wings with wind screens and brackets
wing = wall([(3.3, -28.32, L2), (5.08, -27.88, L2), (5.08, -25.32, L2), (3.3, -24.88, L2)], 1.12, 0.05, P, w=0.012, name='wing')
add(both(wing))
add(*stamp(gusset(M, 1.7, 1.5), [((s * 3.22, y, L2 - 0.1), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-27.6, -25.6)]))
for s in (-1, 1):
    add(xform(searchlight(M, 0.2), at=(s * 4.55, -26.6, L2 + 0.6)))
    add(cy(0.07, 0.6, (s * 4.55, -26.6, L2 + 0.3), P, segs=6))
    add(bx(1.0, 0.55, 0.85, (s * 2.55, -23.75, L2 + 0.45), P, w=0.03))
    add(bx(1.04, 0.59, 0.05, (s * 2.55, -23.75, L2 + 0.9), M.CANVAS))
    add(bx(0.3, 0.3, 1.0, (s * 2.2, -30.2, L3 + 0.5), P, w=0.02))
add(cy(0.14, 1.15, (0, -30.9, L3 + 0.57), M.STEEL, segs=6), cy(0.2, 0.2, (0, -30.9, L3 + 1.2), M.BRONZE, segs=8))
# main battery director on its barbette
add(cy(1.25, 1.5, (0, -27.3, L3 + 0.75), P, segs=14, w=0.03))
dst = [(-28.75, 0.95, 13.95), (-28.35, 1.3, 14.55), (-26.3, 1.3, 14.55), (-25.9, 1.05, 14.25)]
add(hard(loft('director', [[(-x, y, 12.6), (x, y, 12.6), (x, y, zt), (-x, y, zt)] for y, x, zt in dst], mat=P), 0.05))
add(cy(0.17, 5.0, (0, -27.1, 13.7), P, rot=(0, 90, 0), segs=8))
for s in (-1, 1):
    add(bx(0.3, 0.42, 0.42, (s * 2.45, -27.1, 13.7), P, w=0.03), bx(0.05, 0.06, 0.2, (s * 2.45, -27.33, 13.7), M.GLASS))
    add(bx(0.07, 0.07, 1.3, (s * 0.6, -27.2, 15.1), P))
add(bx(1.9, 0.1, 1.5, (0, -27.45, 15.75), P, rot=(-10, 0, 0), w=0.02), bx(0.5, 0.4, 0.5, (0, -27.15, 15.6), P, w=0.03))
add(bx(0.5, 0.05, 0.3, (0, -28.78, 13.5), M.GLASS), bx(0.7, 0.7, 0.06, (0.5, -27.0, 14.58), P))
count('bridge')

# mast: a pole with two struts, a yard, a small radar platform, the air-search aerial on top
MY, MT = -21.3, 26.2
add(tube([(0, MY, L1), (0, MY + 0.45, 17.5), (0, MY + 0.8, MT)], 0.3, P, segs=8, radii=[0.3, 0.22, 0.12], name='mast'))
for s in (-1, 1):
    add(tube([(s * 1.9, MY + 2.9, L1), (0, MY + 0.5, 18.2)], 0.13, P, segs=6, name='strut'))
    add(wire((s * 3.5, MY + 0.55, 20.0), (0, MY + 0.7, 23.0), 0.025, M.WIRE))
    for x in (1.4, 3.3):
        add(wire((s * x, MY + 0.55, 19.95), (s * (2.3 + x * 0.12), -23.7, L2 + 1.0), 0.02, M.WIRE))
    add(wire((s * 3.45, MY + 0.55, 19.95), (s * 1.3, 4.3, 14.6), 0.02, M.WIRE))
add(tube([(-3.6, MY + 0.55, 20.0), (0, MY + 0.55, 20.05), (3.6, MY + 0.55, 20.0)], 0.07, P, segs=6, radii=[0.045, 0.085, 0.045], name='yard'))
add(cy(0.85, 0.07, (0, MY + 0.35, 22.3), P, segs=10), bx(0.12, 0.9, 0.12, (0, MY - 0.1, 22.2), P))
add(bx(1.3, 0.3, 0.55, (0, MY - 0.4, 23.0), P, w=0.04), cy(0.07, 0.5, (0, MY - 0.4, 22.55), P, segs=6))
add(bx(0.9, 0.6, 0.06, (0, MY + 0.3, 16.0), P), cy(0.2, 0.3, (0, MY - 0.05, 16.2), P, segs=8))
add(tube([(0, MY + 0.75, 24.2), (0, MY + 2.4, 25.0)], 0.04, P, segs=4, name='gaff'))
rp = (0, MY + 0.8, MT)
r = [cy(0.1, 0.6, (rp[0], rp[1], rp[2] + 0.3), P, segs=6)]
for z in (0.55, 1.2, 1.85):
    r.append(bx(4.4, 0.05, 0.05, (0, rp[1], rp[2] + z), P))
for x in (-2.2, -1.1, 0, 1.1, 2.2):
    r.append(bx(0.05, 0.05, 1.3, (x, rp[1], rp[2] + 1.2), P))
for z in (0.88, 1.52):
    r.append(bx(4.0, 0.03, 0.03, (0, rp[1] - 0.2, rp[2] + z), M.STEEL))
    for x in (-1.65, 0, 1.65):
        r.append(bx(0.03, 0.2, 0.03, (x, rp[1] - 0.1, rp[2] + z), M.STEEL))
radar = join('radar', r)
pivot(radar, rp)
tag(radar, 'radar', rpm=8)

# funnels on their uptake casings
RAKE = 7.0
smoke = []
for i, (fy, fh) in enumerate(((-13.6, 6.7), (2.5, 6.3))):
    add(slab(sym([(fy - 2.75, 1.0), (fy - 2.45, 1.45), (fy + 2.45, 1.45), (fy + 2.75, 1.0)]), L1, L1 + 1.3, P, w=0.05, name='uptake'))
    fb = (0, fy, L1 + 1.25)
    add(funnel(M, 1.18, 2.15, fh, rake=RAKE, cap=0.85, base=fb))
    k = math.tan(R(RAKE))
    add(shade(loft('band', [superellipse(1.18 * 0.955 + g, 2.15 * 0.955 + g, 2.3, 16, at=(0, fy + k * z, fb[2] + z)) for z, g in ((fh * 0.6 - 0.07, 0.0), (fh * 0.6 - 0.05, 0.05), (fh * 0.6 + 0.05, 0.05), (fh * 0.6 + 0.07, 0.0))],
                   cap_start=False, cap_end=False, mat=P), 50))
    for x in (-0.32, 0.32):
        add(tube([(x, fy - 2.2 + k * 0.4, fb[2] + 0.4), (x, fy - 2.14 + k * fh, fb[2] + fh + 0.45)], 0.07, P, segs=5, name='steam-pipe'))
    add(tube([(0, fy + 2.22 + k * 0.4, fb[2] + 0.4), (0, fy + 2.16 + k * fh, fb[2] + fh + 0.3)], 0.06, P, segs=5, name='steam-pipe'))
    add(cy(0.09, 0.5, (0, fy - 2.35 + k * fh * 0.72, fb[2] + fh * 0.72), M.BRONZE, rot=(90, 0, 0), segs=6))
    smoke.append((0, fy + k * fh, fb[2] + fh + 0.1))
    for s in (-1, 1):
        add(wire((s * 1.0, fy + k * fh * 0.6, fb[2] + fh * 0.6), (s * 2.5, fy - 1.0, L1 + 0.05), 0.02, M.WIRE))
        add(wire((s * 1.0, fy + k * fh * 0.6, fb[2] + fh * 0.6), (s * 2.5, fy + 2.6, L1 + 0.05), 0.02, M.WIRE))
# searchlight platform on the after funnel
SLZ = L1 + 4.6
add(slab(sym([(4.2, 1.0), (4.4, 2.1), (6.6, 2.1), (7.0, 1.6)]), SLZ - 0.08, SLZ, P, w=0.02, name='light-platform'))
add(*stamp(gusset(M, 1.0, 1.3), [((s * 1.0, 5.0, SLZ - 0.08), (0, 0, 90)) for s in (-1, 1)]))
add(tube([(0, 6.7, SLZ - 0.08), (0, 5.3, L1 + 1.3)], 0.1, P, segs=5))
for s in (-1, 1):
    add(xform(searchlight(M, 0.46), at=(s * 1.2, 6.0, SLZ)))
count('mast and funnels')

# ---------------------------------------------------------------- guns

turret, gun, tr, mz = gunhouse5(M)
tag(turret, 'yaw', speed=0.9, min=-150, max=150)
tag(gun, 'pitch', min=-8, max=80, recoil=0.35)
G1, G5 = (0, -43.5, dz(-43.5) + 0.4), (0, 42.2, dz(42.2) + 0.16)
add(cy(1.78, 1.2, (0, -43.5, G1[2] - 0.6), P, segs=16, w=0.03))
add(cy(1.78, 0.42, (0, -35.5, L1 + 0.21), P, segs=16, w=0.03))
add(cy(1.78, 0.4, (0, 42.2, G5[2] - 0.2), P, segs=16, w=0.03))
mount_set(turret, gun, [(G1, 0), ((0, -35.5, L1 + 0.42), 0), ((0, 21.7, L1 + 0.02), 180), ((0, 33.4, L1 + 0.02), 180), (G5, 180)],
          muzzles=[mz], kind='naval', mname='muzzle.main.{i}')


def torpedo_mount():
    t = [cy(1.65, 0.26, (0, 0, 0.13), P, segs=14)]
    for y in (-1.9, 1.7):
        t.append(bx(4.1, 0.36, 0.3, (0, y, 0.42), P, w=0.02))
    for i in range(5):
        x = (i - 2) * 0.78
        t.append(cy(0.33, 7.1, (x, -0.1, 0.92), P, rot=(90, 0, 0), segs=8))
        for y in (-3.5, -0.9):
            t.append(cy(0.385, 0.22, (x, y, 0.92), P, rot=(90, 0, 0), segs=8, caps=False))
        t.append(cy(0.37, 0.55, (x, 3.3, 0.92), P, rot=(90, 0, 0), segs=8))
    t.append(bx(1.7, 1.9, 0.95, (0, 0.5, 1.72), P, w=0.14))
    t.append(bx(1.0, 0.05, 0.3, (0, -0.47, 1.85), M.GLASS))
    t.append(bx(0.5, 0.5, 0.25, (0, 0.6, 2.3), P, w=0.05))
    for s in (-1, 1):
        t.append(bx(0.3, 5.0, 0.04, (s * 2.1, 0.3, 0.62), P))
        t.append(bx(0.03, 5.0, 0.03, (s * 2.25, 0.3, 1.5), P))
        for y in (-2.1, 0.3, 2.7):
            t.append(bx(0.03, 0.03, 0.9, (s * 2.25, y, 1.06), P))
    return join('tubes', t)


tubes = torpedo_mount()
tag(tubes, 'yaw', speed=0.3, min=-100, max=100)
mount_set(tubes, None, [((0, -5.6, L1 + 0.02), 0), ((0, 10.6, L1 + 0.02), 0)], muzzles=[(0, -3.8, 0.92)], kind='torpedo', mname='muzzle.torp.{i}')

aa, aag, atr, amz = bofors_twin(M)
tag(aa, 'yaw', aims='air', speed=1.6)
tag(aag, 'pitch', min=0, max=85, recoil=0.08)
AAZ = L1 + 0.1
AA5Z = L1 + 1.9
AA = [((3.8, -20.4, AAZ), 0), ((-3.8, -20.4, AAZ), 0), ((3.95, 2.6, AAZ), 0), ((-3.95, 2.6, AAZ), 0), ((0, 27.6, AA5Z), 180)]
mount_set(aa, aag, AA, muzzles=amz, kind='flak', mname='muzzle.aa.{i}.{k}')
add(*stamp(tub(M, 1.8, 1.1, segs=12), [((p[0], p[1], p[2] - 0.1), (0, 0, 0)) for p, _ in AA]))
add(cy(1.45, 1.8, (0, 27.6, L1 + 0.9), P, segs=14, w=0.03))
for (x, y, z), _ in AA[:4]:
    s = 1 if x > 0 else -1
    for yy in (y - 1.1, y + 1.1):
        add(tube([(s * 5.0, yy, z - 0.1), (s * 5.0, yy, dz(yy))], 0.09, P, segs=5, name='tub-post'))
    add(*stamp(gusset(M, 1.6, 1.4), [((s * (3.3 if y < 0 else 2.75), y, z - 0.1), (0, 0, 0 if s > 0 else 180))]))
add(*stamp(locker(M), [((s * x, y, z), (0, 0, 0)) for s in (-1, 1) for x, y, z in ((2.3, -18.2, L1), (2.1, 0.0, L1), (2.2, 25.0, L1), (4.6, 45.8, dz(45.8)), (1.5, -39.8 + 2.6, L1))]))
count('guns')

# ---------------------------------------------------------------- boats, rafts, torpedo davit

bt = boat(M, 7.9, 2.3, 1.0)
add(*stamp(bt, [((s * 4.72, -13.6, dz(-13.6) + 0.75), (0, 0, 0)) for s in (-1, 1)]))
dv = davit(M, 3.9, 1.05)
dplaces = []
for s in (-1, 1):
    for y in (-16.6, -10.6):
        dplaces.append(((s * 5.7, y, dz(y)), (0, 0, 180 if s > 0 else 0)))
        add(wire((s * 4.68, y, dz(y) + 3.75), (s * 4.72, y + (0.6 if y < -13 else -0.6), dz(y) + 1.95), 0.022, M.WIRE))
        add(bx(2.0, 0.12, 0.6, (s * 4.72, y + (1.2 if y < -13 else -1.2), dz(y) + 0.5), P))
add(*stamp(dv, dplaces))
rf = raft(M)
rplaces = []
for s in (-1, 1):
    for y in (22.8, 30.6):
        rplaces.append(((s * 3.08, y, L1 - 1.0), (0, s * 76, 0)))
    rplaces.append(((s * 3.52, -27.2, L1 + 1.3), (0, s * 78, 0)))
    rplaces.append(((s * 1.72, -13.6, L1 + 0.75), (0, s * 80, 0)))
add(*stamp(rf, rplaces))
# floater-net baskets hung outboard of the rails
add(*stamp(bx(0.5, 1.7, 0.5, mat=M.CANVAS, w=0.0, name='net-basket'), [((s * (x + 0.32), y, L1 + 0.5), (0, 0, 0)) for s in (-1, 1) for x, y in ((3.37, -16.0), (3.37, -11.2), (2.82, 7.6), (2.82, 12.6))]))
# torpedo-loading davit
add(cy(0.12, 2.9, (-2.15, 15.5, L1 + 1.45), P, segs=6), tube([(-2.15, 15.5, L1 + 2.8), (-1.2, 14.3, L1 + 3.5), (0.2, 12.6, L1 + 3.6)], 0.08, P, segs=5, name='jib'))
add(wire((0.2, 12.6, L1 + 3.6), (0.2, 12.6, L1 + 2.3), 0.025, M.WIRE), bx(0.12, 0.12, 0.3, (0.2, 12.6, L1 + 2.2), M.STEEL))
add(wire((-2.15, 15.5, L1 + 2.9), (0.2, 12.6, L1 + 3.62), 0.02, M.WIRE))

# ladders, doors, scuttles, ventilators
add(ladder(M, (1.6, 18.2, dz(18)), (1.6, 16.15, L1)), ladder(M, (-1.6, 16.3, dz(17)), (-1.6, 18.4, L1)))
add(ladder(M, (2.4, -21.2, L1), (2.4, -23.05, L2)), ladder(M, (-2.2, -23.3, L2), (-2.2, -25.05, L3)))
add(ladder(M, (-2.0, -40.9, dz(-40.9)), (-2.0, -39.0, L1)))
dplaces = [((s * x, y, dz(y) - 0.1), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for x, y in ((3.25, -30.5), (3.25, -17.0), (3.25, -11.0), (2.7, -1.5), (2.7, 13.0), (2.8, 20.6), (2.8, 31.5))]
dplaces += [((s * 3.2, -25.5, L1 - 0.1), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1)]
add(*stamp(door(M), dplaces))
ports += [((s * x, y, L1 - 0.95), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for x, y in ((3.25, -33.0), (3.25, -28.0), (3.25, -23.5), (3.25, -19.5), (3.25, -14.5), (2.7, -5.0), (2.7, 1.5), (2.7, 6.0), (2.7, 10.0), (2.8, 24.0), (2.8, 27.5))]
ports += [((s * 3.2, y, L2 - 0.95), (0, 0, 0 if s > 0 else 180)) for s in (-1, 1) for y in (-29.0, -27.0, -24.2)]
add(*stamp(porthole(M), ports))
vplaces = [((s * x, y, z), (0, 0, 0)) for s in (-1, 1) for x, y, z in ((2.6, -45.3, dz(-45.3)), (4.6, -31.0, dz(-31)), (4.9, -6.5, dz(-6.5)), (4.9, 7.0, dz(7)), (4.6, 28.0, dz(28)), (2.0, -9.5, L1), (1.9, 6.6, L1), (2.3, 15.0, L1), (3.3, 37.5, dz(37.5)))]
add(*stamp(mushroom(M), vplaces))
count('fittings')

# ---------------------------------------------------------------- stern: depth charges and throwers

dc = cy(0.23, 0.7, rot=(0, 90, 0), segs=6, mat=M.STEEL, name='charge')
dcp = []
for s in (-1, 1):
    x = s * 1.75
    for y in frange(52.3, 56.8, 0.5):
        dcp.append(((x, y, dz(y) + 0.52), (0, 0, 0)))
    for xx in (x - 0.42, x + 0.42):
        add(bx(0.05, 5.4, 0.05, (xx, 54.6, dz(54.6) + 0.26), P), bx(0.05, 5.4, 0.05, (xx, 54.6, dz(54.6) + 0.82), P))
        for y in (52.0, 53.3, 54.6, 55.9, 57.2):
            add(bx(0.05, 0.05, 0.75, (xx, y, dz(y) + 0.47), P))
kg = join('kgun', [bx(0.55, 0.55, 0.22, (0, 0, 0.11), P, w=0.02), cy(0.12, 0.95, (0.28, 0, 0.55), P, rot=(0, 45, 0), segs=6), bx(0.08, 0.4, 0.3, (0.56, 0, 0.83), M.STEEL, rot=(0, 45, 0))])
kgp, rack = [], []
for s in (-1, 1):
    for y in (45.4, 48.0, 50.6):
        x = s * (H.edge(y) - 1.0)
        kgp.append(((x, y, dz(y)), (0, 0, 0 if s > 0 else 180)))
        dcp.append(((x + s * 0.72, y, dz(y) + 1.05), (0, 0, 90)))
        for j in range(3):
            dcp.append(((x - s * (0.9 + j * 0.5), y + 0.9, dz(y) + 0.5), (0, 0, 90)))
        add(bx(1.7, 0.05, 0.05, (x - s * 1.35, y + 0.55, dz(y) + 0.24), P), bx(1.7, 0.05, 0.05, (x - s * 1.35, y + 1.25, dz(y) + 0.24), P))
        for j in (0, 1):
            add(bx(0.05, 0.75, 0.24, (x - s * (0.6 + j * 1.5), y + 0.9, dz(y) + 0.12), P))
add(*stamp(kg, kgp))
add(*stamp(dc, dcp))
for s in (-1, 1):
    add(cy(0.3, 1.3, (s * 0.55, 56.3, dz(56.3) + 0.55), P, rot=(90, 0, 0), segs=8), bx(0.5, 0.9, 0.24, (s * 0.55, 56.3, dz(56.3) + 0.12), P))
    # propeller guards
    y0 = 49.6
    e = H.edge(y0)
    add(tube([(s * (e - 0.1), y0 - 1.5, dz(y0) - 0.25), (s * (e + 1.15), y0 - 0.6, dz(y0) - 0.3), (s * (e + 1.15), y0 + 0.9, dz(y0) - 0.3), (s * (H.edge(y0 + 1.9) - 0.1), y0 + 1.9, dz(y0) - 0.25)], 0.06, P, segs=4, name='guard'))
    add(tube([(s * (e + 1.15), y0 + 0.15, dz(y0) - 0.3), (s * (H.half(y0, 1.2) - 0.05), y0 + 0.15, 1.2)], 0.05, P, segs=4, name='guard-stay'))
add(tube([(0, 57.25, dz(57.2)), (0, 57.7, dz(57.2) + 2.7)], 0.035, P, segs=4, name='ensign-staff'))
st20, st20g, _, _ = oerlikon(M, 'o', 'og', lite=True)
st20g.location = (0, 0, 0)
bpy.context.view_layer.update()
o20 = join('oerlikon', [st20, xform(st20g, at=(0, 0, 1.36), rot=(-25, 0, 0))])
add(*stamp(o20, [((1.6, 47.2, dz(47.2)), (0, 0, 180)), ((-1.6, 47.2, dz(47.2)), (0, 0, 180)), ((4.75, 9.2, dz(9.2)), (0, 0, -90)), ((-4.75, 9.2, dz(9.2)), (0, 0, 90)),
                 ((2.0, -31.2, L3 + 0.02), (0, 0, 0)), ((-2.0, -31.2, L3 + 0.02), (0, 0, 0))][:4]))
count('stern')

# ---------------------------------------------------------------- railings

rails = Rails()
for s in (-1, 1):
    rails.run([(s * (H.edge(y) - 0.2), y, dz(y) + 0.1) for y in frange(-56.9, 57.1, 4.6)], last=True)
    rails.run([(s * x, y, L1 + 0.02) for x, y in ((1.75, -38.9), (2.5, -38.1), (3.05, -36.8), (3.3, -34.9), (3.37, -32.0))], last=False)
    rails.run([(s * 3.37, -18.4, L1 + 0.02), (s * 3.37, -9.0, L1 + 0.02), (s * 2.82, -7.6, L1 + 0.02), (s * 2.82, 0.6, L1 + 0.02)], last=True)
    rails.run([(s * 2.82, 4.6, L1 + 0.02), (s * 2.82, 15.4, L1 + 0.02), (s * 2.3, 16.1, L1 + 0.02)], last=False)
    rails.run([(s * 2.4, 18.4, L1 + 0.02), (s * 2.92, 19.0, L1 + 0.02), (s * 2.92, 35.0, L1 + 0.02), (s * 2.3, 36.3, L1 + 0.02), (s * 1.3, 36.8, L1 + 0.02)], last=False)
    rails.run([(s * 3.4, -24.8, L2 + 0.02), (s * 3.4, -23.0, L2 + 0.02)], last=True)
    rails.run([(s * 2.1, 4.4, SLZ), (s * 2.1, 6.6, SLZ), (s * 1.6, 7.0, SLZ)], last=False)
rails.run([(2.6, 57.3, dz(57.3) + 0.1), (-2.6, 57.3, dz(57.3) + 0.1)], last=False)
rails.run([(2.3, 16.1, L1 + 0.02), (-2.3, 16.1, L1 + 0.02)], last=False)
rails.run([(1.6, 7.0, SLZ), (-1.6, 7.0, SLZ)], last=False)
rails.run([(3.4, -23.0, L2 + 0.02), (-3.4, -23.0, L2 + 0.02)], last=False)
add(*rails.build(P))
count('rails')

for o_ in (turret, gun, tubes, aa, aag, radar):
    print(f'   .. {o_.name}: {tris([o_])} triangles each')
hull = join('hull', S)
tag(hull, 'none')
for i, p in enumerate(smoke):
    marker(f'smoke.{i + 1}', p, hull)

lift_for_debug()
even_texels()
finish('destroyer', size=4096, tint=(0.2, 0.225, 0.25), views=((-35, 14, 0.55), (150, 22, 0.6), (-90, 6, 0.85), (-25, 10, 0.3), (155, 14, 0.3)))
