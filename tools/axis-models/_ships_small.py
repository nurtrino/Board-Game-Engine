# Shared builders for the destroyer, the submarine and the transport: a hull lofted from stations,
# railing runs, guns, boats and the small fittings that make a deck look busy.
import sys, os, math, bisect
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

PI = math.pi
deg = math.degrees


# ---------------------------------------------------------------- small maths

def curve(pts):
    """A smooth, overshoot-free curve through (x, value) points. Flat beyond the ends."""
    xs = [float(p[0]) for p in pts]
    vs = [float(p[1]) for p in pts]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(vs[i + 1] - vs[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return vs[0]
        if x >= xs[-1]:
            return vs[-1]
        i = bisect.bisect_right(xs, x) - 1
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


def frange(a, b, step):
    n = max(1, round(abs(b - a) / step))
    return [a + (b - a) * i / n for i in range(n + 1)]


def rz(v, a):
    """Turn a point about z by a degrees."""
    c, s = math.cos(R(a)), math.sin(R(a))
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2])


# ---------------------------------------------------------------- primitives

def bx(sx, sy, sz, at=(0, 0, 0), mat=None, rot=(0, 0, 0), w=0.0, name='b'):
    return hard(box(name, sx, sy, sz, at=at, rot=rot, mat=mat), w)


def cy(r, d, at=(0, 0, 0), mat=None, rot=(0, 0, 0), segs=10, r2=None, w=0.0, caps=True, name='c'):
    ob = cyl(name, r, d, at=at, rot=rot, segs=segs, r2=r2, mat=mat, caps=caps)
    if segs <= 4:
        return hard(ob, w)
    return hard(ob, w, sharp=75 if segs <= 6 else 50)


def lat(profile, at=(0, 0, 0), mat=None, rot=(0, 0, 0), segs=10, sharp=50, name='l'):
    return shade(lathe(name, profile, segs=segs, at=at, rot=rot, mat=mat), 75 if segs <= 6 else sharp)


def tube(pts, r, mat=None, segs=6, caps=True, name='tube', radii=None):
    """A round bar swept along a path."""
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rings, prev = [], None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
            u = t.cross(ref).normalized()
        else:
            u = (prev - t * prev.dot(t)).normalized()
        v = t.cross(u)
        prev = u
        rr = radii[i] if radii else r
        rings.append([tuple(p + (u * math.cos(2 * PI * k / segs) + v * math.sin(2 * PI * k / segs)) * rr) for k in range(segs)])
    ob = loft(name, rings, cap_start=caps, cap_end=caps, mat=mat)
    return shade(ob, 100 if segs <= 4 else 75 if segs <= 6 else 50)


def wire(a, b, r=0.022, mat=None, segs=3):
    return tube([a, b], r, mat, segs=segs, caps=False, name='wire')


def sym(st):
    """A plan outline from (y, half-width) stations, front to back."""
    return [(x, y) for y, x in st] + [(-x, y) for y, x in reversed(st)]


def rect(xh, y0, y1):
    return [(xh, y0), (xh, y1), (-xh, y1), (-xh, y0)]


def circle(r, at=(0, 0), segs=12, a0=0.0):
    return [(at[0] + r * math.cos(2 * PI * i / segs + a0), at[1] + r * math.sin(2 * PI * i / segs + a0)) for i in range(segs)]


def offset(outline, d):
    """Grow (d > 0) or shrink a counter-clockwise plan outline."""
    n, out = len(outline), []
    for i in range(n):
        p0, p1, p2 = Vector(outline[i - 1]), Vector(outline[i]), Vector(outline[(i + 1) % n])
        e1, e2 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n1, n2 = Vector((e1.y, -e1.x)), Vector((e2.y, -e2.x))
        m = n1 + n2
        if m.length < 1e-6:
            m = n1.copy()
        m.normalize()
        k = d / max(0.35, m.dot(n1))
        out.append((p1.x + m.x * k, p1.y + m.y * k))
    return out


def slab(outline, z0, z1, mat=None, w=0.0, name='slab', sharp=50):
    """A plan outline pushed up from z0 to z1."""
    ob = loft(name, [[(x, y, z0) for x, y in outline], [(x, y, z1) for x, y in outline]], mat=mat)
    return hard(ob, w, sharp=sharp)


def wall(path, h, t, mat=None, closed=False, w=0.0, name='wall'):
    """A thin plate standing on a path of (x, y, z) points; its thickness goes to the left of travel."""
    pts = [Vector(p) for p in path]
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        a = pts[i - 1] if (closed or i > 0) else None
        b = pts[(i + 1) % n] if (closed or i < n - 1) else None
        ns = []
        for u, v in ((a, p), (p, b)):
            if u is None or v is None:
                continue
            e = Vector((v.x - u.x, v.y - u.y))
            if e.length < 1e-6:
                continue
            e.normalize()
            ns.append(Vector((-e.y, e.x)))
        m = ns[0].copy() if len(ns) == 1 else (ns[0] + ns[1])
        if m.length < 1e-6:
            m = ns[0].copy()
        m.normalize()
        k = t / max(0.35, m.dot(ns[0]))
        q = Vector((p.x + m.x * k, p.y + m.y * k, p.z))
        rings.append([tuple(p), (p.x, p.y, p.z + h), (q.x, q.y, q.z + h), tuple(q)])
    if closed:
        rings.append(rings[0])
    ob = loft(name, rings, cap_start=not closed, cap_end=not closed, mat=mat)
    if closed:
        weld(ob)
    return hard(ob, w)


