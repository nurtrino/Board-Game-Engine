# Local additions to kit.py for the aircraft (fighter.py, bomber.py): smooth lofted bodies, aerofoil
# surfaces with real control-surface grooves, canopy framing, panel-line maps and a few check renders.
import bpy, bmesh, math, os, bisect
import numpy as np
from mathutils import Vector, Matrix
from kit import *


# ---------------------------------------------------------------- curves and small mesh tools

def pchip(xs, ys):
    """A smooth curve through the points that never overshoots them."""
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    if n == 2:
        m = [d[0], d[0]]
    else:
        for i in range(1, n - 1):
            if d[i - 1] * d[i] > 0:
                w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

        def end(h0, h1, d0, d1):
            v = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
            if v * d0 <= 0:
                return 0.0
            if d0 * d1 <= 0 and abs(v) > 3 * abs(d0):
                return 3 * d0
            return v
        m[0] = end(h[0], h[1], d[0], d[1])
        m[-1] = end(h[-1], h[-2], d[-1], d[-2])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = bisect.bisect_right(xs, x) - 1
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def grid_mesh(name, rows, mat=None, close_u=False, close_v=False):
    """Quads over a grid of points rows[i][j]. Normals are left as wound: follow with face_out()."""
    nu, nv = len(rows), len(rows[0])
    verts = [p for r in rows for p in r]
    faces = []
    for i in range(nu if close_u else nu - 1):
        a, b = i * nv, ((i + 1) % nu) * nv
        for j in range(nv if close_v else nv - 1):
            k = (j + 1) % nv
            faces.append((a + j, a + k, b + k, b + j))
    return mesh_obj(name, verts, faces, mat)


def face_out(ob, ref):
    """Flip the whole mesh if, on balance, its faces look toward ref rather than away from it.
    ref is a point, or a function of the face centre giving the point to face away from."""
    me = ob.data
    tot = 0.0
    for p in me.polygons:
        r = ref(p.center) if callable(ref) else Vector(ref)
        tot += p.normal.dot(p.center - r) * p.area
    if tot < 0:
        me.flip_normals()
    me.update()
    return ob


def mat_faces(ob, mat, pred):
    """Give the faces picked by pred(polygon) another material."""
    me = ob.data
    mats = list(me.materials)
    if mat not in mats:
        me.materials.append(mat)
        mats.append(mat)
    idx = mats.index(mat)
    for p in me.polygons:
        if pred(p):
            p.material_index = idx
    return ob


def fan(name, hub, rim, mat=None):
    """Triangles from one point to a run of points."""
    verts = [hub] + list(rim)
    return mesh_obj(name, verts, [(0, i, i + 1) for i in range(1, len(rim))], mat)


# ---------------------------------------------------------------- lofted bodies

class Body:
    """A fuselage, nacelle or pod: cross-sections along y, each a superellipse with its own top and
    bottom. keys are rows of (y, half width, top z, bottom z, z of widest point, top exponent,
    bottom exponent), blended smoothly; ys are the stations actually lofted."""

    def __init__(self, keys, ys, n=32, x0=0.0):
        ky = [k[0] for k in keys]
        self.f = [pchip(ky, [k[i + 1] for k in keys]) for i in range(6)]
        self.ys = sorted(ys)
        self.n = n
        self.x0 = x0

    def sec(self, y):
        return [f(y) for f in self.f]

    def _pt(self, y, t):
        w, zt, zb, zm, nt, nb = self.sec(y)
        c, s = math.cos(t), math.sin(t)
        if abs(c) < 1e-9:
            c = 0.0
        if abs(s) < 1e-9:
            s = 0.0
        n, hz = (nt, zt - zm) if s >= 0 else (nb, zm - zb)
        x = w * math.copysign(abs(c) ** (2 / n), c)
        z = zm + hz * math.copysign(abs(s) ** (2 / n), s)
        return Vector((self.x0 + x, y, z))

    def _seg(self, y):
        ys = self.ys
        i = min(max(bisect.bisect_right(ys, y) - 1, 0), len(ys) - 2)
        u = (y - ys[i]) / (ys[i + 1] - ys[i])
        return i, min(max(u, 0.0), 1.0)

    def pt(self, y, t, off=0.0):
        """A point on the lofted skin (straight between stations, as the mesh is)."""
        i, u = self._seg(y)
        p = self._pt(self.ys[i], t).lerp(self._pt(self.ys[i + 1], t), u)
        if off:
            p += self.nrm(y, t) * off
        return p

    def nrm(self, y, t):
        i, u = self._seg(y)
        e = 2e-3
        a = self._pt(self.ys[i], t - e).lerp(self._pt(self.ys[i + 1], t - e), u)
        b = self._pt(self.ys[i], t + e).lerp(self._pt(self.ys[i + 1], t + e), u)
        d_y = self._pt(self.ys[i + 1], t) - self._pt(self.ys[i], t)
        return d_y.cross(b - a).normalized()

    def t_of(self, y, z):
        """Ring angle on the +x side at height z."""
        w, zt, zb, zm, nt, nb = self.sec(y)
        if z >= zm:
            v = min(1.0, (z - zm) / max(zt - zm, 1e-6))
            return math.asin(v ** (nt / 2))
        v = min(1.0, (zm - z) / max(zm - zb, 1e-6))
        return -math.asin(v ** (nb / 2))

    def t_of_x(self, y, x, top=True):
        """Ring angle on the top (or bottom) at a distance x from the centre line."""
        w, zt, zb, zm, nt, nb = self.sec(y)
        n = nt if top else nb
        v = min(1.0, abs(x - self.x0) / w)
        t = math.acos(v ** (n / 2))
        if x < self.x0:
            t = math.pi - t
        return t if top else -t

    def hw(self, y, z):
        """Half width at height z (smooth section)."""
        return self._pt(y, self.t_of(y, z)).x - self.x0

    def z_at(self, y, x, top=True):
        return self._pt(y, self.t_of_x(y, x, top)).z

    def side(self, y, z, sx=1, off=0.0):
        t = self.t_of(y, z)
        if sx < 0:
            t = math.pi - t
        return self.pt(y, t, off)

    def side_n(self, y, z, sx=1):
        t = self.t_of(y, z)
        if sx < 0:
            t = math.pi - t
        return self.nrm(y, t)

    def top(self, y):
        return self.sec(y)[1]

    def bot(self, y):
        return self.sec(y)[2]

    def ring(self, y):
        return [self._pt(y, 2 * math.pi * i / self.n) for i in range(self.n)]

    def build(self, name, mat, cap_start=True, cap_end=True, y0=None, y1=None, angle=60):
        ys = [y for y in self.ys if (y0 is None or y >= y0 - 1e-6) and (y1 is None or y <= y1 + 1e-6)]
        ob = loft(name, [self.ring(y) for y in ys], cap_start, cap_end, mat)
        return soft(ob, angle)

    def patch(self, y0, y1, t0, t1, nt=4, off=0.008, ny=1):
        """A grid of points lying just off the skin: rows along y, columns round the ring."""
        ys = sorted({y0, y1} | {y for y in self.ys if y0 < y < y1})
        if ny > 1:
            more = []
            for a, b in zip(ys, ys[1:]):
                more += [a + (b - a) * k / ny for k in range(1, ny)]
            ys = sorted(ys + more)
        return [[self.pt(y, t0 + (t1 - t0) * j / nt, off) for j in range(nt + 1)] for y in ys]


