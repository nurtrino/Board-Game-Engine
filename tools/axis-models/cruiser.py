# Heavy cruiser. 190 m, a long forecastle with a break aft of the catapult, three triple 8-inch
# turrets, one big raked funnel, a tripod foremast, torpedo tubes and a seaplane amidships.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _ships_capital import *

reset()
M = materials()
K = Kit(M)

BRK = 0.655                                   # where the forecastle ends: y = 29.45
YB = -95.0 + BRK * 190.0


def sheer(u):
    if u <= BRK + 0.00025:
        return 5.6 + 2.3 * max(0.0, 1 - u / 0.5) ** 2
    return 3.2 + 0.35 * max(0.0, (u - 0.86) / 0.14) ** 2


H = Hull(190.0, 20.0, 6.5, sheer, brk=(BRK,), ue=0.42, uw=0.50, ae=1.8, aw=1.5, ur=0.58, urw=0.54, ks=0.46, kw=0.3,
         rake=7.5, overhang=3.6, bulb=0.9, bulbfwd=1.6, cut=4.5, flare=1.9, camber=0.18, zb=0.7, zt=0.8, t_aft=1.1,
         margin=0.55, pmid=4.5)
K.parts.append(H.build(M))
K.parts.append(H.strake(M, -0.5, 0.02, 0.975, w=0.1, h=0.18))
K.parts.append(H.strake(M, -2.6, 0.26, 0.64, w=0.14, h=0.26))
dk = H.deck
FD = 5.6                                      # forecastle deck amidships
QD = 3.2                                      # quarterdeck
C1, C2, C3, C4 = 8.1, 10.6, 13.1, 15.6

# ---------------------------------------------------------------- hull side and underwater

portholes_hull(K, H, -84, YB - 2.0, 3.0, -1.4)
portholes_hull(K, H, -78, -46, 3.0, -3.6)
portholes_hull(K, H, -8, YB - 2.0, 3.0, -3.6)
portholes_hull(K, H, YB + 2.5, 86, 3.0, -1.35)
anchor_gear(K, H, -86.0, -2.3, -80.0, 1.9, -77.8, k=0.62)
screws(K, [(2.6, 80.5, -4.7), (5.8, 73.5, -4.2)], [(0.0, 82.5, 87.5, -1.7, -6.2)], r_prop=1.7)
K.add(prism('skeg', [(46, -6.45), (77, -6.3), (81, -2.2), (50, -5.9)], -0.25, 0.25, M.RED), 0.08)
for s in (-1, 1):
    K.add(box('bilge-keel', 1.0, 30, 0.12, at=(s * 9.15, 5, -5.25), rot=(0, s * 45, 0), mat=M.RED), 0.0)

# ---------------------------------------------------------------- deck edge rails and fittings

for y0, y1 in ((-93.8, YB - 0.25), (YB + 0.35, 94.3)):
    port = H.edge_run(y0, y1, inset=0.25)
    K.rail(port)
    K.rail([(-p.x, p.y, p.z) for p in port])
# the after edge of the forecastle deck, either side of the after superstructure
for s in (-1, 1):
    K.rail([(s * 9.7, YB - 0.2, dk(YB - 0.2, 9.7)), (s * 5.9, YB - 0.2, dk(YB - 0.2, 5.9))])
    K.ladders.append(((s * 7.8, YB + 2.25, QD + 0.1), (0, 0, 180)))

K.add(tube('jackstaff', (0, -93.8, dk(-93.8)), (0, -94.0, dk(-93.8) + 3.6), 0.05, 4, mat=M.PAINT), 0.0)
K.add(tube('ensign-staff', (0, 93.8, dk(93.8)), (0, 94.6, dk(93.8) + 4.2), 0.05, 4, mat=M.PAINT), 0.0)
K.add(lathe_o('bullnose', [(0.42, 0.0), (0.5, 0.25), (0.3, 0.42), (0.25, 0.15)], segs=8, mat=M.PAINT, at=(0, -93.5, dk(-93.5) - 0.05)), 0.0)

