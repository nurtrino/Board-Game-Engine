# Fast battleship, about 1940. 250 m, three triple turrets (two forward, one aft), a tall tower
# bridge, two raked funnels, twin dual-purpose mounts along the sides, catapults on the quarterdeck.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _ships_capital import *

reset()
M = materials()
K = Kit(M)


def sheer(u):
    return 5.5 + 2.0 * max(0.0, 1 - u / 0.5) ** 2 + 0.3 * max(0.0, (u - 0.86) / 0.14) ** 2


H = Hull(250.0, 33.0, 9.5, sheer, rake=8.5, stem=1.6)
K.parts.append(H.build(M))
K.parts.append(H.strake(M, -0.6, 0.02, 0.975, w=0.12, h=0.2))
K.parts.append(H.strake(M, -3.0, 0.27, 0.76, w=0.16, h=0.3))
dk = H.deck

Z1, Z2, Z3, Z4, Z5 = 8.4, 11.1, 13.8, 16.5, 19.2
ZB = 5.2                                     # deckhouses start a little under the deck surface

# ---------------------------------------------------------------- hull side and underwater

portholes_hull(K, H, -110, 114, 4.0, -1.55)
portholes_hull(K, H, -102, -64, 4.0, -4.0)
portholes_hull(K, H, 58, 106, 4.0, -3.7)
anchor_gear(K, H, -112.5, -2.5, -99.0, 2.7, -95.6)
screws(K, [(4.0, 106.0, -6.6), (9.0, 97.0, -6.0)], [(3.6, 108.5, 114.5, -2.3, -8.7), (-3.6, 108.5, 114.5, -2.3, -8.7)])
K.add(prism('skeg', [(62, -9.45), (101, -9.2), (105, -3.0), (66, -8.6)], -0.35, 0.35, M.RED), 0.1)
for s in (-1, 1):
    K.add(box('bilge-keel', 1.3, 44, 0.14, at=(s * 15.35, 2, -7.8), rot=(0, s * 45, 0), mat=M.RED), 0.0)

# ---------------------------------------------------------------- main deck: rails and fittings

port = H.edge_run(-123.5, 124.0, inset=0.3)
K.rail(port)
K.rail([(-p.x, p.y, p.z) for p in port])

K.add(tube('jackstaff', (0, -123.6, dk(-123.6)), (0, -123.9, dk(-123.6) + 4.2), 0.06, 4, mat=M.PAINT), 0.0)
K.add(tube('ensign-staff', (0, 123.6, dk(123.6)), (0, 124.6, dk(123.6) + 5.0), 0.06, 4, mat=M.PAINT), 0.0)
K.add(lathe_o('bullnose', [(0.5, 0.0), (0.6, 0.3), (0.35, 0.5), (0.3, 0.2)], segs=8, mat=M.PAINT, at=(0, -123.2, dk(-123.2) - 0.05)), 0.0)

for y in (-115.5, -103, -77, -50, 2, 57, 86, 110):
    for s in (-1, 1):
        x = H.half(y) - 1.25
        K.bollards.append(((s * x, y, dk(y, x)), (0, 0, 0)))
        x = H.half(y + 3.0) - 0.5
        K.chocks.append(((s * x, y + 3.0, dk(y + 3.0, x)), (0, 0, 0)))
for s in (-1, 1):
    K.chocks.append(((s * 1.0, -121.5, dk(-121.5)), (0, 0, s * 20)))
    K.chocks.append(((s * 3.2, 122.4, dk(122.4)), (0, 0, s * 60)))

# breakwater on the foredeck, with stays behind it
BW = [(-10.2, -80.0), (-5.0, -84.2), (0.0, -86.0), (5.0, -84.2), (10.2, -80.0)]
bulwark(K, 'breakwater', BW, lambda x, y: dk(y, x) - 0.06, 1.5, t=0.1)
for a, b in zip(BW, BW[1:]):
    for t in (0.15, 0.5, 0.85):
        x, y = lerp(a[0], b[0], t), lerp(a[1], b[1], t)
        K.add(tube('bw-stay', (x, y + 0.05, dk(y, x) + 1.35), (x, y + 1.3, dk(y, x)), 0.06, 3, mat=M.PAINT), 0.0)

