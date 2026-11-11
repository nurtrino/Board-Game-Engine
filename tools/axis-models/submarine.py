# Fleet submarine on the surface. The round outer hull and its saddle tanks sit mostly under water;
# a free-flooding casing with a slatted deck stands above it, a raked knife bow, a deck gun forward
# of the conning tower fairwater, periscope shears, and a railed gun platform abaft the bridge.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _ships_small import *

reset()
M = ship_mats()
P = M.PAINT
DARK = plain('bottom', (0.03, 0.028, 0.03), rough=0.72, dirt=0.25, vary=0.18, bump=0.4)
SLATS = wood('slats', colour=(0.14, 0.115, 0.088), plank=0.1, length=3.6, dirt=0.8)
S = []


def add(*obs):
    S.extend(obs)
    return obs[0]


def count(label):
    print(f'   .. {label}: {tris(S)} static triangles so far')


# ---------------------------------------------------------------- hull

WLZ = 0.22          # where the dark bottom paint stops


class SubHull(Hull):
    """Outer hull and casing as one skin: a round bottom up to the widest point, a shoulder (the tank
    tops) rolling in to the foot of the casing, then the casing side up to the deck edge."""

    def __init__(self, ys, deck_z, keel_z, beam, casing, n_low=6, n_mid=3):
        self.ys, self.deck, self.keel, self.beam, self.casing = ys, deck_z, keel_z, beam, casing
        self.n_low, self.n_mid = n_low, n_mid

    def edge(self, y):
        return self.casing(y)

    def levels(self, y):
        zk, zd = self.keel(y), self.deck(y)
        zj = min(max(0.65, zk + 0.55 * (zd - zk)), zd - 0.4)
        zc = max(-1.5, zk + 0.5 * (zj - zk))
        return zk, zc, zj, zd

    def half(self, y, z):
        zk, zc, zj, zd = self.levels(y)
        a, c = self.beam(y), self.casing(y)
        cf = min(c + 0.18, a * 0.97)
        if z <= zk + 1e-6:
            return 0.0
        if z <= zc:
            p = 2.3 if y > -30 else 2.3 - 0.7 * min(1.0, (-30 - y) / 14.0)
            r = (zc - z) / (zc - zk)
            return a * (1.0 - r ** p) ** (1.0 / p)
        if z <= zj:
            u = (z - zc) / (zj - zc)
            return cf + (a - cf) * math.sqrt(max(0.0, 1.0 - u * u))
        k = min(1.0, (z - zj) / max(1e-6, zd - zj))
        return cf + (c - cf) * k

    def rows(self, y, collapse=False):
        zk, zc, zj, zd = self.levels(y)
        zb = min(max(WLZ, zk), zj)
        zs = [zk + (zb - zk) * (j / self.n_low) ** 1.8 for j in range(self.n_low + 1)]
        zs += [zb + (zj - zb) * j / self.n_mid for j in range(1, self.n_mid + 1)]
        zs.append(zd)
        pts = [(0.0 if collapse else self.half(y, z), y, z) for z in zs]
        pts[0] = (0.0, y, zs[0])
        return pts

    def build(self, name, dark, paint_, deck):
        st = [(self.ys[0], True)] + [(y, False) for y in self.ys] + [(self.ys[-1], True)]
        rings = []
        for y, col in st:
            r = self.rows(y, col)
            m = len(r)
            rings.append([r[0]] + r[1:] + [(0.0, y, self.deck(y))] + [(-x, yy, z) for x, yy, z in reversed(r[1:])])
        ob = loft(name, rings, cap_start=False, cap_end=False)
        n, nl = 2 * m, self.n_low

        def pick(fi):
            j = fi % n
            if j >= m:
                j = n - 1 - j
            return 0 if j < nl else 2 if j == m - 1 else 1
        face_mats(ob, (dark, paint_, deck), pick)
        weld(ob, 1e-4)
        outward(ob)
        return split_rings(shade(ob, 38), (-15, 15))


