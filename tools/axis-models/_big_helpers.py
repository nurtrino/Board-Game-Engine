# Helpers shared by the two large models (carrier.py, factory.py). Everything here is built on kit.py:
# a mesh builder for structures made of many flat panels and struts, materials for large surfaces
# (the kit's own, re-scaled so their noise, wear and grime suit a 250 m ship rather than a 6 m tank,
# plus brick, concrete and corrugated sheet), and extra close-up renders for checking the work.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix, Euler
import kit
from kit import *


def V(p):
    return Vector(p)


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


# ---------------------------------------------------------------- mesh builder

def _frame(a, b, up=(0, 0, 1)):
    d = b - a
    d.normalize()
    upv = Vector(up)
    if abs(d.dot(upv)) > 0.985:
        upv = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    s = d.cross(upv).normalized()
    u = d.cross(s)          # s x u = d
    return s, u, d


_SLOTS = {}


def _slot(mat):
    """Thin struts of one material all share one small patch of the atlas (see MB). This is where
    that patch is parked until the final pack, in the same row unwrap_now() parks its stamps."""
    if mat.name not in _SLOTS:
        kit._PARKED += 1
        _SLOTS[mat.name] = kit._PARKED
    return _SLOTS[mat.name]


class MB:
    """Collects polygons (each with its own material) and struts into one mesh.

    A ship or a works has thousands of rails, stays, ladder rungs and lattice bars. Unwrapped one by
    one they would each need their own island and its margin, and the margins alone would fill the
    atlas. So thin struts are "shared": every such face is laid over one small patch per material
    (and pinned there like a stamped copy). The last shared face in the mesh is the one that gets
    baked into the patch, so finish a model with shared_tail() in open air."""

    THIN = 0.17      # struts no thicker than this share a patch unless told otherwise
    SLIVER = 0.26    # and so does any other face narrower than this (None in shared= keeps the rule)

    def __init__(self):
        self.v, self.f, self.fm, self.mats, self.sh = [], [], [], [], []

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def poly(self, pts, mat, facing=None, shared=None):
        pts = [Vector(p) for p in pts]
        if facing is not None:
            n = Vector((0, 0, 0))
            for i in range(len(pts)):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
            if n.dot(Vector(facing)) < 0:
                pts.reverse()
        base = len(self.v)
        self.v += pts
        self.f.append(tuple(range(base, base + len(pts))))
        self.fm.append(self._mi(mat))
        if shared is None:
            # narrow in its own plane: measure across the longest edge
            e = max(((pts[(i + 1) % len(pts)] - pts[i]) for i in range(len(pts))), key=lambda d: d.length)
            if e.length > 1e-6:
                e = e.normalized()
                n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
                side = n.cross(e)
                if side.length > 1e-9:
                    side.normalize()
                    ds = [p.dot(side) for p in pts]
                    shared = (max(ds) - min(ds)) < self.SLIVER
        self.sh.append(bool(shared))

    def box(self, lo, hi, mat, drop='', top=None, bottom=None):
        """An axis-aligned box. drop lists faces to leave out, e.g. '-z +y'."""
        x0, y0, z0 = lo
        x1, y1, z1 = hi
        faces = {
            '-x': ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
            '+x': ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
            '-y': ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
            '+y': ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
            '-z': ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
            '+z': ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        }
        for key, (pts, n) in faces.items():
            if key in drop:
                continue
            m = top if (key == '+z' and top) else bottom if (key == '-z' and bottom) else mat
            self.poly(pts, m, n)

    def beam(self, a, b, w, h=None, mat=None, caps=False, up=(0, 0, 1), shared=None):
        """A rectangular strut from a to b: w across, h in the up direction."""
        a, b = Vector(a), Vector(b)
        h = w if h is None else h
        shared = (max(w, h) <= self.THIN) if shared is None else shared
        s, u, d = _frame(a, b, up)
        c = [(-s * w - u * h) / 2, (s * w - u * h) / 2, (s * w + u * h) / 2, (-s * w + u * h) / 2]
        base = len(self.v)
        self.v += [a + k for k in c] + [b + k for k in c]
        mi = self._mi(mat)
        for i in range(4):
            j = (i + 1) % 4
            self.f.append((base + i, base + j, base + 4 + j, base + 4 + i))
            self.fm.append(mi)
            self.sh.append(shared)
        if caps:
            self.f.append((base + 3, base + 2, base + 1, base))
            self.f.append((base + 4, base + 5, base + 6, base + 7))
            self.fm += [mi, mi]
            self.sh += [shared, shared]

    def tube(self, a, b, r, mat, segs=3, r2=None, caps=False, up=(0, 0, 1), shared=None):
        a, b = Vector(a), Vector(b)
        r2 = r if r2 is None else r2
        shared = (2 * max(r, r2) <= self.THIN) if shared is None else shared
        s, u, d = _frame(a, b, up)
        base = len(self.v)
        for p, rr in ((a, r), (b, r2)):
            for i in range(segs):
                t = 2 * math.pi * i / segs
                self.v.append(p + (s * math.cos(t) + u * math.sin(t)) * rr)
        mi = self._mi(mat)
        for i in range(segs):
            j = (i + 1) % segs
            self.f.append((base + i, base + j, base + segs + j, base + segs + i))
            self.fm.append(mi)
            self.sh.append(shared)
        if caps:
            self.f.append(tuple(base + i for i in reversed(range(segs))))
            self.f.append(tuple(base + segs + i for i in range(segs)))
            self.fm += [mi, mi]
            self.sh += [shared, shared]

    def wall(self, o, ud, n, us, vs, holes=(), mat=None, depth=0.0, back=None, reveal=None):
        """A flat upright wall with rectangular openings. o is its origin, ud the horizontal direction
        along it, n the way it faces. us and vs are its extent along ud and up; holes are
        (u0, u1, v0, v1). Each opening gets reveals depth deep and, if back is given, a back panel."""
        o, ud, n = Vector(o), Vector(ud), Vector(n)
        up = Vector((0, 0, 1))

        def P(u, v, d=0.0):
            return o + ud * u + up * v - n * d

        ucuts = sorted({us[0], us[1], *[h[0] for h in holes], *[h[1] for h in holes]})
        vcuts = sorted({vs[0], vs[1], *[h[2] for h in holes], *[h[3] for h in holes]})
        ucuts = [u for u in ucuts if us[0] - 1e-6 <= u <= us[1] + 1e-6]
        vcuts = [v for v in vcuts if vs[0] - 1e-6 <= v <= vs[1] + 1e-6]
        for ua, ub in zip(ucuts, ucuts[1:]):
            for va, vb in zip(vcuts, vcuts[1:]):
                cu, cv = (ua + ub) / 2, (va + vb) / 2
                if any(h[0] < cu < h[1] and h[2] < cv < h[3] for h in holes):
                    continue
                self.poly([P(ua, va), P(ub, va), P(ub, vb), P(ua, vb)], mat, n)
        if depth > 0:
            rm = reveal or mat
            for (a, b, c, d) in holes:
                self.poly([P(a, c), P(a, d), P(a, d, depth), P(a, c, depth)], rm, ud)
                self.poly([P(b, c), P(b, d), P(b, d, depth), P(b, c, depth)], rm, -ud)
                self.poly([P(a, d), P(b, d), P(b, d, depth), P(a, d, depth)], rm, -up)
                self.poly([P(a, c), P(b, c), P(b, c, depth), P(a, c, depth)], rm, up)
                if back:
                    self.poly([P(a, c, depth), P(b, c, depth), P(b, d, depth), P(a, d, depth)], back, n)

    def floor(self, x0, x1, y0, y1, z, holes=(), mat=None, skirt=0.0):
        """A level slab top with rectangular holes (x0, x1, y0, y1) left out, and an edge skirt going down."""
        xc = sorted({x0, x1, *[h[0] for h in holes], *[h[1] for h in holes]})
        yc = sorted({y0, y1, *[h[2] for h in holes], *[h[3] for h in holes]})
        xc = [x for x in xc if x0 - 1e-6 <= x <= x1 + 1e-6]
        yc = [y for y in yc if y0 - 1e-6 <= y <= y1 + 1e-6]
        for xa, xb in zip(xc, xc[1:]):
            for ya, yb in zip(yc, yc[1:]):
                cx, cy = (xa + xb) / 2, (ya + yb) / 2
                if any(h[0] < cx < h[1] and h[2] < cy < h[3] for h in holes):
                    continue
                self.poly([(xa, ya, z), (xb, ya, z), (xb, yb, z), (xa, yb, z)], mat, (0, 0, 1))
        if skirt > 0:
            self.poly([(x0, y0, z - skirt), (x1, y0, z - skirt), (x1, y0, z), (x0, y0, z)], mat, (0, -1, 0))
            self.poly([(x0, y1, z - skirt), (x1, y1, z - skirt), (x1, y1, z), (x0, y1, z)], mat, (0, 1, 0))
            self.poly([(x0, y0, z - skirt), (x0, y1, z - skirt), (x0, y1, z), (x0, y0, z)], mat, (-1, 0, 0))
            self.poly([(x1, y0, z - skirt), (x1, y1, z - skirt), (x1, y1, z), (x1, y0, z)], mat, (1, 0, 0))

    def lattice(self, a, b, w0, w1, bays, mat, t=0.12, up=(0, 0, 1)):
        """A four-sided lattice girder from a to b, w0 square at a and w1 at b."""
        a, b = Vector(a), Vector(b)
        s, u, d = _frame(a, b, up)
        L = (b - a).length

        def corner(k, f):
            w = lerp(w0, w1, f) / 2
            sx = (-1, 1, 1, -1)[k]
            sy = (-1, -1, 1, 1)[k]
            return a + d * (L * f) + s * (sx * w) + u * (sy * w)

        for k in range(4):
            self.tube(corner(k, 0), corner(k, 1), t / 2, mat, 3)
        for i in range(bays):
            f0, f1 = i / bays, (i + 1) / bays
            for k in range(4):
                k2 = (k + 1) % 4
                if (i + k) % 2:
                    self.tube(corner(k, f0), corner(k2, f1), t * 0.36, mat, 3)
                else:
                    self.tube(corner(k2, f0), corner(k, f1), t * 0.36, mat, 3)

    def obj(self, name, merge=2e-4, sharp=40):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(p) for p in self.v], [], self.f)
        for m in self.mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', self.fm)
        me.update()
        if any(self.sh):
            uvl = me.uv_layers.new(name='UVMap')
            keep = me.attributes.new('keep_uv', 'INT', 'FACE')
            keep.data.foreach_set('value', [1 if s_ else 0 for s_ in self.sh])
            uv = [0.0] * (len(me.loops) * 2)
            for pi, poly in enumerate(me.polygons):
                if not self.sh[pi]:
                    continue
                off = 4.0 * _slot(self.mats[self.fm[pi]])
                n = poly.loop_total
                if n == 4:
                    f = self.f[pi]
                    e1, e2 = (self.v[f[1]] - self.v[f[0]]).length, (self.v[f[3]] - self.v[f[0]]).length
                    run = min(max(e1, e2), 3.2) / 4.0
                    pts = [(0.0, 0.0), (0.0, 0.3), (run, 0.3), (run, 0.0)] if e2 >= e1 else [(0.0, 0.0), (run, 0.0), (run, 0.3), (0.0, 0.3)]
                else:
                    pts = [(0.03 + 0.02 * math.cos(2 * math.pi * i / n), 0.03 + 0.02 * math.sin(2 * math.pi * i / n)) for i in range(n)]
                for j, (a, b) in enumerate(pts):
                    uv[2 * (poly.loop_start + j)] = a + off
                    uv[2 * (poly.loop_start + j) + 1] = b
            uvl.data.foreach_set('uv', uv)
        if merge:
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
            bm.to_mesh(me)
            bm.free()
            me.update()
        ob = link(bpy.data.objects.new(name, me))
        if sharp:
            shade(ob, sharp)
        return ob