def edge_places(outline, z, step=0.9, out=0.0, pick=None):
    """Places (at, rot) along the edges of a plan outline for a part built facing +x."""
    places = []
    n = len(outline)
    for i in range(n):
        p, q = Vector(outline[i]), Vector(outline[(i + 1) % n])
        e = q - p
        ln = e.length
        if ln < 1e-4:
            continue
        nrm = Vector((e.y, -e.x)) / ln
        k = max(1, round(ln / step))
        for j in range(k):
            c = p + e * ((j + 0.5) / k)
            if pick and not pick(c.x, c.y, ln / k):
                continue
            places.append(((c.x + nrm.x * out, c.y + nrm.y * out, z), (0, 0, deg(math.atan2(nrm.y, nrm.x)))))
    return places


def stamp(proto, places, name=None):
    """Like copies(), but a place may carry a scale as well: (at, rot[, scale])."""
    unwrap_now(proto)
    out = []
    for i, pl in enumerate(places):
        me = proto.data.copy()
        o = link(bpy.data.objects.new(f'{name or proto.name}.{i}', me))
        xform(o, pl[0], pl[1], pl[2] if len(pl) > 2 else (1, 1, 1))
        out.append(o)
    data = proto.data
    bpy.data.objects.remove(proto)
    bpy.data.meshes.remove(data)
    return out


def face_mats(ob, mats, pick):
    """Give a mesh several materials: pick(face index) returns the slot."""
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)
    for i, poly in enumerate(ob.data.polygons):
        poly.material_index = pick(i)
    return ob


# ---------------------------------------------------------------- materials

class Mats:
    pass


def ship_mats(deck=(0.085, 0.09, 0.098), red=(0.21, 0.043, 0.033)):
    m = Mats()
    m.PAINT = paint('paint', dirt=0.9, wear=0.9, gloss=0.5)
    m.RED = plain('antifoul', red, rough=0.82, dirt=0.8, vary=0.22, bump=0.4)
    m.BOOT = plain('boot', (0.022, 0.022, 0.025), rough=0.62, dirt=0.5)
    m.DECK = plain('deck', deck, rough=0.84, dirt=0.75, rust=0.22, bump=0.45)
    m.STEEL = plain('steel', (0.10, 0.082, 0.07), rough=0.62, metal=0.7, rust=0.85, dirt=0.6)
    m.GUN = plain('gunmetal', (0.055, 0.055, 0.06), rough=0.42, metal=0.9, dirt=0.3, vary=0.08)
    m.CANVAS = plain('canvas', (0.34, 0.32, 0.25), rough=0.95, vary=0.2, dirt=0.7, bump=0.5, fine_scale=140.0)
    m.SOOT = plain('soot', (0.018, 0.018, 0.018), rough=0.9, dirt=0.3)
    m.BRONZE = plain('bronze', (0.42, 0.27, 0.10), rough=0.38, metal=0.9, dirt=0.4)
    m.WIRE = plain('wire', (0.045, 0.045, 0.05), rough=0.6, metal=0.5, dirt=0.3, vary=0.05)
    m.GLASS = glass()
    return m


# ---------------------------------------------------------------- hull