for y in (-88.5, -58, -30, 5, 20, 35, 62, 84):
    for s in (-1, 1):
        x = H.half(y) - 1.0
        K.bollards.append(((s * x, y, dk(y, x)), (0, 0, 0)))
        x = H.half(y + 2.6) - 0.42
        K.chocks.append(((s * x, y + 2.6, dk(y + 2.6, x)), (0, 0, 0)))
for s in (-1, 1):
    K.chocks.append(((s * 0.8, -92.2, dk(-92.2)), (0, 0, s * 20)))
    K.chocks.append(((s * 2.4, 92.6, dk(92.6)), (0, 0, s * 60)))

BW = [(-5.4, -63.4), (-2.9, -66.5), (0.0, -68.0), (2.9, -66.5), (5.4, -63.4)]
bulwark(K, 'breakwater', BW, lambda x, y: dk(y, x) - 0.06, 1.25, t=0.09)
for a, b in zip(BW, BW[1:]):
    for t in (0.2, 0.6):
        x, y = lerp(a[0], b[0], t), lerp(a[1], b[1], t)
        K.add(tube('bw-stay', (x, y + 0.05, dk(y, x) + 1.1), (x, y + 1.1, dk(y, x)), 0.05, 3, mat=M.PAINT), 0.0)

for x, y in ((0, -60.5), (-3.6, -45), (3.6, -45), (0, -83.5), (0, 64), (-4.0, 70), (4.0, 70), (0, 80), (-6.5, -24), (6.5, -24), (0, 86)):
    K.hatches.append(((x, y, dk(y, x) - 0.03), (0, 0, 0)))
for x, y in ((5.0, -59), (5.4, -47), (6.2, -41), (2.2, -84.5), (6.6, 52), (6.0, 61), (2.5, 77), (3.6, 88), (8.2, 22)):
    for s in (-1, 1):
        K.vents.append(((s * x, y, dk(y, x) - 0.03), (0, 0, 0)))
for x, y, r in ((7.6, -36, 90), (8.6, 0.5, 0), (7.2, 58, 90), (4.6, 82, 0)):
    for s in (-1, 1):
        K.reels.append(((s * x, y, dk(y, x) - 0.02), (0, 0, r)))
for y in (-56, -53, 66, 69, 88):
    for s in (-1, 1):
        x = H.half(y) - 1.4
        K.oerlikons.append(((s * x, y, dk(y, x) - 0.02), (0, 0, s * 70 if y < 0 else s * 110)))
for s in (-1, 1):
    K.add(tube('boom', (s * 9.2, -44, dk(-44, 9.2) + 0.4), (s * 9.5, -33.5, dk(-33.5, 9.5) + 0.4), 0.11, 5, r2=0.07, mat=M.TARP, caps=True), 0.0)
    for k in range(3):
        K.rafts.append(((s * 5.6, 64.5, dk(64.5, 5.6) + 0.05 + k * 0.36), (0, 0, 90)))

# ---------------------------------------------------------------- barbettes

TUR = {}
for nm, y, hgt in (('A', -52.0, 0.9), ('B', -37.5, 3.5), ('C', 56.0, 0.9)):
    zt = dk(y) + hgt
    zb_ = dk(y) - 0.5
    pedestal(K, 'barbette', 0, y, zb_, zt, 3.55, segs=24, bev=0.08)
    collar(K, 'barbette-rim', 0, y, zt - 0.32, 3.55, w=0.1, h=0.16, segs=24)
    TUR[nm] = (0.0, y, zt)
yb = TUR['B'][1]
K.vladders.append(((0, yb - 3.57, dk(yb) + 0.3), (0, 0, 0)))
K.doors.append(((3.55 * math.sin(R(55)), yb - 3.55 * math.cos(R(55)), dk(yb) + 0.1), (0, 0, 55)))
K.doors.append(((-3.55 * math.sin(R(55)), yb - 3.55 * math.cos(R(55)), dk(yb) + 0.1), (0, 0, -55)))

# ---------------------------------------------------------------- forward superstructure

SEC = []
for i, (x, y, z, yaw) in enumerate(((7.9, -16.5, FD, 0.0), (7.9, -6.0, FD, 0.0), (6.0, 36.5, 6.3, 180.0), (6.0, 46.0, 6.3, 180.0))):
    for s in (1, -1):
        zz = (dk(y, x) + 0.55) if z == FD else z
        pedestal(K, 'sec-base', s * x, y, (dk(y, x) if y < YB else QD) - 0.1, zz, 1.9, segs=14)
        SEC.append((('P' if s > 0 else 'S') + str(i + 1), (s * x, y, zz), yaw, s))