deck_z = curve([(-47.5, 3.7), (-44, 3.2), (-38, 2.55), (-30, 2.1), (-20, 1.85), (20, 1.8), (32, 1.6), (40, 1.2), (45, 0.9), (47.5, 0.75)])
keel_z = curve([(-47.5, 3.0), (-46.7, 1.4), (-45.7, 0.0), (-44.6, -1.6), (-43.2, -3.0), (-41, -4.1), (-37.5, -4.75), (-32, -4.9), (24, -4.9), (32, -4.2),
                (38, -3.0), (43, -1.6), (46, -0.7), (47.5, -0.3)])
beam = curve([(-47.5, 0.05), (-45.5, 0.5), (-42, 1.15), (-37, 2.0), (-30, 3.0), (-22, 3.75), (-12, 4.08), (-4, 4.1), (10, 4.1), (20, 3.85), (28, 3.2),
              (35, 2.3), (41, 1.4), (45, 0.75), (47.5, 0.3)])
casing = curve([(-47.5, 0.05), (-45, 0.5), (-41, 0.95), (-35, 1.4), (-27, 1.8), (-18, 2.08), (-8, 2.2), (8, 2.2), (18, 2.0), (28, 1.6), (36, 1.15),
                (42, 0.75), (46, 0.45), (47.5, 0.25)])
YS = [-47.5, -47.1, -46.6, -45.9, -45.0, -43.8, -42.2, -40, -37, -33, -28, -22, -15, -8, 0, 8, 15, 21, 26, 31, 35, 38.5, 41.5, 44, 45.8, 46.9, 47.5]
H = SubHull(YS, deck_z, keel_z, beam, casing)
add(H.build('shell', DARK, P, SLATS))
dz = H.deck

# keel, flood openings under the tanks, limber holes along the casing
for ky in (-25.0, -5.0, 15.0):
    add(bx(0.5, 20.0, 0.3, (0, ky, -4.95), DARK, w=0.05, name='keel'))
slot = fix_normals(mesh_obj('slot', [(0, -0.3, 0), (0, -0.19, 0.1), (0, 0.19, 0.1), (0, 0.3, 0), (0, 0.19, -0.1), (0, -0.19, -0.1)], [(0, 1, 2, 3, 4, 5)], M.SOOT))
if slot.data.polygons[0].normal.x < 0:
    slot.data.flip_normals()
holes = [H.side(y, H.levels(y)[2] + 0.3, s, out=0.006) for s in (1, -1) for y in frange(-41.0, 41.0, 0.95)]
holes += [(H.side(y, -4.1, s, out=0.006)[0], H.side(y, -4.1, s)[1], (1, 1.5, 1.6)) for s in (1, -1) for y in frange(-27, 23, 2.5)]
holes += [(H.side(y, dz(y) - 0.22, s, out=0.006)[0], H.side(y, dz(y) - 0.22, s)[1], (1, 0.45, 0.7)) for s in (1, -1) for y in frange(-36.0, 36.0, 2.85)]
add(*stamp(slot, holes))
count('hull')

# ---------------------------------------------------------------- bow

shutter = loft('shutter', [superellipse(1.25, 0.4, 2.6, 12, at=(x, 0, 0), plane='yz') for x in (-0.03, 0.045)], cap_start=False, mat=M.GUN)
shutter = join('shutter', [shade(shutter, 40), bx(0.02, 2.2, 0.05, (0.05, 0, 0), M.SOOT)])
TUBES = [(-42.7, -1.35, 1), (-42.7, -1.35, -1), (-41.5, -2.65, 1), (-41.5, -2.65, -1)]
add(*stamp(shutter, [H.side(y, z, s, out=0.0) for y, z, s in TUBES] + [(H.side(42.6, -0.75, s)[0], H.side(42.6, -0.75, s)[1], (1, 0.8, 0.8)) for s in (1, -1)]))
torps = [(s * (H.half(y - 1.5, z) + 0.15), y - 1.5, z) for y, z, s in TUBES]
# bow planes folded up against the casing, with their housings
for s in (-1, 1):
    x = H.half(-39.3, 1.6)
    add(bx(0.1, 2.9, 1.7, (s * (x + 0.22), -39.3, 1.75), P, rot=(0, s * -7, 0), w=0.03, name='bow-plane'))
    add(bx(0.5, 1.5, 0.5, (s * (x + 0.08), -39.3, 0.85), P, w=0.1), cy(0.16, 0.5, (s * (x + 0.2), -39.3, 0.88), M.STEEL, rot=(0, 90, 0), segs=6))