class Hull:
    """A ship's hull from lines. Every argument but ys is a function of y:
    deck_z (sheer), deck_half (deck edge half-breadth), wl_half (waterline half-breadth), keel_z (the
    profile of the bottom: below zero under water, above zero where the stem or counter overhangs),
    full (section fullness: 1 is a V, 4 is a box), flare (above-water curve: 1 straight, 2 hollow),
    lip (height of the gunwale bar or bulwark)."""

    def __init__(self, ys, deck_z, deck_half, wl_half, keel_z, full, flare, lip=None, lip_w=0.12,
                 boot=(-0.3, 0.45), n_low=5, n_up=4):
        self.ys, self.deck, self.edge, self.wl, self.keel = ys, deck_z, deck_half, wl_half, keel_z
        self.full, self.flare, self.lip, self.lip_w = full, flare, lip, lip_w
        self.boot, self.n_low, self.n_up = boot, n_low, n_up

    def half(self, y, z):
        zb, zd = self.keel(y), self.deck(y)
        if z <= zb + 1e-6:
            return 0.0
        if z < 0.0:
            h = (z - zb) / (-zb)
            p = self.full(y)
            return self.wl(y) * (1.0 - (1.0 - h) ** p) ** (1.0 / p)
        z0 = max(0.0, zb)
        bw = self.wl(y) if zb < 0 else 0.0
        k = (z - z0) / max(1e-6, zd - z0)
        g = self.flare(y)
        f = k ** g if k <= 1 else 1 + g * (k - 1)
        return max(0.0, bw + (self.edge(y) - bw) * f)

    def rows(self, y, collapse=False):
        zb, zd = self.keel(y), self.deck(y)
        zb = min(zb, zd)
        zlo, zhi = self.boot
        zs = []
        for j in range(self.n_low + 1):
            u = (j / self.n_low) ** 2.0
            zs.append(zb + (zlo - zb) * u if zb < zlo else zb)
        z0 = min(max(zb, zhi), zd)
        zs.append(z0)
        for j in range(1, self.n_up + 1):
            zs.append(z0 + (zd - z0) * j / self.n_up)
        pts = [(0.0 if collapse else self.half(y, z), y, z) for z in zs]
        pts[0] = (0.0, y, zs[0])
        if self.lip:
            lh = self.lip(y)
            xo = 0.0 if collapse else self.half(y, zd + lh)
            xi = 0.0 if collapse else max(0.0, min(pts[-1][0], xo) - self.lip_w)
            pts += [(xo, y, zd + lh), (xi, y, zd + lh), (xi, y, zd)]
        return pts

    def build(self, name, red, boot, paint_, deck, split=()):
        st = [(y, False) for y in self.ys]
        if self.edge(self.ys[0]) > 0.02:
            st.insert(0, (self.ys[0], True))
        if self.edge(self.ys[-1]) > 0.02:
            st.append((self.ys[-1], True))
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
            return 0 if j < nl else 1 if j == nl else 3 if j == m - 1 else 2
        face_mats(ob, (red, boot, paint_, deck), pick)
        weld(ob, 1e-4)
        outward(ob)
        return split_rings(shade(ob, 40), split)

    def side(self, y, z, s=1, out=0.0):
        """Where the shell is at (y, z) on side s, and the turn that points a +x-facing part outward."""
        h = self.half(y, z)
        e = 0.05
        hy = (self.half(y + e, z) - self.half(y - e, z)) / (2 * e)
        hz = (self.half(y, z + e) - self.half(y, z - e)) / (2 * e)
        nrm = Vector((s, -hy, -hz)).normalized()
        b = -math.asin(max(-1, min(1, nrm.z)))
        a = math.atan2(nrm.y, nrm.x)
        return ((s * h + nrm.x * out, y + nrm.y * out, z + nrm.z * out), (0, deg(b), deg(a)))

    def strake(self, ys, zf, out, hgt, mat, name='strake', w=0.0):
        """A bar following the shell (a bilge keel, a rubbing strake), on the +x side."""
        rings = []
        for y in ys:
            z = zf(y)
            h = self.half(y, z)
            rings.append([(h - 0.05, y, z - hgt / 2), (h + out, y, z - hgt / 2), (h + out, y, z + hgt / 2), (h - 0.05, y, z + hgt / 2)])
        return hard(loft(name, rings, mat=mat), w)


class Rails:
    """Stanchions and wires. Collect runs, then build() stamps them all from two shared parts."""

    def __init__(self, h=1.05, bay=2.3, levels=(0.54, 1.03), post=0.032, wire_r=0.02):
        self.h, self.bay, self.levels, self.post, self.wire_r = h, bay, levels, post, wire_r
        self.posts, self.wires = [], []

    def run(self, path, closed=False, last=True):
        pts = [Vector(p) for p in path]
        if closed:
            pts.append(pts[0])
        for a, b in zip(pts, pts[1:]):
            d = b - a
            ln = d.length
            if ln < 1e-3:
                continue
            n = max(1, round(ln / self.bay))
            for i in range(n):
                self.posts.append(tuple(a + d * (i / n)))
            yaw = deg(math.atan2(-d.x, d.y))
            pitch = deg(math.atan2(d.z, math.hypot(d.x, d.y)))
            for lv in self.levels:
                self.wires.append(((a.x, a.y, a.z + lv), (pitch, 0, yaw), (1, ln, 1)))
        if last and not closed:
            self.posts.append(tuple(pts[-1]))

    def build(self, mat):
        out = []
        if self.posts:
            post = cyl('post', self.post * 1.15, self.h, at=(0, 0, self.h / 2), segs=3, caps=False, mat=mat)
            out += stamp(shade(post, 130), [(p, (0, 0, 0)) for p in self.posts])
        if self.wires:
            w = cyl('rail', self.wire_r, 1.0, at=(0, 0.5, 0), rot=(-90, 0, 0), segs=3, caps=False, mat=mat)
            out += stamp(shade(w, 130), self.wires)
        return out


# ---------------------------------------------------------------- placing moving parts

def mount_set(base, child, places, muzzles=(), kind='naval', mname='muzzle.{i}', start=1):
    """Put a yaw part (built at the origin, facing -y) and its pitch child at each (at, turn about z).
    The first place uses the objects themselves, the rest are instances. Muzzle markers follow."""
    out = []
    piv = child.location.copy() if child is not None else None
    for i, (at, turn) in enumerate(places):
        m = Matrix.Translation(Vector(at)) @ Matrix.Rotation(R(turn), 4, 'Z')
        if i == 0:
            b = base
            b.location = at
            b.rotation_euler = (0, 0, R(turn))
        else:
            b = instance(base, f'{base.name}.{i + 1}', at=at, rot=(0, 0, turn))
        c = None
        if child is not None:
            wpos = m @ piv
            if i == 0:
                c = child
                c.location = wpos
                c.rotation_euler = (0, 0, R(turn))
            else:
                c = instance(child, f'{child.name}.{i + 1}', at=wpos, rot=(0, 0, turn))
            parent(c, b)
        for k, mz in enumerate(muzzles):
            e = marker(mname.format(i=i + start, k='LR'[k] if len(muzzles) == 2 else str(k + 1)), tuple(m @ Vector(mz)), None, kind=kind)
            e.rotation_euler = (0, 0, R(turn))
            parent(e, c if c is not None else b)
        out.append((b, c))
    return out