# ---------------------------------------------------------------- aerofoil surfaces

def _thick(f, tc):
    f = min(max(f, 0.0), 1.0)
    return 5 * tc * (0.2969 * math.sqrt(f) - 0.1260 * f - 0.3516 * f ** 2 + 0.2843 * f ** 3 - 0.1036 * f ** 4)


def _camber(f, m, p):
    if not m:
        return 0.0
    if f < p:
        return m / p ** 2 * (2 * p * f - f * f)
    return m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * f - f * f)


class Foil:
    """A wing, tailplane or fin. O is the origin, S the direction of span, C of chord, U of thickness.
    plan rows are (span position, leading edge, chord, thickness ratio, incidence in degrees), linear
    between rows. The last tip_r of the span is rounded off. Control surfaces are cut in as real
    grooves: hinge is a chord fraction or a line (s0, c0, s1, c1); surfaces are (s0, s1, upper, lower)."""

    G = [0.003, 0.012, 0.03, 0.06, 0.11, 0.18, 0.27, 0.38, 0.5, 0.63, 0.77, 0.9, 1.0]
    REAR = [0.4, 0.75]

    def __init__(self, O, S, C, U, plan, tip_r=0.0, tip_mid=0.45, camber=0.02, cpos=0.4, axis=0.3,
                 hinge=None, surfaces=(), gw=0.007, gd=0.014, hmin=0.5, hmax=0.9):
        self.O, self.S, self.C, self.U = Vector(O), Vector(S).normalized(), Vector(C).normalized(), Vector(U).normalized()
        self.hand = 1 if self.S.cross(self.C).dot(self.U) > 0 else -1
        self.plan = plan
        self.s0, self.s1 = plan[0][0], plan[-1][0]
        self.tip_r, self.tip_mid = tip_r, tip_mid
        self.camber, self.cpos, self.axis = camber, cpos, axis
        self.hinge, self.surfaces, self.gw, self.gd = hinge, list(surfaces), gw, gd
        self.hmin, self.hmax = hmin, hmax

    def base(self, s):
        P = self.plan
        i = min(max(bisect.bisect_right([p[0] for p in P], s) - 1, 0), len(P) - 2)
        u = (s - P[i][0]) / (P[i + 1][0] - P[i][0])
        return [P[i][k] + (P[i + 1][k] - P[i][k]) * u for k in range(1, 5)]

    def sec(self, s):
        le, ch, tc, tw = self.base(min(s, self.s1))
        if self.tip_r > 0 and s > self.s1 - self.tip_r:
            q = min(1.0, (s - (self.s1 - self.tip_r)) / self.tip_r)
            k = max(math.sqrt(max(0.0, 1 - q * q)), 0.02)
            mid = le + ch * self.tip_mid
            le, ch = mid - (mid - le) * k, ch * k
        return le, ch, tc, tw

    def local(self, s, f, side=1, depth=0.0):
        le, ch, tc, tw = self.sec(s)
        c = le + ch * f
        u = ch * (_camber(f, self.camber, self.cpos) + side * _thick(f, tc)) - side * depth
        if tw:
            a = R(tw)
            cr = le + ch * self.axis
            dc = c - cr
            c, u = cr + dc * math.cos(a) + u * math.sin(a), -dc * math.sin(a) + u * math.cos(a)
        return c, u

    def _pt(self, s, f, side=1, depth=0.0):
        c, u = self.local(s, f, side, depth)
        return self.O + self.S * s + self.C * c + self.U * u

    def pt(self, s, f, side=1, depth=0.0):
        """A point on the skin. Once built, this follows the mesh: straight between span stations."""
        st = getattr(self, 'st', None)
        if not st or s <= st[0] or s >= st[-1]:
            return self._pt(s, f, side, depth)
        i = min(bisect.bisect_right(st, s) - 1, len(st) - 2)
        u = (s - st[i]) / (st[i + 1] - st[i])
        return self._pt(st[i], f, side, depth).lerp(self._pt(st[i + 1], f, side, depth), u)

    def nrm(self, s, f, side=1):
        e = 2e-3
        f0, f1 = max(f - e, 1e-4), min(f + e, 1.0)
        dc = self.pt(s, f1, side) - self.pt(s, f0, side)
        ds = self.pt(s + e, f, side) - self.pt(s - e, f, side)
        return (ds.cross(dc) * (side * self.hand)).normalized()

    def half(self, s, f):
        """Half the thickness of the section there, in metres."""
        le, ch, tc, tw = self.sec(s)
        return ch * _thick(f, tc)

    # for wings and tailplanes, whose span runs along x
    def s_of(self, x):
        return (x - self.O.x) / self.S.x

    def sf(self, x, y):
        s = self.s_of(x)
        le, ch, tc, tw = self.sec(s)
        return s, min(max((y - self.O.y - le) / ch, 0.0), 1.0)

    def at(self, x, y, side=1, off=0.0):
        s, f = self.sf(x, y)
        p = self.pt(s, f, side)
        return p + self.nrm(s, f, side) * off if off else p

    def hfrac(self, s):
        if self.hinge is None:
            return 0.75
        if isinstance(self.hinge, (int, float)):
            return self.hinge
        le, ch, tc, tw = self.sec(s)
        s0, c0, s1, c1 = self.hinge
        line = c0 + (c1 - c0) * (s - s0) / (s1 - s0)
        return min(max((line - le) / ch, self.hmin), self.hmax)

    def stations(self, extra=()):
        st = [p[0] for p in self.plan] + list(extra)
        if self.tip_r > 0:
            st = [s for s in st if s < self.s1 - self.tip_r - 1e-6]
            for a in (0, 20, 40, 58, 73, 84, 89.3):
                st.append(self.s1 - self.tip_r + self.tip_r * math.sin(R(a)))
        mids = set()
        for (a, b, up, lo) in self.surfaces:
            for e in (a, b):
                if self.s0 + 2 * self.gw < e < self.s1 - 2 * self.gw:
                    mids.add(round(e, 5))
        mids = sorted(mids)
        st = [s for s in st if all(abs(s - m) > 4 * self.gw for m in mids)]
        for m in mids:
            st += [m - self.gw, m, m + self.gw]
        st = sorted(st)
        out = [st[0]]
        for s in st[1:]:
            if s - out[-1] > 1e-5:
                out.append(s)
        return out, mids

    def ring(self, s, mids):
        le, ch, tc, tw = self.sec(s)
        h = self.hfrac(s)
        d = min(self.gw / ch, 0.03)
        is_mid = any(abs(s - m) < 1e-6 for m in mids)
        on = {1: False, -1: False}
        mid = {1: False, -1: False}
        for (a, b, up, lo) in self.surfaces:
            inside = a - 1e-6 <= s <= b + 1e-6
            at_end = is_mid and (abs(s - a) < 1e-6 or abs(s - b) < 1e-6)
            for side, flag in ((1, up), (-1, lo)):
                if flag and inside:
                    on[side] = True
                if flag and at_end:
                    mid[side] = True
        ng = len(self.G)
        fr = [g * (h - d) for g in self.G] + [h, h + d] + [h + d + (1 - h - d) * q for q in self.REAR]

        def P(i, side):
            depth = 0.0
            if i == ng and (on[side] or mid[side]):
                depth = self.gd
            if i > ng and mid[side]:
                depth = self.gd
            depth = min(depth, 0.6 * ch * _thick(fr[i], tc))
            return self._pt(s, fr[i], side, depth)

        te = 1.0 - (1.5 * self.gd / ch if (mid[1] and mid[-1]) else 0.0)
        return ([self._pt(s, te, 1)] + [P(i, 1) for i in reversed(range(len(fr)))]
                + [self._pt(s, 0.0, 1)] + [P(i, -1) for i in range(len(fr))])

    def build(self, name, mat, cap_root=False, extra=(), angle=50):
        st, mids = self.stations(extra)
        rings = [self.ring(s, mids) for s in st]
        ob = loft(name, rings, cap_start=cap_root, cap_end=True, mat=mat)
        shade(ob, angle)
        self.st = st
        self.mids = mids
        self.nring = len(rings[0])
        return ob

    def lead_faces(self, ob, mat, s0, s1, k=4):
        """Give the leading edge between two span positions another material (de-icing boots).
        k counts chord points back from the leading edge on each side."""
        n = self.nring
        le = 1 + len(self.G) + 2 + len(self.REAR)      # ring index of the leading edge point
        bands = [i for i in range(len(self.st) - 1) if self.st[i] >= s0 - 1e-6 and self.st[i + 1] <= s1 + 1e-6]
        want = {i * n + j for i in bands for j in range(le - k, le + k)}
        return mat_faces(ob, mat, lambda p: p.index in want)