S1 = octo(6.0, -28.5, 12.0, f=(3.6, 4.5), b=(4.4, 2.5))
house(K, 'S1', S1, FD - 0.4, C1)
wall_fit(K, S1, FD + 0.05, step=2.8, skip=lambda x, y: abs(x) > 5.5 and (abs(y + 16.5) < 2.0 or abs(y + 6.0) < 2.0))
K.rail_outline(S1, C1)

S2 = bullet(4.6, -28.6, -9.0, df=3.0)
house(K, 'S2', S2, C1 - 0.05, C2)
wall_fit(K, S2, C1, step=2.7)
K.rail_outline(S2, C2, skip=lambda x, y: y < -12.5)

CT = (0.0, -29.3)
pedestal(K, 'conning-tower', CT[0], CT[1], C1 - 0.05, C3 - 0.3, 1.7, segs=16, bev=0.08)
K.add(cyl('ct-slits', 1.73, 0.2, at=(CT[0], CT[1], C3 - 1.1), segs=16, mat=M.GLASS, caps=False), 0.0)
collar(K, 'ct-hood', CT[0], CT[1], C3 - 0.75, 1.7, w=0.1, h=0.24, segs=16)

S3 = bullet(3.9, -27.4, -13.0, df=2.8)
house(K, 'S3', S3, C2 - 0.05, C3, lip=0.3)
windows(K, 'nav-windows', [p for p in S3 if p[1] < -19.0], C2 + 1.3, 0.75)
wall_fit(K, S3, C2, step=2.6, skip=lambda x, y: y < -18.5)
for s in (-1, 1):
    w = [(s * 3.9, -24.0), (s * 6.6, -23.4), (s * 6.6, -19.8), (s * 3.9, -19.2)]
    w = w if s > 0 else w[::-1]
    plate(K, 'wing', w, C2 + 0.02, 0.12)
    bulwark(K, 'wing-screen', w, C2, 1.1)
    K.add(tube('wing-strut', (s * 6.3, -21.6, C2 - 0.1), (s * 4.7, -21.6, C1 + 0.4), 0.07, 4, mat=M.PAINT), 0.0)
    K.add(box('pelorus', 0.26, 0.26, 1.25, at=(s * 6.0, -21.6, C2 + 0.62), mat=M.PAINT), 0.0)
    K.lights.append(((s * 3.4, -10.6, C2), (0, 0, s * 70)))
bulwark(K, 'compass-screen', offset_outline(S3, 0.22), C3, 1.15, closed=True)
S4 = bullet(2.6, -25.2, -15.5, df=2.0)
house(K, 'S4', S4, C3 - 0.05, C4, lip=0.25)
windows(K, 'upper-windows', [p for p in S4 if p[1] < -19.5], C3 + 1.3, 0.7)
K.rail_outline(S4, C4, skip=lambda x, y: y > -17.0)
for s in (-1, 1):
    K.add(box('binocular', 0.45, 0.36, 0.36, at=(s * 2.9, -24.6, C3 + 1.3), rot=(0, 0, s * 30), mat=M.PAINT), 0.0)
    K.add(box('binocular-post', 0.1, 0.1, 1.1, at=(s * 2.9, -24.6, C3 + 0.55), mat=M.PAINT), 0.0)
    K.oerlikons.append(((s * 3.1, -15.2, C3), (0, 0, s * 90)))

# directors: a main-battery director on the bridge and one aft; dual-purpose directors on the wings
md = proto_main_director(M, s=0.72, arm=4.4)
pedestal(K, 'dir-base', 0, -21.0, C4 - 0.05, C4 + 0.9, 1.5, segs=12)
ZAD = 10.4
K.extend(copies(md, [((0, -21.0, C4 + 0.9), (0, 0, 0)), ((0, 41.0, ZAD), (0, 0, 180))]))

