# Local helpers shared by artillery.py and aa_gun.py. Everything here builds on kit.py and leaves it alone.
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from kit import *


# ---------------------------------------------------------------- placing

def frame(at=(0, 0, 0), rot=(0, 0, 0)):
    """A 4x4 from a position and XYZ euler degrees (the same convention as kit.xform)."""
    return Matrix.Translation(Vector(at)) @ Euler([R(a) for a in rot], 'XYZ').to_matrix().to_4x4()


def flip_x(m):
    """The same placement on the other side of the centre line."""
    return Matrix.Diagonal((-1, 1, 1, 1)) @ m


def place(ob, m):
    """Bake a matrix into the mesh (a mirror is allowed: the faces are flipped back)."""
    ob.data.transform(m)
    if m.determinant() < 0:
        ob.data.flip_normals()
    ob.data.update()
    return ob


def euler_deg(m):
    return tuple(math.degrees(a) for a in m.to_euler('XYZ'))


def spot(m, local=(0, 0, 0), rot=(0, 0, 0)):
    """An (at, rot) pair for copies(): a point and an orientation given in the frame m."""
    mm = m @ frame(local, rot)
    return (tuple(mm.translation), euler_deg(mm))


def along(p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4(), d.length


def rod(name, p0, p1, r, segs=6, mat=None, caps=True, r2=None):
    """A round bar from p0 to p1."""
    m, length = along(p0, p1)
    return shade(place(cyl(name, r, length, segs=segs, r2=r2, mat=mat, caps=caps), m), 50)


def beam(name, pts, sizes, mat=None, up=(0, 0, 1), caps=True):
    """A box section through the stations pts; sizes are (width, height) at each."""
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(Vector(up)).normalized()
        u = side.cross(d).normalized()
        w, h = sizes[i] if isinstance(sizes[0], (tuple, list)) else sizes
        rings.append([p - side * w / 2 - u * h / 2, p + side * w / 2 - u * h / 2, p + side * w / 2 + u * h / 2, p - side * w / 2 + u * h / 2])
    return loft(name, rings, cap_start=caps, cap_end=caps, mat=mat)


def beam_frame(p0, p1, up=(0, 0, 1)):
    """Unit vectors (along, side, up) of a beam from p0 to p1."""
    d = (Vector(p1) - Vector(p0)).normalized()
    side = d.cross(Vector(up)).normalized()
    return d, side, side.cross(d).normalized()


def basis(origin, x, y, z):
    """A 4x4 whose local axes are the given vectors."""
    m = Matrix.Identity(4)
    for i, v in enumerate((x, y, z)):
        for j in range(3):
            m[j][i] = v[j]
    m.translation = Vector(origin)
    return m


# ---------------------------------------------------------------- shapes

def revolve(name, profile, segs=20, at=(0, 0, 0), rot=(0, 0, 0), mat=None, cap0=False, cap1=False):
    """kit.lathe without the forced end caps: for tyres, rings and open shells."""
    rings = []
    for r, h in profile:
        rr = max(r, 2e-5)      # small enough that weld() closes the tip whatever the segment count
        rings.append([(rr * math.cos(2 * math.pi * i / segs), rr * math.sin(2 * math.pi * i / segs), h) for i in range(segs)])
    ob = loft(name, rings, cap_start=cap0, cap_end=cap1, mat=mat)
    weld(ob, 1e-4)
    return xform(ob, at, rot)


def torus(name, big, small, segs=16, tube=6, at=(0, 0, 0), rot=(0, 0, 0), mat=None):
    """A ring about z."""
    prof = [(big + small * math.cos(2 * math.pi * j / tube), small * math.sin(2 * math.pi * j / tube)) for j in range(tube)]
    return revolve(name, prof + [prof[0]], segs, at, rot, mat)


def slab(name, outline, t, mat=None, m=None):
    """A flat plate: outline is (a, b) points in the local xz plane, the thickness is along local y."""
    ob = loft(name, [[(a, -t / 2, b) for a, b in outline], [(a, t / 2, b) for a, b in outline]], mat=mat)
    return place(ob, m) if m is not None else ob


def slab_hole(name, outer, inner, t, mat=None, m=None):
    """A flat plate with one opening. outer and inner have the same number of points, both in the same
    winding and starting near the same corner."""
    n = len(outer)
    verts = []
    for y in (-t / 2, t / 2):
        verts += [(a, y, b) for a, b in outer]
        verts += [(a, y, b) for a, b in inner]
    faces = []
    for i in range(n):
        k = (i + 1) % n
        faces.append((i, k, n + k, n + i))                              # front
        faces.append((2 * n + i, 2 * n + k, 3 * n + k, 3 * n + i))      # back
        faces.append((i, k, 2 * n + k, 2 * n + i))                      # outer wall
        faces.append((n + i, n + k, 3 * n + k, 3 * n + i))              # opening wall
    ob = fix_normals(mesh_obj(name, verts, faces, mat))
    return place(ob, m) if m is not None else ob


def open_box(name, sx, sy, sz, mat=None, ends=(True, True)):
    """A box with no bottom (for lugs and pads that sit on a surface). Its base is at z = 0.
    ends says whether the -x and +x end faces are made."""
    x, y = sx / 2, sy / 2
    v = [(-x, -y, 0), (x, -y, 0), (x, y, 0), (-x, y, 0), (-x, -y, sz), (x, -y, sz), (x, y, sz), (-x, y, sz)]
    f = [(4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6)]
    if ends[1]:
        f.append((1, 2, 6, 5))
    if ends[0]:
        f.append((3, 0, 4, 7))
    return mesh_obj(name, v, f, mat)


def arc_bar(name, centre, radius, a0, a1, width, depth, steps=8, mat=None):
    """A curved bar in the yz plane about centre. Angles are degrees below the forward (-y) direction.
    width is across x, depth is radial (inward from radius)."""
    cx, cy, cz = centre
    rings = []
    for i in range(steps + 1):
        a = R(a0 + (a1 - a0) * i / steps)
        ring = []
        for rr, x in ((radius - depth, -width / 2), (radius, -width / 2), (radius, width / 2), (radius - depth, width / 2)):
            ring.append((cx + x, cy - rr * math.cos(a), cz - rr * math.sin(a)))
        rings.append(ring)
    return loft(name, rings, mat=mat)


def rivet(mat, r=0.011, segs=4):
    """A dome head, base on z = 0, pointing +z. Meant for copies()."""
    return shade(revolve('rivet', [(r, 0.0), (r * 0.72, r * 0.5), (0.0, r * 0.75)], segs, mat=mat), 70)


def bolt(mat, r=0.012, h=0.014, segs=5):
    """A hex head, base on z = 0, pointing +z. Meant for copies()."""
    return shade(revolve('bolt', [(r, 0.0), (r, h), (0.0, h)], segs, mat=mat), 40)


def two_tone(ob, mat_a, mat_b, split, axis=2):
    """Two materials on one mesh: faces whose centre lies beyond split along the axis get the second."""
    me = ob.data
    me.materials.clear()
    me.materials.append(mat_a)
    me.materials.append(mat_b)
    for p in me.polygons:
        p.material_index = 1 if p.center[axis] > split else 0
    return ob


def stamps(proto, places, name=None):
    """Like kit.copies, but every copy keeps its own piece of the atlas. Use it for a part made of more
    than one material or of many islands: the shared layout copies() pins is rescaled island by island
    when the atlas is packed, and islands of different materials can end up on top of each other."""
    out = []
    for i, (at, rot) in enumerate(places):
        o = link(bpy.data.objects.new(f'{name or proto.name}.{i}', proto.data.copy()))
        out.append(xform(o, at, rot))
    data = proto.data
    bpy.data.objects.remove(proto)
    bpy.data.meshes.remove(data)
    return out


def ring_spots(m, radius, n, phase=0.0, lift=0.0):
    """n places on a circle in the local xy plane of m, facing local +z."""
    return [spot(m, (radius * math.cos(phase + 2 * math.pi * i / n), radius * math.sin(phase + 2 * math.pi * i / n), lift)) for i in range(n)]


def handwheel(name, radius, m, rim_mat, hub_mat, spokes=3, r=0.011, grip=True, grip_mat=None, segs=16):
    """A handwheel in the local xy plane of m, its crank grip sticking out along local +z."""
    parts = [shade(torus('rim', radius, r, segs, 4, mat=rim_mat), 70)]
    parts.append(shade(cyl('hub', max(0.022, radius * 0.2), 0.045, segs=8, mat=hub_mat), 40))
    for i in range(spokes):
        a = 2 * math.pi * i / spokes + 0.5
        parts.append(rod('spoke', (radius * 0.12 * math.cos(a), radius * 0.12 * math.sin(a), 0), (radius * math.cos(a), radius * math.sin(a), 0), r * 0.8, segs=4, mat=hub_mat, caps=False))
    if grip:
        parts.append(shade(cyl('grip', r * 1.35, 0.085, at=(radius, 0, 0.045), segs=6, mat=grip_mat or hub_mat), 50))
    return place(join(name, parts), m)


def disc_wheel(name, radius, width, rim, paint_mat, rubber, segs=18, lugs=18, two_sided=True, hub=0.09, nuts=5, lug_h=0.01, disc_segs=18, lite=False):
    """A steel disc wheel with a pneumatic tyre and block tread, axle along x, centred on the origin.
    two_sided wheels look the same from both faces, so one mesh serves both ends of an axle."""
    parts = []
    c = radius - lug_h
    hw = width / 2
    f = 0.76 * hw
    prof = [(rim, -f), (rim + 0.05, -0.97 * hw), (c - 0.12, -hw), (c - 0.04, -0.93 * hw), (c, -0.74 * hw),
            (c, 0.74 * hw), (c - 0.04, 0.93 * hw), (c - 0.12, hw), (rim + 0.05, 0.97 * hw), (rim, f)]
    if lite:
        prof = [(rim, -f), (rim + 0.05, -0.97 * hw), (c - 0.05, -0.95 * hw), (c, -0.74 * hw),
                (c, 0.74 * hw), (c - 0.05, 0.95 * hw), (rim + 0.05, 0.97 * hw), (rim, f)]
    parts.append(shade(revolve('tyre', prof, segs, rot=(0, 90, 0), mat=rubber), 50))
    if lugs:
        # a V of two blocks on every flat of the tyre, so each block sits square on the surface under it
        pitch = 2 * math.pi / lugs
        flats = lugs == segs and segs % 2 == 0
        base = c * math.cos(math.pi / segs) - 0.002 if flats else c - 0.004
        for s in (-1, 1):
            places = []
            for i in range(lugs):
                a = (i + 0.5) * pitch if flats else (i + (0.5 if s > 0 else 0.0)) * pitch
                mm = Matrix.Rotation(a, 4, 'X') @ frame((s * 0.39 * hw, 0, base), (0, 0, s * 22))
                places.append((tuple(mm.translation), euler_deg(mm)))
            lug = shade(open_box('lug', 0.64 * hw, 0.46 * pitch * radius, radius - base, rubber, ends=(s < 0, s > 0)), 30)
            parts += copies(lug, places)
    half = [(0.0, hub), (0.042, hub), (0.058, hub - 0.02), (0.105, hub - 0.024), (0.118, 0.045), (0.60 * rim, 0.02),
            (0.84 * rim, 0.04), (rim - 0.014, f - 0.014), (rim + 0.017, f + 0.004)]
    if two_sided:
        prof = half + [(r_, -h_) for r_, h_ in reversed(half)]
    else:
        prof = half + [(rim + 0.017, -f), (0.0, -f)]
    parts.append(hard(lathe('disc', prof, segs=disc_segs, rot=(0, 90, 0), mat=paint_mat), 0.0, sharp=32))
    if nuts:
        places = []
        for s in ((-1, 1) if two_sided else (1,)):
            for i in range(nuts):
                a = i * 2 * math.pi / nuts
                places.append(((s * (hub - 0.024), 0.083 * math.cos(a), 0.083 * math.sin(a)), (0, 90 * s, 0)))
        parts += copies(bolt(paint_mat, 0.013, 0.016, 5), places)
    return join(name, parts)


# ---------------------------------------------------------------- ammunition and stores

def crate(name, sx, sy, sz, mat, battens=True, rope=None):
    """A wooden box with end battens, long axis along y, sitting on z = 0, centred in x and y."""
    parts = [hard(box('crate', sx, sy, sz, at=(0, 0, sz / 2), mat=mat), 0.006)]
    if battens:
        for y in (-sy / 2 + 0.07, sy / 2 - 0.07):
            for x in (-sx / 2 - 0.008, sx / 2 + 0.008):
                parts.append(shade(box('batten', 0.018, 0.05, sz * 0.94, at=(x, y, sz / 2), mat=mat), 50))
            parts.append(shade(box('batten-top', sx + 0.02, 0.05, 0.016, at=(0, y, sz + 0.006), mat=mat), 50))
    if rope is not None:
        for y in (-sy / 2 - 0.012, sy / 2 + 0.012):
            parts.append(shade(box('handle', sx * 0.4, 0.02, 0.025, at=(0, y, sz * 0.62), mat=rope), 50))
    return join(name, parts)


# ---------------------------------------------------------------- surfaces

def tread_plate(mat, pitch=0.06, rib=0.3, height=2.2):
    """Raise a diamond grid of ribs on the up-facing surfaces of a kit material (floor tread plate)."""
    nt = mat.node_tree
    bump = next(n for n in nt.nodes if n.type == 'BUMP')
    old = bump.inputs['Height'].links[0].from_socket if bump.inputs['Height'].links else None
    g = Graph.__new__(Graph)
    g.mat, g.t, g.x = mat, nt, 9000
    tc = g.n('ShaderNodeTexCoord')
    sep = g.n('ShaderNodeSeparateXYZ')
    g.link(tc.outputs['Object'], sep.inputs[0])
    k = 1.0 / (pitch * math.sqrt(2))
    ribs = None
    for op in ('ADD', 'SUBTRACT'):
        u = g.math('MULTIPLY', g.math(op, sep.outputs['X'], sep.outputs['Y']), k)
        a = g.math('ABSOLUTE', g.math('SUBTRACT', g.math('FRACT', u), 0.5))
        ridge = g.ramp(a, rib * 0.5, rib * 0.22)
        ribs = ridge if ribs is None else g.math('MAXIMUM', ribs, ridge)
    geo = g.n('ShaderNodeNewGeometry')
    nrm = g.n('ShaderNodeSeparateXYZ')
    g.link(geo.outputs['Normal'], nrm.inputs[0])
    ribs = g.math('MULTIPLY', ribs, g.ramp(nrm.outputs['Z'], 0.7, 0.9))
    h = g.math('MULTIPLY', ribs, height)
    if old is not None:
        h = g.math('ADD', h, old)
    g.link(h, bump.inputs['Height'])
    return mat


# ---------------------------------------------------------------- budget

def report(label, obs):
    """Print where the triangles of a part go, biggest first (grouped by object name)."""
    groups = {}
    for o in obs:
        key = o.name.split('.')[0]
        groups[key] = groups.get(key, 0) + sum(len(p.vertices) - 2 for p in o.data.polygons)
    total = sum(groups.values())
    top = sorted(groups.items(), key=lambda kv: -kv[1])[:14]
    print(f'  [{label}] {total} tris: ' + ', '.join(f'{k} {v}' for k, v in top))
    return total