def far_camera(clip=5000.0):
    """The kit's preview camera keeps Blender's 100 m far clip; these models are seen from further.
    Wrap the kit's link() so any camera it makes can see that far."""
    inner = kit.link
    if getattr(inner, '_far', False):
        return

    def far_link(ob):
        if ob.type == 'CAMERA':
            ob.data.clip_end = clip
        return inner(ob)
    far_link._far = True
    kit.link = far_link


def revolve(name, profile, segs=14, at=(0, 0, 0), mat=None):
    """Spin a profile of (radius, height) points about z, leaving both ends open."""
    rings = [[(r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), h) for i in range(segs)] for r, h in profile]
    verts = [p for ring in rings for p in ring]
    faces = []
    for i in range(len(rings) - 1):
        a, b = i * segs, (i + 1) * segs
        for j in range(segs):
            k = (j + 1) % segs
            faces.append((a + j, a + k, b + k, b + j))
    ob = mesh_obj(name, verts, faces, mat)
    # wound so that a profile running upward faces outward
    return xform(ob, at)


def shared_tail(at, u, n, only=None, step=0.36):
    """A strip of every material that has shared struts, laid flat against an open wall: at is the
    lower corner, u the direction along the wall, n the way the wall faces. Append the returned
    object to the model last. Its faces are then the ones baked into each shared patch, so every
    strut looks like a clean flat piece of its material (a thin rod would bake as nothing but worn
    edge) lit and weathered as it is out in the open."""
    mb = MB()
    at, u, n = Vector(at), Vector(u).normalized(), Vector(n).normalized()
    mats = [m for m in bpy.data.materials if m.name in _SLOTS and (only is None or m in only)]
    for i, m in enumerate(sorted(mats, key=lambda m: m.name)):
        p = at + n * 0.004 + Vector((0, 0, step * i))
        mb.poly([p, p + u * 3.2, p + u * 3.2 + Vector((0, 0, 0.3)), p + Vector((0, 0, 0.3))], m, n, shared=True)
    return mb.obj('strips') if mats else None