add(*stamp(anchor(M), [(H.side(-36.5, 1.05, -1, out=0.03)[0], (0, 0, 180), (0.62, 0.62, 0.62))]))
add(cy(0.2, 0.28, (0, -47.0, dz(-47.0) + 0.14), M.STEEL, rot=(90, 0, 0), segs=8), bx(0.3, 0.5, 0.12, (0, -46.4, dz(-46.4) + 0.06), M.STEEL))
add(cy(0.07, 0.5, (0, -42.8, dz(-42.8) + 0.25), M.STEEL, segs=5), cy(0.07, 1.1, (0, -42.8, dz(-42.8) + 0.55), M.STEEL, rot=(0, 90, 0), segs=5))
add(xform(capstan(M, 0.3, 0.55), at=(0, -37.5, dz(-37.5))))
add(bx(1.0, 2.6, 0.16, (0, -31.0, dz(-31.0) + 0.06), P, w=0.03), bx(0.7, 0.9, 0.3, (0, -31.4, dz(-31.4) + 0.2), P, rot=(8, 0, 0), w=0.04))
add(cy(0.48, 0.34, (0, -24.5, dz(-24.5) + 0.17), P, segs=10, w=0.03), bx(0.26, 0.26, 0.05, (0, -24.5, dz(-24.5) + 0.37), M.STEEL, rot=(0, 0, 45)))
add(cy(0.55, 0.06, (0, -21.0, dz(-21.0) + 0.03), M.CANVAS, segs=10))
count('bow')

# ---------------------------------------------------------------- deck gun

mount, gun, mtr, mmz = open_gun(M, length=4.7, bore=0.1)
tag(mount, 'yaw', speed=0.6)
tag(gun, 'pitch', min=-5, max=40, recoil=0.3)
GY = -15.6
add(cy(1.95, 0.14, (0, GY, dz(GY) + 0.05), P, segs=14, w=0.03), cy(0.8, 0.3, (0, GY, dz(GY) + 0.2), P, segs=10, w=0.03))
mount_set(mount, gun, [((0, GY, dz(GY) + 0.34), 0)], muzzles=[mmz], kind='naval', mname='muzzle')

# ---------------------------------------------------------------- conning tower fairwater

DK = dz(0)
CG = 3.55            # the gun platforms and the ledge round the bridge
BR = 4.6             # bridge deck
TOP = 5.9            # top of the bridge fairing
FWD = sym([(-9.7, 0.2), (-9.3, 0.75), (-8.4, 1.2), (-6.9, 1.5), (-2.4, 1.56)])
AFT = sym([(-2.4, 1.5), (2.2, 1.42), (4.6, 1.05), (6.0, 0.5), (6.4, 0.15)])
UPR = sym([(-9.25, 0.2), (-8.85, 0.66), (-8.0, 1.05), (-6.7, 1.3), (-2.4, 1.36)])
add(slab(FWD, DK - 0.1, CG, P, w=0.05, name='fairwater'))
add(slab(AFT, DK - 0.1, CG - 0.08, P, w=0.05, name='fairwater-aft'))
add(slab(UPR, CG, BR, P, w=0.04, name='bridge'))
add(slab(offset(UPR, -0.07), BR, BR + 0.02, SLATS))
add(wall([(x, y, BR - 0.02) for x, y in UPR], TOP - BR, 0.06, P, closed=True, w=0.015, name='bridge-fairing'))
for z in (DK + 1.0, CG + 0.52):
    add(wall([(x, y, z) for x, y in offset(FWD if z < CG else UPR, 0.025)], 0.06, 0.03, P, closed=True, name='seam'))