# tripod foremast with a spotting top
MY = -12.6
K.add(tube('foremast', (0, MY, C2), (0, MY, 35.2), 0.5, 8, r2=0.3, mat=M.PAINT), 0.0)
for s in (-1, 1):
    K.add(tube('foremast-leg', (s * 3.3, -6.4, C1), (s * 0.25, MY + 0.3, 26.0), 0.3, 6, r2=0.24, mat=M.PAINT), 0.0)
    K.add(tube('foremast-tie', (s * 1.7, -9.5, 17.5), (0, MY, 17.8), 0.1, 4, mat=M.PAINT), 0.0)
    K.add(tube('foremast-tie', (s * 1.0, -10.6, 21.8), (0, MY, 22.0), 0.1, 4, mat=M.PAINT), 0.0)
ST = circle(2.3, 0, MY - 0.4, 10, phase=R(18))
plate(K, 'spotting-floor', circle(2.9, 0, MY - 0.4, 10, phase=R(18)), 25.6, 0.14)
house(K, 'spotting-top', ST, 25.6, 28.0, lip=0.3)
windows(K, 'spotting-windows', [p for p in ST if p[1] < MY - 0.2], 26.7, 0.6)
K.rail([(2.85 * math.cos(a), MY - 0.4 + 2.85 * math.sin(a), 25.6) for a in [2 * math.pi * i / 8 for i in range(9)]], spacing=3.0)
for a in (200, 250, 290, 340):
    K.add(tube('top-strut', (2.6 * math.cos(R(a)), MY - 0.4 + 2.6 * math.sin(R(a)), 25.5), (0.4 * math.cos(R(a)), MY + 0.4 * math.sin(R(a)), 23.2), 0.06, 3, mat=M.PAINT), 0.0)
K.add(tube('fore-yard', (-6.0, MY - 0.5, 30.6), (6.0, MY - 0.5, 30.6), 0.11, 5, mat=M.PAINT, caps=True), 0.0)
for s in (-1, 1):
    K.add(tube('yard-brace', (s * 3.8, MY - 0.5, 30.6), (0, MY, 32.4), 0.04, 3, mat=M.PAINT), 0.0)
    K.add(box('yard-lamp', 0.22, 0.22, 0.36, at=(s * 5.7, MY - 0.5, 30.9), mat=M.PAINT), 0.0)
plate(K, 'radar-deck', circle(1.5, 0, MY, 10), 35.2, 0.12)
K.rail([(1.45 * math.cos(a), MY + 1.45 * math.sin(a), 35.2) for a in [2 * math.pi * i / 6 for i in range(7)]], spacing=3.0)
RADAR_AT = (0, MY, 35.25)
K.add(tube('topmast', (0, MY + 1.2, 35.2), (0, MY + 1.35, 41.0), 0.11, 5, r2=0.06, mat=M.PAINT), 0.0)
K.add(tube('top-yard', (-2.2, MY + 1.3, 39.6), (2.2, MY + 1.3, 39.6), 0.05, 4, mat=M.PAINT), 0.0)

# ---------------------------------------------------------------- funnel, boats, searchlights

CAS = octo(3.5, -7.5, 8.6, f=(2.6, 1.0), b=(2.6, 1.0))
house(K, 'casing', CAS, C1 - 0.05, C1 + 1.9)
wall_fit(K, CAS, C1, step=2.8, zport=1.1, doors=False)
F1 = funnel(K, 'funnel', 0, 0.2, C1 + 1.7, 22.4, 2.4, 4.9, rake=9.0, cap=1.5, taper=0.88, segs=22)
marker('smoke.1', (F1[0], F1[1], F1[2] + 0.3))
zs = 15.2
yy = 0.2 + (zs - C1 - 1.7) * math.tan(R(9.0))
for s in (-1, 1):
    w = [(s * 1.9, yy - 2.2), (s * 4.6, yy - 1.6), (s * 4.6, yy + 1.6), (s * 1.9, yy + 2.2)]
    w = w if s > 0 else w[::-1]
    plate(K, 'sl-platform', w, zs, 0.12)
    bulwark(K, 'sl-screen', w, zs, 0.95)
    K.lights.append(((s * 3.6, yy, zs), (0, 0, s * 90)))
    K.add(tube('sl-strut', (s * 4.3, yy, zs - 0.12), (s * 2.4, yy, zs - 2.4), 0.07, 4, mat=M.PAINT), 0.0)