# ---------------------------------------------------------------- guns

def gunhouse5(M):
    """A 5-inch single in an enclosed gunhouse. Returns (turret, gun, trunnion, muzzle)."""
    P = M.PAINT
    st = [(-2.05, 0.95, 1.95), (-1.7, 1.22, 2.38), (-0.85, 1.6, 2.75), (1.85, 1.6, 2.75), (2.4, 1.2, 2.6)]
    rings = [[(-x, y, 0.26), (x, y, 0.26), (x, y, zt), (-x, y, zt)] for y, x, zt in st]
    t = [hard(loft('gh', rings, mat=P), 0.045)]
    t.append(cy(1.52, 0.28, (0, 0.1, 0.14), P, segs=12))
    for s in (-1, 1):
        t.append(bx(0.22, 0.6, 0.44, (s * 1.62, -0.7, 2.08), P, w=0.03))
        t.append(bx(0.06, 0.05, 0.2, (s * 1.62, -1.02, 2.08), M.GLASS))
        t.append(bx(0.05, 0.78, 1.55, (s * 1.615, 0.85, 1.25), P))
        t.append(bx(0.035, 2.3, 0.1, (s * 1.3, 0.5, 2.8), P))
        t.append(bx(0.08, 0.5, 0.08, (s * 1.64, 0.85, 2.15), P))
    t.append(bx(0.74, 0.86, 0.3, (0.72, 1.12, 2.88), P, w=0.035))
    t.append(bx(0.5, 0.05, 0.12, (0.72, 0.68, 2.93), M.GLASS))
    t.append(bx(0.56, 0.56, 0.05, (-0.72, 0.3, 2.78), P))
    t.append(cy(0.17, 0.2, (-0.7, 1.4, 2.85), P, segs=6))
    t.append(bx(0.7, 0.06, 1.0, (0, 2.41, 1.15), P))
    for z in (0.8, 1.4, 2.0):
        t.append(bx(0.36, 0.05, 0.035, (-0.95, 2.34, z), P, rot=(0, 0, 36)))
    turret = join('turret.main', t)
    tr = (0.0, -1.15, 1.72)
    g = []
    prof = [(0.0, 0.55), (0.27, 0.55), (0.27, 1.25), (0.2, 1.36), (0.165, 2.7), (0.122, 4.56), (0.14, 4.6), (0.14, 4.72), (0.07, 4.72), (0.0, 4.55)]
    g.append(lat(prof, at=tr, mat=P, rot=(90, 0, 0), segs=8, sharp=35))
    g.append(lat([(0.0, 0.8), (0.56, 0.84), (0.52, 1.1), (0.33, 1.5), (0.26, 1.56), (0.0, 1.56)], at=tr, mat=M.CANVAS, rot=(90, 0, 0), segs=8))
    gun = join('guns.main', g)
    pivot(gun, tr)
    return turret, gun, tr, (0.0, tr[1] - 4.8, tr[2])


def open_gun(M, length=3.8, bore=0.076, shield=False, name='mount', gname='gun'):
    """A pedestal gun in the open (a 3-inch or 4-inch). Returns (mount, gun, trunnion, muzzle)."""
    P, k = M.PAINT, bore / 0.076
    t = [lat([(0.66, 0.0), (0.66, 0.07), (0.4, 0.16), (0.3, 0.95), (0.44, 1.02), (0.44, 1.16)], mat=P, segs=10)]
    for s in (-1, 1):
        t.append(bx(0.09, 0.62, 0.62, (s * 0.36, 0.02, 1.42), P, w=0.03))
        t.append(cy(0.2, 0.05, (s * 0.62, 0.42, 1.2), M.STEEL, rot=(0, 90, 0), segs=8))
        t.append(bx(0.24, 0.05, 0.05, (s * 0.5, 0.42, 1.2), P))
        t.append(bx(0.34, 0.3, 0.05, (s * 0.62, 0.78, 0.72), P))
        t.append(bx(0.05, 0.05, 0.5, (s * 0.52, 0.66, 0.92), P))
    t.append(bx(0.07, 0.36, 0.1, (-0.46, -0.1, 1.86), M.GUN))
    t.append(bx(0.05, 0.05, 0.22, (-0.46, -0.05, 1.72), P))
    if shield:
        for s in (-1, 1):
            t.append(bx(0.72, 0.04, 1.25, (s * 0.62, -0.62, 1.42), P))
            t.append(bx(0.6, 0.04, 1.25, (s * 1.2, -0.42, 1.42), P, rot=(0, 0, s * -40)))
        t.append(bx(1.96, 0.04, 0.34, (0, -0.62, 2.2), P))
        t.append(bx(1.5, 0.5, 0.04, (0, -0.4, 2.38), P, rot=(-12, 0, 0)))
    mount = join(name, t)
    tr = (0.0, 0.0, 1.5)
    g = []
    prof = [(0.0, -0.75), (0.15 * k, -0.75), (0.17 * k, -0.2), (0.17 * k, 0.95), (0.125 * k, 1.05), (0.1 * k, length * 0.55), (0.066 * k, length - 0.75),
            (0.08 * k, length - 0.73), (0.08 * k, length - 0.75 + 0.1), (0.04 * k, length - 0.65), (0.04 * k, length - 0.9), (0.0, length - 0.9)]
    g.append(lat(prof, at=tr, mat=P, rot=(90, 0, 0), segs=8, sharp=35))
    g.append(bx(0.34 * k, 0.42, 0.36 * k, (0, 0.85, 1.5), M.GUN, w=0.025))
    g.append(cy(0.065 * k, 1.3, (0, -0.35, 1.5 - 0.23 * k), P, rot=(90, 0, 0), segs=6))
    g.append(cy(0.05 * k, 1.0, (0, -0.25, 1.5 + 0.22 * k), P, rot=(90, 0, 0), segs=6))
    gun = join(gname, g)
    pivot(gun, tr)
    return mount, gun, tr, (0.0, -(length - 0.6), 1.5)