PLAT = sym([(-2.4, 1.75), (2.4, 1.75), (5.0, 1.4), (6.6, 0.8), (7.0, 0.3)])
add(slab(PLAT, CG - 0.08, CG, P, w=0.02, name='gun-platform'), slab(offset(PLAT, -0.08), CG, CG + 0.02, SLATS))
FPL = sym([(-13.1, 0.45), (-12.7, 1.05), (-11.6, 1.45), (-9.0, 1.62)])
add(slab(FPL, 3.02, 3.1, P, w=0.02, name='fore-platform'), slab(offset(FPL, -0.08), 3.1, 3.12, SLATS))
add(slab(sym([(-12.2, 0.35), (-11.7, 0.85), (-9.6, 1.15)]), DK - 0.1, 3.02, P, w=0.05, name='fore-platform-base'))
add(*stamp(bx(0.05, 0.42, 0.26, mat=M.GLASS, name='bridge-port'), edge_places(UPR, BR + 0.9, step=0.72, out=0.005, pick=lambda x, y, ln: y < -7.4)))
add(*stamp(bx(0.3, 0.6, 0.05, mat=P, name='venturi'), edge_places(UPR, TOP, step=0.9, out=0.1, pick=lambda x, y, ln: y < -6.0)))
holes2 = edge_places(FWD, DK + 0.26, step=1.0, out=0.006, pick=lambda x, y, ln: y > -9.2) + edge_places(AFT, DK + 0.26, step=1.0, out=0.006, pick=lambda x, y, ln: y > -2.3)
holes2 += [(p_, r_, (1, 0.5, 0.6)) for p_, r_ in edge_places(FWD, CG - 0.5, step=1.5, out=0.006, pick=lambda x, y, ln: y > -8.5)]
add(*stamp(panel(M.SOOT, 0.5, 0.24), holes2))
add(*stamp(door(M, 0.6, 1.5), [((1.53, -5.4, DK - 0.1), (0, 0, 0)), ((-1.53, -5.4, DK - 0.1), (0, 0, 180))]))
add(*stamp(bx(0.06, 0.34, 0.035, mat=M.STEEL, name='rung'), [((s * 1.55, -3.2, DK + 0.4 + i * 0.36), (0, 0, 0)) for s in (-1, 1) for i in range(5)]))
for s in (-1, 1):
    add(bx(0.1, 0.22, 0.14, (s * 1.12, -8.1, TOP - 0.5), M.GLASS))
    add(bx(0.5, 0.3, 0.35, (s * 1.05, -2.9, BR + 0.2), P, w=0.03))
# periscope shears, periscopes and masts
SH = sym([(-6.9, 0.22), (-6.4, 0.46), (-4.2, 0.46), (-3.6, 0.22)])
add(slab(SH, BR, 7.3, P, w=0.05, name='shears'))
add(*stamp(bx(0.07, 0.07, 7.3 - TOP, mat=P, name='shear-rib'), [((s * 0.48, y, (7.3 + TOP) / 2), (0, 0, 0)) for s in (-1, 1) for y in (-6.1, -5.3, -4.5)]))
add(bx(0.2, 2.2, 0.12, (0, -5.3, 7.36), P), bx(1.5, 0.12, 0.12, (0, -5.9, 6.7), P), bx(1.5, 0.12, 0.12, (0, -4.6, 6.7), P))
for s in (-1, 1):
    add(tube([(s * 0.75, -5.9, 6.7), (s * 1.15, -5.6, 6.7), (s * 1.15, -4.9, 6.7), (s * 0.75, -4.6, 6.7)], 0.035, P, segs=4, name='lookout-ring'))
    add(tube([(s * 0.75, -5.9, 7.6), (s * 1.15, -5.6, 7.6), (s * 1.15, -4.9, 7.6), (s * 0.75, -4.6, 7.6)], 0.035, P, segs=4, name='lookout-rail'))
    add(bx(0.035, 0.035, 0.9, (s * 1.15, -5.25, 7.15), P), bx(0.6, 0.7, 0.04, (s * 0.85, -5.25, 6.68), P))