for x, y in ((0, -74), (-5.5, -71), (5.5, -71), (0, -104), (-6.5, 80), (6.5, 80), (0, 84), (0, 99), (-4.5, 58), (4.5, 58), (-11, -47), (11, -47)):
    K.hatches.append(((x, y, dk(y, x) - 0.03), (0, 0, 0)))
for x, y in ((7.6, -67), (7.6, -53), (8.6, -43), (8.6, -31), (5.0, -92.5), (8.2, 59), (8.2, 73), (3.0, 90), (6, 112), (2.5, -109), (11.5, 62)):
    for s in (-1, 1):
        K.vents.append(((s * x, y, dk(y, x) - 0.03), (0, 0, 0)))
for x, y, r in ((12.2, -40, 90), (13.2, -8, 0), (13.6, 22, 0), (11.8, 60, 90), (9.5, 100, 0), (6.0, -96, 90)):
    for s in (-1, 1):
        K.reels.append(((s * x, y, dk(y, x) - 0.02), (0, 0, r)))
# single 20 mm guns along the deck edge
for y in (-76, -72, -68, 76, 80, 84, 88, 114, 117):
    for s in (-1, 1):
        x = H.half(y) - 1.6
        K.oerlikons.append(((s * x, y, dk(y, x) - 0.02), (0, 0, s * 70 if y < 0 else s * 110)))
# boat booms stowed along the sides amidships
for s in (-1, 1):
    K.add(tube('boom', (s * 15.4, -44, dk(-44, 15.4) + 0.45), (s * 15.9, -31, dk(-31, 15.9) + 0.45), 0.13, 5, r2=0.08, mat=M.TARP, caps=True), 0.0)
    K.add(tube('boom', (s * 15.9, 57, dk(57, 15.9) + 0.45), (s * 14.2, 70, dk(70, 14.2) + 0.45), 0.13, 5, r2=0.08, mat=M.TARP, caps=True), 0.0)

# ---------------------------------------------------------------- barbettes

TUR = {}
for nm, y, hgt in (('A', -60.0, 1.3), ('B', -36.0, 4.8), ('C', 66.0, 1.3)):
    zt = dk(y) + hgt
    pedestal(K, 'barbette', 0, y, 5.0, zt, 5.9, segs=28, bev=0.1)
    collar(K, 'barbette-rim', 0, y, zt - 0.4, 5.9, segs=28)
    TUR[nm] = (0.0, y, zt)
# the tall B barbette: a walkway half way up, ladder, doors
yb = TUR['B'][1]
zb = dk(yb) + 2.5
plate(K, 'b-walk', circle(7.0, 0, yb, 20), zb, 0.12)
K.rail([(7.0 * math.cos(a), yb + 7.0 * math.sin(a) * 0.985, zb) for a in [math.pi * (1.02 + 0.96 * i / 14) for i in range(15)]], spacing=2.2)
for a in (20, 160, 200, 340, 250, 290):
    K.gussets.append(((6.0 * math.cos(R(a)), yb + 6.0 * math.sin(R(a)), zb - 0.12), (0, 0, a + 90)))
K.vladders.append(((0, yb - 5.92, dk(yb)), (0, 0, 0)))
K.doors.append(((5.9 * math.sin(R(50)), yb - 5.9 * math.cos(R(50)), dk(yb) + 0.1), (0, 0, 50)))
K.doors.append(((-5.9 * math.sin(R(50)), yb - 5.9 * math.cos(R(50)), dk(yb) + 0.1), (0, 0, -50)))

# ---------------------------------------------------------------- superstructure