boats = []
for s in (-1, 1):
    boats.append(((s * 4.85, -1.4, C1 + 0.02), (0, 0, 0)))
    for y in (-3.6, 1.0):
        K.add(tube('davit', (s * 5.85, y, C1), (s * 5.85, y, C1 + 2.7), 0.09, 5, mat=M.PAINT), 0.0)
        K.add(tube('davit-arm', (s * 5.85, y, C1 + 2.7), (s * 4.85, y, C1 + 3.1), 0.08, 5, mat=M.PAINT), 0.0)
        K.add(tube('davit-fall', (s * 4.85, y, C1 + 3.1), (s * 4.85, y, C1 + 1.5), 0.03, 3, mat=M.IRON), 0.0)
K.extend(copies(proto_boat(M, L=8.6, B=2.4, Hh=1.2), boats))

# ---------------------------------------------------------------- catapult, seaplane, crane, torpedo tubes

CAT = (0.0, 20.6, dk(20.6) + 1.2)
pedestal(K, 'catapult-base', CAT[0], CAT[1], FD - 0.3, CAT[2], 2.4, segs=16, bev=0.06)
plate(K, 'catapult-walk', circle(3.3, CAT[0], CAT[1], 14), CAT[2] - 0.5, 0.1)
K.rail([(3.25 * math.cos(a), CAT[1] + 3.25 * math.sin(a), CAT[2] - 0.5) for a in [2 * math.pi * i / 10 for i in range(11)]], spacing=3.0)
cat = proto_catapult(M, 15.0)
xform(cat, at=CAT, rot=(0, 0, -14.0))
K.parts.append(cat)
plane = proto_floatplane(M, span=10.4)
xform(plane, at=tuple(Vector(CAT) + rz((0, -0.6, 2.73), -14.0)), rot=(0, 0, -14.0))
K.parts.append(plane)
crane(K, 'aircraft-crane', (0, 28.2, dk(28.2)), 10.0, 9.5, yaw=0.0, lift=40.0, r=0.42)


def proto_tubes(M):
    """A triple torpedo tube mount, tubes along y, base at z = 0."""
    parts = [hard(cyl('tt-base', 1.3, 0.4, at=(0, 0, 0.2), segs=10, mat=M.PAINT), 0.03),
             hard(box('tt-cradle', 2.5, 1.6, 0.3, at=(0, 0, 0.55), mat=M.PAINT), 0.0),
             hard(box('tt-shield', 2.3, 1.5, 1.0, at=(0, 2.2, 1.35), mat=M.PAINT), 0.08)]
    for x in (-0.8, 0.0, 0.8):
        parts.append(soft(cyl('tt-tube', 0.33, 7.0, at=(x, 0, 1.0), rot=(90, 0, 0), segs=8, mat=M.PAINT)))
        parts.append(soft(cyl('tt-collar', 0.37, 0.3, at=(x, -3.2, 1.0), rot=(90, 0, 0), segs=8, mat=M.PAINT, caps=False)))
        parts.append(soft(cyl('tt-collar', 0.37, 0.3, at=(x, -0.6, 1.0), rot=(90, 0, 0), segs=8, mat=M.PAINT, caps=False)))
    return join('tubes', parts)


K.extend(copies(proto_tubes(M), [((s * 7.5, y, dk(y, 7.5) - 0.02), (0, 0, 0)) for s in (-1, 1) for y in (16.0, 24.8)]))

# ---------------------------------------------------------------- after superstructure (on the quarterdeck)