add(tube([(0, -5.9, 7.3), (0, -5.9, 8.4), (0, -5.9, 10.0)], 0.1, P, segs=6, radii=[0.13, 0.11, 0.06], name='periscope'), cy(0.075, 0.3, (0, -5.9, 10.05), M.GUN, segs=6))
add(tube([(0, -4.7, 7.3), (0, -4.7, 8.2), (0, -4.7, 9.4)], 0.12, P, segs=6, radii=[0.15, 0.13, 0.09], name='periscope'), cy(0.11, 0.3, (0, -4.7, 9.45), M.GUN, segs=6))
add(tube([(0, -7.6, BR), (0, -7.6, 8.5)], 0.09, P, segs=6, name='radar-mast'))
add(lat([(0.0, 0.0), (0.3, 0.05), (0.52, 0.22)], at=(0, -7.6, 8.6), mat=P, rot=(60, 0, 0), segs=8), bx(0.3, 0.3, 0.3, (0, -7.6, 8.5), P, w=0.04))
add(tube([(0, -3.2, BR), (0, -3.2, 9.0)], 0.06, P, segs=5, name='sd-mast'), bx(1.1, 0.05, 0.05, (0, -3.2, 8.9), P), bx(0.05, 0.05, 0.5, (0.5, -3.2, 8.9), P), bx(0.05, 0.05, 0.5, (-0.5, -3.2, 8.9), P))
add(cy(0.13, 0.9, (0.5, -8.0, BR + 0.45), P, segs=6), bx(0.34, 0.26, 0.2, (0.5, -8.0, BR + 1.0), M.GUN, w=0.03))
add(cy(0.16, 1.0, (-0.45, -7.0, BR + 0.5), M.STEEL, segs=6), cy(0.2, 0.18, (-0.45, -7.0, BR + 1.05), M.BRONZE, segs=8))
add(cy(0.38, 0.2, (0, -3.6, BR + 0.1), P, segs=8, w=0.03))
add(cy(0.13, 0.9, (0, 5.2, CG + 0.45), P, segs=6), bx(0.34, 0.26, 0.2, (0, 5.2, CG + 1.0), M.GUN, w=0.03))
add(tube([(0.0, -3.9, 7.3), (0.0, -3.9, 7.75), (0.32, -3.9, 8.05), (0.0, -3.9, 8.35), (-0.32, -3.9, 8.05), (0.0, -3.9, 7.75)], 0.03, P, segs=4, name='df-loop'))
# light AA guns on the platforms before and abaft the bridge
st20, st20g, _, _ = oerlikon(M, 'o', 'og')
st20g.location = (0, 0, 0)
bpy.context.view_layer.update()
o20 = join('oerlikon', [st20, xform(st20g, at=(0, 0, 1.36), rot=(-30, 0, 0))])
add(*stamp(o20, [((0, 1.9, CG + 0.02), (0, 0, 180)), ((0, -11.3, 3.12), (0, 0, 0))]))
add(*stamp(locker(M, 0.5, 0.4, 0.5), [((s * 1.2, -1.6, CG + 0.02), (0, 0, 0)) for s in (-1, 1)]))
add(ladder(M, (0.9, 7.7, DK), (0.9, 6.6, CG)))
count('tower')

# ---------------------------------------------------------------- after deck and stern

for y, r_ in ((9.5, 0.5), (15.5, 0.5), (28.5, 0.46)):
    add(cy(r_, 0.3, (0, y, dz(y) + 0.15), P, segs=10, w=0.03), bx(0.26, 0.26, 0.05, (0, y, dz(y) + 0.33), M.STEEL, rot=(0, 0, 45)))
add(bx(1.0, 2.6, 0.16, (0, 22.0, dz(22.0) + 0.06), P, w=0.03), bx(0.7, 0.9, 0.3, (0, 22.4, dz(22.4) + 0.2), P, rot=(-8, 0, 0), w=0.04))
add(xform(capstan(M, 0.28, 0.5), at=(0, 37.0, dz(37.0))))
add(cy(0.55, 0.06, (0, 33.0, dz(33.0) + 0.03), M.CANVAS, segs=10))
cleat = join('cleat', [bx(0.14, 0.22, 0.16, (0, 0, 0.08), M.STEEL), bx(0.1, 0.7, 0.09, (0, 0, 0.2), M.STEEL)])
add(*stamp(cleat, [((s * (H.edge(y) - 0.3), y, dz(y)), (0, 0, 0)) for s in (-1, 1) for y in (-40.5, -27.0, -12.0, 12.0, 26.0, 39.0)]))
# diesel exhausts on the casing side
EXH = (17.5, 1.25)
for s in (-1, 1):
    p_, r_ = H.side(EXH[0], EXH[1], s, out=0.0)
    add(*stamp(cy(0.2, 0.2, rot=(0, 90, 0), segs=8, mat=M.SOOT, w=0.03, name='exhaust-port'), [(p_, r_)]))