def wing_fillet(name, body, wing, mat, r_le=0.05, r_te=0.2, tail=0.55, x0=0.4, arc=4, sink=0.02, drop=0.12):
    """The fairing between a wing root and the fuselage side, on the +x side: a concave strip that
    wraps the leading edge, widens along the upper surface and runs out to a point behind the
    trailing edge."""
    seq = [(0.10, -1, 0.012), (0.045, -1, 0.5 * r_le), (0.012, -1, 0.85 * r_le), (0.0, 1, r_le), (0.012, 1, r_le)]
    for f in (0.045, 0.10, 0.18, 0.28, 0.4, 0.52, 0.64, 0.76, 0.87, 0.95, 1.0):
        seq.append((f, 1, r_le + (r_te - r_le) * f ** 1.2))
    rows = []
    last = None
    for f, side, r in seq:
        x = x0
        for _ in range(5):
            p = wing.pt(wing.s_of(x), f, side)
            x = body.hw(p.y, p.z)
        s = wing.s_of(x)
        p = wing.pt(s, f, side)
        n = wing.nrm(s, max(f, 0.002), side)
        if f == 0.0:
            n = Vector((0, -1, 0))
        sb = wing.s_of(x + r)
        B = wing.pt(sb, f, side) - wing.nrm(sb, max(f, 0.002), side) * 0.003
        l = math.hypot(n.y, n.z)
        ya, za = p.y + n.y / l * r, p.z + n.z / l * r
        A = Vector((body.hw(ya, za) - 0.003, ya, za))
        d = sink if f < 0.97 else 0.004
        zc = B.z - side * d
        Cp = Vector((body.hw(p.y, zc) - 0.02, B.y, zc))
        row = [A] + [p + (A - p) * (1 - math.sin(R(90 * k / arc))) + (B - p) * (1 - math.cos(R(90 * k / arc))) for k in range(1, arc)] + [B, Cp]
        rows.append(row)
        last = (p, r)
    p0, r0 = last
    for k in range(1, 5):
        u = k / 4
        y = p0.y + tail * u
        z = p0.z - drop * tail * u
        r = max(r0 * (1 - u ** 1.4), 0.004)
        K = Vector((body.hw(y, z), y, z))
        A = Vector((body.hw(y, z + r) - 0.003, y, z + r))
        B = Vector((K.x + r, y, z))
        Cp = Vector((body.hw(y, z - 0.004) - 0.02, y, z - 0.004))
        rows.append([A] + [K + (A - K) * (1 - math.sin(R(90 * j / arc))) + (B - K) * (1 - math.cos(R(90 * j / arc))) for j in range(1, arc)] + [B, Cp])
    ob = grid_mesh(name, rows, mat)
    face_out(ob, lambda c: c - Vector((0.3, 0, 0.3)))
    return soft(ob, 55)