SEC_Y = (-15.0, -4.0, 7.0, 18.0, 29.0)
SEC = []
for i, y in enumerate(SEC_Y):
    high = i % 2 == 1
    for s in (1, -1):
        x = 9.3 if high else 10.5
        z = Z2 + 0.3 if high else Z1 + 0.9
        pedestal(K, 'sec-base', s * x, y, Z1 - 0.1, z, 2.5 if high else 2.3, segs=16)
        if high:
            collar(K, 'sec-base-rim', s * x, y, z - 0.35, 2.5, segs=16)
        SEC.append((('P' if s > 0 else 'S') + str(i + 1), (s * x, y, z), 0.0 if i < 3 else 180.0, s))


def near_sec(x, y, r=3.0):
    return any(abs(abs(x) - abs(p[1][0])) < r and abs(y - p[1][1]) < r for p in SEC)


L1 = octo(13.4, -29.5, 54.0, f=(6.5, 8.0), b=(8.0, 6.0))
house(K, 'L1', L1, ZB, Z1)
wall_fit(K, L1, 5.5, step=3.6)
K.rail_outline(L1, Z1)

L2 = octo(7.2, -27.5, 31.0, f=(4.2, 6.0))
house(K, 'L2', L2, Z1 - 0.05, Z2)
wall_fit(K, L2, Z1, step=3.4, skip=lambda x, y: near_sec(x, y, 3.2) and abs(x) > 6.5)
K.rail_outline(L2, Z2, skip=lambda x, y: any(p[1][2] > Z2 and abs(y - p[1][1]) < 3.0 for p in SEC) and abs(x) > 6.0)
L2A = octo(5.2, 30.0, 48.5, b=(3.6, 2.5))
house(K, 'L2-aft', L2A, Z1 - 0.05, Z2)
wall_fit(K, L2A, Z1, step=3.0, skip=lambda x, y: y < 31.5)
K.rail_outline(L2A, Z2, skip=lambda x, y: y < 31.5)

# conning tower and the bridge decks behind it
CT = (0.0, -24.6)
pedestal(K, 'conning-tower', CT[0], CT[1], Z2 - 0.05, 18.3, 2.5, segs=20, bev=0.12)
K.add(cyl('ct-slits', 2.53, 0.24, at=(CT[0], CT[1], 17.35), segs=20, mat=M.GLASS, caps=False), 0.0)
collar(K, 'ct-hood', CT[0], CT[1], 17.75, 2.5, w=0.14, h=0.3, segs=20)
collar(K, 'ct-band', CT[0], CT[1], 14.2, 2.5, w=0.07, h=0.2, segs=20)

L3 = bullet(5.6, -22.6, 11.6, df=3.0)
house(K, 'L3', L3, Z2 - 0.05, Z3)
wall_fit(K, L3, Z2, step=3.0)
K.rail_outline(L3, Z3, skip=lambda x, y: y < -5.0)

L4 = bullet(4.7, -21.4, -6.4, df=3.0)
house(K, 'L4', L4, Z3 - 0.05, Z4, lip=0.3)
windows(K, 'nav-windows', [p for p in L4 if p[1] < -13.5], Z3 + 1.35, 0.8)
wall_fit(K, L4, Z3, step=2.6, skip=lambda x, y: y < -13.0)
# bridge wings
for s in (-1, 1):
    w = [(s * 4.6, -18.2), (s * 8.4, -17.4), (s * 8.4, -13.2), (s * 4.6, -12.4)]
    w = w if s > 0 else w[::-1]
    plate(K, 'wing', w, Z3 + 0.02, 0.14)
    bulwark(K, 'wing-screen', w, Z3, 1.15)
    K.add(tube('wing-strut', (s * 8.0, -15.3, Z3 - 0.1), (s * 5.7, -15.3, Z2 + 0.4), 0.09, 4, mat=M.PAINT), 0.0)
    K.add(box('pelorus', 0.3, 0.3, 1.3, at=(s * 7.6, -15.3, Z3 + 0.65), mat=M.PAINT), 0.0)
    K.lights.append(((s * 6.6, -9.0, Z3), (0, 0, s * 60)))

bulwark(K, 'L4-screen', offset_outline(L4, 0.22), Z4, 1.15, closed=True)
L5 = bullet(3.9, -20.4, -8.0, df=2.6)
house(K, 'L5', L5, Z4 - 0.05, Z5, lip=0.3)
windows(K, 'adm-windows', [p for p in L5 if p[1] < -13.0], Z4 + 1.35, 0.75)
bulwark(K, 'L5-screen', offset_outline(L5, 0.22), Z5, 1.1, closed=True)