A1 = octo(5.4, YB - 0.1, 50.0, b=(3.6, 3.0))
ZA1 = 5.75
house(K, 'A1', A1, QD - 0.2, ZA1)
wall_fit(K, A1, QD + 0.05, step=2.8, skip=lambda x, y: y < YB + 1.0 or (abs(x) > 5.0 and (abs(y - 36.5) < 2.3 or abs(y - 46.0) < 2.3)))
K.rail_outline(A1, ZA1, skip=lambda x, y: y < YB + 0.5 or (abs(x) > 4.5 and (abs(y - 36.5) < 2.4 or abs(y - 46.0) < 2.4)))
A2 = octo(3.7, 32.0, 44.5, f=(2.8, 1.0), b=(2.6, 1.5))
ZA2 = 8.3
house(K, 'A2', A2, ZA1 - 0.05, ZA2)
wall_fit(K, A2, ZA1, step=2.7)
K.rail_outline(A2, ZA2)
pedestal(K, 'aft-dir-tower', 0, 41.0, ZA2 - 0.05, ZAD, 1.5, segs=12)
NY = 34.2
K.add(tube('mainmast', (0, NY, ZA2), (0, NY, 31.0), 0.4, 8, r2=0.16, mat=M.PAINT), 0.0)
for s in (-1, 1):
    K.add(tube('mainmast-leg', (s * 2.2, 37.6, ZA2), (s * 0.12, NY + 0.2, 21.5), 0.2, 6, r2=0.16, mat=M.PAINT), 0.0)
plate(K, 'main-top', circle(1.3, 0, NY, 10), 21.8, 0.12)
bulwark(K, 'main-top-screen', circle(1.3, 0, NY, 10), 21.8, 0.9, closed=True)
K.add(tube('main-yard', (-4.6, NY + 0.4, 25.4), (4.6, NY + 0.4, 25.4), 0.09, 5, mat=M.PAINT, caps=True), 0.0)
K.add(tube('main-yard-2', (-2.0, NY + 0.25, 29.2), (2.0, NY + 0.25, 29.2), 0.05, 4, mat=M.PAINT), 0.0)
K.add(tube('gaff', (0, NY + 0.25, 26.6), (0, NY + 4.2, 28.8), 0.06, 4, mat=M.PAINT), 0.0)
for s in (-1, 1):
    K.lights.append(((s * 2.6, 34.0, ZA2), (0, 0, s * 110)))
    K.ladders.append(((s * 2.0, 52.25, QD + 0.1), (0, 0, 180)))
    K.ladders.append(((s * 1.6, 46.8, ZA1), (0, 0, 180)))
    K.ladders.append(((s * 4.0, -30.8, dk(-30.8, 4.0)), (0, 0, 0)))
    for y in (33.0, 40.0):
        K.rafts.append(((s * 3.78, y, ZA1 + 1.3), (90, 0, s * 90)))
    for y in (-22.0, 5.5):
        K.rafts.append(((s * 6.08, y, FD + 1.4), (90, 0, s * 90)))
    for x, y, z in ((5.0, -11.0, C1), (3.8, -11.0, C2), (4.4, 31.5, ZA1), (2.6, 47.6, ZA1), (2.9, 36.5, ZA2)):
        K.vents.append(((s * x, y, z), (0, 0, 0)))
    for x, y, z in ((5.2, -20.5, C1), (5.0, 5.5, C1), (4.6, 42.0, ZA1)):
        K.lockers.append(((s * x, y, z), (0, 0, 90)))

# ---------------------------------------------------------------- light AA tubs

AA = []
for s in (1, -1):
    AA.append((s * 6.5, -31.6, dk(-31.6, 6.5), 0.0))
    AA.append((s * 3.5, 10.2, C1, s * 90.0))
    AA.append((s * 5.4, 74.0, dk(74.0, 5.4), 180.0))
for x, y, z, yaw in AA:
    tub(K, 'aa-tub', x, y, z, r=1.85, h=1.0, floor=False)
    K.lockers.append(((x * 1.0, y + 2.7, z), (0, 0, 90)))

# ---------------------------------------------------------------- the fixed mesh

K.finish_fittings()
K.tally()
hull = K.join_all('hull')
tag(hull, 'none')
for e in [o for o in bpy.context.scene.objects if o.type == 'EMPTY' and o.name.startswith('smoke')]:
    parent(e, hull)

# ---------------------------------------------------------------- main battery

MAIN = dict(wf=2.75, wm=3.45, wr=2.5, yf=-4.3, ys=-1.6, yq=2.2, yr=4.7, hs=1.75, ht=2.2, z0=0.25, sl=0.5, ring=3.25, scale=0.65,
            bores=(-1.75, 0.0, 1.75), ty=-2.6, tz=1.12, bore=0.1, segs=12,
            barrel=[(0.34, 0.9), (0.34, 3.5), (0.3, 3.6), (0.26, 5.6), (0.21, 8.0), (0.175, 10.3), (0.2, 10.38), (0.2, 10.6)])