def drop(ob, dirs, tol=0.99):
    """Delete the faces of a mesh that face any of the given directions: hidden faces cost atlas."""
    table = {'+x': (1, 0, 0), '-x': (-1, 0, 0), '+y': (0, 1, 0), '-y': (0, -1, 0), '+z': (0, 0, 1), '-z': (0, 0, -1)}
    vs = [Vector(table[d]) for d in dirs.split()]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    dead = [f for f in bm.faces if any(f.normal.dot(v) > tol for v in vs)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def mats_by_normal(ob, rules, default=None):
    """Give faces a material by which way they face. rules: list of ((nx, ny, nz), min dot, material)."""
    me = ob.data
    names = list(me.materials)
    def idx(m):
        if m not in names:
            me.materials.append(m)
            names.append(m)
        return names.index(m)
    for p in me.polygons:
        for n, lim, m in rules:
            if p.normal.dot(Vector(n)) > lim:
                p.material_index = idx(m)
                break
    return ob


class Rails:
    """Open railings: rails and posts are thin struts, so they all share the one small patch of the
    atlas that their material's struts use (see MB) and look like the same painted steel. A post
    stamped with copies() would be unwrapped as itself, and a rod that thin bakes as bare worn edge."""

    def __init__(self, mat, h=1.1, gap=2.6, t=0.07, mids=(0.5,)):
        self.mat, self.h, self.gap, self.t, self.mids = mat, h, gap, t, mids
        self.posts = []

    def run(self, mb, pts, closed=False):
        pts = [Vector(p) for p in pts]
        if closed:
            pts = pts + [pts[0]]
        for k, (a, b) in enumerate(zip(pts, pts[1:])):
            for f in (1.0,) + tuple(self.mids):
                o = Vector((0, 0, self.h * f))
                mb.tube(a + o, b + o, self.t / 2, self.mat, 3)
            n = max(1, round((b - a).length / self.gap))
            last = (k == len(pts) - 2) and not closed
            for i in range(n + (1 if last else 0)):
                self.posts.append((a.lerp(b, i / n), self.h))

    def build(self):
        if not self.posts:
            return []
        mb = MB()
        for p, h in self.posts:
            mb.tube(p, p + Vector((0, 0, h)), self.t / 2, self.mat, 3)
        return [mb.obj('posts')]


def ladder(mb, a, b, mat, w=0.5, t=0.05, step=0.45, out=(1, 0, 0)):
    """A ladder from a to b; rungs across the direction perpendicular to both the run and 'out'."""
    a, b = Vector(a), Vector(b)
    d = (b - a).normalized()
    side = d.cross(Vector(out)).normalized() * (w / 2)
    mb.tube(a - side, b - side, t / 2, mat, 3)
    mb.tube(a + side, b + side, t / 2, mat, 3)
    n = int((b - a).length / step)
    for i in range(1, n):
        p = a.lerp(b, i / n)
        mb.tube(p - side, p + side, t * 0.4, mat, 3)


# ---------------------------------------------------------------- materials

def _sub(mat):
    g = Graph.__new__(Graph)
    g.mat, g.t, g.x = mat, mat.node_tree, 0
    return g


def rescale(mat, k):
    """Stretch a kit material's patterns by 1/k (k = 0.15 makes every blotch, chip and streak about
    seven times larger), so paint made for a tank suits a ship or a building."""
    for n in mat.node_tree.nodes:
        if n.type == 'MAPPING':
            s = n.inputs['Scale'].default_value
            n.inputs['Scale'].default_value = (s[0] * k, s[1] * k, s[2] * k)
        elif n.type == 'BEVEL':
            n.inputs['Radius'].default_value /= k
        elif n.type == 'AMBIENT_OCCLUSION':
            n.inputs['Distance'].default_value /= k
        elif n.type == 'BUMP':
            n.inputs['Distance'].default_value /= k
    return mat


def _wall_uv(g):
    """A 2D coordinate that lies in the plane of any face: (horizontal, up) on walls, (x, y) on decks."""
    tc = g.n('ShaderNodeTexCoord')
    pos = g.n('ShaderNodeSeparateXYZ')
    g.link(tc.outputs['Object'], pos.inputs[0])
    geo = g.n('ShaderNodeNewGeometry')
    nor = g.n('ShaderNodeSeparateXYZ')
    g.link(geo.outputs['True Normal'], nor.inputs[0])
    ax, ay, az = (g.math('ABSOLUTE', nor.outputs[k]) for k in 'XYZ')
    facing_x = g.math('GREATER_THAN', ax, ay)
    flat = g.math('GREATER_THAN', az, 0.75)
    u = g.mixf(facing_x, pos.outputs['X'], pos.outputs['Y'])
    u = g.mixf(flat, u, pos.outputs['X'])
    v = g.mixf(flat, pos.outputs['Z'], pos.outputs['Y'])
    comb = g.n('ShaderNodeCombineXYZ')
    g.link(u, comb.inputs['X'])
    g.link(v, comb.inputs['Y'])
    return comb.outputs[0], flat


def add_plating(mat, w=6.0, h=2.4, seam=0.05, dark=0.3, depth=1.2):
    """Lay plate seams over a finished kit material: strakes w long and h high, on any face."""
    g = _sub(mat)
    nt = mat.node_tree
    vec, flat = _wall_uv(g)
    br = g.n('ShaderNodeTexBrick', offset=0.5)
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = w
    br.inputs['Row Height'].default_value = h
    br.inputs['Mortar Size'].default_value = seam
    br.inputs['Mortar Smooth'].default_value = 0.1
    g.link(vec, br.inputs['Vector'])
    line = br.outputs['Fac']
    alb = nt.nodes['ch_albedo']
    src = alb.inputs[0].links[0].from_socket
    dk = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    di = {s.identifier: s for s in dk.inputs}
    g.link(g.math('MULTIPLY', line, dark), di['Factor_Float'])
    g.link(src, di['A_Color'])
    di['B_Color'].default_value = (0.25, 0.24, 0.23, 1)
    g.link({s.identifier: s for s in dk.outputs}['Result_Color'], alb.inputs[0])
    for n in nt.nodes:
        if n.type == 'BUMP' and n.inputs['Height'].links:
            hsrc = n.inputs['Height'].links[0].from_socket
            g.link(g.math('SUBTRACT', hsrc, g.math('MULTIPLY', line, depth)), n.inputs['Height'])
    return mat


def brick(name='brick', dark=(0.19, 0.075, 0.05), lite=(0.36, 0.15, 0.09), mortar=(0.42, 0.40, 0.36),
          course=0.16, length=0.48, dirt=0.9, soot=0.5, k=0.3, soot_above=None):
    """Brickwork on any upright face, courses level. Mortar lines are in the bump.
    soot_above = (z0, z1) blackens the work from z0 upward, fully by z1 (chimney tops)."""
    g = Graph(bpy.data.materials.new(name))
    vec, flat = _wall_uv(g)
    br = g.n('ShaderNodeTexBrick', offset=0.5)
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = length
    br.inputs['Row Height'].default_value = course
    br.inputs['Mortar Size'].default_value = course * 0.11
    br.inputs['Mortar Smooth'].default_value = 0.15
    br.inputs['Bias'].default_value = 0.0
    br.inputs['Color1'].default_value = (*dark, 1)
    br.inputs['Color2'].default_value = (*lite, 1)
    br.inputs['Mortar'].default_value = (*mortar, 1)
    g.link(vec, br.inputs['Vector'])
    tone = g.noise(0.5, 4.0, 0.6)
    blotch = g.mix(g.ramp(tone, 0.3, 0.75), (0.72, 0.7, 0.68), (1.12, 1.08, 1.0))
    mm = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mi = {s.identifier: s for s in mm.inputs}
    mi['Factor_Float'].default_value = 1.0
    g.link(br.outputs['Color'], mi['A_Color'])
    g.link(blotch, mi['B_Color'])
    col = {s.identifier: s for s in mm.outputs}['Result_Color']
    grime, dust = kit._dirt(g, dirt, None, True)
    sooty = g.math('MAXIMUM', grime, g.math('MULTIPLY', g.ramp(g.noise(0.35, 5.0, 0.7), 0.5, 0.8), soot))
    if soot_above:
        geo = g.n('ShaderNodeNewGeometry')
        pz = g.n('ShaderNodeSeparateXYZ')
        g.link(geo.outputs['Position'], pz.inputs[0])
        high = g.math('MULTIPLY', g.ramp(pz.outputs['Z'], soot_above[0], soot_above[1]), g.mixf(g.noise(0.8, 4.0, 0.6), 0.45, 1.0))
        sooty = g.math('MAXIMUM', sooty, g.math('MULTIPLY', high, 0.92))
    col = g.mix(sooty, col, (0.035, 0.032, 0.03))
    col = g.mix(dust, col, (0.3, 0.27, 0.23))
    height = g.math('SUBTRACT', g.math('MULTIPLY', g.noise(30.0, 3.0, 0.6), 0.3), br.outputs['Fac'])
    m = g.finish(col, g.mixf(sooty, 0.86, 0.95), 0.0, 0.0, height, 0.9, 0.012)
    rescale_noise(m, k)
    return m


def rescale_noise(mat, k):
    """rescale(), but leaving the bump distance alone (for materials whose bump is a real relief)."""
    for n in mat.node_tree.nodes:
        if n.type == 'MAPPING':
            s = n.inputs['Scale'].default_value
            n.inputs['Scale'].default_value = (s[0] * k, s[1] * k, s[2] * k)
        elif n.type == 'BEVEL':
            n.inputs['Radius'].default_value /= k
        elif n.type == 'AMBIENT_OCCLUSION':
            n.inputs['Distance'].default_value /= k
    return mat


def corrugated(name='corrugated', colour=(0.25, 0.27, 0.27), pitch=0.3, along='x', rust=0.5, dirt=0.8,
               mask=0.0, metal=0.35, k=0.3, depth=0.03):
    """Corrugated sheet. The profile repeats along the given axis, so the ridges run across it and
    down any slope. Sheet laps show every few metres."""
    g = Graph(bpy.data.materials.new(name))
    tc = g.n('ShaderNodeTexCoord')
    pos = g.n('ShaderNodeSeparateXYZ')
    g.link(tc.outputs['Object'], pos.inputs[0])
    wave = g.math('SINE', g.math('MULTIPLY', pos.outputs[along.upper()], 2 * math.pi / pitch))
    w01 = g.math('ADD', g.math('MULTIPLY', wave, 0.5), 0.5)
    other = 'Y' if along.lower() == 'x' else 'X'
    lap = g.math('FRACT', g.math('MULTIPLY', g.math('ADD', pos.outputs[other], g.math('MULTIPLY', pos.outputs['Z'], 1.7)), 1 / 2.2))
    lapline = g.ramp(lap, 0.04, 0.0)
    tone = g.noise(0.9, 4.0, 0.6)
    base = g.mix(g.ramp(tone, 0.25, 0.75), tuple(c * 0.78 for c in colour), tuple(min(1, c * 1.15) for c in colour))
    shade_ = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    si = {s.identifier: s for s in shade_.inputs}
    si['Factor_Float'].default_value = 1.0
    g.link(base, si['A_Color'])
    grey = g.n('ShaderNodeCombineColor')
    lum = g.math('MULTIPLY', g.mixf(w01, 0.72, 1.12), g.mixf(lapline, 1.0, 0.6))
    for i in range(3):
        g.link(lum, grey.inputs[i])
    g.link(grey.outputs[0], si['B_Color'])
    col = {s.identifier: s for s in shade_.outputs}['Result_Color']
    rr = g.ramp(g.noise(2.2, 5.0, 0.7), 0.62 - 0.3 * rust, 0.82 - 0.25 * rust) if rust > 0 else None
    r = 0.55
    m_ = metal
    paintmask = mask
    if rr is not None:
        col = g.mix(rr, col, g.mix(g.noise(40, 2.0, 0.5), (0.17, 0.075, 0.035), (0.09, 0.05, 0.035)))
        r = g.mixf(rr, 0.55, 0.9)
        m_ = g.mixf(rr, metal, 0.05)
        if mask > 0:
            paintmask = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, rr), mask)
    grime, dust = kit._dirt(g, dirt, None, True)
    dk = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    di = {s.identifier: s for s in dk.inputs}
    g.link(grime, di['Factor_Float'])
    g.link(col, di['A_Color'])
    di['B_Color'].default_value = (0.3, 0.27, 0.25, 1)
    col = {s.identifier: s for s in dk.outputs}['Result_Color']
    col = g.mix(dust, col, (0.22, 0.19, 0.15))
    if mask > 0:
        paintmask = g.math('MULTIPLY', paintmask, g.math('SUBTRACT', 1.0, g.math('MULTIPLY', dust, 0.9)))
    height = g.math('SUBTRACT', w01, g.math('MULTIPLY', lapline, 0.5))
    m = g.finish(col, r, m_, paintmask, height, 1.0, depth)
    rescale_noise(m, k)
    return m


