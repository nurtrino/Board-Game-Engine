# Rifleman. A 1.78 m soldier built as rigid parts with rounded joints, so the stage can pose him
# by turning each part about its pivot. He stands at the origin facing -y; his left is +x.
#
# Every limb hangs straight down from its pivot (shoulder, elbow and wrist share one x and y; so do
# hip, knee and ankle), and left and right limbs draw the same mesh, so each limb mesh is symmetric
# about its own pivot in x. No object is rotated or scaled.
#
# What the stage can count on (Blender axes):
#   - every limb segment runs down its own -z from its pivot: turning it about x by a negative angle
#     swings it forward, a positive angle back; the spine and head lean forward with a positive angle
#   - a hand hangs with its fingers along -z, thumb towards -y, palm towards the body
#   - the rifle stands at order arms, butt on the ground, with its pivot at the small of the stock
#     (not in the hand): muzzle +z, sights +y. Turned +90 degrees about x it is level, muzzle to -y,
#     sights up, bolt handle to the right. To shoulder it, move the pivot into the right palm.
#   - the muzzle marker is turned so that its own -y runs out of the barrel
#
#   POSE=aim     a kneeling, aiming pose for checking the joints. Never exports: it only writes
#                build/infantry/preview-pose-N.png (grey with AXM_DRAFT=1, otherwise from the last bake).
#   HELMET=a|b|c which helmet the previews show (all three are always in the model).
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit
from kit import *
import numpy as np

reset()

POSE = os.environ.get('POSE', '')
SHOW = os.environ.get('HELMET', 'a')
DRAFT = os.environ.get('AXM_DRAFT') == '1'

UNIFORM = plain('uniform', (0.5, 0.5, 0.5), rough=0.9, mask=1.0, bump=0.6, fine_scale=180, dirt=0.8, low=(0.0, 0.6))
HELMET = paint('helmet', wear=0.7, dirt=0.5, gloss=0.5, streaks=False)
SKIN = plain('skin', (0.56, 0.35, 0.25), rough=0.62, vary=0.06, dirt=0.45, bump=0.1, fine_scale=120)
LIP = plain('lip', (0.30, 0.15, 0.12), rough=0.6, vary=0.05, dirt=0.2, bump=0.1)
HAIR = plain('hair', (0.045, 0.03, 0.02), rough=0.8, vary=0.2, dirt=0.3, bump=0.5, fine_scale=220)
EYE = plain('eye', (0.012, 0.01, 0.009), rough=0.35, vary=0.0, dirt=0.0, bump=0.0)
LEATHER = plain('leather', (0.085, 0.048, 0.026), rough=0.55, vary=0.18, dirt=0.7, low=(0.0, 0.3), bump=0.3, fine_scale=110)
SOLE = plain('sole', (0.035, 0.026, 0.02), rough=0.8, vary=0.1, dirt=0.9, low=(0.0, 0.2), bump=0.3)
WEB = plain('webbing', (0.36, 0.31, 0.18), rough=0.95, vary=0.14, dirt=0.7, bump=0.6, fine_scale=160)
PACK = plain('pack', (0.29, 0.26, 0.15), rough=0.95, vary=0.18, dirt=0.8, bump=0.6, fine_scale=150)
BLANKET = plain('blanket', (0.20, 0.19, 0.16), rough=0.98, vary=0.2, dirt=0.6, bump=0.7, fine_scale=200)
CANTEEN = plain('canteen', (0.17, 0.19, 0.10), rough=0.9, vary=0.15, dirt=0.6, bump=0.5, fine_scale=160)
WOOD = plain('riflewood', (0.21, 0.105, 0.045), rough=0.48, vary=0.25, dirt=0.4, bump=0.2, fine_scale=60)
GUNMETAL = plain('gunmetal', (0.07, 0.07, 0.075), rough=0.4, metal=0.9, vary=0.08, dirt=0.25, polish=0.5)
BRASS = plain('brass', (0.50, 0.36, 0.13), rough=0.42, metal=0.9, vary=0.1, dirt=0.4)
BUTTON = plain('button', (0.16, 0.13, 0.07), rough=0.5, metal=0.6, vary=0.1, dirt=0.3)

# joints (the soldier's left side; the right side mirrors x)
PELVIS = (0.0, 0.0, 0.95)
WAIST = (0.0, 0.0, 1.08)
NECK = (0.0, 0.016, 1.50)
SHOULDER = (0.200, 0.0, 1.42)
ELBOW = (0.200, 0.0, 1.133)
WRIST = (0.200, 0.0, 0.873)
HIP = (0.090, 0.0, 0.93)
KNEE = (0.090, 0.0, 0.50)
ANKLE = (0.090, 0.0, 0.09)


# ---------------------------------------------------------------- local helpers