def oerlikon(M, name='aa', gname='aa.guns', lite=False):
    """A 20 mm on a cone pedestal with a split shield. Returns (mount, gun, trunnion, muzzle)."""
    P = M.PAINT
    if lite:
        t = [lat([(0.34, 0.0), (0.12, 0.16), (0.1, 1.1), (0.15, 1.22)], mat=P, segs=6)]
    else:
        t = [lat([(0.36, 0.0), (0.34, 0.05), (0.13, 0.16), (0.1, 1.05), (0.15, 1.1), (0.15, 1.22)], mat=P, segs=8)]
    for s in (-1, 1):
        t.append(bx(0.5, 0.03, 0.7, (s * 0.36, -0.3, 1.42), P, rot=(8, 0, s * -9), w=0.0 if lite else 0.01))
        if not lite:
            t.append(bx(0.05, 0.3, 0.3, (s * 0.1, 0.0, 1.3), P))
    mount = join(name, t)
    tr = (0.0, 0.0, 1.36)
    g = [bx(0.12, 0.72, 0.15, (0, 0.05, 1.36), M.GUN, w=0.0 if lite else 0.015)]
    if lite:
        g.append(cy(0.034, 1.45, (0, -1.0, 1.36), M.GUN, rot=(90, 0, 0), segs=4))
        g.append(cy(0.17, 0.13, (0, -0.02, 1.52), M.GUN, rot=(90, 0, 0), segs=6))
    else:
        g.append(cy(0.045, 0.5, (0, -0.55, 1.36), M.GUN, rot=(90, 0, 0), segs=6))
        g.append(cy(0.026, 0.95, (0, -1.25, 1.36), M.GUN, rot=(90, 0, 0), segs=5))
        g.append(cy(0.17, 0.13, (0, -0.02, 1.52), M.GUN, rot=(90, 0, 0), segs=10))
        g.append(cy(0.07, 0.015, (0, -0.28, 1.56), M.GUN, rot=(90, 0, 0), segs=8))
    for s in (-1, 1):
        g.append(bx(0.035, 0.46, 0.035, (s * 0.17, 0.62, 1.34), M.GUN, rot=(0, 0, s * 9)))
        if not lite:
            g.append(bx(0.05, 0.06, 0.24, (s * 0.2, 0.84, 1.28), M.GUN))
    gun = join(gname, g)
    pivot(gun, tr)
    return mount, gun, tr, (0.0, -1.75, 1.36)


def bofors_twin(M, name='aa', gname='aa.guns'):
    """A twin 40 mm. Returns (mount, gun, trunnion, (muzzle L, muzzle R))."""
    P = M.PAINT
    t = [cy(1.0, 0.12, (0, 0, 0.06), P, segs=10)]
    t.append(bx(1.9, 1.7, 0.06, (0, 0.25, 0.17), P))
    for s in (-1, 1):
        t.append(shade(prism('cheek', [(-0.45, 0.2), (0.45, 0.2), (0.22, 1.2), (-0.22, 1.2)], s * 0.48 - 0.05, s * 0.48 + 0.05, mat=P), 30))
        t.append(bx(0.3, 0.3, 0.06, (s * 0.8, 0.5, 0.62), P))
        t.append(bx(0.3, 0.05, 0.3, (s * 0.8, 0.66, 0.78), P))
        t.append(bx(0.05, 0.05, 0.42, (s * 0.8, 0.5, 0.4), P))
        t.append(bx(0.04, 0.04, 0.5, (s * 0.72, -0.1, 1.2), M.GUN))
        t.append(bx(0.2, 0.02, 0.2, (s * 0.72, -0.12, 1.5), M.GUN, rot=(0, 45, 0)))
        t.append(cy(0.13, 0.04, (s * 0.95, 0.1, 0.9), M.STEEL, rot=(0, 90, 0), segs=6))
    t.append(bx(1.5, 0.05, 0.5, (0, 1.08, 0.45), P))
    mount = join(name, t)
    tr = (0.0, 0.0, 1.05)
    g, mz = [], []
    for s in (-1, 1):
        x = s * 0.2
        g.append(bx(0.26, 1.15, 0.36, (x, 0.2, 1.05), P, w=0.03))
        g.append(bx(0.14, 0.5, 0.42, (x, 0.3, 1.4), M.GUN, rot=(-18, 0, 0)))
        g.append(cy(0.085, 0.65, (x, -0.7, 1.05), P, rot=(90, 0, 0), segs=6, caps=False))
        g.append(cy(0.042, 1.35, (x, -1.7, 1.05), M.GUN, rot=(90, 0, 0), segs=5, r2=0.05, caps=False))
        g.append(cy(0.045, 0.24, (x, -2.48, 1.05), M.GUN, rot=(90, 0, 0), segs=5, r2=0.075))
        mz.append((x, -2.62, 1.05))
    gun = join(gname, g)
    pivot(gun, tr)
    return mount, gun, tr, mz