# the tower trunk and its platforms
T0 = octo(3.0, -19.0, -9.0, f=(2.0, 1.0), b=(2.0, 1.0))
T1 = octo(2.5, -18.3, -9.7, f=(1.7, 0.8), b=(1.7, 0.8))
ZT = 32.0
tower(K, 'trunk', [(T0, Z5 - 0.05), (T1, ZT)], bev=0.07, cap=False)
for z in (21.0, 24.2, 27.4, 30.4):
    f = (z - Z5) / (ZT - Z5)
    for s in (-1, 1):
        K.ports.append(((s * (lerp(3.0, 2.5, f) + 0.01), -14.0, z), rot_to((s, 0, 0))))
        K.ports.append(((s * (lerp(3.0, 2.5, f) + 0.01), -11.6, z), rot_to((s, 0, 0))))


def platform(name, outline, z, screen=1.1, struts=True):
    plate(K, name, outline, z, 0.14)
    if screen:
        bulwark(K, name + '-screen', offset_outline(outline, -0.02), z, screen, closed=True)
    if struts:
        for p in outline[::3]:
            if abs(p[0]) > 2.6 or p[1] < -19.5:
                d = Vector((p[0], p[1] + 14.0, 0.0))
                d.normalize()
                K.add(tube(name + '-strut', (p[0] - d.x * 0.3, p[1] - d.y * 0.3, z - 0.14), (d.x * 2.7, -14.0 + d.y * 4.6, z - 2.3), 0.07, 3, mat=M.PAINT), 0.0)


P1 = bullet(4.9, -22.6, -7.4, df=3.4)
platform('P1', P1, 22.4)
for s in (-1, 1):
    K.lights.append(((s * 3.9, -9.4, 22.4), (0, 0, s * 110)))
    K.add(box('binocular', 0.5, 0.4, 0.4, at=(s * 3.2, -20.0, 22.4 + 1.3), rot=(0, 0, s * 30), mat=M.PAINT), 0.0)
    K.add(box('binocular-post', 0.12, 0.12, 1.1, at=(s * 3.2, -20.0, 22.4 + 0.55), mat=M.PAINT), 0.0)
P2 = bullet(4.1, -21.4, -8.4, df=3.0)
platform('P2', P2, 25.7)
P3 = bullet(4.3, -21.8, -9.0, df=3.0)
platform('P3', P3, 29.0)
P3W = octo(6.9, -17.0, -11.4, f=(6.0, 1.3), b=(6.0, 1.3))
platform('P3-wings', P3W, 29.02, struts=False)
for s in (-1, 1):
    K.add(tube('P3-strut', (s * 6.5, -14.2, 28.9), (s * 2.8, -14.2, 26.2), 0.09, 4, mat=M.PAINT), 0.0)
    K.oerlikons.append(((s * 5.9, -14.2, 29.02), (0, 0, s * 90)))

TOP = bullet(3.4, -21.0, -9.6, df=2.6)
house(K, 'top', TOP, 30.9, 34.4, lip=0.35)
windows(K, 'top-windows', [p for p in TOP if p[1] < -12.5], 32.7, 0.8)
wall_fit(K, TOP, 31.0, step=2.4, zport=1.3, doors=False, skip=lambda x, y: y < -12.0)
K.rail_outline(offset_outline(TOP, 0.3), 34.4)
K.vladders.append(((0, -9.0 + 0.0, Z5), (0, 0, 180)))
K.vladders.append(((0, -9.2, Z5 + 2.7), (0, 0, 180)))
K.vladders.append(((0, -9.4, Z5 + 5.4), (0, 0, 180)))