# ---------------------------------------------------------------- framing and struts

def bar(name, pts, nrms, width=0.035, out=0.012, inn=0.01, mat=None, closed=False):
    """A flat bar laid along a line on a surface: canopy frames, window frames. nrms are the surface
    normals at the points (one normal for all is fine)."""
    pts = [Vector(p) for p in pts]
    if isinstance(nrms, Vector) or (len(nrms) == 3 and not hasattr(nrms[0], '__len__')):
        nrms = [Vector(nrms)] * len(pts)
    n = len(pts)
    rings = []
    for i in range(n):
        a = pts[i - 1] if (closed or i > 0) else pts[i]
        b = pts[(i + 1) % n] if (closed or i < n - 1) else pts[i]
        t = (b - a).normalized()
        nn = Vector(nrms[i]).normalized()
        bn = t.cross(nn).normalized()
        nn = bn.cross(t).normalized()
        k = 1.0
        if closed or 0 < i < n - 1:
            t1, t2 = (pts[i] - a).normalized(), (b - pts[i]).normalized()
            k = 1 / max(0.5, math.sqrt(max(0.0, (1 + t1.dot(t2)) / 2)))
        w = width / 2 * k
        rings.append([pts[i] - bn * w - nn * inn, pts[i] + bn * w - nn * inn, pts[i] + bn * w + nn * out, pts[i] - bn * w + nn * out])
    if closed:
        ob = fix_normals(grid_mesh(name, rings, mat, close_u=True, close_v=True))
    else:
        ob = loft(name, rings, True, True, mat)
    return shade(ob, 35)


def strut(name, p0, p1, chord0, chord1, thick0, thick1, mat=None, n=8, along=(0, 1, 0)):
    """A streamlined mast between two points: lens section, chord along `along`."""
    p0, p1 = Vector(p0), Vector(p1)
    ax = (p1 - p0).normalized()
    c = Vector(along)
    c = (c - ax * c.dot(ax)).normalized()
    u = ax.cross(c)
    rings = []
    for p, ch, th in ((p0, chord0, thick0), (p1, chord1, thick1)):
        rings.append([p + c * (ch / 2 * math.cos(2 * math.pi * i / n)) + u * (th / 2 * math.sin(2 * math.pi * i / n)) for i in range(n)])
    return shade(loft(name, rings, True, True, mat), 50)