# stern planes, rudder, shafts, screws, guards
add(both(hard(fix_normals(mesh_obj('stern-plane', [(0.4, 41.2, -1.75), (3.3, 42.4, -1.75), (3.3, 44.6, -1.75), (0.3, 45.0, -1.75), (0.4, 41.2, -1.95), (3.3, 42.4, -1.95), (3.3, 44.6, -1.95), (0.3, 45.0, -1.95)],
                       [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], DARK)), 0.04)))
add(hard(prism('rudder', [(44.4, -0.6), (47.1, -0.5), (47.0, -3.5), (44.9, -3.8)], -0.1, 0.1, mat=DARK), 0.05))
add(bx(0.16, 0.5, 2.0, (0, 44.3, -2.6), DARK))
for s in (-1, 1):
    add(tube([(s * 1.35, 31.0, -2.75), (s * 2.0, 40.6, -2.75)], 0.1, M.STEEL, segs=6, name='shaft'))
    add(bx(0.08, 0.4, 1.3, (s * 1.75, 39.6, -2.2), DARK, rot=(0, s * -30, 0)), cy(0.18, 0.7, (s * 1.97, 39.9, -2.75), DARK, rot=(90, 0, 0), segs=6))
    e = H.edge(40.5)
    add(tube([(s * (e - 0.1), 39.2, dz(40) - 0.25), (s * (e + 1.9), 40.0, dz(40) - 0.4), (s * (e + 1.9), 41.2, dz(40) - 0.4), (s * (H.edge(42.2) - 0.1), 42.2, dz(42) - 0.25)], 0.05, P, segs=4, name='guard'))
add(*stamp(propeller(M, 1.1, 4), [((2.0, 41.0, -2.75), (0, 0, 0)), ((-2.0, 41.0, -2.75), (0, 0, 0), (-1, 1, 1))]))
count('stern')

# ---------------------------------------------------------------- rails and aerial wires

rails = Rails(h=0.9, bay=2.6, levels=(0.46, 0.88), post=0.028, wire_r=0.018)
for s in (-1, 1):
    rails.run([(s * (H.edge(y) - 0.12), y, dz(y)) for y in frange(-45.5, 45.0, 5.03)], last=True)
    rails.run([(s * x, y, CG) for x, y in ((1.7, -2.3), (1.7, 2.4), (1.36, 5.0), (0.78, 6.55), (0.25, 7.0))], last=False)
    rails.run([(s * x, y, 3.1) for x, y in ((1.57, -9.1), (1.42, -11.6), (1.02, -12.65), (0.4, -13.05))], last=(s > 0))
add(*rails.build(P))
BOWP, STP = (0, -46.2, dz(-46.2) + 2.0), (0, 45.6, dz(45.6) + 1.7)
add(tube([(0, -46.2, dz(-46.2)), BOWP], 0.04, P, segs=4, name='jackstaff'), tube([(0, 45.6, dz(45.6)), STP], 0.04, P, segs=4, name='stern-staff'))
for s in (-1, 1):
    add(wire(BOWP, (s * 0.5, -6.0, 7.38), 0.02, M.WIRE), wire((s * 0.5, -4.5, 7.38), STP, 0.02, M.WIRE))
    add(bx(0.07, 0.3, 0.07, (s * 0.47, -8.0, 7.2), M.CANVAS, rot=(8, 0, 0)), bx(0.07, 0.3, 0.07, (s * 0.47, -2.5, 7.15), M.CANVAS, rot=(-7, 0, 0)))
count('rails')

for o_ in (mount, gun):
    print(f'   .. {o_.name}: {tris([o_])} triangles each')
hull = join('hull', S)
tag(hull, 'none')
for i, p_ in enumerate(torps):
    marker(f'muzzle.torp.{i + 1}', p_, hull, kind='torpedo')
marker('exhaust', H.side(EXH[0], EXH[1], 1, out=0.15)[0], hull)

lift_for_debug()
even_texels()
finish('submarine', size=2048, tint=(0.12, 0.135, 0.15), views=((-35, 14, 0.55), (150, 22, 0.6), (-90, 6, 0.85), (-25, 10, 0.3), (-50, 8, 0.2)))