# directors: main battery on the tower top and aft; dual-purpose forward, each side, and aft
md = proto_main_director(M)
ZAD = 19.6
K.extend(copies(md, [((0, -15.3, 34.4), (0, 0, 0)), ((0, 38.5, ZAD), (0, 0, 180))]))
pedestal(K, 'side-dir-tower', 6.5, -0.6, Z2, 17.0, 1.45, segs=12)
pedestal(K, 'side-dir-tower', -6.5, -0.6, Z2, 17.0, 1.45, segs=12)
pedestal(K, 'aft-dir-low', 0, 44.6, Z3 - 0.05, 15.4, 1.45, segs=12)
K.extend(copies(proto_director(M), [((0, CT[1], 18.3), (0, 0, 0)), ((6.5, -0.6, 17.0), (0, 0, 0)), ((-6.5, -0.6, 17.0), (0, 0, 0)), ((0, 44.6, 15.4), (0, 0, 180))]))
for s in (-1, 1):
    plate(K, 'side-dir-walk', circle(2.3, s * 6.5, -0.6, 12), 15.6, 0.1)
    bulwark(K, 'side-dir-screen', circle(2.3, s * 6.5, -0.6, 12), 15.6, 0.9, closed=True)

# foremast: a pole stepped on the tower with two legs raked aft, a yard, the radar platform
MY = -8.9
K.add(tube('foremast', (0, MY, 28.5), (0, MY, 45.8), 0.55, 8, r2=0.34, mat=M.PAINT), 0.0)
for s in (-1, 1):
    K.add(tube('foremast-leg', (s * 2.9, -3.4, Z3), (s * 0.2, MY + 0.3, 40.0), 0.3, 6, r2=0.24, mat=M.PAINT), 0.0)
    K.add(tube('foremast-tie', (s * 1.9, -5.3, 26.0), (0, MY, 26.5), 0.12, 4, mat=M.PAINT), 0.0)
plate(K, 'fore-top', circle(1.7, 0, MY, 10), 40.6, 0.12)
bulwark(K, 'fore-top-screen', circle(1.7, 0, MY, 10), 40.6, 1.0, closed=True)
K.add(tube('fore-yard', (-7.0, MY - 0.5, 42.4), (7.0, MY - 0.5, 42.4), 0.13, 5, mat=M.PAINT, caps=True), 0.0)
for s in (-1, 1):
    K.add(tube('yard-brace', (s * 4.5, MY - 0.5, 42.4), (0, MY, 44.4), 0.04, 3, mat=M.PAINT), 0.0)
    K.add(box('yard-lamp', 0.25, 0.25, 0.4, at=(s * 6.6, MY - 0.5, 42.75), mat=M.PAINT), 0.0)
plate(K, 'radar-deck', circle(1.9, 0, MY, 10), 45.8, 0.14)
K.rail([(1.85 * math.cos(a), MY + 1.85 * math.sin(a), 45.8) for a in [2 * math.pi * i / 8 for i in range(9)]], spacing=3.0)
RADAR_AT = (0, MY, 45.85)
K.add(tube('topmast', (0, MY + 1.5, 45.8), (0, MY + 1.7, 53.0), 0.14, 5, r2=0.08, mat=M.PAINT), 0.0)
K.add(tube('top-yard', (-2.8, MY + 1.65, 51.2), (2.8, MY + 1.65, 51.2), 0.06, 4, mat=M.PAINT), 0.0)

# funnels
F1 = funnel(K, 'funnel-1', 0, 3.0, Z3 - 0.3, 28.0, 3.3, 4.9, rake=9.0, taper=0.86)
CAS = octo(4.6, 17.4, 30.6, f=(3.4, 1.2), b=(3.4, 1.2))
house(K, 'casing', CAS, Z2 - 0.05, 13.3)
wall_fit(K, CAS, Z2, step=3.0)
F2 = funnel(K, 'funnel-2', 0, 23.0, 13.1, 26.6, 3.1, 4.6, rake=9.0, taper=0.86)
marker('smoke.1', (F1[0], F1[1], F1[2] + 0.3))
marker('smoke.2', (F2[0], F2[1], F2[2] + 0.3))
# searchlight platforms on the funnels
for cy, z, fz0 in ((3.0, 20.5, Z3 - 0.3), (23.0, 19.5, 13.1)):
    yy = cy + (z - fz0) * math.tan(R(9.0))
    for s in (-1, 1):
        w = [(s * 2.4, yy - 2.0), (s * 5.5, yy - 1.5), (s * 5.5, yy + 1.5), (s * 2.4, yy + 2.0)]
        w = w if s > 0 else w[::-1]
        plate(K, 'sl-platform', w, z, 0.12)
        bulwark(K, 'sl-screen', w, z, 1.0)
        K.lights.append(((s * 4.4, yy, z), (0, 0, s * 90)))
        K.add(tube('sl-strut', (s * 5.2, yy, z - 0.12), (s * 2.9, yy, z - 2.6), 0.08, 4, mat=M.PAINT), 0.0)