def smooth(lo, hi, v):
    t = max(0.0, min(1.0, (v - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def ring(z, a, f, b=None, cx=0.0, cy=0.0, n=10, p=2.0, ph=0.0, zf=None, sf=1.0):
    """A ring in the xy plane at height z: half-width a, depth f to the front (-y) and b to the back.
    zf and sf lift and widen the front of the ring only (a helmet's visor, a collar's opening)."""
    b = f if b is None else b
    pts = []
    for i in range(n):
        t = 2 * math.pi * (i + ph) / n
        c, s = math.cos(t), math.sin(t)
        w = smooth(0.45, 0.85, -s) if (zf is not None or sf != 1.0) else 0.0
        k = 1 + (sf - 1) * w
        x = a * math.copysign(abs(c) ** (2 / p), c) * k
        y = (b if s > 0 else f) * math.copysign(abs(s) ** (2 / p), s) * k
        pts.append((cx + x, cy + y, z if zf is None else z + (zf - z) * w))
    return pts


def dome(zc, a, f, b, cx, cy, n, p, ph, up, steps=(40, 70)):
    """Rings closing a tube end as half an ellipsoid as tall as it is deep, so the joint can turn
    about x without opening. From the equator outwards."""
    rz = (f + b) / 2
    return [ring(zc + up * rz * math.sin(R(e)), a * math.cos(R(e)), f * math.cos(R(e)), b * math.cos(R(e)), cx, cy, n, p, ph) for e in steps]


def limb(name, sec, n, mat, p=2.0, ph=0.5, cx=0.0, top=True, bot=True, angle=55):
    """A limb segment from sections (z, a, f, b, cy), top down, each end closed with a dome centred on it."""
    rings = []
    if top:
        z, a, f, b, cy = sec[0]
        rings += dome(z, a, f, b, cx, cy, n, p, ph, +1)[::-1]
    rings += [ring(z, a, f, b, cx, cy, n, p, ph) for z, a, f, b, cy in sec]
    if bot:
        z, a, f, b, cy = sec[-1]
        rings += dome(z, a, f, b, cx, cy, n, p, ph, -1)
    return soft(loft(name, rings, mat=mat), angle)


def paint_faces(ob, mat, pred):
    """Give the faces whose centre passes pred another material."""
    me = ob.data
    idx = len(me.materials)
    me.materials.append(mat)
    for poly in me.polygons:
        if pred(poly.center):
            poly.material_index = idx
    return ob


class Surf:
    """The skin of a lofted body, from its table of (z, a, f, b, cy): for laying things on it."""
    def __init__(self, table, p):
        self.t, self.p = table, p

    def at(self, z):
        t = self.t
        if z <= t[0][0]:
            return t[0][1:]
        for lo, hi in zip(t, t[1:]):
            if z <= hi[0]:
                k = (z - lo[0]) / (hi[0] - lo[0])
                return tuple(lo[i] + (hi[i] - lo[i]) * k for i in range(1, 5))
        return t[-1][1:]

    def normal(self, z, x, side=-1):
        a, f, b, cy = self.at(z)
        d = f if side < 0 else b
        u = min(abs(x) / a, 0.98)
        v = (1 - u ** self.p) ** (1 / self.p)
        n = Vector((math.copysign(u ** (self.p - 1) / a, x) if u > 0 else 0.0, side * v ** (self.p - 1) / d, 0.0))
        return n.normalized()

    def point(self, z, x, side=-1, off=0.0):
        a, f, b, cy = self.at(z)
        d = f if side < 0 else b
        u = min(abs(x) / a, 0.98)
        y = cy + side * d * (1 - u ** self.p) ** (1 / self.p)
        return Vector((x, y, z)) + self.normal(z, x, side) * off

    def yaw(self, z, x, side=-1):
        """Turn (degrees about z) that faces a box's -y side along the surface normal."""
        n = self.normal(z, x, side)
        return math.degrees(math.atan2(n.x, -n.y))

    def ang(self, z, deg, off=0.0):
        """A point at an angle round the ring, measured from the front centre towards +x."""
        a, f, b, cy = self.at(z)
        t = R(270 + deg)
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / self.p), c)
        return self.point(z, x, -1 if s < 0 else 1, off)


def ribbon(name, pts, width, thick, mat, centre, sink=0.004, close=False, widths=None):
    """A strap along a path. centre (a point, or a function of the path point) is what the strap
    faces away from. With close=False the hidden underside is left out."""
    pts = [Vector(q) for q in pts]
    rings = []
    for i, q in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        out = q - Vector(centre(q) if callable(centre) else centre)
        nrm = (out - out.dot(t) * t).normalized()
        w = nrm.cross(t).normalized() * ((widths[i] if widths else width) / 2)
        rings.append([tuple(q - w - nrm * sink), tuple(q - w + nrm * thick), tuple(q + w + nrm * thick), tuple(q + w - nrm * sink)])
    return shade(loft(name, rings, mat=mat, close=close), 50)


def rod(name, p0, p1, r, segs=6, mat=None, r2=None, caps=True):
    """A cylinder between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    ob = cyl(name, r, d.length, segs=segs, r2=r2, mat=mat, caps=caps)
    ob.data.transform(Matrix.Translation((p0 + p1) / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    ob.data.update()
    return ob


def patch(name, c, w, h, n, mat, up=(0, 0, 1)):
    """A flat panel facing n: eyes, mouth."""
    c, n = Vector(c), Vector(n).normalized()
    u = Vector(up).cross(n).normalized()
    v = n.cross(u)
    ob = mesh_obj(name, [c - u * w / 2 - v * h / 2, c + u * w / 2 - v * h / 2, c + u * w / 2 + v * h / 2, c - u * w / 2 + v * h / 2], [(0, 1, 2, 3)], mat)
    if ob.data.polygons[0].normal.dot(n) < 0:
        ob.data.flip_normals()
    return ob


def stud(name, r, h, mat, n=6):
    """A button: a low cone facing -y."""
    verts = [(0, -h, 0)] + [(r * math.cos(2 * math.pi * i / n), 0, r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    ob = mesh_obj(name, verts, [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)], mat)
    return shade(fix_normals(ob), 30)


def mirrored(name, obs):
    """Left-side parts and their mirror images, as one object."""
    return both(join(name, obs))


# ---------------------------------------------------------------- pelvis: hips, tunic skirt, belt

P_T = [
    (0.838, 0.045, 0.050, 0.055, 0.0),
    (0.846, 0.116, 0.085, 0.095, 0.0),
    (0.856, 0.155, 0.104, 0.114, 0.002),
    (0.858, 0.173, 0.119, 0.128, 0.003),    # tunic hem
    (0.950, 0.170, 0.118, 0.130, 0.004),
    (1.035, 0.146, 0.108, 0.106, 0.001),
    (1.036, 0.152, 0.114, 0.112, 0.0),      # belt
    (1.086, 0.151, 0.114, 0.111, 0.0),
    (1.088, 0.134, 0.100, 0.098, 0.0),
]
PEL = Surf(P_T, 2.3)
bparts = []
hips = soft(loft('hips', [ring(z, a, f, b, 0, cy, 16, 2.3) for z, a, f, b, cy in P_T], mat=UNIFORM), 50)
paint_faces(hips, LEATHER, lambda c: 1.0355 < c.z < 1.0875)
bparts.append(hips)
bparts.append(hard(box('buckle', 0.052, 0.012, 0.042, at=(0, -0.117, 1.061), mat=BRASS), 0.004))
bparts.append(box('buckle-bar', 0.008, 0.016, 0.046, at=(0, -0.117, 1.061), mat=BRASS))
# the tunic's front opening carries on down the skirt
bparts.append(ribbon('skirt-front', [PEL.point(z, 0.0, -1) for z in (1.034, 0.95, 0.860)], 0.034, 0.004, UNIFORM, lambda q: (0, 0.0, q.z)))
# skirt pocket flaps
for s in (-1, 1):
    q = PEL.point(0.966, s * 0.100, -1, 0.001)
    bparts.append(box('skirt-flap', 0.092, 0.010, 0.036, at=tuple(q), rot=(-4, 0, PEL.yaw(0.966, s * 0.100)), mat=UNIFORM))
# belt loops and a bayonet in its scabbard on the left hip
for dg in (118, 242):
    q = PEL.ang(1.061, dg, 0.002)
    bparts.append(box('belt-loop', 0.016, 0.008, 0.058, at=tuple(q), rot=(0, 0, dg), mat=LEATHER))
q = PEL.ang(1.03, 118, 0.012)
yw = 118
bparts.append(box('frog', 0.040, 0.014, 0.115, at=(q.x, q.y, 1.005), rot=(0, 0, yw), mat=LEATHER))
bparts.append(rod('bayonet-grip', (q.x, q.y, 1.06), (q.x, q.y, 1.135), 0.011, 6, WOOD))
bparts.append(box('bayonet-guard', 0.034, 0.012, 0.008, at=(q.x, q.y, 1.062), rot=(0, 0, yw), mat=GUNMETAL))
sc_ = loft('scabbard', [[(q.x + sx * wx, q.y + sy * wy, z) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for z, wx, wy in ((0.95, 0.011, 0.016), (0.70, 0.007, 0.010), (0.685, 0.003, 0.004))], mat=GUNMETAL)
bparts.append(hard(sc_, 0.0))
body = join('body', bparts)

# ---------------------------------------------------------------- legs

thigh = limb('thigh.L', [
    (0.930, 0.082, 0.092, 0.092, 0.000),
    (0.850, 0.083, 0.095, 0.092, 0.000),
    (0.760, 0.080, 0.094, 0.084, -0.003),
    (0.660, 0.074, 0.086, 0.077, -0.004),
    (0.570, 0.068, 0.076, 0.071, -0.003),
    (0.500, 0.065, 0.069, 0.069, 0.000),
], n=10, mat=UNIFORM, cx=HIP[0])

shin_parts = []
shin_t = limb('shin-leg', [
    (0.500, 0.063, 0.0685, 0.0685, 0.000),
    (0.440, 0.062, 0.064, 0.073, 0.003),
    (0.370, 0.063, 0.061, 0.080, 0.007),
    (0.300, 0.067, 0.066, 0.081, 0.007),
    (0.268, 0.070, 0.071, 0.082, 0.006),     # trousers bloused over the gaiter
    (0.252, 0.058, 0.061, 0.069, 0.006),
    (0.248, 0.051, 0.054, 0.061, 0.006),     # gaiter
    (0.170, 0.047, 0.050, 0.056, 0.005),
    (0.104, 0.049, 0.055, 0.058, 0.004),
], n=10, mat=UNIFORM, cx=KNEE[0], bot=False)
paint_faces(shin_t, WEB, lambda c: c.z < 0.2495)
shin_parts.append(shin_t)
for z in (0.218, 0.140):
    a, f, b = (0.0515, 0.055, 0.061) if z > 0.2 else (0.0505, 0.055, 0.059)
    strap = loft('gaiter-strap', [ring(z - 0.008, a, f, b, KNEE[0], 0.005, 10, 2.0, 0.5), ring(z + 0.008, a, f, b, KNEE[0], 0.005, 10, 2.0, 0.5)], cap_start=False, cap_end=False, mat=LEATHER)
    shin_parts.append(shade(strap, 50))
shin = join('shin.L', shin_parts)


def boot_ring(y, a, top, zc=0.040, bot=0.010, n=8, p=2.5):
    pts = []
    for i in range(n):
        t = 2 * math.pi * (i + 0.5) / n
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / p), c)
        z = zc + ((top - zc) if s > 0 else (zc - bot)) * math.copysign(abs(s) ** (2 / p), s)
        pts.append((ANKLE[0] + x, y, z))
    return pts


foot_parts = []
upper = loft('boot', [
    boot_ring(0.079, 0.020, 0.072, 0.042),
    boot_ring(0.068, 0.035, 0.106),
    boot_ring(0.030, 0.042, 0.126),
    boot_ring(-0.030, 0.045, 0.119),
    boot_ring(-0.085, 0.048, 0.084),
    boot_ring(-0.140, 0.051, 0.064),
    boot_ring(-0.186, 0.046, 0.056, 0.034),
    boot_ring(-0.212, 0.026, 0.044, 0.028),
], mat=LEATHER)
foot_parts.append(soft(upper, 55))
foot_parts.append(soft(sphere('ankle', 1.0, at=ANKLE, scale=(0.044, 0.050, 0.050), segs=8, rings=4, mat=LEATHER), 60))


def sole_ring(y, a, zb, zt):
    return [(ANKLE[0] - a, y, zb), (ANKLE[0] + a, y, zb), (ANKLE[0] + a, y, zt), (ANKLE[0] - a, y, zt)]


sole = loft('sole', [
    sole_ring(0.084, 0.024, 0.0, 0.024), sole_ring(0.066, 0.040, 0.0, 0.024), sole_ring(0.008, 0.042, 0.0, 0.022),
    sole_ring(0.006, 0.042, 0.011, 0.020), sole_ring(-0.040, 0.044, 0.008, 0.017), sole_ring(-0.066, 0.049, 0.0, 0.015),
    sole_ring(-0.140, 0.055, 0.0, 0.014), sole_ring(-0.192, 0.049, 0.001, 0.015), sole_ring(-0.218, 0.028, 0.005, 0.017),
], mat=SOLE)
foot_parts.append(shade(sole, 40))
foot = join('foot.L', foot_parts)

# ---------------------------------------------------------------- arms

upperarm = limb('upperarm.L', [
    (1.420, 0.048, 0.050, 0.050, 0.000),
    (1.375, 0.050, 0.055, 0.053, 0.000),
    (1.290, 0.046, 0.051, 0.049, 0.001),
    (1.195, 0.041, 0.044, 0.045, 0.001),
    (1.133, 0.040, 0.042, 0.042, 0.000),
], n=10, mat=UNIFORM, cx=SHOULDER[0])

forearm = limb('forearm.L', [
    (1.133, 0.039, 0.041, 0.041, 0.000),
    (1.080, 0.041, 0.045, 0.043, 0.000),
    (0.990, 0.036, 0.039, 0.038, 0.000),
    (0.930, 0.031, 0.033, 0.033, 0.000),
    (0.927, 0.035, 0.037, 0.037, 0.000),      # cuff
    (0.882, 0.034, 0.036, 0.036, 0.000),
    (0.880, 0.026, 0.029, 0.029, 0.000),
], n=10, mat=UNIFORM, cx=ELBOW[0], bot=False)

# The hand hangs palm-in, fingers together and pointing down, thumb to the front: the same for
# both hands, so one mesh serves. Thin in x, fingers along -z, thumb towards -y.
HX, HZ = WRIST[0], WRIST[2]
hparts = []
palm = loft('palm', [
    ring(HZ + 0.024, 0.012, 0.018, None, HX, 0.0, 8, 3.0, 0.5),
    ring(HZ + 0.008, 0.021, 0.028, None, HX, 0.0, 8, 3.0, 0.5),
    ring(HZ - 0.016, 0.019, 0.031, None, HX, -0.001, 8, 3.0, 0.5),
    ring(HZ - 0.048, 0.016, 0.043, None, HX, -0.004, 8, 3.0, 0.5),
    ring(HZ - 0.086, 0.014, 0.045, None, HX, -0.004, 8, 3.0, 0.5),
], mat=SKIN)
hparts.append(soft(palm, 50))
for yc, wy, ln in ((-0.038, 0.0205, 0.078), (-0.0155, 0.0215, 0.089), (0.0075, 0.0205, 0.081), (0.029, 0.018, 0.063)):
    z0 = HZ - 0.080
    rings = []
    for k, (z, s) in enumerate(((z0, 1.0), (z0 - ln * 0.55, 0.92), (z0 - ln, 0.66))):
        hw, hx = wy / 2 * s, 0.0085 * s
        rings.append([(HX - hx, yc - hw, z), (HX + hx, yc - hw, z), (HX + hx, yc + hw, z), (HX - hx, yc + hw, z)])
    hparts.append(shade(loft('finger', rings, cap_start=False, mat=SKIN), 60))
th = []
for (y, z), (hx, hw) in zip(((-0.026, HZ - 0.026), (-0.052, HZ - 0.056), (-0.060, HZ - 0.086), (-0.059, HZ - 0.104)), ((0.011, 0.016), (0.010, 0.013), (0.008, 0.010), (0.005, 0.006))):
    th.append([(HX - hx, y - hw, z + hw * 0.5), (HX + hx, y - hw, z + hw * 0.5), (HX + hx, y + hw, z - hw * 0.5), (HX - hx, y + hw, z - hw * 0.5)])
hparts.append(shade(loft('thumb', th, cap_start=False, mat=SKIN), 60))
hand = join('hand.L', hparts)

# ---------------------------------------------------------------- torso: tunic and field gear

T_T = [
    (1.030, 0.124, 0.094, 0.092, 0.003),
    (1.086, 0.142, 0.106, 0.102, 0.002),
    (1.125, 0.147, 0.112, 0.105, 0.001),     # tunic bloused over the belt
    (1.200, 0.149, 0.117, 0.108, -0.001),
    (1.290, 0.158, 0.127, 0.114, -0.004),
    (1.360, 0.168, 0.130, 0.120, -0.004),
    (1.410, 0.178, 0.120, 0.122, 0.000),     # shoulders
    (1.442, 0.184, 0.098, 0.112, 0.006),
    (1.460, 0.170, 0.086, 0.102, 0.010),
    (1.480, 0.132, 0.074, 0.090, 0.012),
    (1.512, 0.072, 0.060, 0.070, 0.014),
]
TP = 2.4
TOR = Surf(T_T, TP)
sparts, sleft = [], []       # sleft: left-side pieces that get mirrored
sparts.append(soft(loft('torso', [ring(z, a, f, b, 0, cy, 16, TP) for z, a, f, b, cy in T_T], mat=UNIFORM), 50))
collar = loft('collar', [
    ring(1.490, 0.071, 0.070, 0.071, 0, 0.014, 12, 2.0),
    ring(1.541, 0.064, 0.064, 0.065, 0, 0.016, 12, 2.0, zf=1.522),
    ring(1.541, 0.053, 0.053, 0.054, 0, 0.017, 12, 2.0, zf=1.522),
], mat=UNIFORM)
sparts.append(soft(collar, 50))
# front placket and buttons
sparts.append(ribbon('placket', [TOR.point(z, 0.0, -1) for z in (1.088, 1.125, 1.20, 1.29, 1.36, 1.41, 1.46, 1.506)], 0.032, 0.004, UNIFORM, lambda q: (0, 0.02, min(q.z, 1.30))))
places = []
for z in (1.145, 1.225, 1.305, 1.385, 1.455):
    q = TOR.point(z, 0.0, -1, 0.0035)
    n1, n0 = TOR.point(z + 0.02, 0.0, -1), TOR.point(z - 0.02, 0.0, -1)
    places.append((tuple(q), (-math.degrees(math.atan2(n1.y - n0.y, 0.04)), 0, 0)))
for s in (-1, 1):
    places.append((tuple(TOR.point(1.352, s * 0.090, -1, 0.0055)), (0, 0, TOR.yaw(1.352, s * 0.090))))
    places.append(((s * 0.086, 0.012, 1.513), (-90, s * 27.5, 0)))
sparts += copies(stud('button', 0.0085, 0.004, BUTTON), places)
# breast pockets with buttoned flaps, and shoulder straps
for z, h, w, off in ((1.325, 0.094, 0.084, -0.002), (1.362, 0.034, 0.090, 0.0005)):
    q = TOR.point(z, 0.090, -1, off)
    sleft.append(box('pocket', w, 0.010, h, at=tuple(q), rot=(0, 0, TOR.yaw(z, 0.090)), mat=UNIFORM))
sleft.append(box('epaulette', 0.100, 0.046, 0.007, at=(0.122, 0.012, 1.4895), rot=(0, 27.5, 0), mat=UNIFORM))

# webbing: a strap over each shoulder from the ammunition pouch to the pack


def torso_c(q):
    return (q.x * 0.55, 0.008, min(q.z, 1.40))


sp = []
for z, x in ((1.20, 0.088), (1.29, 0.090), (1.36, 0.094), (1.41, 0.100), (1.455, 0.106)):
    sp.append(TOR.point(z, x, -1, 0.001))
sp.append(TOR.point(1.482, 0.108, -1, 0.001) + Vector((0, 0, 0.005)))
sp.append(TOR.point(1.482, 0.108, 1, 0.001) + Vector((0, 0, 0.005)))
for z, x in ((1.455, 0.106), (1.40, 0.100)):
    sp.append(TOR.point(z, x, 1, 0.001))
sleft.append(ribbon('brace', sp, 0.038, 0.008, WEB, torso_c, sink=0.006))
# ammunition pouch on the front of the belt
q = TOR.point(1.150, 0.090, -1, 0.019)
yw = TOR.yaw(1.150, 0.090)
sleft.append(hard(box('pouch', 0.088, 0.050, 0.118, at=tuple(q), rot=(0, 0, yw), mat=WEB), 0.007))
q = TOR.point(1.186, 0.090, -1, 0.021)
sleft.append(box('pouch-flap', 0.092, 0.054, 0.050, at=tuple(q), rot=(0, 0, yw), mat=WEB))
q = TOR.point(1.150, 0.090, -1, 0.046)
sleft.append(box('pouch-tab', 0.020, 0.006, 0.050, at=tuple(q), rot=(0, 0, yw), mat=WEB))
sparts.append(mirrored('spine-sides', sleft))

# pack, with a rolled blanket on top and the entrenching tool strapped to its back
sparts.append(hard(box('pack', 0.262, 0.132, 0.245, at=(0, 0.150, 1.335), mat=PACK), 0.014))
sparts.append(hard(box('pack-flap', 0.268, 0.020, 0.135, at=(0, 0.212, 1.392), mat=PACK), 0.005))
sparts.append(box('pack-lid', 0.268, 0.142, 0.014, at=(0, 0.150, 1.458), mat=PACK))
for s in (-1, 1):
    sparts.append(box('pack-strap', 0.022, 0.006, 0.20, at=(s * 0.098, 0.224, 1.36), mat=LEATHER))
    sparts.append(box('pack-buckle', 0.030, 0.008, 0.018, at=(s * 0.098, 0.226, 1.30), mat=BRASS))
roll = cyl('blanket', 0.052, 0.36, at=(0, 0.158, 1.512), rot=(0, 90, 0), segs=10, mat=BLANKET)
sparts.append(soft(roll, 50))
for s in (-1, 1):
    sparts.append(shade(cyl('blanket-strap', 0.0545, 0.022, at=(s * 0.105, 0.158, 1.512), rot=(0, 90, 0), segs=10, mat=LEATHER, caps=False), 50))
blade = loft('etool-cover', [[(x, y, z) for x, z in ((-0.066, 1.215), (0.066, 1.215), (0.070, 1.335), (0.032, 1.395), (-0.032, 1.395), (-0.070, 1.335))] for y in (0.216, 0.238)], mat=WEB)
sparts.append(hard(blade, 0.004))
sparts.append(rod('etool-shaft', (0, 0.231, 1.22), (0, 0.226, 1.03), 0.013, 6, WOOD))
sparts.append(rod('etool-grip', (-0.045, 0.226, 1.025), (0.045, 0.226, 1.025), 0.012, 6, WOOD))
# canteen on the right hip, slung from the pack
cq = TOR.point(1.11, -0.105, 1, 0.030)
can = lathe('canteen', [(0.0, 0.0), (0.046, 0.012), (0.053, 0.070), (0.041, 0.125), (0.016, 0.138), (0.016, 0.158), (0.0, 0.158)], segs=8, mat=CANTEEN)
paint_faces(can, GUNMETAL, lambda c: c.z > 0.136)
xform(can, at=(cq.x, cq.y, 1.035), rot=(0, 0, -22), scale=(1, 0.62, 1))
sparts.append(soft(can, 50))
sparts.append(box('canteen-strap', 0.020, 0.008, 0.11, at=(cq.x, cq.y + 0.022, 1.165), rot=(0, 0, -22), mat=WEB))
spine = join('spine', sparts)

# ---------------------------------------------------------------- head

H_T = [
    (1.553, 0.024, 0.024, 0.030, -0.070),
    (1.568, 0.044, 0.050, 0.055, -0.049),
    (1.598, 0.061, 0.088, 0.072, -0.014),
    (1.640, 0.074, 0.102, 0.086, 0.000),
    (1.682, 0.077, 0.100, 0.094, 0.000),
    (1.716, 0.077, 0.101, 0.096, 0.000),
    (1.750, 0.070, 0.090, 0.090, 0.000),
    (1.772, 0.050, 0.062, 0.066, 0.002),
    (1.781, 0.022, 0.028, 0.030, 0.002),
]
HP = 2.3
HEAD = Surf(H_T, HP)
hd, hleft = [], []
skull = soft(loft('skull', [ring(z, a, f, b, 0, cy, 12, HP) for z, a, f, b, cy in H_T], mat=SKIN), 65)
paint_faces(skull, HAIR, lambda c: c.z > 1.742 or (c.y > 0.030 and c.z > 1.585) or (c.y > -0.025 and c.z > 1.700))
hd.append(skull)
neck = loft('neck', [ring(1.470, 0.054, 0.052, 0.054, 0, 0.020, 8, 2.0, 0.5), ring(1.560, 0.049, 0.049, 0.052, 0, 0.018, 8, 2.0, 0.5), ring(1.630, 0.048, 0.048, 0.052, 0, 0.016, 8, 2.0, 0.5)], cap_start=False, cap_end=False, mat=SKIN)
hd.append(soft(neck, 60))
fy = HEAD.point(1.690, 0.0).y
nose = mesh_obj('nose', [(0, fy - 0.001, 1.699), (0, fy - 0.027, 1.648), (0.0165, fy + 0.006, 1.640), (-0.0165, fy + 0.006, 1.640), (0, fy - 0.002, 1.631), (0.009, fy + 0.004, 1.694), (-0.009, fy + 0.004, 1.694)],
                [(0, 5, 1), (0, 1, 6), (5, 2, 1), (6, 1, 3), (1, 2, 4), (1, 4, 3)], SKIN)
hd.append(shade(fix_normals(nose), 80))
hd.append(patch('mouth', HEAD.point(1.6065, 0.0, -1, 0.0015), 0.036, 0.007, (0, -1, 0.1), LIP))
# brows, eyes and ears, mirrored
q = HEAD.point(1.705, 0.035, -1, 0.0005)
hleft.append(box('brow', 0.038, 0.011, 0.009, at=tuple(q), rot=(0, 4, HEAD.yaw(1.705, 0.035)), mat=HAIR))
hleft.append(patch('eye', HEAD.point(1.686, 0.034, -1, 0.0016), 0.023, 0.010, HEAD.normal(1.686, 0.034), EYE))
ear = [(-0.012, -0.022), (0.004, -0.029), (0.015, -0.012), (0.017, 0.013), (0.006, 0.029), (-0.010, 0.022)]
hleft.append(shade(loft('ear', [[(0.066, 0.010 + y, 1.667 + z) for y, z in ear], [(0.089, 0.018 + y * 0.72, 1.668 + z * 0.78) for y, z in ear]], cap_start=False, mat=SKIN), 50))
hd.append(mirrored('face-sides', hleft))
head = join('head', hd)
head['texel'] = 1.5


def chinstrap(z_top, mat):
    """Down each cheek from under the helmet's rim and round under the chin."""
    side = [HEAD.ang(z, dg, 0.002) for z, dg in ((z_top, 84), (1.640, 66), (1.588, 44))]
    under = [Vector((0.030, -0.062, 1.5545)), Vector((0.0, -0.068, 1.5505))]
    pts = side + under
    pts = pts + [Vector((-q.x, q.y, q.z)) for q in reversed(pts[:-1])]
    return ribbon('chinstrap', pts, 0.014, 0.003, mat, (0, -0.02, 1.66), sink=0.004)


def helmet(name, rings, strap_z, strap_mat):
    shell = soft(loft('shell', rings, cap_end=False, mat=HELMET), 50)
    return join(name, [shell, chinstrap(strap_z, strap_mat)])


def hr(z, a, f, b, zf=None, sf=1.0):
    return ring(z, a, f, b, 0, -0.002, 16, 2.0, 0.0, zf=zf, sf=sf)


# a: deep, with a visor and a flared skirt round the ears and neck
helmet_a = helmet('helmet.a', [
    hr(1.807, 0.020, 0.024, 0.024), hr(1.798, 0.054, 0.064, 0.066), hr(1.774, 0.085, 0.101, 0.103), hr(1.740, 0.099, 0.117, 0.119),
    hr(1.706, 0.103, 0.121, 0.123), hr(1.668, 0.104, 0.122, 0.125, zf=1.700, sf=1.04), hr(1.636, 0.117, 0.122, 0.144, zf=1.692, sf=1.16),
    hr(1.632, 0.114, 0.120, 0.140, zf=1.688, sf=1.14), hr(1.652, 0.070, 0.090, 0.080, zf=1.700),
], 1.70, LEATHER)
# b: a round pot with a short rim
helmet_b = helmet('helmet.b', [
    hr(1.812, 0.020, 0.024, 0.024), hr(1.803, 0.054, 0.064, 0.066), hr(1.780, 0.086, 0.102, 0.104), hr(1.745, 0.101, 0.119, 0.121),
    hr(1.708, 0.106, 0.125, 0.128), hr(1.684, 0.107, 0.126, 0.130, zf=1.698), hr(1.674, 0.112, 0.131, 0.137, zf=1.690, sf=1.07),
    hr(1.670, 0.109, 0.128, 0.134, zf=1.686, sf=1.06), hr(1.690, 0.070, 0.092, 0.084, zf=1.702),
], 1.71, WEB)
# c: a shallow dish with a wide flat brim
helmet_c = helmet('helmet.c', [
    hr(1.806, 0.020, 0.022, 0.022), hr(1.799, 0.050, 0.056, 0.056), hr(1.782, 0.078, 0.088, 0.088), hr(1.760, 0.094, 0.106, 0.106),
    hr(1.743, 0.099, 0.112, 0.112), hr(1.728, 0.150, 0.166, 0.166), hr(1.723, 0.147, 0.163, 0.163), hr(1.738, 0.068, 0.086, 0.084),
], 1.74, WEB)

# ---------------------------------------------------------------- rifle
# Bolt action, 1.10 m. It stands at order arms: butt on the ground by the right toe, muzzle up,
# trigger guard to the front, the right hand against its fore-end. Lengths below run from the butt
# plate (s), heights from the bore (v, towards the sights) and w is to the soldier's left. Turning
# the rifle +90 degrees about its own x levels it: muzzle to -y, sights up, bolt handle on the right.

RX, RY, RZ = -0.171, -0.074, 0.002
GRIP = (0.33, -0.043)


def rp(s, v=0.0, w=0.0):
    return (RX + w, RY + v, RZ + s)


def sring(s, top, bot, hw, n=8, p=2.6):
    vc, h = (top + bot) / 2, (top - bot) / 2
    pts = []
    for i in range(n):
        t = 2 * math.pi * (i + 0.5) / n
        c, sn = math.cos(t), math.sin(t)
        pts.append(rp(s, vc + h * math.copysign(abs(sn) ** (2 / p), sn), hw * math.copysign(abs(c) ** (2 / p), c)))
    return pts


rparts = []
stock = loft('stock', [sring(*r_) for r_ in (
    (0.000, -0.030, -0.150, 0.0205), (0.008, -0.030, -0.150, 0.022), (0.110, -0.022, -0.126, 0.023), (0.220, -0.013, -0.094, 0.022),
    (0.290, -0.022, -0.072, 0.018), (0.350, -0.016, -0.064, 0.018), (0.410, -0.004, -0.060, 0.021), (0.520, -0.002, -0.060, 0.024),
    (0.620, 0.000, -0.046, 0.022), (0.850, 0.000, -0.038, 0.019), (1.000, 0.000, -0.032, 0.017))], mat=WOOD)
paint_faces(stock, GUNMETAL, lambda c: c.z < RZ + 0.0075)
rparts.append(soft(stock, 50))
guard = loft('handguard', [[rp(s, 0.003 + rv * math.sin(2 * math.pi * (i + 0.5) / 6), rw * math.cos(2 * math.pi * (i + 0.5) / 6)) for i in range(6)] for s, rw, rv in ((0.635, 0.019, 0.017), (0.93, 0.016, 0.015))], mat=WOOD)
rparts.append(soft(guard, 50))
rparts.append(shade(cyl('barrel', 0.0095, 0.60, at=rp(0.80), segs=6, r2=0.0078, mat=GUNMETAL), 50))
rparts.append(shade(cyl('receiver', 0.0165, 0.21, at=rp(0.505, 0.006), segs=8, mat=GUNMETAL), 50))
rparts.append(shade(cyl('bolt', 0.010, 0.075, at=rp(0.368, 0.008), segs=6, mat=GUNMETAL), 50))
rparts.append(rod('bolt-handle', rp(0.432, 0.006, -0.014), rp(0.420, -0.016, -0.040), 0.005, 5, GUNMETAL))
rparts.append(soft(sphere('bolt-knob', 0.010, at=rp(0.419, -0.019, -0.044), segs=5, rings=3, mat=GUNMETAL), 60))
rparts.append(ribbon('trigger-guard', [rp(0.352, -0.060), rp(0.360, -0.083), rp(0.395, -0.090), rp(0.430, -0.083), rp(0.438, -0.058)], 0.012, 0.0015, GUNMETAL, rp(0.395, -0.062), sink=0.0015, close=True))
rparts.append(box('trigger', 0.005, 0.022, 0.006, at=rp(0.402, -0.072), rot=(18, 0, 0), mat=GUNMETAL))
rparts.append(box('floorplate', 0.022, 0.006, 0.090, at=rp(0.495, -0.0615), mat=GUNMETAL))
rparts.append(box('rear-sight', 0.014, 0.010, 0.050, at=rp(0.655, 0.0235), mat=GUNMETAL))
rparts.append(box('rear-leaf', 0.016, 0.012, 0.006, at=rp(0.640, 0.027), mat=GUNMETAL))
for s0, top, bot, hw in ((0.850, 0.0215, -0.0405, 0.0215), (0.988, 0.0125, -0.035, 0.0195)):
    band = loft('band', [sring(s0 - 0.008, top, bot, hw), sring(s0 + 0.008, top, bot, hw)], cap_start=False, cap_end=s0 > 0.9, mat=GUNMETAL)
    rparts.append(shade(band, 50))
rparts.append(shade(cyl('sight-base', 0.0115, 0.024, at=rp(1.072), segs=6, mat=GUNMETAL), 50))
rparts.append(box('front-sight', 0.003, 0.016, 0.014, at=rp(1.072, 0.016), mat=GUNMETAL))
sl = [rp(0.850, -0.046), rp(0.660, -0.074), rp(0.470, -0.101), rp(0.280, -0.121), rp(0.090, -0.136)]
rparts.append(ribbon('sling', sl, 0.028, 0.0015, LEATHER, lambda q: (q.x, q.y + 0.2, q.z + 0.03), sink=0.0015, close=True))
rparts.append(box('swivel', 0.032, 0.012, 0.010, at=rp(0.852, -0.043), mat=GUNMETAL))
rparts.append(box('swivel', 0.032, 0.012, 0.010, at=rp(0.088, -0.133), mat=GUNMETAL))
rifle = join('rifle', rparts)

# ---------------------------------------------------------------- the part tree

OBJ = {}


def part(ob, bone, at, par=None, kind='bone', **props):
    pivot(ob, at)
    tag(ob, kind, **({'bone': bone} if kind == 'bone' else {}), **props)
    if par is not None:
        parent(ob, par)
    OBJ[ob.name] = ob
    return ob


def twin(ob, name, par):
    """The right-hand limb: the same mesh at the mirrored pivot."""
    o = instance(ob, name, at=(-ob.location.x, ob.location.y, ob.location.z))
    o['bone'] = name
    parent(o, par)
    OBJ[name] = o
    return o


part(body, 'pelvis', PELVIS)
part(spine, 'spine', WAIST, body)
part(head, 'head', NECK, spine)
HELMETS = {'a': helmet_a, 'b': helmet_b, 'c': helmet_c}
for v, h in HELMETS.items():
    part(h, None, NECK, head, kind='none', variant=v)
part(upperarm, 'upperarm.L', SHOULDER, spine)
part(forearm, 'forearm.L', ELBOW, upperarm)
part(hand, 'hand.L', WRIST, forearm)
part(thigh, 'thigh.L', HIP, body)
part(shin, 'shin.L', KNEE, thigh)
part(foot, 'foot.L', ANKLE, shin)
twin(forearm, 'forearm.R', twin(upperarm, 'upperarm.R', spine))
twin(hand, 'hand.R', OBJ['forearm.R'])
twin(shin, 'shin.R', twin(thigh, 'thigh.R', body))
twin(foot, 'foot.R', OBJ['shin.R'])
part(rifle, 'rifle', rp(*GRIP), OBJ['hand.R'])
muzzle = marker('muzzle', rp(1.10), rifle, kind='rifle')
muzzle.rotation_euler = (R(-90), 0, 0)       # its -y runs up the barrel, so it faces where the rifle points


# ---------------------------------------------------------------- baking a figure that moves
# All three helmets sit on the head at once. Baked together they would shade and dirty each other,
# and a preview would show all three, so each is baked with the other two out of the way and the
# previews show one.
#
# The body parts overlap at every joint. Baked as he stands, the hidden ends of the limbs come out
# black and stay black when a knee or elbow bends and brings them into view. So the parts are
# pulled apart for the bake: each one carries only its own shading and dirt (the head with its helmet).

KIT_BAKE, KIT_PREVIEW, KIT_BOUNDS = kit.bake, kit.preview, kit._bounds
HELMET_Z = {v: h.location.z for v, h in HELMETS.items()}
BONES = ('body', 'spine', 'head', 'upperarm.L', 'forearm.L', 'hand.L', 'upperarm.R', 'forearm.R', 'hand.R',
         'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R', 'rifle')
bpy.context.view_layer.update()
REST = {n: OBJ[n].matrix_world.translation.copy() for n in BONES}


def only_helmet(v):
    for k, h in HELMETS.items():
        h.location.z = HELMET_Z[k] + (0.0 if v is None or k == v else 60.0)
    bpy.context.view_layer.update()


def explode(on):
    """Stand the parts in a row 3 m apart (heights kept, so ground dust still lands low), or put them back."""
    for i, n in enumerate(BONES):
        bpy.context.view_layer.update()
        OBJ[n].matrix_world = Matrix.Translation(REST[n] + Vector((3.0 * (i + 1) if on else 0.0, 0, 0)))
    bpy.context.view_layer.update()


def bake_variants(name, size=2048, margin=0.003, samples=24, ao_samples=64):
    if os.environ.get('AXM_REUSE') == '1':
        return KIT_BAKE(name, size, margin, samples, ao_samples)
    sc = bpy.context.scene
    obs = kit.baked_meshes()
    pick = kit._unwrap(obs, margin)
    if kit._apply_texel(pick):
        kit._pack(pick, margin, average=False)
    out = os.path.join(kit.BUILD, name)
    os.makedirs(out, exist_ok=True)
    mats = {m for o in pick for m in o.data.materials if m}

    def new(label, ch):
        img = bpy.data.images.new(f'{name}_{label}', size, size, alpha=False)
        img.colorspace_settings.name = 'sRGB' if ch == 'albedo' else 'Non-Color'
        return img

    tex = {}
    for m in mats:
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.name = 'bake_target'
        m.node_tree.nodes.active = node
        tex[m] = node
    sc.render.bake.margin = 12
    sc.render.bake.use_clear = True

    def run(kind, img, n, sel):
        sc.cycles.samples = n
        for m in mats:
            tex[m].image = img
            m.node_tree.nodes.active = tex[m]
        bpy.ops.object.select_all(action='DESELECT')
        for o in sel:
            o.select_set(True)
        bpy.context.view_layer.objects.active = sel[0]
        bpy.ops.object.bake(type=kind, margin=12, use_clear=True)

    main, others = 'b', ('a', 'c')
    images, alt = {}, {v: {} for v in others}
    explode(True)

    def passes(kind, ch, n):
        t = time.time()
        images[ch] = new(ch, ch)
        only_helmet(main)
        run(kind, images[ch], n, pick)
        for v in others:
            alt[v][ch] = new(f'{ch}_{v}', ch)
            only_helmet(v)
            run(kind, alt[v][ch], n, [HELMETS[v]])
        only_helmet(None)
        print(f'  baked {ch} in {time.time() - t:.1f}s')

    for ch in kit.CHANNELS:
        for m in mats:
            nt = m.node_tree
            nt.links.new(nt.nodes['ch_' + ch].outputs[0], nt.nodes['emit'].inputs['Color'])
            nt.links.new(nt.nodes['emit'].outputs[0], nt.nodes['output'].inputs['Surface'])
        passes('EMIT', ch, samples)
    # which helmet owns each texel (and each texel of the margin round its islands)
    for i, v in enumerate(others):
        HELMETS[v].pass_index = i + 1
    for m in mats:
        nt = m.node_tree
        info = nt.nodes.new('ShaderNodeObjectInfo')
        div = nt.nodes.new('ShaderNodeMath')
        div.operation = 'DIVIDE'
        div.inputs[1].default_value = float(len(others))
        nt.links.new(info.outputs['Object Index'], div.inputs[0])
        nt.links.new(div.outputs[0], nt.nodes['emit'].inputs['Color'])
    ids = new('ids', 'ids')
    run('EMIT', ids, 1, pick)
    for m in mats:
        nt = m.node_tree
        nt.links.new(nt.nodes['principled'].outputs[0], nt.nodes['output'].inputs['Surface'])
    t = time.time()
    images['normal'] = new('normal', 'normal')
    run('NORMAL', images['normal'], 8, pick)
    print(f'  baked normal in {time.time() - t:.1f}s')
    passes('AO', 'ao', ao_samples)
    explode(False)

    def px(img):
        a = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        return a.reshape(-1, 4)

    owner = np.rint(px(ids)[:, 0] * len(others)).astype(np.int32)
    for ch, img in images.items():
        if ch != 'normal':
            base = px(img)
            for i, v in enumerate(others):
                sel = owner == i + 1
                base[sel] = px(alt[v][ch])[sel]
            img.pixels.foreach_set(base.ravel())
        img.filepath_raw = os.path.join(out, f'{ch}.png')
        img.file_format = 'PNG'
        img.save()
    for v in others:
        for img in alt[v].values():
            bpy.data.images.remove(img)
    bpy.data.images.remove(ids)
    return images


def figure_preview(name, views=((-30, 10), (150, 12), (0, 3), (90, 3)), size=(800, 1100), samples=48, ground=True, suffix=''):
    """The whole figure wearing one helmet, then a close look at the head in each helmet."""
    def show(v):
        for k, h in HELMETS.items():
            h.hide_render = k != v
    show(SHOW)
    paths = KIT_PREVIEW(name, views, size=(800, 1100), samples=samples, ground=ground, suffix=suffix)
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for o in [OBJ['head']] + list(HELMETS.values()):
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    lo.z -= 0.16
    kit._bounds = lambda: (lo, hi)
    try:
        for v in (HELMETS if os.environ.get('CLOSE', '1') != '0' else ()):
            show(v)
            paths += KIT_PREVIEW(name, ((-22, 4), (112, 10)), size=(700, 700), samples=samples, ground=ground, suffix=f'{suffix}-helmet-{v}')
    finally:
        kit._bounds = KIT_BOUNDS
        for h in HELMETS.values():
            h.hide_render = False
    return paths


kit.bake = bake_variants
kit.preview = figure_preview


# ---------------------------------------------------------------- joint check: kneeling, aiming

def pose_aim():
    rest = {n: o.matrix_world.translation.copy() for n, o in OBJ.items()}
    rx = lambda d: Matrix.Rotation(R(d), 3, 'X')
    ry = lambda d: Matrix.Rotation(R(d), 3, 'Y')
    rz = lambda d: Matrix.Rotation(R(d), 3, 'Z')
    world = {}

    def place(name, rot, par=None, pos=None):
        if pos is None:
            pp, pr = world[par]
            pos = pp + pr @ (rest[name] - rest[par])
        world[name] = (Vector(pos), rot)

    yaw = rz(-32)
    place('body', yaw, pos=rest['body'] + Vector((0, 0, -0.434)))
    place('spine', yaw @ rz(-14) @ rx(9), 'body')
    place('head', rz(-6) @ ry(-9) @ rx(7), 'spine')
    place('thigh.L', yaw @ rx(-90.5), 'body')
    place('shin.L', yaw, 'thigh.L')
    place('foot.L', yaw, 'shin.L')
    place('thigh.R', yaw @ rx(5), 'body')
    place('shin.R', yaw @ rx(115), 'thigh.R')
    place('foot.R', yaw @ rx(68), 'shin.R')

    # the rifle, level and pointing at -y, its butt in the right shoulder
    sp, sr = world['spine']
    sh = {s: sp + sr @ (rest['upperarm.' + s] - rest['spine']) for s in 'LR'}
    butt = sh['R'] + sr @ Vector((0.035, -0.085, -0.03))
    aim = rx(90)
    grip = butt + aim @ Vector((0, GRIP[1] + 0.09, GRIP[0]))

    def on_rifle(s, v, w=0.0):
        return grip + aim @ Vector((w, v - GRIP[1], s - GRIP[0]))

    def basis(fingers, palm):
        f, p_ = Vector(fingers).normalized(), Vector(palm).normalized()
        return f, p_, -f.cross(p_)

    def hand_rot(side, fingers, palm):
        f0, p0, t0 = basis((0, 0, -1), (-1, 0, 0) if side == 'L' else (1, 0, 0))
        f1, p1, t1 = basis(fingers, palm)
        if side == 'R':
            t0, t1 = -t0, -t1
        return Matrix((f1, p1, t1)).transposed() @ Matrix((f0, p0, t0)).transposed().inverted()

    def arm(side, wrist, pole, hrot):
        s = sh[side]
        l1 = (rest['forearm.' + side] - rest['upperarm.' + side]).length
        l2 = (rest['hand.' + side] - rest['forearm.' + side]).length
        d = wrist - s
        dist = min(d.length, (l1 + l2) * 0.999)
        d.normalize()
        a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
        h = math.sqrt(max(l1 * l1 - a * a, 0.0))
        pv = Vector(pole)
        pv = (pv - pv.dot(d) * d).normalized()
        elbow = s + d * a + pv * h
        wr = s + d * dist
        hinge = (elbow - s).cross(wr - elbow).normalized()
        if hinge.dot(sr @ Vector((1, 0, 0))) < 0:
            hinge = -hinge

        def frame(v):
            z = -v.normalized()
            y = z.cross(hinge).normalized()
            return Matrix((y.cross(z), y, z)).transposed()

        place('upperarm.' + side, frame(elbow - s), pos=s)
        place('forearm.' + side, frame(wr - elbow), pos=elbow)
        place('hand.' + side, hrot, pos=wr)

    fr = Vector((0, -0.74, -0.67))
    hr_ = hand_rot('R', fr, (1, 0, 0))
    arm('R', on_rifle(0.335, -0.052, -0.030) - fr * 0.055, (-0.75, 0.2, -0.6), hr_)
    fl = Vector((-0.85, 0, 0.5))
    hl = hand_rot('L', fl, (-0.5, 0, 0.85))
    palm = on_rifle(0.60, -0.050, 0.012) - Vector((-0.5, 0, 0.85)) * 0.014
    arm('L', palm - fl * 0.055, (0.25, 0.1, -1.0), hl)
    place('rifle', aim, pos=grip)

    for name in ('body', 'spine', 'head', 'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R',
                 'upperarm.L', 'forearm.L', 'hand.L', 'upperarm.R', 'forearm.R', 'hand.R', 'rifle'):
        pos, rot = world[name]
        bpy.context.view_layer.update()
        OBJ[name].matrix_world = Matrix.Translation(pos) @ rot.to_4x4()
    bpy.context.view_layer.update()


def pose_preview(name, size):
    """Render the posed figure without touching the exported model or its textures."""
    weight_all()
    views = ((-35, 12), (140, 14), (60, 8), (-90, 6))
    if DRAFT:
        return figure_preview(name, views, samples=24, suffix='-draft-pose')
    os.environ['AXM_REUSE'] = '1'
    images = KIT_BAKE(name, size)
    bm = baked_material(name, images, (0.13, 0.15, 0.075))
    for me in {o.data for o in baked_meshes()}:
        me.materials.clear()
        me.materials.append(bm)
    return figure_preview(name, views, suffix='-pose')


one = tris(baked_meshes()) - tris([helmet_b, helmet_c])
print(f'[infantry] {one} triangles drawn with one helmet (a); helmets: a {tris([helmet_a])}, b {tris([helmet_b])}, c {tris([helmet_c])}')
for n_, o_ in sorted(OBJ.items()):
    print(f'    {n_:12s} {tris([o_]):5d}')

if POSE:
    pose_aim()
    for p_ in pose_preview('infantry', 1024):
        print('  pose', p_)
else:
    finish('infantry', size=1024, views=((-30, 10), (150, 12), (0, 3), (90, 3)))