def concrete(name='concrete', colour=(0.36, 0.35, 0.33), slab=8.0, stains=1.0, tyres=1.0, dirt=0.8, k=0.3, joint=0.07, lanes=()):
    """Cast concrete: slab joints, oil and water stains, and dark tyre tracks swept along x and y.
    lanes are (x0, x1, y0, y1) strips that are driven on: darker, and thick with tyre marks."""
    g = Graph(bpy.data.materials.new(name))
    vec, flat = _wall_uv(g)
    br = g.n('ShaderNodeTexBrick', offset=0.0)
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Brick Width'].default_value = slab
    br.inputs['Row Height'].default_value = slab
    br.inputs['Mortar Size'].default_value = joint
    br.inputs['Mortar Smooth'].default_value = 0.2
    br.inputs['Color1'].default_value = (0.86, 0.86, 0.86, 1)
    br.inputs['Color2'].default_value = (1.05, 1.05, 1.05, 1)
    br.inputs['Mortar'].default_value = (0.3, 0.3, 0.3, 1)
    g.link(vec, br.inputs['Vector'])
    tone = g.noise(0.7, 5.0, 0.65)
    base = g.mix(g.ramp(tone, 0.25, 0.75), tuple(c * 0.8 for c in colour), tuple(min(1, c * 1.14) for c in colour))
    mm = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    mi = {s.identifier: s for s in mm.inputs}
    mi['Factor_Float'].default_value = 1.0
    g.link(base, mi['A_Color'])
    g.link(br.outputs['Color'], mi['B_Color'])
    col = {s.identifier: s for s in mm.outputs}['Result_Color']
    # stains: broad dark patches with ragged edges, and smaller oil spots
    blot = g.ramp(g.noise(0.28, 6.0, 0.72), 0.5, 0.64)
    spots = g.ramp(g.noise(1.9, 5.0, 0.7), 0.63, 0.7)
    st = g.math('MULTIPLY', g.math('MAXIMUM', g.math('MULTIPLY', blot, 0.75), g.math('MULTIPLY', spots, 0.95)), stains, clamp=True)
    col = g.mix(st, col, (0.06, 0.056, 0.052))
    # tyre tracks: long thin streaks. A lane is driven along its length, so its streaks run that way
    if tyres > 0:
        wob = g.math('MULTIPLY', g.math('SUBTRACT', g.noise(0.35, 2.0, 0.5), 0.5), 6.0)       # tracks wander a little
        tc0 = g.n('ShaderNodeTexCoord')
        sp0 = g.n('ShaderNodeSeparateXYZ')
        g.link(tc0.outputs['Object'], sp0.inputs[0])

        def streaks(across, seed):
            v = g.n('ShaderNodeCombineXYZ')
            g.link(g.math('ADD', sp0.outputs[across], wob), v.inputs['X'])
            v.inputs['Y'].default_value = seed
            n_ = g.n('ShaderNodeTexNoise')
            n_.inputs['Scale'].default_value = 1.5
            n_.inputs['Detail'].default_value = 2.0
            g.link(v.outputs[0], n_.inputs['Vector'])
            return g.ramp(n_.outputs[0], 0.53, 0.6)
        along_x, along_y = streaks('Y', 3.7), streaks('X', 11.3)
        breakup = g.ramp(g.noise(1.2, 3.0, 0.6), 0.3, 0.6)
        general = g.math('MULTIPLY', g.ramp(g.noise(0.12, 2.0, 0.5), 0.45, 0.62), 0.3 if lanes else 0.9)
        tr = g.math('MULTIPLY', g.math('MAXIMUM', along_x, along_y), general)
        if lanes:
            lx = ly = None
            for x0, x1, y0, y1 in lanes:
                mx = g.ramp(g.math('ABSOLUTE', g.math('SUBTRACT', sp0.outputs['X'], (x0 + x1) / 2)), (x1 - x0) / 2, (x1 - x0) / 2 - 1.2)
                my = g.ramp(g.math('ABSOLUTE', g.math('SUBTRACT', sp0.outputs['Y'], (y0 + y1) / 2)), (y1 - y0) / 2, (y1 - y0) / 2 - 1.2)
                m_ = g.math('MULTIPLY', mx, my)
                if (x1 - x0) >= (y1 - y0):
                    lx = m_ if lx is None else g.math('MAXIMUM', lx, m_)
                else:
                    ly = m_ if ly is None else g.math('MAXIMUM', ly, m_)
            lane = lx if ly is None else ly if lx is None else g.math('MAXIMUM', lx, ly)
            worn = g.math('MULTIPLY', g.math('MULTIPLY', lane, g.mixf(g.ramp(g.noise(0.9, 4.0, 0.6), 0.25, 0.7), 0.5, 1.0)), g.math('MULTIPLY', flat, 0.5))
            col = g.mix(worn, col, (0.085, 0.08, 0.075))
            if lx is not None:
                tr = g.math('MAXIMUM', tr, g.math('MULTIPLY', along_x, lx))
            if ly is not None:
                tr = g.math('MAXIMUM', tr, g.math('MULTIPLY', along_y, ly))
        tr = g.math('MULTIPLY', g.math('MULTIPLY', tr, g.mixf(breakup, 0.45, 1.0)), g.math('MULTIPLY', flat, 0.85 * tyres), clamp=True)
        col = g.mix(tr, col, (0.03, 0.03, 0.03))
    grime, dust = kit._dirt(g, dirt, None, True)
    dk = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    di = {s.identifier: s for s in dk.inputs}
    g.link(grime, di['Factor_Float'])
    g.link(col, di['A_Color'])
    di['B_Color'].default_value = (0.35, 0.32, 0.29, 1)
    col = {s.identifier: s for s in dk.outputs}['Result_Color']
    col = g.mix(g.math('MULTIPLY', dust, 0.6), col, (0.3, 0.27, 0.22))
    height = g.math('SUBTRACT', g.math('MULTIPLY', g.noise(22.0, 4.0, 0.65), 0.25), br.outputs['Fac'])
    m = g.finish(col, g.mixf(st, 0.9, 0.55), 0.0, 0.0, height, 0.7, 0.01)
    rescale_noise(m, k)
    return m