# ---------------------------------------------------------------- fittings

def porthole(M, r=0.25):
    """A rimmed scuttle, facing +x."""
    segs = 6

    def ring(rr, x):
        return [(x, rr * math.cos(2 * PI * i / segs), rr * math.sin(2 * PI * i / segs)) for i in range(segs)]
    ob = loft('port', [ring(r, -0.02), ring(r * 0.74, 0.05)], cap_start=False, cap_end=True)
    face_mats(ob, (M.PAINT, M.GLASS), lambda i: 1 if i == segs else 0)
    return shade(ob, 40)


def door(M, w=0.75, h=1.75):
    """A watertight door with its frame and dogs, facing +x."""
    parts = [bx(0.05, w, h, (0.02, 0, h / 2 + 0.2), M.PAINT), bx(0.03, w - 0.22, h - 0.28, (0.055, 0, h / 2 + 0.2), M.PAINT)]
    parts.append(bx(0.03, 0.16, 0.16, (0.08, 0, h / 2 + 0.25), M.STEEL, rot=(45, 0, 0)))
    return join('door', parts)


def bitts(M):
    """A pair of mooring bollards on a base plate, along y."""
    parts = [bx(0.42, 1.3, 0.06, (0, 0, 0.03), M.STEEL)]
    for y in (-0.38, 0.38):
        parts.append(lat([(0.15, 0.05), (0.15, 0.5), (0.21, 0.55), (0.0, 0.63)], at=(0, y, 0), mat=M.STEEL, segs=6))
    return join('bitts', parts)


def chock(M):
    """A closed fairlead at the deck edge, opening along x."""
    parts = [bx(0.3, 0.16, 0.36, (0, y, 0.18), M.STEEL) for y in (-0.36, 0.36)]
    parts.append(bx(0.3, 0.9, 0.1, (0, 0, 0.38), M.STEEL))
    return join('chock', parts)


def mushroom(M, h=0.6, r=0.3):
    return lat([(r * 0.42, 0.0), (r * 0.42, h * 0.75), (r, h * 0.8), (r, h * 0.92), (0.0, h)], mat=M.PAINT, segs=5, name='vent')


def cowl(M, h=2.2, r=0.38, segs=6):
    """A ventilator cowl, mouth facing -y."""
    pts = [(0, 0, 0), (0, 0, h * 0.72), (0, -r * 0.5, h * 0.93), (0, -r * 1.25, h)]
    ob = tube(pts, r * 0.62, M.PAINT, segs=segs, caps=False, radii=[r * 0.62, r * 0.62, r * 0.75, r * 1.0], name='cowl')
    mouth = cy(r * 0.93, 0.02, (0, -r * 1.2, h), M.SOOT, rot=(90 - 38, 0, 0), segs=segs)
    return join('cowl', [ob, mouth])


def hatch(M, w=0.8):
    """A deck scuttle with a hand wheel."""
    parts = [bx(w, w, 0.2, (0, 0, 0.1), M.PAINT), bx(w + 0.06, w + 0.06, 0.05, (0, 0, 0.22), M.PAINT)]
    parts.append(bx(0.2, 0.2, 0.04, (0, 0, 0.27), M.STEEL, rot=(0, 0, 45)))
    return join('hatch', parts)


def locker(M, sx=0.9, sy=0.6, sz=0.8):
    parts = [bx(sx, sy, sz, (0, 0, sz / 2), M.PAINT, w=0.025), bx(sx + 0.04, sy + 0.04, 0.04, (0, 0, sz), M.PAINT)]
    return join('locker', parts)


def raft(M, ln=2.6, wd=1.3):
    """A life float lying flat, long side along y."""
    path = [(a, b, 0) for a, b, _ in superellipse(wd / 2, ln / 2, 4.0, 10)]
    parts = [wall(path, 0.3, 0.28, M.CANVAS, closed=True, name='float'), bx(wd - 0.5, ln - 0.5, 0.05, (0, 0, 0.08), M.STEEL)]
    return join('raft', parts)


def anchor(M):
    """A stockless anchor lying against the shell: facing +x, shank up."""
    parts = [bx(0.16, 0.16, 1.9, (0.1, 0, 1.05), M.STEEL), bx(0.26, 1.2, 0.3, (0.14, 0, 0.12), M.STEEL, w=0.04)]
    for y in (-0.46, 0.46):
        parts.append(bx(0.12, 0.3, 0.95, (0.12, y, 0.65), M.STEEL, rot=(0, -8, 0), w=0.03))
    parts.append(cy(0.16, 0.06, (0.1, 0, 2.02), M.STEEL, rot=(90, 0, 0), segs=6))
    return join('anchor', parts)


def chain(M, path, link_len=0.3):
    """Chain links along a path of points."""
    places = []
    pts = [Vector(p) for p in path]
    k = 0
    for a, b in zip(pts, pts[1:]):
        d = b - a
        n = max(1, round(d.length / link_len))
        yaw = deg(math.atan2(-d.x, d.y))
        pitch = deg(math.atan2(d.z, math.hypot(d.x, d.y)))
        for i in range(n):
            places.append((tuple(a + d * ((i + 0.5) / n)), (pitch, 90 if k % 2 else 0, yaw)))
            k += 1
    return stamp(bx(0.2, link_len * 1.15, 0.055, mat=M.STEEL, name='link'), places)