# light AA between the funnels on raised tubs
AA = []
for s in (1, -1):
    pedestal(K, 'aa-tower', s * 6.0, 13.3, Z2 - 0.05, Z3 - 0.1, 1.7, segs=10, r2=2.2)
    AA.append((s * 6.0, 13.3, Z3, s * 90.0))
    AA.append((s * 8.9, -24.0, Z1, 0.0))
    AA.append((s * 8.6, 50.6, Z1, 180.0))
    AA.append((s * 9.3, 92.0, dk(92.0, 9.3), 180.0))
for i, (x, y, z, yaw) in enumerate(AA):
    tub(K, 'aa-tub', x, y, z, r=2.35, h=1.05, floor=z > Z2)
    K.lockers.append(((x + math.copysign(0.4, x), y + (3.2 if y < 20 else -3.2), z if z < Z3 else Z2), (0, 0, 90)))

# aft superstructure
L3A = octo(3.9, 34.0, 47.0, f=(3.0, 1.0), b=(2.8, 1.5))
house(K, 'L3-aft', L3A, Z2 - 0.05, Z3)
wall_fit(K, L3A, Z2, step=2.8)
K.rail_outline(L3A, Z3)
pedestal(K, 'aft-dir-tower', 0, 38.5, Z3 - 0.05, ZAD, 2.1, segs=16, bev=0.08)
plate(K, 'aft-dir-walk', circle(3.3, 0, 38.5, 14), 17.0, 0.12)
bulwark(K, 'aft-dir-screen', circle(3.3, 0, 38.5, 14), 17.0, 1.0, closed=True)
for a in range(0, 360, 60):
    K.gussets.append(((2.1 * math.cos(R(a)), 38.5 + 2.1 * math.sin(R(a)), 16.88), (0, 0, a + 90)))

# mainmast
NY = 32.3
K.add(tube('mainmast', (0, NY, Z2), (0, NY, 41.5), 0.5, 8, r2=0.2, mat=M.PAINT), 0.0)
for s in (-1, 1):
    K.add(tube('mainmast-leg', (s * 2.6, 28.4, 13.3), (s * 0.15, NY - 0.2, 31.0), 0.26, 6, r2=0.2, mat=M.PAINT), 0.0)
plate(K, 'main-top', circle(1.5, 0, NY, 10), 29.0, 0.12)
bulwark(K, 'main-top-screen', circle(1.5, 0, NY, 10), 29.0, 0.95, closed=True)
K.add(tube('main-yard', (-5.6, NY + 0.45, 34.2), (5.6, NY + 0.45, 34.2), 0.11, 5, mat=M.PAINT, caps=True), 0.0)
K.add(tube('main-yard-2', (-2.6, NY + 0.3, 39.0), (2.6, NY + 0.3, 39.0), 0.06, 4, mat=M.PAINT), 0.0)
K.add(tube('gaff', (0, NY + 0.3, 36.0), (0, NY + 5.0, 38.6), 0.07, 4, mat=M.PAINT), 0.0)

# boats on the 01 level abreast the after superstructure, with their cranes
boats = []
for s in (-1, 1):
    boats.append(((s * 7.3, 40.4, Z1 + 0.02), (0, 0, 0)))
    boats.append(((s * 10.7, 40.6, Z1 + 0.02), (0, 0, 0)))
    crane(K, 'boat-crane', (s * 6.4, 48.0, Z1), 8.6, 10.0, yaw=s * 12.0, lift=38.0)