def tube(name, p0, p1, r, segs=8, r2=None, mat=None, caps=True):
    """A cylinder between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    ob = cyl(name, r, d.length, segs=segs, r2=r2, mat=mat, caps=caps)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.data.transform(Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4())
    ob.data.update()
    return ob


def dome_rows(centre, rx, ry, rz, n_around=16, n_up=5, top=0.98):
    """Rows of a half-ellipsoid dome sitting on z = centre.z, from its rim up towards the crown."""
    cx, cy, cz = centre
    rows = []
    for i in range(n_up + 1):
        a = R(90 * top * i / n_up)
        rows.append([Vector((cx + rx * math.cos(a) * math.cos(2 * math.pi * j / n_around), cy + ry * math.cos(a) * math.sin(2 * math.pi * j / n_around), cz + rz * math.sin(a))) for j in range(n_around)])
    return rows


# ---------------------------------------------------------------- propeller

def blade(name, radius, mat, tip_mat=None, root=0.13, chord=0.3, beta75=32.0, n=10, cw=True, tip_from=0.9):
    """One propeller blade pointing +z from the origin, turning about y, flying towards -y."""
    Q = [root, 0.2, 0.3, 0.45, 0.6, 0.75, 0.87, 0.94, 0.98, 1.0]
    CH = [0.34, 0.4, 0.66, 0.9, 1.0, 0.97, 0.84, 0.64, 0.4, 0.12]
    TH = [0.95, 0.72, 0.32, 0.17, 0.115, 0.09, 0.075, 0.07, 0.07, 0.07]
    k = 0.75 * math.tan(R(beta75))
    sx = -1 if cw else 1
    rings = []
    for q, c, th in zip(Q, CH, TH):
        b = math.atan2(k, q)
        c *= chord
        lead = Vector((sx * math.cos(b), -math.sin(b), 0))      # trailing to leading edge
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(Vector((0, 0, q * radius)) + lead * (c / 2 * math.cos(a)) + Vector((lead.y, -lead.x, 0)) * (th * c / 2 * math.sin(a)))
        rings.append(ring)
    ob = loft(name, rings, True, True, mat)
    shade(ob, 50)
    if tip_mat is not None:
        mat_faces(ob, tip_mat, lambda p: p.center.z > tip_from * radius)
    return ob


# ---------------------------------------------------------------- panel-line maps

class LineMap:
    """Line work drawn in a flat projection and laid over the paint: channel 0 and 1 are lines,
    channel 2 is soot. Coordinates are metres."""

    def __init__(self, u0, u1, v0, v1, px=0.006):
        self.u0, self.v0, self.px = u0, v0, px
        self.w = int(math.ceil((u1 - u0) / px))
        self.h = int(math.ceil((v1 - v0) / px))
        self.u1, self.v1 = u0 + self.w * px, v0 + self.h * px
        self.a = np.zeros((3, self.h, self.w), np.float32)

    def _box(self, x0, y0, x1, y1, r):
        ia, ib = max(0, int(min(x0, x1) - r)), min(self.w, int(max(x0, x1) + r) + 2)
        ja, jb = max(0, int(min(y0, y1) - r)), min(self.h, int(max(y0, y1) + r) + 2)
        if ia >= ib or ja >= jb:
            return None
        X, Y = np.meshgrid(np.arange(ia, ib) + 0.5, np.arange(ja, jb) + 0.5)
        return ia, ib, ja, jb, X, Y

    def seg(self, ch, p, q, width=0.012, strength=1.0, mirror=False):
        px = self.px
        x0, y0, x1, y1 = (p[0] - self.u0) / px, (p[1] - self.v0) / px, (q[0] - self.u0) / px, (q[1] - self.v0) / px
        b = self._box(x0, y0, x1, y1, width / px / 2 + 2)
        if b:
            ia, ib, ja, jb, X, Y = b
            dx, dy = x1 - x0, y1 - y0
            L2 = dx * dx + dy * dy
            t = np.clip(((X - x0) * dx + (Y - y0) * dy) / L2, 0, 1) if L2 > 1e-12 else 0.0
            d = np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
            cov = np.clip(width / px / 2 - d + 0.5, 0, 1) * strength
            blk = self.a[ch, ja:jb, ia:ib]
            np.maximum(blk, cov, out=blk)
        if mirror:
            self.seg(ch, (-p[0], p[1]), (-q[0], q[1]), width, strength)

    def poly(self, ch, pts, width=0.012, closed=True, strength=1.0, mirror=False):
        n = len(pts)
        for i in range(n if closed else n - 1):
            self.seg(ch, pts[i], pts[(i + 1) % n], width, strength, mirror)

    def rect(self, ch, u0, v0, u1, v1, width=0.012, strength=1.0, mirror=False):
        self.poly(ch, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], width, True, strength, mirror)

    def circle(self, ch, c, r, width=0.012, n=28, strength=1.0, mirror=False):
        self.poly(ch, [(c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n)) for i in range(n)], width, True, strength, mirror)

    def streak(self, p, q, w0, w1, strength=1.0, mirror=False, ch=2):
        """Soot blown from p towards q, spreading from half-width w0 to w1 and fading out."""
        px = self.px
        x0, y0, x1, y1 = (p[0] - self.u0) / px, (p[1] - self.v0) / px, (q[0] - self.u0) / px, (q[1] - self.v0) / px
        b = self._box(x0, y0, x1, y1, 2.5 * max(w0, w1) / px)
        if b:
            ia, ib, ja, jb, X, Y = b
            dx, dy = x1 - x0, y1 - y0
            L = math.hypot(dx, dy)
            t = ((X - x0) * dx + (Y - y0) * dy) / (L * L)
            dp = np.abs((X - x0) * dy - (Y - y0) * dx) / L
            tc = np.clip(t, 0, 1)
            wl = (w0 + (w1 - w0) * tc) / px
            val = strength * np.clip((t + 0.02) / 0.06, 0, 1) * (1 - tc) ** 1.3 * np.exp(-(dp / wl) ** 2)
            blk = self.a[ch, ja:jb, ia:ib]
            np.maximum(blk, val.astype(np.float32), out=blk)
        if mirror:
            self.streak((-p[0], p[1]), (-q[0], q[1]), w0, w1, strength, False, ch)

    def image(self, name):
        img = bpy.data.images.new(name, self.w, self.h, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        px = np.ones((self.h, self.w, 4), np.float32)
        px[:, :, 0], px[:, :, 1], px[:, :, 2] = self.a[0], self.a[1], self.a[2]
        img.pixels.foreach_set(px.ravel())
        img.update()
        img.pack()
        return img


def add_linework(mat, plan=None, side=None, dz=0.0, dark=0.86, groove=2.2):
    """Lay line maps over a paint() material without touching kit.py. plan is seen from above:
    channel 0 marks faces that look up, channel 1 faces that look down, channel 2 is soot on both.
    side is seen from the side (y, z): channel 0 lines, channel 2 soot. dz is how far the model was
    moved up after the maps were drawn."""
    nt = mat.node_tree
    N, L = nt.nodes, nt.links

    def new(kind, **kw):
        node = N.new(kind)
        for k, v in kw.items():
            setattr(node, k, v)
        return node

    def m(op, a, b=None, clamp=False):
        node = new('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if hasattr(v, 'is_output'):
                L.new(v, node.inputs[i])
            else:
                node.inputs[i].default_value = v
        return node.outputs[0]

    tc = new('ShaderNodeTexCoord')
    pos = new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Object'], pos.inputs[0])
    geo = new('ShaderNodeNewGeometry')
    nor = new('ShaderNodeSeparateXYZ')
    L.new(geo.outputs['Normal'], nor.inputs[0])

    def tex(lm, name, us, vs, vofs=0.0):
        u = m('DIVIDE', m('SUBTRACT', us, lm.u0), lm.u1 - lm.u0)
        v = m('DIVIDE', m('SUBTRACT', vs, lm.v0 + vofs), lm.v1 - lm.v0)
        comb = new('ShaderNodeCombineXYZ')
        L.new(u, comb.inputs[0])
        L.new(v, comb.inputs[1])
        t = new('ShaderNodeTexImage', extension='CLIP', interpolation='Linear')
        t.image = lm.image(name)
        L.new(comb.outputs[0], t.inputs['Vector'])
        rgb = new('ShaderNodeSeparateColor')
        L.new(t.outputs['Color'], rgb.inputs[0])
        return rgb.outputs

    line, soot = None, None
    if plan is not None:
        o = tex(plan, mat.name + '_plan', pos.outputs[0], pos.outputs[1])
        up = m('GREATER_THAN', nor.outputs[2], 0.45)
        dn = m('LESS_THAN', nor.outputs[2], -0.45)
        line = m('ADD', m('MULTIPLY', o[0], up), m('MULTIPLY', o[1], dn))
        soot = m('MULTIPLY', o[2], m('ADD', up, dn))
    if side is not None:
        o = tex(side, mat.name + '_side', pos.outputs[1], pos.outputs[2], dz)
        sd = m('GREATER_THAN', m('ABSOLUTE', nor.outputs[0]), 0.6)
        l2 = m('MULTIPLY', o[0], sd)
        s2 = m('MULTIPLY', o[2], sd)
        line = l2 if line is None else m('MAXIMUM', line, l2)
        soot = s2 if soot is None else m('MAXIMUM', soot, s2)
    # break the soot up so it does not look airbrushed
    nz = new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 5.0
    nz.inputs['Detail'].default_value = 4.0
    L.new(tc.outputs['Object'], nz.inputs['Vector'])
    soot = m('MULTIPLY', soot, m('ADD', m('MULTIPLY', nz.outputs[0], 0.9), 0.45), clamp=True)

    def mixc(fac, a, b):
        node = new('ShaderNodeMix', data_type='RGBA')
        ins = {s.identifier: s for s in node.inputs}
        L.new(fac, ins['Factor_Float'])
        L.new(a, ins['A_Color'])
        ins['B_Color'].default_value = (*b, 1)
        return {s.identifier: s for s in node.outputs}['Result_Color']

    def mixf(fac, a, b):
        node = new('ShaderNodeMix', data_type='FLOAT')
        ins = {s.identifier: s for s in node.inputs}
        L.new(fac, ins['Factor_Float'])
        L.new(a, ins['A_Float'])
        ins['B_Float'].default_value = b
        return {s.identifier: s for s in node.outputs}['Result_Float']

    rr = N['ch_albedo']
    col = rr.inputs[0].links[0].from_socket
    col = mixc(m('MULTIPLY', soot, 0.85), col, (0.035, 0.03, 0.028))
    col = mixc(m('MULTIPLY', line, dark), col, (0.03, 0.03, 0.03))
    L.new(col, rr.inputs[0])
    rr = N['ch_rough']
    L.new(mixf(soot, rr.inputs[0].links[0].from_socket, 0.9), rr.inputs[0])
    rr = N['ch_mask']
    L.new(m('MULTIPLY', rr.inputs[0].links[0].from_socket, m('SUBTRACT', 1.0, m('MULTIPLY', soot, 0.8))), rr.inputs[0])
    bump = next(n for n in N if n.type == 'BUMP')
    h = bump.inputs['Height'].links[0].from_socket
    L.new(m('SUBTRACT', h, m('MULTIPLY', line, groove)), bump.inputs['Height'])
    return mat


# ---------------------------------------------------------------- placing things

def place_decal(name, size, centre, normal, up, par, kind='insignia', clear=0.004):
    """A marking panel tangent to a surface at centre, standing clear of it, its top towards up."""
    n = Vector(normal).normalized()
    v = Vector(up)
    v = (v - n * v.dot(n)).normalized()
    u = v.cross(n)
    m = Matrix((u, v, n)).transposed()
    e = m.to_euler('XYZ')
    at = Vector(centre) + n * clear
    return decal(name, size, size, tuple(at), tuple(math.degrees(a) for a in e), par, kind)


def foil_decal(name, foil, s, fc, size, side, sx, par, kind='insignia', up=(0, -1, 0), clear=0.004):
    """A marking panel on a wing, tailplane or fin, centred at chord fraction fc of span station s.
    The panel touches the curved skin where that leaves the smallest gap at its front and back edges."""
    le, ch, tc, tw = foil.sec(s)
    half = size / 2 / ch
    fs = [fc - half + 2 * half * i / 24 for i in range(25)]
    best = None
    for k in range(1, 24):
        p, n = foil.pt(s, fs[k], side), foil.nrm(s, fs[k], side)
        gaps = [-(foil.pt(s, f, side) - p).dot(n) for f in fs]
        if min(gaps) < -5e-4:
            continue
        if best is None or max(gaps) < best[0]:
            best = (max(gaps), p, n)
    g, p, n = best
    q = foil.pt(s, fc, side)
    c = q - n * (q - p).dot(n)
    return place_decal(name, size, (sx * c.x, c.y, c.z), (sx * n.x, n.y, n.z), up, par, kind, clear)


def settle(lift=0.0):
    """Move the whole aircraft so its lowest point is at z = lift. The hull stays at the origin."""
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    lo = min((o.matrix_world @ v.co).z for o in sc.objects if o.type == 'MESH' for v in o.data.vertices)
    dz = lift - lo
    for o in sc.objects:
        if o.parent is None:
            if o.type == 'MESH' and o.name == 'hull':
                o.data.transform(Matrix.Translation((0, 0, dz)))
                o.data.update()
            else:
                o.location.z += dz
        elif o.parent.name == 'hull':
            o.location.z += dz
    bpy.context.view_layer.update()
    return dz


def hide_special():
    """Keep marking panels and propeller discs out of the bake: left visible they shade the skin
    under them (black squares in the AO and the dirt). They are still exported."""
    for o in bpy.context.scene.objects:
        if o.get('anim') in SPECIAL:
            o.hide_render = True


def check_decals(n=11):
    """Print, for each marking panel, how much of it is under the skin and how far it stands off."""
    from mathutils.bvhtree import BVHTree
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    bvh = BVHTree.FromObject(sc.objects['hull'], bpy.context.evaluated_depsgraph_get())
    for o in sorted(sc.objects, key=lambda o: o.name):
        if o.get('anim') != 'decal':
            continue
        c = [o.matrix_world @ v.co for v in o.data.vertices]
        nn = (c[1] - c[0]).cross(c[3] - c[0]).normalized()
        buried, gaps = 0, []
        for i in range(n):
            for j in range(n):
                p = c[0] + (c[1] - c[0]) * ((i + 0.5) / n) + (c[3] - c[0]) * ((j + 0.5) / n)
                if bvh.ray_cast(p + nn * 1e-4, nn, 1.5)[0] is not None:
                    buried += 1
                hit = bvh.ray_cast(p, -nn, 3.0)
                gaps.append(hit[3] if hit[0] is not None else 9.0)
        print(f'  {o.name}: under the skin {buried}/{n * n}, gap {min(gaps) * 1000:.0f}..{max(gaps) * 1000:.0f} mm')


def far_clip(dist=4000.0):
    """kit.preview() leaves the camera's far clip at 100 m, short of a big aircraft."""
    def fix(scene, *args):
        if scene.camera:
            scene.camera.data.clip_end = dist
    bpy.app.handlers.render_pre.append(fix)