# ---------------------------------------------------------------- unwrap at one texel density
# kit._unwrap evens out the texel density with average_islands_scale and then packs the free islands
# on their own, which rescales them but not the stamped copies. With a handful of copies (the tank)
# the mismatch is small; with hundreds (railing posts, windows, sleepers) the copies end up tens of
# times denser than the hull and the hull gets a sliver of the atlas. even_unwrap() does the same
# job but sizes every stamped part to the free islands' density itself, and keeps each stamp's
# islands together while doing it. install_even_unwrap() swaps it in for kit._unwrap.

_TEXEL = {}


def unwrap_as(ob, texel):
    """Unwrap a part by itself and give it `texel` times the usual texel density (0.5 for surfaces
    that are seldom seen, such as a ship's bottom). Do this before the part is joined to anything."""
    kit.unwrap_now(ob)
    _TEXEL[kit._PARKED] = texel
    return ob


def _face_uv_area(f, uv):
    pts = [l[uv].uv for l in f.loops]
    a = 0.0
    for i in range(len(pts)):
        p, q = pts[i], pts[(i + 1) % len(pts)]
        a += p.x * q.y - q.x * p.y
    return abs(a) / 2


EVEN_MARGIN = 0.0015     # between islands, as a fraction of the atlas (the kit asks for 0.003)