K.extend(copies(proto_boat(M), boats))

# rafts: leaning on the superstructure sides, stacked on the quarterdeck
for s in (-1, 1):
    for y in (-21.0, 23.5, 26.8):
        K.rafts.append(((s * 7.28, y, Z1 + 1.35), (90, 0, s * 90)))
    for y in (36.5, 40.0, 43.5):
        K.rafts.append(((s * 5.28, y, Z1 + 1.35), (90, 0, s * 90)))
    for y in (-16.5, -13.0):
        K.rafts.append(((s * 5.68, y, Z2 + 1.3), (90, 0, s * 90)))
    for k in range(3):
        K.rafts.append(((s * 10.5, 78.5, dk(78.5, 10.5) + 0.05 + k * 0.36), (0, 0, 90)))

# ladders between the decks
for s in (-1, 1):
    K.ladders.append(((s * 5.0, -31.9, dk(-31.9, 5.0)), (0, 0, 0)))
    K.ladders.append(((s * 6.5, 56.3, dk(56.3, 6.5)), (0, 0, 180)))
    K.ladders.append(((s * 2.2, 50.8, Z1), (0, 0, 180)))
    K.ladders.append(((s * 4.9, -3.9, Z3), (0, 0, 180)))
    K.vladders.append(((s * 3.9, 41.5, Z2), (0, 0, s * 90)))

# vents and lockers on the superstructure decks
for s in (-1, 1):
    for x, y, z in ((11.6, -9.5, Z1), (11.6, 1.5, Z1), (11.6, 12.5, Z1), (5.9, -20.0, Z2), (6.2, 8.0, Z2), (6.2, 27.5, Z2), (4.0, 31.5, Z2), (3.0, 45.0, Z3), (4.6, 9.5, Z3)):
        K.vents.append(((s * x, y, z), (0, 0, 0)))
    for x, y, z in ((12.3, -20.5, Z1), (12.3, 34.0, Z1), (6.0, -10.0, Z2), (6.4, 4.0, Z2), (4.4, 46.2, Z2)):
        K.lockers.append(((s * x, y, z), (0, 0, 90)))
    for y in (-10.5, 12.0):
        K.oerlikons.append(((s * 12.4, y + 1.0, Z1), (0, 0, s * 90)))

# ---------------------------------------------------------------- quarterdeck: catapults, plane, crane

cats = []
for s in (-1, 1):
    cats.append(((s * 7.0, 105.0, dk(105.0, 7.0) - 0.02), (0, 0, s * -8.0)))
K.extend(copies(proto_catapult(M, 20.0), cats))
plane = proto_floatplane(M)
xform(plane, at=tuple(Vector(cats[1][0]) + rz((0, 1.5, 2.73), -8.0)), rot=(0, 0, 172.0))
K.parts.append(plane)
crane(K, 'stern-crane', (0, 119.4, dk(119.4)), 8.0, 10.5, yaw=0.0, lift=42.0, r=0.36)

# ---------------------------------------------------------------- the fixed mesh

K.finish_fittings()
K.tally()
hull = K.join_all('hull')
tag(hull, 'none')
for e in [o for o in bpy.context.scene.objects if o.type == 'EMPTY' and o.name.startswith('smoke')]:
    parent(e, hull)

# ---------------------------------------------------------------- main battery

MAIN = dict(wf=4.5, wm=5.6, wr=3.9, yf=-6.6, ys=-2.4, yq=3.4, yr=7.3, hs=2.5, ht=3.1, z0=0.3, sl=0.5, ring=5.3,
            bores=(-2.95, 0.0, 2.95), ty=-4.0, tz=1.55, bore=0.2, segs=12,
            barrel=[(0.62, 1.4), (0.62, 5.6), (0.56, 5.75), (0.5, 8.0), (0.42, 11.5), (0.355, 15.15), (0.4, 15.25), (0.4, 15.55)])