# ---------------------------------------------------------------- check renders

def air_views(name, views=((-40, -25), (160, -32), (-90, 2), (12, 6, 0.6))):
    """More previews without the ground, lit a little from below, to judge the underside. Writes
    preview-air-N.png. Call after finish()."""
    fill = bpy.data.lights.new('_fill', 'SUN')
    fill.energy = 1.6
    ob = link(bpy.data.objects.new('_fill', fill))
    ob.rotation_euler = (R(155), 0, R(30))
    paths = preview(name, views=views, ground=False, samples=32, suffix='-air')
    bpy.data.objects.remove(ob)
    for p in paths:
        print('  air', p)
    return paths



def check_views(name, size=(900, 560), decals=True):
    """Front, side, top and bottom orthographic views on one sheet, plus two back-face tests
    (anything red is a face turned inside out). Call after finish() in a draft run."""
    sc = bpy.context.scene
    out = os.path.join(BUILD, name)
    os.makedirs(out, exist_ok=True)
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in sc.objects:
        if o.type == 'MESH' and o.get('anim') != 'propdisc':
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    centre = (lo + hi) / 2
    ext = hi - lo
    world = bpy.data.worlds.new('chk')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.75, 0.78, 0.82, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    sc.world = world
    sun = bpy.data.lights.new('chk-sun', 'SUN')
    sun.energy = 3.0
    sun_ob = link(bpy.data.objects.new('_chk-sun', sun))
    sun_ob.rotation_euler = (R(50), 0, R(-35))
    if decals:
        dm = bpy.data.materials.new('_decal')
        dm.use_nodes = True
        dm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.08, 0.05, 1)
        for o in sc.objects:
            if o.get('anim') == 'decal':
                o.hide_render = False
                o.data.materials.clear()
                o.data.materials.append(dm)
    cam_data = bpy.data.cameras.new('chk')
    cam_data.type = 'ORTHO'
    cam_data.clip_end = 2000
    cam = link(bpy.data.objects.new('_chk-cam', cam_data))
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.cycles.samples = 16
    sc.cycles.use_denoising = True
    aspect = size[0] / size[1]
    shots = {
        'front': (Vector((0, -1, 0)), ext.x, ext.z),
        'side': (Vector((1, 0, 0)), ext.y, ext.z),
        'top': (Vector((0, 0, 1)), ext.x, ext.y),
        'bottom': (Vector((0, 0, -1)), ext.x, ext.y),
    }
    files = []
    for key, (d, w, h) in shots.items():
        cam_data.ortho_scale = max(w, h * aspect) * 1.06
        cam.location = centre + d * 300
        up = 'Y'
        cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler()
        if key == 'top':
            cam.rotation_euler = (0, 0, 0)
        if key == 'bottom':
            cam.rotation_euler = (math.pi, 0, 0)
        sun_ob.rotation_euler = (R(50), 0, R(-35)) if key != 'bottom' else (R(180 - 40), 0, R(-35))
        sc.render.filepath = os.path.join(out, f'_chk-{key}.png')
        bpy.ops.render.render(write_still=True)
        files.append(sc.render.filepath)
    # one sheet
    tiles = []
    for f in files:
        img = bpy.data.images.load(f)
        a = np.empty(size[0] * size[1] * 4, np.float32)
        img.pixels.foreach_get(a)
        tiles.append(a.reshape(size[1], size[0], 4))
        bpy.data.images.remove(img)
        os.remove(f)
    sheet = np.vstack([np.hstack(tiles[2:4]), np.hstack(tiles[0:2])])     # image rows run bottom-up
    img = bpy.data.images.new('_sheet', size[0] * 2, size[1] * 2, alpha=False)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = os.path.join(out, 'check-ortho.png')
    img.file_format = 'PNG'
    img.save()
    print('  check', img.filepath_raw)
    # back faces
    bf = bpy.data.materials.new('_backface')
    bf.use_nodes = True
    nt = bf.node_tree
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mix = nt.nodes.new('ShaderNodeMixShader')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, 0, 0, 1)
    em.inputs['Strength'].default_value = 2.0
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.55, 0.57, 0.6, 1)
    nt.links.new(geo.outputs['Backfacing'], mix.inputs[0])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    seen = set()
    for o in sc.objects:
        if o.type == 'MESH' and o.get('anim') not in SPECIAL and o.data not in seen:
            seen.add(o.data)
            o.data.materials.clear()
            o.data.materials.append(bf)
    cam_data.type = 'PERSP'
    cam_data.lens = 70
    radius = ext.length / 2
    for i, (az, el) in enumerate(((-38, 24), (150, -28))):
        a, e = R(az), R(el)
        eye = centre + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * radius * 4.4
        cam.location = eye
        cam.rotation_euler = (centre - eye).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, f'check-back-{i}.png')
        bpy.ops.render.render(write_still=True)
        print('  check', sc.render.filepath)