t0, g0, trun, muz = build_main_turret(M, K, MAIN)
tag(t0, 'yaw', speed=0.35, min=-145, max=145)
t0['texel'] = g0['texel'] = 1.5        # the main battery is what the camera goes to: more of the atlas
tag(g0, 'pitch', min=-3, max=35, recoil=0.8)
for nm in ('A', 'B', 'C'):
    yaw = 180.0 if nm == 'C' else 0.0
    t, g = place_mount(t0, g0, 'turret.main.' + nm, 'guns.main.' + nm, TUR[nm], yaw, trun)
    parent(t, hull)
    for i, m in enumerate(muz):
        muzzle_marker(f'muzzle.{nm}{i + 1}', m, TUR[nm], yaw, g, 'naval')
drop_protos(t0, g0)

# ---------------------------------------------------------------- secondary battery

t0, g0, trun, muz = build_sec_mount(M, dict(scale=0.8, barrel=5.6, calibre=0.13))
tag(t0, 'yaw', speed=0.8)
tag(g0, 'pitch', min=-5, max=75, recoil=0.3)
for nm, at, yaw, s in SEC:
    t, g = place_mount(t0, g0, 'turret.sec.' + nm, 'guns.sec.' + nm, at, yaw, trun)
    outboard_ccw = (s > 0) == (yaw == 0.0)
    t['min'], t['max'] = (-8, 168) if outboard_ccw else (-168, 8)
    parent(t, hull)
    for i, m in enumerate(muz):
        muzzle_marker(f'muzzle.sec.{nm}.{i + 1}', m, at, yaw, g, 'naval')
drop_protos(t0, g0)

# ---------------------------------------------------------------- anti-aircraft

t0, g0, trun, mz = build_aa(M, pairs=1)
tag(t0, 'yaw', aims='air', speed=1.6)
tag(g0, 'pitch', min=0, max=85, recoil=0.08)
for i, (x, y, z, yaw) in enumerate(AA):
    t, g = place_mount(t0, g0, f'aa.{i + 1}', f'aa.guns.{i + 1}', (x, y, z + 0.02), yaw, trun)
    parent(t, hull)
    muzzle_marker(f'muzzle.aa.{i + 1}', mz, (x, y, z + 0.02), yaw, g, 'flak')
drop_protos(t0, g0)

# ---------------------------------------------------------------- radar, markings

radar = build_radar(M, w=3.8, h=2.8)
radar.location = RADAR_AT
tag(radar, 'radar', rpm=6)
parent(radar, hull)

fy = -72.6
slope = D2(math.atan2(dk(fy + 4.5) - dk(fy - 4.5), 9.0))
decal('flag-deck', 9.0, 6.0, (0, fy, dk(fy) + 0.05), rot=(slope, 0, 90), par=hull, kind='flag')

count_all()
finish('cruiser', size=4096, tint=(0.2, 0.225, 0.25),
       views=ship_views(((-35, 14, 0.72), (-148, 20, 0.72), (-90, 6, 0.85), (-25, 10, 0.35), (-90, 5, 0.42), (200, 16, 0.4))))

focus_previews('cruiser', (
    ('all', (-10, -95, -6.5), (10, 95, 41), ((-35, 14, 0.72), (-90, 5, 0.82), (148, 20, 0.72), (0, 75, 1.0))),
    ('bow', (-10, -96, 0), (10, -45, 12), ((-40, 18, 0.8), (-90, 8, 0.8), (25, 40, 0.8))),
    ('mid', (-10, -32, 0), (10, 32, 40), ((-60, 15, 0.7), (-125, 25, 0.7), (-90, 4, 0.7), (0, 65, 0.7))),
    ('aft', (-10, 25, 0), (10, 96, 12), ((-140, 20, 0.8), (-90, 8, 0.8), (180, 35, 0.8))),
    ('under', (-10, -95, -7), (10, 95, 6), ((-35, -12, 1.0), (-150, -14, 0.5), (-90, -2, 1.0)), False),
))