t0, g0, trun, muz = build_main_turret(M, K, MAIN)
tag(t0, 'yaw', speed=0.22, min=-145, max=145)
t0['texel'] = g0['texel'] = 1.5        # the main battery is what the camera goes to: more of the atlas
tag(g0, 'pitch', min=-3, max=35, recoil=1.3)
for nm in ('A', 'B', 'C'):
    yaw = 180.0 if nm == 'C' else 0.0
    t, g = place_mount(t0, g0, 'turret.main.' + nm, 'guns.main.' + nm, TUR[nm], yaw, trun)
    parent(t, hull)
    for i, m in enumerate(muz):
        muzzle_marker(f'muzzle.{nm}{i + 1}', m, TUR[nm], yaw, g, 'naval')
drop_protos(t0, g0)

# ---------------------------------------------------------------- secondary battery

t0, g0, trun, muz = build_sec_mount(M, dict())
tag(t0, 'yaw', speed=0.8)
tag(g0, 'pitch', min=-5, max=75, recoil=0.3)
for nm, at, yaw, s in SEC:
    t, g = place_mount(t0, g0, 'turret.sec.' + nm, 'guns.sec.' + nm, at, yaw, trun)
    # a mount never trains across the ship: positive is anticlockwise seen from above
    outboard_ccw = (s > 0) == (yaw == 0.0)
    t['min'], t['max'] = (-8, 168) if outboard_ccw else (-168, 8)
    parent(t, hull)
    for i, m in enumerate(muz):
        muzzle_marker(f'muzzle.sec.{nm}.{i + 1}', m, at, yaw, g, 'naval')
drop_protos(t0, g0)

# ---------------------------------------------------------------- anti-aircraft

t0, g0, trun, mz = build_aa(M, pairs=2)
tag(t0, 'yaw', aims='air', speed=1.6)
tag(g0, 'pitch', min=0, max=85, recoil=0.08)
for i, (x, y, z, yaw) in enumerate(AA):
    t, g = place_mount(t0, g0, f'aa.{i + 1}', f'aa.guns.{i + 1}', (x, y, z + 0.02), yaw, trun)
    parent(t, hull)
    muzzle_marker(f'muzzle.aa.{i + 1}', mz, (x, y, z + 0.02), yaw, g, 'flak')
drop_protos(t0, g0)

# ---------------------------------------------------------------- radar, markings

radar = build_radar(M)
radar.location = RADAR_AT
tag(radar, 'radar', rpm=6)
parent(radar, hull)

fy = -90.2
slope = D2(math.atan2(dk(fy + 3.0) - dk(fy - 3.0), 6.0))
decal('flag-deck', 9.0, 6.0, (0, fy, dk(fy) + 0.05), rot=(slope, 0, 0), par=hull, kind='flag')

count_all()
finish('battleship', size=4096, tint=(0.2, 0.225, 0.25),
       views=ship_views(((-35, 14, 0.72), (-148, 20, 0.72), (-90, 6, 0.85), (-25, 10, 0.35), (-90, 5, 0.42), (200, 16, 0.4))))

focus_previews('battleship', (
    ('all', (-16.5, -125, -9.5), (16.5, 125, 51), ((-35, 14, 0.72), (-90, 5, 0.82), (148, 20, 0.72), (0, 75, 1.0))),
    ('bow', (-16, -126, 0), (16, -70, 14), ((-40, 18, 0.8), (-90, 8, 0.8), (25, 40, 0.8))),
    ('fwd', (-16, -75, 0), (16, -20, 22), ((-50, 20, 0.8), (-90, 6, 0.8))),
    ('mid', (-16, -30, 0), (16, 55, 50), ((-60, 15, 0.7), (-125, 25, 0.7), (-90, 4, 0.7), (0, 65, 0.7))),
    ('aft', (-16, 50, 0), (16, 126, 14), ((-140, 20, 0.8), (-90, 8, 0.8), (180, 35, 0.8))),
    ('under', (-17, -125, -10), (17, 125, 8), ((-35, -12, 1.0), (-150, -14, 0.5), (-90, -2, 1.0), (-20, -10, 0.4)), False),
))