# ---------------------------------------------------------------- quick shape check (no ray tracing)

VIEWPORT = {'paint': (0.42, 0.45, 0.36), 'glass': (0.04, 0.07, 0.09), 'soot': (0.07, 0.055, 0.05), 'blade': (0.04, 0.04, 0.04),
            'blade-tip': (0.8, 0.6, 0.05), 'gunmetal': (0.1, 0.1, 0.11), 'dark': (0.01, 0.01, 0.01), 'rubber': (0.03, 0.03, 0.03),
            'engine': (0.1, 0.1, 0.11), 'hub': (0.25, 0.25, 0.26), 'leather': (0.2, 0.12, 0.07)}


def quick_views(name, persp=((-38, 16), (150, -24), (-60, 8, 0.5), (20, 4, 0.6)), size=(1100, 700)):
    """Workbench renders for judging shape in seconds: an orthographic sheet (front, side / top,
    bottom) and a few perspective views, written as quick-*.png. Back faces are culled as the game
    will cull them, so a face turned inside out shows as a hole. Markings are drawn red."""
    sc = bpy.context.scene
    out = os.path.join(BUILD, name)
    os.makedirs(out, exist_ok=True)
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.show_shadows = False
    sh.show_backface_culling = True
    sh.show_specular_highlight = True
    try:
        sc.display.render_aa = '16'
    except Exception:
        pass
    world = bpy.data.worlds.new('quick')
    world.color = (0.5, 0.56, 0.63)
    sc.world = world
    sc.view_settings.view_transform = 'Standard'
    for m in bpy.data.materials:
        key = m.name.split('.')[0]
        col = VIEWPORT.get(key, VIEWPORT['paint'] if key.startswith('paint') else (0.4, 0.4, 0.4))
        m.diffuse_color = (*col, 1)
        m.roughness = 0.15 if key == 'glass' else 0.6
    dm = bpy.data.materials.new('_decal')
    dm.diffuse_color = (0.85, 0.1, 0.06, 1)
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in sc.objects:
        if o.get('anim') == 'propdisc':
            o.hide_render = True
        if o.get('anim') == 'decal':
            o.hide_render = False
            o.data.materials.clear()
            o.data.materials.append(dm)
        if o.type == 'MESH' and o.get('anim') != 'propdisc':
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    centre, ext = (lo + hi) / 2, hi - lo
    cam_data = bpy.data.cameras.new('quick')
    cam_data.clip_end = 3000
    cam = link(bpy.data.objects.new('_quick-cam', cam_data))
    sc.camera = cam
    small = (size[0] * 9 // 11, size[1] * 9 // 11)
    sc.render.resolution_x, sc.render.resolution_y = small
    aspect = small[0] / small[1]
    cam_data.type = 'ORTHO'
    tiles = []
    for key, d, w, h in (('front', Vector((0, -1, 0)), ext.x, ext.z), ('side', Vector((1, 0, 0)), ext.y, ext.z),
                         ('top', Vector((0, 0, 1)), ext.x, ext.y), ('bottom', Vector((0, 0, -1)), ext.x, ext.y)):
        cam_data.ortho_scale = max(w, h * aspect) * 1.06
        cam.location = centre + d * 300
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        if key == 'top':
            cam.rotation_euler = (0, 0, 0)
        if key == 'bottom':
            cam.rotation_euler = (math.pi, 0, 0)
        sc.render.filepath = os.path.join(out, f'_quick-{key}.png')
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(sc.render.filepath)
        a = np.empty(small[0] * small[1] * 4, np.float32)
        img.pixels.foreach_get(a)
        tiles.append(a.reshape(small[1], small[0], 4))
        bpy.data.images.remove(img)
        os.remove(sc.render.filepath)
    sheet = np.vstack([np.hstack(tiles[2:4]), np.hstack(tiles[0:2])])
    img = bpy.data.images.new('_sheet', small[0] * 2, small[1] * 2, alpha=False)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = os.path.join(out, 'quick-ortho.png')
    img.file_format = 'PNG'
    img.save()
    print('  quick', img.filepath_raw)
    cam_data.type = 'PERSP'
    cam_data.lens = 70
    sc.render.resolution_x, sc.render.resolution_y = size
    radius = ext.length / 2
    for i, view in enumerate(persp):
        a, e = R(view[0]), R(view[1])
        dist = radius * 4.6 * (view[2] if len(view) > 2 else 1.0)
        eye = centre + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
        cam.location = eye
        cam.rotation_euler = (centre - eye).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, f'quick-{i}.png')
        bpy.ops.render.render(write_still=True)
        print('  quick', sc.render.filepath)