def capstan(M, r=0.45, h=0.9):
    return lat([(r * 1.25, 0.0), (r * 1.25, 0.08), (r * 0.8, 0.14), (r * 0.62, h * 0.55), (r * 0.9, h * 0.85), (r, h * 0.9), (r, h), (0.0, h + 0.03)], mat=M.STEEL, segs=10, name='capstan')


def searchlight(M, r=0.45):
    """A searchlight on a yoke, facing -y, standing at the origin."""
    parts = [cy(0.12, 0.5, (0, 0, 0.25), M.PAINT, segs=6)]
    for s in (-1, 1):
        parts.append(bx(0.05, 0.14, r + 0.5, (s * (r + 0.05), 0, 0.5 + (r + 0.3) / 2), M.PAINT))
    parts.append(bx(2 * r + 0.15, 0.14, 0.06, (0, 0, 0.5), M.PAINT))
    z = 0.62 + r
    parts.append(lat([(0.0, -r * 0.62), (r * 0.7, -r * 0.6), (r, -r * 0.25), (r, r * 0.55), (r * 0.9, r * 0.6)], at=(0, 0, z), mat=M.PAINT, rot=(90, 0, 0), segs=10))
    parts.append(cy(r * 0.9, 0.02, (0, -r * 0.58, z), M.GLASS, rot=(90, 0, 0), segs=10))
    return join('light', parts)


def tub(M, r=1.8, h=1.05, t=0.07, segs=14, floor=0.08):
    """A round splinter shield with a floor, standing at the origin."""
    return lat([(r, 0.0), (r, h), (r - t, h), (r - t, floor)], mat=M.PAINT, segs=segs, name='tub')


def gusset(M, a=0.8, b=0.8, t=0.05):
    """A triangular bracket under a platform: out along +x, hanging down."""
    v = [(0, -t / 2, 0), (a, -t / 2, 0), (0, -t / 2, -b), (0, t / 2, 0), (a, t / 2, 0), (0, t / 2, -b)]
    f = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    return shade(fix_normals(mesh_obj('gusset', v, f, M.PAINT)), 30)


def ladder(M, p0, p1, width=0.6, step=0.32):
    """An inclined ladder from its foot p0 to its head p1."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    ln = d.length
    yaw = deg(math.atan2(-d.x, d.y))
    pitch = deg(math.atan2(d.z, math.hypot(d.x, d.y)))
    side = Vector((math.cos(R(yaw)), math.sin(R(yaw)), 0))
    mid = (a + b) / 2
    parts = []
    for s in (-1, 1):
        parts.append(bx(0.045, ln, 0.16, tuple(mid + side * (s * width / 2)), M.PAINT, rot=(pitch, 0, yaw)))
    n = max(2, min(6, round(ln / step)))
    for i in range(n):
        parts.append(bx(width, 0.2, 0.03, tuple(a + d * ((i + 0.5) / n)), M.PAINT, rot=(0, 0, yaw)))
    return join('ladder', parts)


def funnel(M, a, b, h, rake=0.0, cap=0.9, base=(0, 0, 0), segs=16, n=2.3, taper=0.94):
    """A funnel standing on base: half-width a, half-length b, raked aft by rake degrees."""
    x0, y0, z0 = base
    k = math.tan(R(rake))

    def ring(sc, grow, z):
        return superellipse(a * sc + grow, b * sc + grow, n, segs, at=(x0, y0 + k * z, z0 + z))
    t2 = (1 + taper) / 2
    rings = [ring(1.0, 0, 0), ring(t2, 0, h * 0.5), ring(taper, 0, h - cap), ring(taper, 0.05, h - cap + 0.03), ring(taper, 0.05, h),
             ring(taper, -0.08, h), ring(taper, -0.08, h - 0.8)]
    ob = loft('funnel', rings, cap_start=False, cap_end=True)
    face_mats(ob, (M.PAINT, M.SOOT), lambda i: 0 if i < 2 * segs else 1)
    return shade(ob, 50)


def boat(M, ln=7.9, beam=2.3, depth=1.0):
    """A ship's boat under a canvas cover: keel on z = 0, bow to -y."""
    st = [(-0.5, 0.03, 0.5), (-0.44, 0.42, 0.2), (-0.3, 0.8, 0.04), (0.0, 1.0, 0.0), (0.28, 0.92, 0.04), (0.44, 0.62, 0.18), (0.5, 0.06, 0.45)]
    rings = []
    for t, wf, kr in st:
        y, b, zk = t * ln, wf * beam / 2, kr * depth
        top = depth * (1 + 0.25 * (2 * t) ** 2)
        rings.append([(0, y, zk), (b * 0.8, y, zk + (top - zk) * 0.45), (b, y, top), (0, y, top + 0.2 * wf + 0.02), (-b, y, top), (-b * 0.8, y, zk + (top - zk) * 0.45)])
    ob = loft('boat', rings)
    face_mats(ob, (M.PAINT, M.CANVAS), lambda i: 1 if i < 36 and i % 6 in (2, 3) else 0)
    return shade(ob, 50)