def _degenerate(pick, label):
    n = tot = 0
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        uv = bm.loops.layers.uv.verify()
        layer = bm.faces.layers.int.get('keep_uv')
        for f in bm.faces:
            if not (layer and f[layer]):
                tot += 1
                if _face_uv_area(f, uv) < 1e-12 and f.calc_area() > 1e-4:
                    n += 1
                    if n <= 12:
                        nb = [g for e in f.edges for g in e.link_faces if g is not f]
                        print('    ', o.name, o.data.materials[f.material_index].name, len(f.verts), round(f.calc_area(), 2), 'sel', f.select, 'hide', f.hide,
                              'neighbours', len(nb), 'pinned', sum(1 for g in nb if layer and g[layer]), 'c', tuple(round(v, 1) for v in f.calc_center_median()),
                              'nrm', tuple(round(v, 2) for v in f.normal))
    print(f'  uvdebug {label}: {n} of {tot} free faces have no uv area')


def even_unwrap(obs, margin):
    margin = min(margin, EVEN_MARGIN)
    datas, pick = set(), []
    for o in obs:
        if o.data not in datas:
            datas.add(o.data)
            pick.append(o)
            if not o.data.uv_layers:
                o.data.uv_layers.new(name='UVMap')
    kit._edit(pick)
    free = kit._show(pick, False)
    # kit._show leaves a free face unselected when every face round it is pinned (deselecting the
    # hidden neighbours takes its vertices with them), and smart project then skips it
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        for f in bm.faces:
            if not f.hide:
                f.select = True
                for v in f.verts:
                    v.select = True
                for e in f.edges:
                    e.select = True
        bmesh.update_edit_mesh(o.data)
    if free:
        bpy.ops.uv.smart_project(angle_limit=R(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        if os.environ.get('AXM_UVDEBUG'):
            _degenerate(pick, 'after smart project')
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.average_islands_scale()
        if os.environ.get('AXM_UVDEBUG'):
            _degenerate(pick, 'after average')
        bpy.ops.uv.pack_islands(rotate=True, margin=margin, margin_method='FRACTION')
        if os.environ.get('AXM_UVDEBUG'):
            _degenerate(pick, 'after pack')
    # the free islands' density, and each stamp's (stamps are told apart by where unwrap_now parked them)
    uv_free = area_free = 0.0
    groups = {}
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        uv = bm.loops.layers.uv.verify()
        layer = bm.faces.layers.int.get('keep_uv')
        for f in bm.faces:
            if layer and f[layer]:
                k = (o.name, int(math.floor(sum(l[uv].uv.x for l in f.loops) / len(f.loops) / 4.0 + 1e-6)))
                g = groups.setdefault(k, [0.0, 0.0, 1e9, 1e9, -1e9, -1e9])
                g[0] += _face_uv_area(f, uv)
                g[1] += f.calc_area()
                for l in f.loops:
                    g[2], g[3] = min(g[2], l[uv].uv.x), min(g[3], l[uv].uv.y)
                    g[4], g[5] = max(g[4], l[uv].uv.x), max(g[5], l[uv].uv.y)
            else:
                uv_free += _face_uv_area(f, uv)
                area_free += f.calc_area()
    if groups and free and uv_free > 0 and area_free > 0:
        want = uv_free / area_free
        scale = {k: (math.sqrt(want * g[1] / g[0]) * _TEXEL.get(k[1], 1.0) if g[0] > 1e-12 and g[1] > 1e-12 else 1.0) for k, g in groups.items()}
        span = max(max(g[4] - g[2], g[5] - g[3]) * scale[k] for k, g in groups.items()) + 0.5
        slot = {k: i for i, k in enumerate(sorted(groups))}
        for o in pick:
            bm = bmesh.from_edit_mesh(o.data)
            uv = bm.loops.layers.uv.verify()
            layer = bm.faces.layers.int.get('keep_uv')
            if not layer:
                continue
            for f in bm.faces:
                if not f[layer]:
                    continue
                k = (o.name, int(math.floor(sum(l[uv].uv.x for l in f.loops) / len(f.loops) / 4.0 + 1e-6)))
                g, s = groups[k], scale[k]
                for l in f.loops:
                    p = l[uv].uv
                    l[uv].uv = ((p.x - g[2]) * s + 2.0 + slot[k] * span, (p.y - g[3]) * s + 2.0)
            bmesh.update_edit_mesh(o.data)
    kit._show(pick, None)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, margin_method='FRACTION', merge_overlap=True)
    if os.environ.get('AXM_UVDEBUG'):
        _degenerate(pick, 'after final pack')
    # bring the result into the 0..1 tile if the packer chose another, and report what came of it
    lo = [1e9, 1e9]
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            for l in f.loops:
                lo[0], lo[1] = min(lo[0], l[uv].uv.x), min(lo[1], l[uv].uv.y)
    shift = (math.floor(lo[0] + 1e-4), math.floor(lo[1] + 1e-4))
    uv_all = area_all = 0.0
    nfree = 0
    for o in pick:
        bm = bmesh.from_edit_mesh(o.data)
        uv = bm.loops.layers.uv.verify()
        layer = bm.faces.layers.int.get('keep_uv')
        if shift != (0, 0):
            for f in bm.faces:
                for l in f.loops:
                    l[uv].uv = (l[uv].uv.x - shift[0], l[uv].uv.y - shift[1])
            bmesh.update_edit_mesh(o.data)
        for f in bm.faces:
            if not (layer and f[layer]):
                uv_all += _face_uv_area(f, uv)
                area_all += f.calc_area()
                nfree += 1
    if area_all > 0:
        d = math.sqrt(uv_all / area_all)
        print(f'  unwrap: {nfree} free faces over {area_all:.0f} m2 fill {uv_all * 100:.0f}% of the atlas; {len(groups)} stamps and shared patches; '
              f'{d * 4096:.1f} px/m at 4096 ({100 / (d * 4096):.1f} cm a texel)')
    bpy.ops.object.mode_set(mode='OBJECT')
    return pick


def install_even_unwrap():
    kit._unwrap = even_unwrap


# ---------------------------------------------------------------- extra renders

def shots(name, views, size=(1100, 700), samples=32, ground=True, suffix='-x'):
    """Close-ups for checking the work: views are (eye, target, lens). Run after finish()."""
    sc = bpy.context.scene
    extra = []
    if ground:
        gp = box('_ground', 6000, 6000, 0.02, at=(0, 0, -0.012))
        gm = bpy.data.materials.new('_ground')
        gm.use_nodes = True
        for n in gm.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Base Color'].default_value = (0.20, 0.19, 0.17, 1)
                n.inputs['Roughness'].default_value = 0.95
        gp.data.materials.append(gm)
        extra.append(gp)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.clip_end = 5000
    cam = link(bpy.data.objects.new('cam', cam_data))
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    draft = '-draft' if os.environ.get('AXM_DRAFT') == '1' else ''
    for i, (eye, target, lens) in enumerate(views):
        eye, target = Vector(eye), Vector(target)
        cam_data.lens = lens
        cam.location = eye
        cam.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(BUILD, name, f'preview{draft}{suffix}-{i}.png')
        bpy.ops.render.render(write_still=True)
        print('  shot', sc.render.filepath)
    for o in extra:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(cam)