def davit(M, h=3.2, reach=1.5, r=0.09):
    """A radial davit: stands at the origin, head reaching out along +x."""
    pts = [(0, 0, 0), (0, 0, h * 0.72), (reach * 0.3, 0, h * 0.93), (reach * 0.7, 0, h), (reach, 0, h * 0.97)]
    return tube(pts, r, M.PAINT, segs=5, name='davit', radii=[r * 1.25, r * 1.1, r, r * 0.9, r * 0.8])


def propeller(M, r=1.5, blades=3):
    """A screw on the origin, shaft along y, facing aft (+y)."""
    parts = [lat([(0.0, -0.4 * r), (0.2 * r, -0.36 * r), (0.2 * r, 0.1 * r), (0.0, 0.5 * r)], mat=M.BRONZE, rot=(-90, 0, 0), segs=6)]
    for i in range(blades):
        a = 360.0 * i / blades
        bl = sphere('blade', 1.0, scale=(r * 0.36, 0.03 * r, r * 0.46), segs=6, rings=4, mat=M.BRONZE)
        xform(bl, at=(0, 0, r * 0.56), rot=(0, 0, 28))
        xform(bl, rot=(0, a, 0))
        parts.append(shade(bl, 60))
    return join('prop', parts)


def lift_for_debug():
    """AXM_LIFT=6 raises the whole unit so a draft preview shows the under-water body. Never set it for a real build."""
    lift = float(os.environ.get('AXM_LIFT', '0') or 0)
    if lift and os.environ.get('AXM_DRAFT') == '1':
        bpy.context.view_layer.update()
        for o in bpy.context.scene.objects:
            if o.parent is None:
                o.location.z += lift


def panel(mat, w=1.0, h=0.26):
    """A flat patch facing +x (a freeing port, a limber hole): two triangles."""
    ob = mesh_obj('panel', [(0, -w / 2, -h / 2), (0, w / 2, -h / 2), (0, w / 2, h / 2), (0, -w / 2, h / 2)], [(0, 1, 2, 3)], mat)
    return ob


# ---------------------------------------------------------------- hull finishing and the atlas

def outward(ob):
    """Make a closed shell's faces point out (the baked AO goes black on a shell that faces in)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def split_rings(ob, ys):
    """Cut a lofted shell into separate pieces at the given stations, so no one piece of the atlas has
    to be as long as the ship. Cut only where the shell runs straight: the seam then shades clean."""
    if not ys:
        return ob
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    edges = [e for e in bm.edges if any(abs(e.verts[0].co.y - y) < 1e-4 and abs(e.verts[1].co.y - y) < 1e-4 for y in ys)]
    if edges:
        bmesh.ops.split_edges(bm, edges=edges)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def _uv_area(pick, pinned):
    total = 0.0
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        uv = bm.loops.layers.uv.verify()
        keep = bm.faces.layers.int.get('keep_uv')
        for f in bm.faces:
            if bool(keep and f[keep]) != pinned:
                continue
            pts = [l[uv].uv for l in f.loops]
            a = 0.0
            for i in range(len(pts)):
                a += pts[i].x * pts[(i + 1) % len(pts)].y - pts[(i + 1) % len(pts)].x * pts[i].y
            total += abs(a) / 2
    return total


def _show_faces(pick, pinned):
    n = 0
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        layer = bm.faces.layers.int.get('keep_uv')
        for f in bm.faces:
            is_pinned = bool(layer and f[layer])
            show = pinned is None or is_pinned == pinned
            f.hide_set(not show)
            f.select_set(show)
            n += show
        bm.select_flush_mode()
        bmesh.update_edit_mesh(o.data)
    return n


def even_texels(margin=0.003):
    """Call just before finish(). The kit's unwrap packs the free faces to fill the square after it has
    evened out the texel density, which leaves every stamped part (hundreds of them on a ship) at many
    times the density of the hull. This does the same unwrap here, scales the stamped parts by the
    same amount the free faces were scaled, and pins everything, so the kit only has to pack."""
    datas, pick = set(), []
    for o in baked_meshes():
        if o.data not in datas:
            datas.add(o.data)
            pick.append(o)
            if not o.data.uv_layers:
                o.data.uv_layers.new(name='UVMap')
            if not o.data.attributes.get('keep_uv'):
                o.data.attributes.new('keep_uv', 'INT', 'FACE')
    bpy.ops.object.select_all(action='DESELECT')
    for o in pick:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pick[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.context.scene.tool_settings.mesh_select_mode = (False, False, True)
    if not _show_faces(pick, False):
        _show_faces(pick, None)
        bpy.ops.object.mode_set(mode='OBJECT')
        return
    bpy.ops.uv.smart_project(angle_limit=R(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    _show_faces(pick, None)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    a0 = _uv_area(pick, False)
    _show_faces(pick, False)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin)
    a1 = _uv_area(pick, False)
    f = math.sqrt(a1 / a0) if a0 > 0 else 1.0
    _show_faces(pick, None)
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        uv = bm.loops.layers.uv.verify()
        keep = bm.faces.layers.int.get('keep_uv')
        for face in bm.faces:
            if face[keep]:
                for l in face.loops:
                    u, v = l[uv].uv
                    cu = 4.0 * round((u - 0.5) / 4.0) + 0.5
                    l[uv].uv = (cu + (u - cu) * f, 0.5 + (v - 0.5) * f)
            else:
                face[keep] = 1
        bmesh.update_edit_mesh(o.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f'   .. even_texels: free faces scaled by {f:.4f}; stamped parts follow')
