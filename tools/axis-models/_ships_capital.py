# Shared builders for the capital ships (battleship.py, cruiser.py): a hull lofted from a
# parametric lines plan, deckhouses, railings, turrets, light guns and the small deck fittings.
# Everything is in metres, bow to -y, waterline at z = 0, starboard is -x.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

D2 = math.degrees


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def sstep(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def rot_to(n):
    """Euler angles (degrees) that turn +z onto the direction n."""
    n = Vector(n).normalized()
    return (0.0, D2(math.acos(clamp(n.z, -1, 1))), D2(math.atan2(n.y, n.x)))


def face_out(nx, ny):
    """z rotation (degrees) that turns a part built facing -y to face the direction (nx, ny)."""
    return D2(math.atan2(nx, -ny))


def rz(p, deg):
    c, s = math.cos(R(deg)), math.sin(R(deg))
    return Vector((p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]))


# ---------------------------------------------------------------- materials

class Mats:
    pass


def materials():
    M = Mats()
    M.PAINT = paint('paint', dirt=0.9, wear=0.8, gloss=0.5)
    M.DECK = paint('deckpaint', grey=0.33, dirt=0.6, wear=0.5, gloss=0.62, streaks=False)
    M.BOAT = paint('boatpaint', grey=0.74, dirt=0.5, wear=0.3, gloss=0.45)
    M.RED = plain('antifoul', (0.22, 0.045, 0.035), rough=0.72, vary=0.16, dirt=0.3)
    M.BOOT = plain('boot', (0.016, 0.016, 0.018), rough=0.55, dirt=0.4)
    M.DARK = plain('cap', (0.026, 0.026, 0.028), rough=0.82, dirt=0.5)
    M.CANVAS = plain('canvas', (0.042, 0.04, 0.036), rough=0.95, vary=0.22, dirt=0.35, bump=0.5, fine_scale=30.0)
    M.TARP = plain('tarp', (0.33, 0.30, 0.22), rough=0.95, vary=0.2, dirt=0.7, bump=0.5, fine_scale=30.0)
    M.IRON = plain('iron', (0.07, 0.065, 0.06), rough=0.62, metal=0.7, rust=0.9, dirt=0.6)
    M.GUN = plain('gunmetal', (0.06, 0.06, 0.065), rough=0.45, metal=0.85, dirt=0.3, vary=0.08)
    M.WOOD = wood('wood', colour=(0.46, 0.37, 0.25), plank=0.25, length=5.0, dirt=0.6)
    M.GLASS = glass()
    return M


# ---------------------------------------------------------------- small mesh helpers

def ring_xy(r, z, segs, cx=0.0, cy=0.0, ry=None, phase=0.0):
    ry = r if ry is None else ry
    return [(cx + r * math.cos(phase + 2 * math.pi * i / segs), cy + ry * math.sin(phase + 2 * math.pi * i / segs), z) for i in range(segs)]


def lathe_o(name, profile, segs=8, mat=None, cap0=False, cap1=False, at=(0, 0, 0), rot=(0, 0, 0)):
    """A lathe about z whose ends are left open unless asked: no faces wasted on hidden caps."""
    rings = [ring_xy(max(r, 1e-4), h, segs) for r, h in profile]
    ob = loft(name, rings, cap_start=cap0, cap_end=cap1, mat=mat)
    weld(ob, 1e-4)
    return xform(ob, at, rot)


def disc(name, r, segs=8, mat=None, at=(0, 0, 0), rot=(0, 0, 0)):
    """One flat face looking along +z."""
    ob = mesh_obj(name, ring_xy(r, 0.0, segs), [tuple(range(segs))], mat)
    return xform(ob, at, rot)


def tube(name, p0, p1, r, segs=6, r2=None, mat=None, caps=False):
    """A rod from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    ob = cyl(name, r, d.length, segs=segs, r2=r2, mat=mat, caps=caps)
    return xform(ob, at=(p0 + p1) / 2, rot=rot_to(d))


def mesh_mats(ob, mats, pick):
    """Several materials on one mesh; pick(polygon) gives the index for each face."""
    me = ob.data
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.material_index = pick(p)
    return ob


UV_SCALE = 1.0 / 300.0          # every layout these builders keep is at this many UV units to the metre


def _normalize_uv(me, density=UV_SCALE):
    """Bring a freshly unwrapped layout to the common scale, about its own centre.
    Why every face of these ships carries a kept layout at one scale: the kit's atlas pass evens out
    texel density with average_islands_scale, which keeps the total UV area it is given, then packs the
    free islands into the unit square on their own. unwrap_now leaves every prototype filling a whole
    unit square and each stamped copy counts again, so a ship with two thousand stamped fittings hands
    that pass hundreds of unit squares of fittings, and the hull and upperworks come out dozens of
    times coarser than a bollard. With everything kept, and already at one scale, the pass has nothing
    to even out and nothing free to shrink; it only packs."""
    uv = me.uv_layers.active.data
    a_uv = a_3d = 0.0
    for p in me.polygons:
        pts = [uv[i].uv for i in p.loop_indices]
        a = 0.0
        for i in range(len(pts)):
            a += pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
        a_uv += abs(a) / 2
        a_3d += p.area
    if a_uv < 1e-12 or a_3d < 1e-12:
        return
    k = density / math.sqrt(a_uv / a_3d)
    vals = [0.0] * (len(uv) * 2)
    uv.foreach_get('uv', vals)
    n = len(vals) // 2
    cx, cy = sum(vals[0::2]) / n, sum(vals[1::2]) / n
    for i in range(0, len(vals), 2):
        vals[i] = cx + (vals[i] - cx) * k
        vals[i + 1] = cy + (vals[i + 1] - cy) * k
    uv.foreach_set('uv', vals)


def pin_uv(ob):
    """Unwrap one object by itself, at the common scale, and keep that layout."""
    unwrap_now(ob)
    _normalize_uv(ob.data)
    return ob


def copies(proto, places, name=None):
    """kit.copies, with the prototype's layout brought to the common scale (see _normalize_uv). It shadows the kit's."""
    pin_uv(proto)
    out = []
    for i, (at, rot) in enumerate(places):
        me = proto.data.copy()
        o = link(bpy.data.objects.new(f'{name or proto.name}.{i}', me))
        xform(o, at, rot)
        out.append(o)
    data = proto.data
    bpy.data.objects.remove(proto)
    bpy.data.meshes.remove(data)
    return out


def copies_s(proto, places, name=None):
    """Like copies, with a scale as well: (at, rot, scale). All copies share one piece of the atlas."""
    pin_uv(proto)
    out = []
    for i, (at, rot, scale) in enumerate(places):
        me = proto.data.copy()
        o = link(bpy.data.objects.new(f'{name or proto.name}.{i}', me))
        xform(o, at, rot, scale)
        out.append(o)
    data = proto.data
    bpy.data.objects.remove(proto)
    bpy.data.meshes.remove(data)
    return out


_FLAT_SIZES = (0.8, 1.6, 3.2, 6.5, 13.0, 26.0, 60.0)
_FLAT_SLOTS = {}
_FLAT_COUNT = [0]


def flat_uv(ob):
    """A kept layout for a small or thin part: every face laid flat at true size, the part's side
    faces all over one patch of the atlas and its top faces over another. A ship has hundreds of
    struts, bars and little boxes; left to an unwrap each face of each becomes an island with its own
    margin, and the margins alone eat a third of the texture. Faces that look down (mostly sat on a
    deck, baked dark) are kept apart, on one patch per material and size for the whole ship, so they
    never colour a face that shows."""
    me = ob.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    flat = [0.0] * (len(me.loops) * 2)
    _FLAT_COUNT[0] += 1
    k = _FLAT_COUNT[0]
    bu, bv = -40.0 - 2.0 * (k % 40), 4.0 + 2.0 * (k // 40)
    for p in me.polygons:
        co = [me.vertices[v].co for v in p.vertices]
        n = len(co)
        best = max(range(n), key=lambda i: (co[(i + 1) % n] - co[i]).length)
        ex = co[(best + 1) % n] - co[best]
        if ex.length < 1e-7 or p.normal.length < 1e-7:
            pts = [(0.0, 0.0)] * n
        else:
            ex.normalize()
            ey = p.normal.cross(ex)
            pts = [((c - co[best]).dot(ex), (c - co[best]).dot(ey)) for c in co]
        u0, v0 = min(q[0] for q in pts), min(q[1] for q in pts)
        if p.normal.z < -0.6:
            mat = me.materials[p.material_index].name if me.materials else '-'
            slot = _FLAT_SLOTS.setdefault(mat, len(_FLAT_SLOTS))
            size = max(max(q[0] for q in pts) - u0, max(q[1] for q in pts) - v0)
            cls = next((i for i, t in enumerate(_FLAT_SIZES) if size <= t), len(_FLAT_SIZES))
            pu, pv = -40.0 - cls * 1.5, -6.0 - slot * 1.5
        else:
            pu, pv = bu + (1.0 if p.normal.z > 0.6 else 0.0), bv + 0.6 * p.material_index
        for li, q in zip(p.loop_indices, pts):
            flat[li * 2] = pu + (q[0] - u0) * UV_SCALE
            flat[li * 2 + 1] = pv + (q[1] - v0) * UV_SCALE
    uv.data.foreach_set('uv', flat)
    keep = me.attributes.get('keep_uv') or me.attributes.new('keep_uv', 'INT', 'FACE')
    keep.data.foreach_set('value', [1] * len(me.polygons))
    return ob


def basis_xform(ob, origin, ex, ey, ez):
    """Bake a rigid placement given by three axes into the mesh."""
    m = Matrix((ex, ey, ez)).transposed().to_4x4()
    m.translation = Vector(origin)
    ob.data.transform(m)
    ob.data.update()
    return ob


# ---------------------------------------------------------------- plan outlines (counter-clockwise from above)

def octo(hw, y0, y1, f=None, b=None):
    """A deckhouse plan. y0 is the forward end. f and b are (half-width at that end, length of the taper)."""
    pts = [(f[0], y0), (hw, y0 + f[1])] if f else [(hw, y0)]
    pts += [(hw, y1 - b[1]), (b[0], y1)] if b else [(hw, y1)]
    return pts + [(-x, y) for x, y in reversed(pts)]


def bullet(hw, y0, y1, df=None, db=0.0, n=7):
    """A plan with a rounded forward end (depth df) and, if db > 0, a rounded after end."""
    df = hw if df is None else df
    pts = [(hw, y0 + df)]
    if db > 0:
        pts += [(hw * math.cos(math.pi * i / n), y1 - db + db * math.sin(math.pi * i / n)) for i in range(n + 1)]
    else:
        pts += [(hw, y1), (-hw, y1)]
    pts.append((-hw, y0 + df))
    pts += [(hw * math.cos(math.pi + math.pi * i / n), y0 + df + df * math.sin(math.pi + math.pi * i / n)) for i in range(1, n)]
    out = []
    for p in pts:
        if not out or (Vector(p) - Vector(out[-1])).length > 1e-4:
            out.append(p)
    if (Vector(out[0]) - Vector(out[-1])).length < 1e-4:
        out.pop()
    return out


def circle(r, cx=0.0, cy=0.0, n=12, phase=0.0):
    return [(cx + r * math.cos(phase + 2 * math.pi * i / n), cy + r * math.sin(phase + 2 * math.pi * i / n)) for i in range(n)]


def offset_outline(pts, d):
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        e1, e2 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n1, n2 = Vector((e1.y, -e1.x)), Vector((e2.y, -e2.x))
        v = (n1 + n2) / max(1 + n1.dot(n2), 0.25)
        out.append((p1.x + v.x * d, p1.y + v.y * d))
    return out


def resample(pts, spacing):
    """Points every `spacing` along a polyline (3D), ends included."""
    P = [Vector(p) for p in pts]
    total = sum((b - a).length for a, b in zip(P, P[1:]))
    n = max(1, round(total / spacing))
    step = total / n
    out, acc, i = [P[0].copy()], 0.0, 0
    for k in range(1, n):
        d = k * step
        while i < len(P) - 2 and acc + (P[i + 1] - P[i]).length < d:
            acc += (P[i + 1] - P[i]).length
            i += 1
        seg = (P[i + 1] - P[i]).length
        out.append(P[i].lerp(P[i + 1], (d - acc) / seg if seg > 1e-9 else 0))
    out.append(P[-1].copy())
    return out


# ---------------------------------------------------------------- the collector

class Kit:
    """Gathers the fixed parts of one ship, and the places of every repeated fitting, so each kind of
    fitting is stamped from one prototype at the end (one piece of the atlas per kind)."""

    def __init__(self, M):
        self.M = M
        self.parts = []
        self.posts, self.rails = [], []
        self.ports, self.doors, self.ladders, self.vladders = [], [], [], []
        self.gussets, self.vents, self.rafts, self.lockers = [], [], [], []
        self.lights, self.bollards, self.chocks, self.hatches = [], [], [], []
        self.oerlikons, self.reels = [], []
        self.tubs = {}

    def add(self, ob, w=0.05, sharp=50, flat=None):
        """Finish a fixed part and collect it. Small and thin parts get the shared flat layout."""
        hard(ob, w, sharp=sharp)
        if flat is None:
            lo = [min(v.co[i] for v in ob.data.vertices) for i in range(3)]
            hi = [max(v.co[i] for v in ob.data.vertices) for i in range(3)]
            d = sorted((hi[i] - lo[i] for i in range(3)), reverse=True)
            flat = d[0] < 4.0 or d[1] < 1.3
        if flat:
            flat_uv(ob)
        self.parts.append(ob)
        return ob

    def extend(self, obs):
        self.parts += obs

    def join_all(self, name='hull'):
        """One mesh from everything collected. Whatever has no kept layout yet is unwrapped together first."""
        free = [o for o in self.parts if o.data.attributes.get('keep_uv') is None]
        kept = [o for o in self.parts if o.data.attributes.get('keep_uv') is not None]
        if free:
            kept.append(pin_uv(join('structure', free)))
        self.parts = []
        return join(name, kept)

    def tally(self, top=40):
        """With AXM_TALLY=1, print where the fixed mesh's triangles go."""
        if os.environ.get('AXM_TALLY') != '1':
            return
        groups = {}
        for o in self.parts:
            key = o.name.split('.')[0]
            n = sum(len(p.vertices) - 2 for p in o.data.polygons)
            c, t = groups.get(key, (0, 0))
            groups[key] = (c + 1, t + n)
        print('  tally of the fixed mesh:')
        for key, (c, t) in sorted(groups.items(), key=lambda kv: -kv[1][1])[:top]:
            print(f'    {t:6d}  {key} x{c}')

    # -- railings: posts with two rails, about 1.1 m high
    def rail(self, pts, closed=False, spacing=3.4):
        P = [Vector(p) for p in pts]
        if closed:
            P.append(P[0])
        for a, b in zip(P, P[1:]):
            d = b - a
            if d.length < 0.3:
                continue
            n = max(1, round(d.length / spacing))
            l = d.length / n
            yaw = D2(math.atan2(-d.x, d.y))
            pitch = D2(math.atan2(d.z, math.hypot(d.x, d.y)))
            for k in range(n):
                p = a + d * (k / n)
                self.posts.append((tuple(p), (0, 0, 0)))
                self.rails.append((tuple(p), (pitch, 0, yaw), (1, l, 1)))
        if not closed:
            self.posts.append((tuple(P[-1]), (0, 0, 0)))

    def rail_outline(self, outline, z, inset=0.15, skip=None, spacing=3.4):
        """Railing round a plan outline at height z. skip(x, y) drops the bays whose middle it matches."""
        pts = offset_outline(outline, -inset)
        n = len(pts)
        run = []
        for i in range(n + 1):
            a = pts[i % n]
            b = pts[(i + 1) % n]
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if i < n and not (skip and (skip(*mid) or skip(*a) or skip(*b))):
                if not run:
                    run.append((a[0], a[1], z))
                run.append((b[0], b[1], z))
            else:
                if len(run) > 1:
                    self.rail(run, spacing=spacing)
                run = []

    def finish_fittings(self):
        """Stamp every collected fitting from its prototype."""
        M = self.M
        h = 1.1
        if self.posts:
            self.parts += copies(soft(cyl('rail-post', 0.05, h, at=(0, 0, h / 2), segs=3, mat=M.PAINT, caps=False)), self.posts)
        if self.rails:
            bay = join('rail-bay', [cyl('r1', 0.036, 1.0, at=(0, 0.5, h), rot=(90, 0, 0), segs=3, mat=M.PAINT, caps=False),
                                    cyl('r2', 0.03, 1.0, at=(0, 0.5, h * 0.52), rot=(90, 0, 0), segs=3, mat=M.PAINT, caps=False)])
            self.parts += copies_s(soft(bay), self.rails)
        for places, make in ((self.ports, proto_porthole), (self.doors, proto_door), (self.ladders, proto_ladder),
                             (self.vladders, proto_vladder), (self.gussets, proto_gusset), (self.vents, proto_vent),
                             (self.rafts, proto_raft), (self.lockers, proto_locker), (self.lights, proto_searchlight),
                             (self.bollards, proto_bollard), (self.chocks, proto_chock), (self.hatches, proto_hatch),
                             (self.oerlikons, proto_oerlikon), (self.reels, proto_reel)):
            if places:
                self.parts += copies(make(M), places)
        for (r, h, segs, floor), places in self.tubs.items():
            self.parts += copies(proto_tub(M, r, h, segs, floor), places)


# ---------------------------------------------------------------- prototypes of repeated fittings

def proto_porthole(M, r=0.2):
    rim = lathe_o('port-rim', [(r * 1.5, 0.0), (r * 1.05, 0.06)], segs=6, mat=M.PAINT)
    pane = disc('port-glass', r * 1.05, 6, M.GLASS, at=(0, 0, 0.045))
    return soft(join('porthole', [rim, pane]), 30)


def proto_door(M):
    """A watertight door, flat against a wall, facing -y, sill at z = 0."""
    parts = [hard(box('door', 0.9, 0.07, 1.9, at=(0, -0.035, 1.05), mat=M.PAINT), 0.0),
             hard(box('door-panel', 0.62, 0.05, 1.5, at=(0, -0.08, 1.05), mat=M.PAINT), 0.0)]
    return join('door', parts)


def proto_ladder(M, rise=2.7, run=2.2, width=0.75):
    """An inclined ladder climbing towards +y from the origin."""
    ang = D2(math.atan2(rise, run))
    ln = math.hypot(rise, run)
    parts = []
    for sx in (-1, 1):
        parts.append(hard(box('stringer', 0.05, ln, 0.2, at=(sx * width / 2, run / 2, rise / 2), rot=(ang, 0, 0), mat=M.PAINT), 0.0))
        parts.append(soft(tube('hand', (sx * width / 2, 0, 0.95), (sx * width / 2, run, rise + 0.95), 0.03, 3, mat=M.PAINT)))
    for i in range(1, 6):
        t = i / 6
        parts.append(hard(box('tread', width, 0.24, 0.04, at=(0, run * t, rise * t), mat=M.DECK), 0.0))
    return join('ladder', parts)


def proto_vladder(M, h=2.7, width=0.45):
    """A vertical ladder against a wall, facing -y."""
    parts = [soft(cyl('vl', 0.03, h, at=(sx * width / 2, -0.12, h / 2), segs=3, mat=M.PAINT, caps=False)) for sx in (-1, 1)]
    for i in range(6):
        parts.append(soft(cyl('rung', 0.022, width, at=(0, -0.12, 0.3 + i * (h - 0.5) / 5), rot=(0, 90, 0), segs=3, mat=M.PAINT, caps=False)))
    return join('vladder', parts)


def proto_gusset(M, a=0.9, b=0.9):
    """A triangular bracket under an overhang: against a wall facing -y, top at z = 0."""
    return hard(prism('gusset', [(0.0, 0.0), (-a, 0.0), (-a, -0.1), (0.0, -b)], -0.04, 0.04, M.PAINT), 0.0)


def proto_vent(M):
    return soft(lathe_o('vent', [(0.2, 0.0), (0.2, 0.62), (0.47, 0.7), (0.0, 0.93)], segs=6, mat=M.PAINT), 50)


def proto_raft(M):
    """A life raft (Carley float) lying flat; stack or lean them with the copy's rotation."""
    outer = loft('raft', [superellipse(1.5, 0.85, 3.0, 8, at=(0, 0, 0.0)), superellipse(1.5, 0.85, 3.0, 8, at=(0, 0, 0.32))], cap_start=False, mat=M.BOAT)
    well = hard(box('raft-well', 2.1, 0.9, 0.05, at=(0, 0, 0.33), mat=M.CANVAS), 0.0)
    return join('raft', [soft(outer, 50), well])


def proto_locker(M):
    parts = [hard(box('locker', 1.5, 0.7, 0.8, at=(0, 0, 0.4), mat=M.PAINT), 0.0),
             hard(box('locker-lid', 1.56, 0.76, 0.06, at=(0, 0, 0.83), mat=M.PAINT), 0.0)]
    return join('locker', parts)


def proto_searchlight(M):
    """A searchlight on its pedestal, lens to -y, base at z = 0."""
    parts = [soft(lathe_o('sl-ped', [(0.32, 0.0), (0.18, 0.2), (0.16, 0.75)], segs=6, mat=M.PAINT)),
             hard(box('sl-yoke', 1.2, 0.14, 0.12, at=(0, 0, 0.78), mat=M.PAINT), 0.0)]
    for sx in (-1, 1):
        parts.append(hard(box('sl-arm', 0.08, 0.14, 0.7, at=(sx * 0.58, 0, 1.12), mat=M.PAINT), 0.0))
    parts.append(soft(lathe_o('sl-drum', [(0.3, 0.42), (0.5, 0.3), (0.52, -0.38), (0.47, -0.42)], segs=8, mat=M.PAINT, cap0=True, at=(0, 0, 1.42), rot=(90, 0, 0)), 50))
    parts.append(disc('sl-glass', 0.47, 8, M.GLASS, at=(0, -0.4, 1.42), rot=(90, 0, 0)))
    return join('searchlight', parts)


def proto_bollard(M):
    """Twin bitts on a base plate, the pair set along y."""
    parts = [hard(box('bitt-base', 0.7, 1.9, 0.1, at=(0, 0, 0.05), mat=M.PAINT), 0.0)]
    for sy in (-1, 1):
        parts.append(soft(lathe_o('bitt', [(0.21, 0.08), (0.21, 0.64), (0.3, 0.72), (0.0, 0.84)], segs=6, mat=M.PAINT, at=(0, sy * 0.55, 0)), 50))
    return join('bollard', parts)


def proto_chock(M):
    """A closed fairlead at the deck edge; the rope passes along x."""
    parts = [hard(box('chock-base', 0.5, 1.3, 0.12, at=(0, 0, 0.06), mat=M.PAINT), 0.0)]
    for sy in (-1, 1):
        parts.append(hard(box('chock-horn', 0.42, 0.3, 0.42, at=(0, sy * 0.48, 0.3), rot=(sy * 18, 0, 0), mat=M.PAINT), 0.0))
    parts.append(hard(box('chock-top', 0.36, 1.1, 0.12, at=(0, 0, 0.52), mat=M.PAINT), 0.0))
    return join('chock', parts)


def proto_hatch(M):
    parts = [hard(box('hatch-coaming', 1.5, 1.5, 0.4, at=(0, 0, 0.2), mat=M.PAINT), 0.0),
             hard(box('hatch-lid', 1.62, 1.62, 0.07, at=(0, 0, 0.43), mat=M.DECK), 0.0),
             hard(box('hatch-wheel', 0.3, 0.3, 0.06, at=(0, 0, 0.49), rot=(0, 0, 45), mat=M.PAINT), 0.0)]
    return join('hatch', parts)


def proto_oerlikon(M):
    """A single 20 mm gun on a pedestal with a shield, at rest pointing up and to -y. Fixed."""
    parts = [soft(lathe_o('oe-ped', [(0.3, 0.0), (0.13, 0.15), (0.11, 1.1)], segs=5, mat=M.PAINT)),
             hard(box('oe-body', 0.14, 0.75, 0.18, at=(0, 0.02, 1.32), rot=(28, 0, 0), mat=M.GUN), 0.0),
             soft(tube('oe-barrel', (0, -0.3, 1.5), (0, -1.45, 2.1), 0.035, 4, mat=M.GUN)),
             hard(box('oe-shield', 1.0, 0.04, 0.75, at=(0, -0.42, 1.48), rot=(28, 0, 0), mat=M.PAINT), 0.0)]
    return join('oerlikon', parts)


def proto_reel(M):
    """A hose or wire reel on a stand; axis along x."""
    parts = [soft(cyl('reel-drum', 0.32, 0.8, at=(0, 0, 0.5), rot=(0, 90, 0), segs=8, mat=M.TARP)),
             hard(box('reel-l', 0.06, 0.8, 0.9, at=(-0.44, 0, 0.45), mat=M.PAINT), 0.0),
             hard(box('reel-r', 0.06, 0.8, 0.9, at=(0.44, 0, 0.45), mat=M.PAINT), 0.0)]
    return join('reel', parts)


def proto_boat(M, L=9.5, B=2.8, Hh=1.35):
    """A ship's boat under a canvas cover, bow to -y, keel at z = 0, with two chocks."""
    rings = []
    for t in (0.0, 0.07, 0.2, 0.42, 0.68, 0.9, 1.0):
        y = -L / 2 + t * L
        b = B / 2 * (0.04 + 0.96 * min(1.0, (t / 0.32)) ** 0.75) * (1.0 - 0.3 * max(0.0, (t - 0.6) / 0.4) ** 2)
        rise = 0.38 * (1 - min(1.0, t / 0.25)) ** 2
        top = Hh + 0.28 * (1 - min(1.0, t / 0.4)) ** 2 + 0.06
        rings.append([(-b, y, top), (-b * 0.86, y, Hh * 0.4 + rise), (0.0, y, rise), (b * 0.86, y, Hh * 0.4 + rise), (b, y, top), (0.0, y, top + 0.22 * (b / (B / 2)))])
    hullb = loft('boat', rings, mat=M.BOAT)
    mesh_mats(hullb, [M.BOAT, M.TARP], lambda p: 1 if p.normal.z > 0.45 else 0)
    parts = [soft(hullb, 40)]
    for y in (-L * 0.26, L * 0.28):
        parts.append(hard(box('chock', B * 0.9, 0.22, 0.5, at=(0, y, 0.2), mat=M.PAINT), 0.0))
    return join('boat', parts)


# ---------------------------------------------------------------- hull

class Hull:
    """A warship hull from a parametric lines plan. u runs 0 (stem) to 1 (stern) along the deck.
    The stations lean with the stem and the stern, so a raked bow and an overhanging stern need
    no special cases. sheer(u) is the height of the deck edge."""

    def __init__(self, L, B, T, sheer, **k):
        self.L, self.hb, self.T, self.sheer = L, B / 2, T, sheer
        d = dict(ue=0.40, uw=0.47, ae=1.9, aw=1.55, ur=0.60, urw=0.56, ks=0.5, kw=0.32, tc=0.9, rake=7.0, overhang=4.5,
                 bulb=1.5, bulbfwd=2.6, cut=6.0, flare=1.7, camber=0.25, zb=0.9, zt=1.0, brk=(), t_aft=1.4, urise=0.72,
                 ub=0.14, us=0.88, margin=0.7, pmid=5.0, stem=1.5, uv_under=0.3, uv_cuts=3)
        d.update(k)
        self.__dict__.update(d)

    def D(self, u):
        return self.sheer(u)

    def Y0(self, u):
        return -self.L / 2 + u * self.L

    def _close(self, t):
        c = clamp((t - self.tc) / (1 - self.tc))
        return math.sqrt(max(0.0, 1 - c * c))

    def bd(self, u):
        if u < self.ue:
            f = 1 - (1 - u / self.ue) ** self.ae
        elif u < self.ur:
            f = 1.0
        else:
            t = (u - self.ur) / (1 - self.ur)
            f = (1 - (1 - self.ks) * t ** 2.2) * self._close(t)
        return self.hb * f

    def bw(self, u):
        if u < self.uw:
            f = 1 - (1 - u / self.uw) ** self.aw
        elif u < self.urw:
            f = 1.0
        else:
            t = (u - self.urw) / (1 - self.urw)
            t2 = (u - self.ur) / (1 - self.ur)
            f = (1 - (1 - self.kw) * t ** 1.9) * self._close(t2)
        return min(self.hb * f, self.bd(u))

    def Tu(self, u):
        if u < self.urise:
            return self.T
        return self.t_aft + (self.T - self.t_aft) * (1 - sstep((u - self.urise) / (1 - self.urise)))

    def pexp(self, u):
        if u < 0.5:
            return lerp(1.3, self.pmid, sstep(u / 0.33))
        return lerp(self.pmid, 2.2, sstep((u - 0.62) / 0.33))

    def x(self, u, z):
        bw, bd = self.bw(u), self.bd(u)
        if z >= 0:
            return bw + (bd - bw) * clamp(z / self.D(u)) ** self.flare
        d = clamp(-z / self.Tu(u))
        p = self.pexp(u)
        x = bw * max(0.0, 1 - d ** p) ** (1 / p)
        if self.bulb and u < 0.09:
            x += self.bulb * math.sin(math.pi * clamp(u / 0.09)) ** 0.7 * math.exp(-((d - 0.7) / 0.2) ** 2) * (1 - d ** 8)
        return x

    def yshift(self, u, z):
        y = 0.0
        if u < self.ub:
            wb = (1 - u / self.ub) ** 2
            if z >= 0:
                sp = self.rake * (1 - clamp(z / self.D(u))) ** self.stem
            else:
                d = clamp(-z / self.Tu(u))
                sp = self.rake - self.bulbfwd * math.exp(-((d - 0.7) / 0.22) ** 2) + self.cut * d ** 5
            y += sp * wb
        if u > self.us:
            ws = ((u - self.us) / (1 - self.us)) ** 2
            if z >= 0:
                so = (1 - clamp(z / self.D(u))) ** 1.6
            else:
                so = 1 + 0.6 * clamp(-z / self.Tu(u))
            y -= self.overhang * so * ws
        return y

    def P(self, u, z):
        return Vector((self.x(u, z), self.Y0(u) + self.yshift(u, z), z))

    def rows(self, u):
        T, D = self.Tu(u), self.D(u)
        zs = [-(self.zb + e * (T - self.zb)) for e in (1.0, 0.985, 0.93, 0.82, 0.66, 0.46, 0.24, 0.0)]
        zs.append(self.zt)
        zs += [self.zt + w * (D - self.zt) for w in (0.2, 0.4, 0.6, 0.8, 1.0)]
        return zs

    def stations(self):
        us = [0, .004, .012, .025, .045, .07, .10, .14, .18, .23, .28, .34, .40, .47, .54, .61, .68, .74, .79, .83, .87, .90, .925, .945]
        uc = self.ur + self.tc * (1 - self.ur)
        us += [uc + c * (1 - uc) for c in (0.0, .25, .5, .7, .85, .94, .985, 1.0)]
        for b in self.brk:
            us = [u for u in us if abs(u - b) > 0.012]
            us += [b, b + 0.0005]
        return sorted(set(us))

    def u_of(self, y):
        return clamp((y + self.L / 2) / self.L)

    def deck(self, y, x=0.0):
        """Height of the deck surface at a point."""
        u = self.u_of(y)
        b = max(self.bd(u), 0.01)
        return self.D(u) + self.camber * (b / self.hb) * max(0.0, 1 - (x / b) ** 2)

    def half(self, y):
        return self.bd(self.u_of(y))

    def side(self, y, z):
        """The point on the port (+x) side at (y, z), and the outward normal there."""
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if self.Y0(mid) + self.yshift(mid, z) < y:
                lo = mid
            else:
                hi = mid
        u = (lo + hi) / 2
        du, dz = 0.002, 0.05
        tu = self.P(min(1.0, u + du), z) - self.P(max(0.0, u - du), z)
        tz = self.P(u, z + dz) - self.P(u, z - dz)
        n = tu.cross(tz)
        n.normalize()
        if n.x < 0:
            n = -n
        return self.P(u, z), n, u

    def build(self, M):
        us = self.stations()
        nh = len(self.rows(0.5))
        nr = 2 * nh - 1
        per = nr + 5
        verts, faces, idx, fuv = [], [], [], []
        side_uv, deck_uv = [], []          # per station: by row (keel first) for the +x side; across the deck
        voff = 0.0
        for i, u in enumerate(us):
            half = [(self.x(u, z), self.Y0(u) + self.yshift(u, z), z) for z in self.rows(u)]
            half[0] = (0.0, half[0][1], half[0][2])
            verts += [(-x, y, z) for x, y, z in reversed(half[1:])] + half
            b, D, y = self.bd(u), self.D(u), self.Y0(u)
            m = max(b - self.margin, b * 0.5)
            for x in (-m, -b * 0.45, 0.0, b * 0.45, m):
                verts.append((x, y, D + self.camber * (b / self.hb) * (1 - (x / b) ** 2 if b > 1e-6 else 0.0)))
            # layout: a step in the deck gets room for its bulkhead
            if i > 0 and u - us[i - 1] < 1e-3:
                voff += abs(self.D(us[i - 1]) - D)
            ua, ub_ = max(0.0, u - 0.002), min(1.0, u + 0.002)
            t = Vector((self.bd(ub_) - self.bd(ua), self.Y0(ub_) - self.Y0(ua)))
            t.normalize()
            n = Vector((t.y, -t.x))            # outward from the deck edge, in plan
            s = [0.0] * nh
            for h in range(nh - 2, -1, -1):
                s[h] = s[h + 1] + (Vector(half[h + 1]) - Vector(half[h])).length * (self.uv_under if h < 7 else 1.0)
            side_uv.append([(b + s[h] * n.x, y + voff + s[h] * n.y) for h in range(nh)])
            deck_uv.append([(x, y + voff) for x in (-b, -m, -b * 0.45, 0.0, b * 0.45, m, b)])
        for i in range(len(us) - 1):
            a, b = i * per, (i + 1) * per
            piece = min(self.uv_cuts - 1, int((us[i] + us[i + 1]) / 2 * self.uv_cuts))
            for j in range(nr - 1):
                k = min(abs(j - (nh - 1)), abs(j + 1 - (nh - 1)))
                faces.append((a + j, a + j + 1, b + j + 1, b + j))
                idx.append(0 if k < 7 else (1 if k == 7 else 2))
                sg = -1.0 if j < nh - 1 else 1.0
                h0, h1 = abs(j - (nh - 1)), abs(j + 1 - (nh - 1))
                quad = [side_uv[i][h0], side_uv[i][h1], side_uv[i + 1][h1], side_uv[i + 1][h0]]
                fuv.append([(sg * p[0], p[1] + piece * 900.0) for p in quad])
            da = [a] + [a + nr + q for q in range(5)] + [a + nr - 1]
            db = [b] + [b + nr + q for q in range(5)] + [b + nr - 1]
            step = us[i + 1] - us[i] < 1e-3
            for q in range(6):
                faces.append((da[q], da[q + 1], db[q + 1], db[q]))
                idx.append(2 if step else (4 if q in (0, 5) else 3))
                fuv.append([(p[0], p[1] + piece * 900.0) for p in (deck_uv[i][q], deck_uv[i][q + 1], deck_uv[i + 1][q + 1], deck_uv[i + 1][q])])
        ob = mesh_obj('hull-loft', verts, faces)
        for m in (M.RED, M.BOOT, M.PAINT, M.WOOD, M.DECK):
            ob.data.materials.append(m)
        for p, k in zip(ob.data.polygons, idx):
            p.material_index = k
        # the layout is kept (as for stamped copies): small, and parked clear of everything else until the pack
        uv = ob.data.uv_layers.new(name='UVMap')
        uv.data.foreach_set('uv', [c for quad in fuv for p in quad for c in (p[0] / 300.0 - 10.0, p[1] / 300.0)])
        weld(ob, 1e-4)
        shade(ob, 50)
        keep = ob.data.attributes.new('keep_uv', 'INT', 'FACE')
        keep.data.foreach_set('value', [1] * len(ob.data.polygons))
        return ob

    def strake(self, M, zrel, u0=0.03, u1=0.97, w=0.13, h=0.22, mat=None):
        """A thin raised strip along both sides, zrel below the deck edge (a degaussing cable, a rubbing strake)."""
        us = [u for u in self.stations() if u0 <= u <= u1]
        verts, faces = [], []
        for u in us:
            z = self.D(u) + zrel
            p = self.P(u, z)
            _, n, _ = self.side(p.y, z)
            verts += [tuple(p + Vector((0, 0, -h / 2)) - n * 0.03), tuple(p + n * w), tuple(p + Vector((0, 0, h / 2)) - n * 0.03)]
        for i in range(len(us) - 1):
            a, b = i * 3, (i + 1) * 3
            faces += [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2)]
        ob = mesh_obj('strake', verts, faces, mat or M.PAINT)
        uv = ob.data.uv_layers.new(name='UVMap')
        flat = []
        for i in range(len(us) - 1):
            ln = (Vector(verts[(i + 1) * 3 + 1]) - Vector(verts[i * 3 + 1])).length / 300.0
            for v0 in (0.0, h / 300.0):
                flat += [-20.0, v0, -20.0 + ln, v0, -20.0 + ln, v0 + h / 300.0, -20.0, v0 + h / 300.0]
        uv.data.foreach_set('uv', flat)
        keep = ob.data.attributes.new('keep_uv', 'INT', 'FACE')
        keep.data.foreach_set('value', [1] * len(ob.data.polygons))
        return both(shade(ob, 50))

    def edge_run(self, y0, y1, inset=0.3, spacing=3.4, lift=0.0):
        """Evenly spaced points along the port deck edge between two y values."""
        n = max(2, int(abs(y1 - y0) / 0.5))
        pts = []
        for i in range(n + 1):
            y = lerp(y0, y1, i / n)
            x = max(self.half(y) - inset, 0.0)
            pts.append((x, y, self.deck(y, x) + lift))
        return resample(pts, spacing)


def portholes_hull(K, H, y0, y1, step, zrel, skip=()):
    """A row of portholes along both sides, zrel below the deck edge."""
    y = y0
    while y <= y1:
        if not any(a <= y <= b for a, b in skip):
            z = H.D(H.u_of(y)) + zrel
            p, n, _ = H.side(y, z)
            for s in (1, -1):
                K.ports.append(((s * (p.x - n.x * 0.01), p.y, z), rot_to((s * n.x, n.y, n.z))))
        y += step


# ---------------------------------------------------------------- deckhouses, platforms, screens

def house(K, name, outline, z0, z1, lip=0.18, bev=0.05, wall=None, top=None, ring=None):
    """A deckhouse: walls from a plan outline with a roof plate that overhangs by `lip`."""
    M = K.M
    wall, top = wall or M.PAINT, top or M.DECK
    if lip:
        zt = z1 - 0.14
        K.add(loft(name, [[(x, y, z0) for x, y in outline], [(x, y, zt) for x, y in outline]], cap_start=False, cap_end=False, mat=wall), bev)
        o2 = offset_outline(outline, lip)
        roof = loft(name + '-roof', [[(x, y, zt) for x, y in outline], [(x, y, zt) for x, y in o2], [(x, y, z1) for x, y in o2]], cap_start=False, cap_end=True, mat=wall)
        mesh_mats(roof, [wall, top], lambda p: 1 if p.normal.z > 0.7 else 0)
        K.add(roof, 0.03)
    else:
        ob = loft(name, [[(x, y, z0) for x, y in outline], [(x, y, z1) for x, y in outline]], cap_start=False, mat=wall)
        mesh_mats(ob, [wall, top], lambda p: 1 if p.normal.z > 0.7 else 0)
        K.add(ob, bev)
    return outline


def plate(K, name, outline, z, t=0.14, top=None, edge=None, bev=0.03):
    """A deck plate with its top at z."""
    M = K.M
    ob = loft(name, [[(x, y, z - t) for x, y in outline], [(x, y, z) for x, y in outline]], mat=edge or M.PAINT)
    mesh_mats(ob, [edge or M.PAINT, top or M.DECK], lambda p: 1 if p.normal.z > 0.7 else 0)
    K.add(ob, bev)
    return outline


def tower(K, name, levels, bev=0.06, mat=None, cap=True):
    """A tapering structure: levels are (outline, z) with the same number of points each."""
    M = K.M
    ob = loft(name, [[(x, y, z) for x, y in o] for o, z in levels], cap_start=False, cap_end=cap, mat=mat or M.PAINT)
    if cap:
        mesh_mats(ob, [mat or M.PAINT, M.DECK], lambda p: 1 if p.normal.z > 0.7 else 0)
    K.add(ob, bev)


def bulwark(K, name, pts, z0, h, t=0.09, closed=False, mat=None, bev=0.0):
    """A thin screen standing on a plan polyline (counter-clockwise outlines get their thickness inside).
    z0 may be a number or a function of (x, y)."""
    M = K.M
    n = len(pts)
    zf = z0 if callable(z0) else (lambda x, y: z0)
    P = [Vector(p) for p in pts]
    verts, faces = [], []
    for i in range(n):
        if closed:
            e1, e2 = (P[i] - P[i - 1]).normalized(), (P[(i + 1) % n] - P[i]).normalized()
        else:
            e1 = (P[i] - P[i - 1]).normalized() if i > 0 else (P[1] - P[0]).normalized()
            e2 = (P[i + 1] - P[i]).normalized() if i < n - 1 else e1
        n1, n2 = Vector((-e1.y, e1.x)), Vector((-e2.y, e2.x))
        v = (n1 + n2) / max(1 + n1.dot(n2), 0.25) * t
        zb = zf(P[i].x, P[i].y)
        q = P[i] + v
        verts += [(P[i].x, P[i].y, zb), (P[i].x, P[i].y, zb + h), (q.x, q.y, zb + h), (q.x, q.y, zb)]
    for i in range(n if closed else n - 1):
        a, b = i * 4, ((i + 1) % n) * 4
        for k in range(4):
            faces.append((a + k, b + k, b + (k + 1) % 4, a + (k + 1) % 4))
    if not closed:
        faces += [(0, 1, 2, 3), ((n - 1) * 4 + 3, (n - 1) * 4 + 2, (n - 1) * 4 + 1, (n - 1) * 4)]
    ob = mesh_obj(name, verts, faces, mat or M.PAINT)
    fix_normals(ob)
    K.add(ob, bev)
    return ob


def windows(K, name, pts, z, h=0.75, closed=False, posts=True):
    """A strip of bridge windows standing a little proud of the wall along a plan polyline."""
    M = K.M
    out = offset_outline(pts, 0.035) if closed else _offset_open(pts, 0.035)
    bulwark(K, name, out, z, h, t=0.09, closed=closed, mat=M.GLASS)
    if posts:
        places = []
        seq = out + ([out[0]] if closed else [])
        for a, b in zip(seq, seq[1:]):
            a, b = Vector(a), Vector(b)
            m = max(1, round((b - a).length / 1.3))
            for k in range(m):
                p = a.lerp(b, k / m)
                places.append(((p.x, p.y, z + h / 2), (0, 0, 0)))
        places.append(((seq[-1][0], seq[-1][1], z + h / 2), (0, 0, 0)))
        K.extend(copies(hard(box('mullion', 0.1, 0.1, h + 0.06, mat=M.PAINT), 0.0), places))


def _offset_open(pts, d):
    P = [Vector(p) for p in pts]
    out = []
    for i in range(len(P)):
        e1 = (P[i] - P[i - 1]).normalized() if i > 0 else (P[1] - P[0]).normalized()
        e2 = (P[i + 1] - P[i]).normalized() if i < len(P) - 1 else e1
        n1, n2 = Vector((e1.y, -e1.x)), Vector((e2.y, -e2.x))
        v = (n1 + n2) / max(1 + n1.dot(n2), 0.25) * d
        out.append((P[i].x + v.x, P[i].y + v.y))
    return out


def wall_fit(K, outline, z0, step=2.9, zport=1.75, door_every=4, min_len=3.2, skip=None, ports=True, doors=True):
    """Portholes and the odd watertight door along every long wall of a plan outline."""
    n = len(outline)
    count = 0
    for i in range(n):
        a, b = Vector(outline[i]), Vector(outline[(i + 1) % n])
        d = b - a
        l = d.length
        if l < min_len:
            continue
        e = d / l
        nrm = Vector((e.y, -e.x))
        m = max(1, int((l - 1.4) / step) + 1)
        start = (l - (m - 1) * step) / 2
        for j in range(m):
            p = a + e * (start + j * step)
            if skip and skip(p.x, p.y):
                continue
            count += 1
            if doors and door_every and count % door_every == 2:
                K.doors.append(((p.x, p.y, z0 + 0.12), (0, 0, face_out(nrm.x, nrm.y))))
            elif ports:
                K.ports.append(((p.x, p.y, z0 + zport), rot_to((nrm.x, nrm.y, 0))))


def gussets(K, outline, z, every=1, min_len=0.0, skip=None):
    """Brackets under a roof plate, at the corners and along the walls of the plan below it."""
    n = len(outline)
    for i in range(n):
        a, b = Vector(outline[i]), Vector(outline[(i + 1) % n])
        d = b - a
        l = d.length
        if l < min_len:
            continue
        e = d / l
        nrm = Vector((e.y, -e.x))
        m = max(1, round(l / every))
        for j in range(m):
            p = a + e * ((j + 0.5) * l / m)
            if skip and skip(p.x, p.y):
                continue
            K.gussets.append(((p.x, p.y, z), (0, 0, face_out(nrm.x, nrm.y))))


def proto_tub(M, r, h, segs, floor, t=0.08):
    """A splinter tub: a ring screen, on a floor plate where it overhangs. Base at z = 0."""
    verts, faces = [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        c, s = math.cos(a), math.sin(a)
        verts += [(r * c, r * s, 0.0), (r * c, r * s, h), ((r - t) * c, (r - t) * s, h), ((r - t) * c, (r - t) * s, 0.0)]
    for i in range(segs):
        a, b = i * 4, ((i + 1) % segs) * 4
        for k in range(3):
            faces.append((a + k, b + k, b + k + 1, a + k + 1))
    parts = [shade(fix_normals(mesh_obj('tub', verts, faces, M.PAINT)), 50)]
    if floor:
        fl = loft('tub-floor', [ring_xy(r + 0.05, -0.12, segs), ring_xy(r + 0.05, 0.0, segs)], mat=M.PAINT)
        mesh_mats(fl, [M.PAINT, M.DECK], lambda p: 1 if p.normal.z > 0.7 else 0)
        parts.append(shade(fl, 50))
    return join('aa-tub', parts)


def tub(K, name, x, y, z, r=2.3, h=1.1, segs=12, floor=True, t=0.08):
    """A splinter tub for a light gun: a ring screen, on a floor plate where it overhangs."""
    K.tubs.setdefault((r, h, segs, floor), []).append(((x, y, z), (0, 0, 0)))


def pedestal(K, name, x, y, z0, z1, r, segs=12, r2=None, bev=0.06):
    """A round base or tower with a chamfered top; nothing is spent on the hidden underside."""
    r2 = r if r2 is None else r2
    ob = lathe_o(name, [(r, z0), (r2, z1 - bev), (r2 - bev, z1), (0.0, z1)], segs=segs, mat=K.M.PAINT, at=(x, y, 0))
    K.add(ob, 0.0, sharp=40)


def collar(K, name, x, y, z, r, w=0.12, h=0.2, segs=16):
    """A raised band round a cylinder."""
    K.add(lathe_o(name, [(r, z - h / 2 - 0.03), (r + w, z - h / 2), (r + w, z + h / 2), (r, z + h / 2 + 0.03)], segs=segs, mat=K.M.PAINT, at=(x, y, 0)), 0.0, sharp=40)


def funnel(K, name, cx, cy, z0, z1, a, b, rake=7.0, n=2.6, segs=20, cap=1.6, taper=0.93, pipes=True):
    """A raked funnel with a dark cap, an open top, bands and steam pipes. Returns the centre of the top."""
    M = K.M
    tr = math.tan(R(rake))

    def ring(z, k=1.0, inset=0.0):
        f = lerp(1.0, taper, (z - z0) / (z1 - z0))
        return superellipse(a * f * k - inset, b * f * k - inset, n, segs, at=(cx, cy + (z - z0) * tr, z))

    zc = z1 - cap
    rings = [ring(z0), ring(lerp(z0, zc, 0.5)), ring(zc), ring(zc, 1.04), ring(z1, 1.04), ring(z1, 1.0, 0.28), ring(z1 - 1.6, 1.0, 0.28)]
    ob = loft(name, rings, cap_start=True, cap_end=True, mat=M.PAINT)
    mesh_mats(ob, [M.PAINT, M.DARK], lambda p: 1 if p.center.z > zc - 0.01 else 0)
    K.add(ob, 0.0, sharp=40)
    for zz in (lerp(z0, zc, 0.33), lerp(z0, zc, 0.7)):
        band = loft(name + '-band', [ring(zz - 0.12, 1.0, -0.01), ring(zz - 0.1, 1.0, -0.09), ring(zz + 0.1, 1.0, -0.09), ring(zz + 0.12, 1.0, -0.01)],
                    cap_start=False, cap_end=False, mat=M.PAINT)
        K.add(band, 0.0, sharp=40)
    top = (cx, cy + (z1 - z0) * tr, z1)
    if pipes:
        f = lerp(1.0, taper, 0.5)
        for sx, yy, r_, up in ((-0.9, -1, 0.2, 0.7), (0.9, -1, 0.2, 0.7), (0.0, 1, 0.26, 1.0)):
            zb, zt = z0 + 0.3, z1 + up
            off = (b * f + 0.3) * yy * (1 - 0.06 * abs(sx))
            p0 = (cx + sx * a * 0.4, cy + (zb - z0) * tr + off, zb)
            p1 = (cx + sx * a * 0.4, cy + (zt - z0) * tr + off * taper, zt)
            K.add(tube(name + '-pipe', p0, p1, r_, 6, mat=M.PAINT, caps=True), 0.0)
            for zz in (lerp(zb, zt, 0.35), lerp(zb, zt, 0.8)):
                K.add(box(name + '-clip', 0.5, 0.5, 0.12, at=(p0[0], lerp(p0[1], p1[1], (zz - zb) / (zt - zb)) - yy * 0.2, zz), mat=M.PAINT), 0.0)
    # grating bars across the mouth
    for k in (-0.45, 0.0, 0.45):
        yy = top[1] + k * b * taper
        wdt = a * taper * (1 - abs(k) ** 2.2) ** (1 / 2.2) * 2 - 0.3
        K.add(box(name + '-bar', wdt, 0.12, 0.12, at=(cx, yy, z1 - 0.25), mat=M.DARK), 0.0)
    return top


# ---------------------------------------------------------------- turrets and guns

def gunhouse(name, wf, wm, wr, yf, ys, yq, yr, hs, ht, mat, z0=0.3, sl=0.5, ch=0.5, drop=0.25, bev=0.07):
    """A faceted armoured gunhouse: a sloped face plate, side plates that break at the shoulders, a
    chamfer between sides and roof, and a roof that falls to the rear. Built about the turret centre."""

    def ring(w, y, hs_, ht_, slope):
        pts = [(-w, y, z0), (-(w - 0.12), y + slope * hs_, z0 + hs_), (-(w - 0.12 - ch), y + slope * ht_, z0 + ht_)]
        return pts + [(-x, yy, z) for x, yy, z in reversed(pts)]

    rings = [ring(wf, yf, hs * 0.9, ht * 0.92, sl), ring(wm, ys, hs, ht, 0.0), ring(wm, yq, hs, ht, 0.0), ring(wr, yr, hs * 0.95, ht - drop, -0.12)]
    return hard(loft(name, rings, mat=mat), bev)


def barrel(name, x, y, z, profile, bore, segs, M, mat=None):
    """A gun barrel along -y from (x, y, z). profile is (radius, distance) pairs; the muzzle gets a dark bore."""
    r_end, l_end = profile[-1]
    outer = lathe_o(name, list(profile) + [(bore, l_end)], segs=segs, mat=mat or M.PAINT, at=(x, y, z), rot=(90, 0, 0))
    pit = lathe_o(name + '-bore', [(bore, l_end), (bore, l_end - bore * 2.5), (0.0, l_end - bore * 2.5)], segs=segs, mat=M.DARK, at=(x, y, z), rot=(90, 0, 0))
    return [hard(outer, 0.0, sharp=35), hard(pit, 0.0, sharp=35)]


def build_main_turret(M, K, p):
    """Returns (turret, guns, trunnion, muzzles) built about the origin: the turret's base centre."""
    wm, z0, ht = p['wm'], p['z0'], p['ht']
    top = z0 + ht
    s = p.get('scale', 1.0)
    parts = [gunhouse('gunhouse', p['wf'], wm, p['wr'], p['yf'], p['ys'], p['yq'], p['yr'], p['hs'], ht, M.PAINT, z0=z0, sl=p['sl'], ch=0.5 * s, drop=0.25 * s, bev=0.07 * s)]
    parts.append(hard(lathe_o('skirt', [(p['ring'], -0.05), (p['ring'], z0 + 0.1)], segs=20, mat=M.PAINT), 0.0, sharp=40))
    # rangefinder ears
    ye = p['yq'] + 1.0 * s
    we = lerp(wm, p['wr'], (ye - p['yq']) / (p['yr'] - p['yq']))
    for sx in (-1, 1):
        parts.append(hard(box('ear', 1.5 * s, 1.7 * s, 1.15 * s, at=(sx * (we + 0.2 * s), ye, z0 + p['hs'] * 0.62), mat=M.PAINT), 0.08 * s))
        parts.append(hard(cyl('ear-lens', 0.33 * s, 0.08, at=(sx * (we + 0.5 * s), ye - 0.86 * s, z0 + p['hs'] * 0.64), rot=(90, 0, 0), segs=8, mat=M.GLASS), 0.0))
        parts.append(hard(box('ear-brow', 0.9 * s, 0.25 * s, 0.1 * s, at=(sx * (we + 0.5 * s), ye - 0.95 * s, z0 + p['hs'] * 0.64 + 0.45 * s), mat=M.PAINT), 0.0))
        # sight hoods on the forward side plates
        t = 0.62
        xs = lerp(p['wf'], wm, t)
        ysd = lerp(p['yf'] + p['sl'] * p['hs'] * 0.5, p['ys'], t)
        parts.append(hard(box('sight', 0.7 * s, 1.0 * s, 0.55 * s, at=(sx * (xs - 0.05), ysd, z0 + p['hs'] * 0.78), rot=(0, 0, sx * -14), mat=M.PAINT), 0.05 * s))
        parts.append(hard(box('sight-glass', 0.4 * s, 0.05, 0.25 * s, at=(sx * (xs + 0.03), ysd - 0.5 * s, z0 + p['hs'] * 0.8), rot=(0, 0, sx * -14), mat=M.GLASS), 0.0))
        # side ladder rungs and a grab rail
        for i in range(5):
            parts.append(hard(box('rung', 0.1, 0.5 * s, 0.05, at=(sx * (wm + 0.02), p['ys'] + 1.1 * s, z0 + 0.4 + i * (p['hs'] - 0.5) / 4.5), mat=M.PAINT), 0.0))
        parts.append(hard(box('side-rail', 0.06, (p['yq'] - p['ys']) * 0.55, 0.06, at=(sx * (wm + 0.03), lerp(p['ys'], p['yq'], 0.62), z0 + p['hs'] * 0.9), mat=M.PAINT), 0.0))
    # roof: periscopes, hatches, plate joints, vents
    for x in p['bores']:
        parts.append(hard(box('periscope', 0.55 * s, 0.5 * s, 0.34 * s, at=(x * 0.9, p['ys'] - 0.9 * s, top - 0.02), mat=M.PAINT), 0.04 * s))
        parts.append(hard(box('peri-glass', 0.36 * s, 0.04, 0.14 * s, at=(x * 0.9, p['ys'] - 1.16 * s, top + 0.06 * s), mat=M.GLASS), 0.0))
    for y in (lerp(p['ys'], p['yq'], 0.28), lerp(p['ys'], p['yq'], 0.86)):
        parts.append(hard(box('roof-joint', (wm - 0.75 * s) * 2, 0.14 * s, 0.07 * s, at=(0, y, top + 0.015), mat=M.PAINT), 0.0))
    for x, y in ((-wm * 0.42, lerp(p['ys'], p['yq'], 0.55)), (wm * 0.42, lerp(p['ys'], p['yq'], 0.55))):
        parts.append(hard(cyl('roof-hatch', 0.48 * s, 0.09 * s, at=(x, y, top + 0.03), segs=8, mat=M.PAINT), 0.0))
        parts.append(hard(box('hatch-grip', 0.34 * s, 0.05, 0.07, at=(x, y, top + 0.1 * s), mat=M.PAINT), 0.0))
    yrr = lerp(p['yq'], p['yr'], 0.5)
    zrr = top - 0.125 * s
    parts.append(hard(box('roof-vent', 1.3 * s, 0.9 * s, 0.4 * s, at=(0, yrr, zrr + 0.12 * s), mat=M.PAINT), 0.06 * s))
    for sx in (-1, 1):
        parts.append(soft(lathe_o('roof-mush', [(0.2 * s, 0.0), (0.2 * s, 0.3 * s), (0.38 * s, 0.34 * s), (0.0, 0.5 * s)], segs=6, mat=M.PAINT, at=(sx * wm * 0.5, yrr + 0.3 * s, zrr - 0.02)), 50))
    # rear door and overhang stiffeners
    parts.append(hard(box('rear-door', 0.9 * s, 0.1, 1.5 * s, at=(0, p['yr'] - 0.08, z0 + 1.1 * s), mat=M.PAINT), 0.0))
    for x in (-p['wr'] * 0.55, p['wr'] * 0.55):
        parts.append(hard(box('rear-rib', 0.12, 0.14, p['hs'] * 0.8, at=(x, p['yr'] - 0.04, z0 + p['hs'] * 0.45), mat=M.PAINT), 0.0))
    # rafts on the side walls
    if p.get('rafts', True):
        places = []
        for sx in (-1, 1):
            for yy in (lerp(p['ys'], p['yq'], 0.3),):
                places.append(((sx * (wm + 0.02), yy, z0 + p['hs'] * 0.5), (90, 0, sx * 90)))
        raft = proto_raft(M)
        raft.data.transform(Matrix.Diagonal((s, s, 1, 1)))
        parts += copies(raft, places)
    turret = pin_uv(join('turret.main', parts))
    turret.data.name = 'turret.main'

    # the guns: barrels with blast bags, turning on the trunnion line
    ty, tz = p['ty'], p['tz']
    gp = []
    muzzles = []
    face_y = p['yf'] + p['sl'] * (tz - z0)
    for x in p['bores']:
        gp += barrel('barrel', x, ty, tz, p['barrel'], p['bore'], p.get('segs', 12), M)
        r0 = p['barrel'][0][0]
        d0 = ty - face_y - 0.55 * s          # the bag starts just inside the face plate
        bag = lathe_o('blast-bag', [(r0 * 1.75, d0), (r0 * 1.85, d0 + 0.75 * s), (r0 * 1.62, d0 + 1.35 * s), (r0 * 1.66, d0 + 1.8 * s), (r0 * 1.3, d0 + 2.35 * s), (r0 * 1.02, d0 + 2.6 * s)],
                      segs=8, mat=M.CANVAS, at=(x, ty, tz), rot=(90, 0, 0))
        gp.append(soft(bag, 60))
        gp.append(hard(lathe_o('bag-clamp', [(r0 * 1.12, d0 + 2.55 * s), (r0 * 1.12, d0 + 2.75 * s), (r0 * 0.98, d0 + 2.78 * s)], segs=8, mat=M.PAINT, at=(x, ty, tz), rot=(90, 0, 0)), 0.0))
        muzzles.append((x, ty - p['barrel'][-1][1], tz))
    guns = pin_uv(join('guns.main', gp))
    guns.data.name = 'guns.main'
    pivot(guns, (0, ty, tz))
    return turret, guns, (0, ty, tz), muzzles


def build_sec_mount(M, p):
    """A twin dual-purpose mount. Returns (turret, guns, trunnion, muzzles) about the base centre."""
    s = p.get('scale', 1.0)
    z0 = 0.4 * s
    hs, ht = p.get('hs', 2.2) * s, p.get('ht', 2.65) * s
    wm = 2.2 * s
    parts = [gunhouse('sec-house', 1.75 * s, wm, 1.85 * s, -2.5 * s, -1.0 * s, 1.3 * s, 2.3 * s, hs, ht, M.PAINT, z0=z0, sl=0.38, ch=0.36 * s, drop=0.14 * s, bev=0.05 * s),
             hard(lathe_o('sec-ring', [(1.95 * s, 0.0), (1.95 * s, z0 + 0.1)], segs=12, mat=M.PAINT), 0.0)]
    top = z0 + ht
    for sx in (-1, 1):
        parts.append(hard(box('sec-sight', 0.5 * s, 0.7 * s, 0.45 * s, at=(sx * (wm - 0.02), -0.2 * s, z0 + hs * 0.8), mat=M.PAINT), 0.0))
        parts.append(hard(box('sec-sight-glass', 0.3 * s, 0.05, 0.2 * s, at=(sx * (wm + 0.02), -0.56 * s, z0 + hs * 0.82), mat=M.GLASS), 0.0))
        parts.append(hard(box('sec-door', 0.08, 0.8 * s, 1.4 * s, at=(sx * (wm - 0.02), 0.75 * s, z0 + 0.95 * s), mat=M.PAINT), 0.0))
    parts.append(hard(box('sec-hatch', 0.8 * s, 0.8 * s, 0.1, at=(0.7 * s, 0.6 * s, top + 0.02), mat=M.PAINT), 0.0))
    parts.append(hard(box('sec-hood', 0.6 * s, 0.6 * s, 0.4 * s, at=(-0.75 * s, -0.4 * s, top + 0.1 * s), mat=M.PAINT), 0.0))
    parts.append(hard(box('sec-hood-glass', 0.4 * s, 0.05, 0.18 * s, at=(-0.75 * s, -0.71 * s, top + 0.16 * s), mat=M.GLASS), 0.0))
    turret = pin_uv(join('turret.sec', parts))
    turret.data.name = 'turret.sec'
    ty, tz = -1.25 * s, z0 + 1.2 * s
    ln = p.get('barrel', 5.2) * s
    r = p.get('calibre', 0.15)
    gp, muzzles = [], []
    for x in (-0.95 * s, 0.95 * s):
        prof = [(r * 1.5, 0.9 * s), (r * 1.5, 1.9 * s), (r * 1.15, 2.05 * s), (r * 0.8, ln - 0.1), (r * 0.95, ln - 0.06), (r * 0.95, ln), (0.0, ln)]
        gp.append(hard(lathe_o('sec-barrel', prof, segs=6, mat=M.PAINT, at=(x, ty, tz), rot=(90, 0, 0)), 0.0, sharp=35))
        gp.append(disc('sec-bore', r * 0.5, 6, M.DARK, at=(x, ty - ln - 0.004, tz), rot=(90, 0, 0)))
        gp.append(soft(lathe_o('sec-bloomer', [(r * 3.0, 0.55 * s), (r * 3.2, 0.95 * s), (r * 2.3, 1.55 * s), (r * 1.45, 1.75 * s)], segs=6, mat=M.CANVAS, at=(x, ty, tz), rot=(90, 0, 0)), 60))
        muzzles.append((x, ty - ln, tz))
    guns = pin_uv(join('guns.sec', gp))
    guns.data.name = 'guns.sec'
    pivot(guns, (0, ty, tz))
    return turret, guns, (0, ty, tz), muzzles


def build_aa(M, pairs=2):
    """A light anti-aircraft mount (twin or quadruple). Returns (mount, guns, trunnion, muzzle)."""
    w = 0.62 * pairs
    parts = [hard(lathe_o('aa-base', [(0.95 + 0.2 * pairs, 0.0), (0.95 + 0.2 * pairs, 0.3), (0.0, 0.3)], segs=8, mat=M.PAINT), 0.0),
             hard(box('aa-carriage', w * 2 + 0.3, 1.1, 0.55, at=(0, 0.25, 0.6), mat=M.PAINT), 0.0),
             hard(box('aa-deck', w * 2 + 1.5, 1.3, 0.06, at=(0, 0.75, 0.42), mat=M.DECK), 0.0)]
    for sx in (-1, 1):
        parts.append(hard(box('aa-cheek', 0.1, 0.9, 0.8, at=(sx * (w + 0.14), 0.15, 1.1), mat=M.PAINT), 0.0))
        parts.append(hard(box('aa-shield', 0.85, 0.05, 1.0, at=(sx * (w + 0.5), -0.55, 1.15), rot=(-14, 0, sx * -10), mat=M.PAINT), 0.0))
        parts.append(hard(box('aa-seat', 0.4, 0.4, 0.45, at=(sx * (w + 0.5), 0.35, 0.68), mat=M.PAINT), 0.0))
    mount = pin_uv(join('aa', parts))
    mount.data.name = 'aa'
    tz = 1.32
    gp = [soft(cyl('aa-trunnion', 0.11, w * 2 + 0.3, at=(0, 0.1, tz), rot=(0, 90, 0), segs=5, mat=M.GUN, caps=False))]
    centres = [0.0] if pairs == 1 else [-(w - 0.5), (w - 0.5)]
    for cx in centres:
        gp.append(hard(box('aa-receiver', 0.56, 1.5, 0.42, at=(cx, 0.35, tz), mat=M.GUN), 0.0))
        gp.append(hard(box('aa-loader', 0.5, 0.5, 0.3, at=(cx, 0.55, tz + 0.34), mat=M.GUN), 0.0))
        for dx in (-0.16, 0.16):
            gp.append(soft(cyl('aa-jacket', 0.085, 1.1, at=(cx + dx, -0.95, tz), rot=(90, 0, 0), segs=4, mat=M.GUN, caps=False)))
            gp.append(soft(cyl('aa-barrel', 0.045, 1.25, at=(cx + dx, -2.1, tz), rot=(90, 0, 0), segs=4, mat=M.GUN, caps=False)))
            gp.append(soft(cyl('aa-flash', 0.1, 0.3, at=(cx + dx, -2.85, tz), rot=(90, 0, 0), segs=4, r2=0.05, mat=M.GUN, caps=False)))
    guns = pin_uv(join('aa.guns', gp))
    guns.data.name = 'aa.guns'
    pivot(guns, (0, 0.1, tz))
    return mount, guns, (0, 0.1, tz), (0, -3.0, tz)


def place_mount(proto_t, proto_g, tname, gname, at, yaw, trunnion):
    """Put one turret of a kind (and its guns) on the ship. Every one is an instance of the prototypes."""
    t = instance(proto_t, tname, at, (0, 0, yaw))
    g = instance(proto_g, gname, tuple(Vector(at) + rz(trunnion, yaw)), (0, 0, yaw))
    parent(g, t)
    return t, g


def muzzle_marker(name, local, at, yaw, par, kind):
    e = marker(name, tuple(Vector(at) + rz(local, yaw)), None, kind=kind)
    e.rotation_euler = (0, 0, R(yaw))
    parent(e, par)
    return e


def drop_protos(*obs):
    for o in obs:
        bpy.data.objects.remove(o)


# ---------------------------------------------------------------- fire control, radar, masts

def proto_director(M, s=1.0, arm=2.6, radar=True):
    """A dual-purpose director: a hooded box on a ring, rangefinder arms, a small radar. Faces -y, base at z = 0."""
    parts = [hard(cyl('dir-ring', 1.25 * s, 0.6 * s, at=(0, 0, 0.3 * s), segs=10, mat=M.PAINT), 0.0),
             hard(prism('dir-hood', [(-1.5 * s, 0.6 * s), (-1.5 * s, 1.7 * s), (-0.9 * s, 2.45 * s), (1.35 * s, 2.45 * s), (1.5 * s, 0.6 * s)], -1.3 * s, 1.3 * s, M.PAINT), 0.07 * s),
             soft(cyl('dir-arm', 0.24 * s, arm * 2 * s, at=(0, 0.25 * s, 1.75 * s), rot=(0, 90, 0), segs=6, mat=M.PAINT)),
             hard(box('dir-slit', 1.5 * s, 0.05, 0.22 * s, at=(0, -1.52 * s, 1.35 * s), mat=M.GLASS), 0.0)]
    for sx in (-1, 1):
        parts.append(hard(box('dir-end', 0.42 * s, 0.6 * s, 0.6 * s, at=(sx * arm * s, 0.25 * s, 1.75 * s), mat=M.PAINT), 0.0))
        parts.append(hard(box('dir-lens', 0.05, 0.3 * s, 0.3 * s, at=(sx * (arm + 0.02) * s, -0.06 * s, 1.75 * s), mat=M.GLASS), 0.0))
    if radar:
        parts.append(soft(cyl('dir-post', 0.1 * s, 0.9 * s, at=(0, 0.3 * s, 2.85 * s), segs=5, mat=M.PAINT, caps=False)))
        parts.append(hard(box('dir-dish', 1.9 * s, 0.1, 1.2 * s, at=(0, 0.05 * s, 3.5 * s), rot=(-8, 0, 0), mat=M.DARK), 0.0))
        parts.append(hard(box('dir-dish-frame', 2.0 * s, 0.14, 0.12 * s, at=(0, 0.1 * s, 3.5 * s), rot=(-8, 0, 0), mat=M.PAINT), 0.0))
        parts.append(hard(box('dir-dish-rib', 0.12 * s, 0.14, 1.3 * s, at=(0, 0.1 * s, 3.5 * s), rot=(-8, 0, 0), mat=M.PAINT), 0.0))
    return join('director', parts)


def proto_main_director(M, s=1.0, arm=5.2):
    """The main-battery director: an armoured hood with long rangefinder arms and a radar mattress. Faces -y."""
    parts = [hard(cyl('md-ring', 2.0 * s, 1.1 * s, at=(0, 0, 0.55 * s), segs=14, mat=M.PAINT), 0.05),
             hard(prism('md-hood', [(-2.2 * s, 1.0 * s), (-2.2 * s, 2.4 * s), (-1.4 * s, 3.3 * s), (2.0 * s, 3.3 * s), (2.3 * s, 1.0 * s)], -1.9 * s, 1.9 * s, M.PAINT), 0.09 * s),
             soft(cyl('md-arm', 0.42 * s, arm * 2 * s, at=(0, 0.4 * s, 2.2 * s), rot=(0, 90, 0), segs=8, mat=M.PAINT)),
             hard(box('md-slit', 2.2 * s, 0.06, 0.3 * s, at=(0, -2.22 * s, 1.9 * s), mat=M.GLASS), 0.0),
             hard(box('md-hatch', 0.9 * s, 0.9 * s, 0.1, at=(0.6 * s, 0.8 * s, 3.33 * s), mat=M.PAINT), 0.0)]
    for sx in (-1, 1):
        parts.append(hard(box('md-end', 0.7 * s, 1.0 * s, 1.0 * s, at=(sx * arm * s, 0.4 * s, 2.2 * s), mat=M.PAINT), 0.08 * s))
        parts.append(hard(box('md-lens', 0.06, 0.45 * s, 0.45 * s, at=(sx * (arm + 0.33) * s, 0.05 * s, 2.2 * s), mat=M.GLASS), 0.0))
        parts.append(hard(box('md-brace', 0.12, 0.12, 1.3 * s, at=(sx * 2.6 * s, 0.4 * s, 1.5 * s), rot=(0, sx * 38, 0), mat=M.PAINT), 0.0))
    # fire-control radar: a frame of bars over a dark screen
    parts.append(hard(box('md-screen', 3.6 * s, 0.08, 1.5 * s, at=(0, -0.4 * s, 4.45 * s), mat=M.DARK), 0.0))
    for z in (3.75, 4.45, 5.15):
        parts.append(hard(box('md-bar', 3.7 * s, 0.14, 0.1 * s, at=(0, -0.38 * s, z * s), mat=M.PAINT), 0.0))
    for x in (-1.8, -0.6, 0.6, 1.8):
        parts.append(hard(box('md-rib', 0.1 * s, 0.14, 1.5 * s, at=(x * s, -0.38 * s, 4.45 * s), mat=M.PAINT), 0.0))
    parts.append(hard(box('md-yoke', 0.5 * s, 0.6 * s, 0.6 * s, at=(0, 0.0, 3.55 * s), mat=M.PAINT), 0.0))
    return join('main-director', parts)


def build_radar(M, w=5.2, h=3.8):
    """A mattress antenna: a frame of bars over a mesh screen, on a pedestal. Turns about the origin."""
    parts = [soft(lathe_o('radar-ped', [(0.5, 0.0), (0.32, 0.25), (0.28, 0.9)], segs=6, mat=M.PAINT)),
             hard(box('radar-head', 0.9, 0.7, 0.5, at=(0, 0.1, 1.0), mat=M.PAINT), 0.04),
             hard(box('radar-screen', w, 0.06, h, at=(0, -0.42, 1.2 + h / 2), mat=M.DARK), 0.0)]
    for i in range(5):
        z = 1.2 + h * i / 4
        parts.append(hard(box('radar-bar', w + 0.1, 0.16, 0.1, at=(0, -0.38, z), mat=M.PAINT), 0.0))
    for i in range(6):
        x = -w / 2 + w * i / 5
        parts.append(hard(box('radar-rib', 0.1, 0.16, h, at=(x, -0.38, 1.2 + h / 2), mat=M.PAINT), 0.0))
    for sx in (-1, 1):
        parts.append(soft(tube('radar-stay', (sx * 0.3, 0.2, 1.1), (sx * w * 0.38, -0.3, 1.2 + h * 0.72), 0.05, 3, mat=M.PAINT)))
    parts.append(hard(box('radar-feed', 0.16, 0.5, 0.16, at=(0, -0.7, 1.2 + h / 2), mat=M.PAINT), 0.0))
    ob = pin_uv(join('radar', parts))
    ob.data.name = 'radar'
    return ob


def proto_catapult(M, length=20.0):
    """An aircraft catapult on its turntable, lying along y, base at z = 0."""
    w, zt = 1.5, 2.3
    parts = [hard(cyl('cat-turntable', 1.9, 0.9, at=(0, 0, 0.45), segs=14, mat=M.PAINT), 0.05),
             hard(box('cat-top', w, length, 0.14, at=(0, 0, zt), mat=M.DECK), 0.0),
             hard(box('cat-bottom', w * 0.8, length * 0.82, 0.12, at=(0, 0, 1.0), mat=M.PAINT), 0.0)]
    for sx in (-1, 1):
        parts.append(hard(box('cat-chord', 0.12, length, 0.16, at=(sx * (w / 2 - 0.06), 0, zt - 0.14), mat=M.PAINT), 0.0))
        parts.append(hard(box('cat-chord-low', 0.1, length * 0.82, 0.12, at=(sx * (w * 0.4 - 0.05), 0, 1.06), mat=M.PAINT), 0.0))
        parts.append(hard(box('cat-rail', 0.1, length - 0.6, 0.1, at=(sx * 0.42, 0, zt + 0.1), mat=M.IRON), 0.0))
    n = 9
    bay = length * 0.82 / n
    for i in range(n + 1):
        y = -length * 0.41 + i * bay
        for sx in (-1, 1):
            parts.append(hard(box('cat-post', 0.08, 0.08, zt - 1.1, at=(sx * (w * 0.45 - 0.02), y, (zt + 1.1) / 2 - 0.03), mat=M.PAINT), 0.0))
            if i < n:
                parts.append(soft(tube('cat-diag', (sx * (w * 0.43), y, 1.1), (sx * (w * 0.47), y + bay, zt - 0.2), 0.045, 3, mat=M.PAINT)))
    # the ends of the top rail stand out beyond the truss
    for sy in (-1, 1):
        parts.append(soft(tube('cat-end', (0, sy * length * 0.41, 1.05), (0, sy * length * 0.5, zt - 0.2), 0.07, 4, mat=M.PAINT)))
    parts.append(hard(box('cat-car', 1.1, 2.2, 0.3, at=(0, 0, zt + 0.28), mat=M.PAINT), 0.04))
    return join('catapult', parts)


def proto_floatplane(M, span=11.0):
    """A small scout floatplane on a centre float, nose to -y, float keel at z = 0."""
    fz = 2.35
    rings = []
    for y, r, dz in ((-3.6, 0.5, 0.0), (-3.3, 0.62, 0.0), (-1.2, 0.66, 0.02), (0.6, 0.6, 0.06), (2.6, 0.38, 0.16), (4.6, 0.12, 0.3)):
        rings.append(superellipse(r * 0.9, r * 1.08, 2.6, 8, at=(0, y, fz + dz), plane='xz'))
    parts = [soft(loft('fp-fuselage', rings, mat=M.PAINT), 50),
             hard(box('fp-wing', span, 1.9, 0.18, at=(0, -1.0, fz - 0.25), mat=M.PAINT), 0.05),
             hard(box('fp-tail', 3.8, 1.1, 0.09, at=(0, 4.1, fz + 0.38), mat=M.PAINT), 0.03),
             hard(prism('fp-fin', [(3.2, fz + 0.3), (4.7, fz + 0.3), (4.8, fz + 1.75), (4.2, fz + 1.75)], -0.05, 0.05, M.PAINT), 0.0),
             hard(box('fp-canopy', 0.74, 2.6, 0.5, at=(0, -0.4, fz + 0.72), mat=M.GLASS), 0.12),
             soft(cyl('fp-cowl', 0.66, 0.5, at=(0, -3.6, fz), rot=(90, 0, 0), segs=8, mat=M.DARK)),
             hard(box('fp-prop', 2.9, 0.06, 0.22, at=(0, -3.95, fz), rot=(0, 25, 0), mat=M.GUN), 0.0),
             soft(cyl('fp-spinner', 0.2, 0.4, at=(0, -4.0, fz), rot=(90, 0, 0), segs=6, r2=0.02, mat=M.PAINT))]
    fl = []
    for y, bw_, top, keel in ((-4.6, 0.1, 1.0, 0.7), (-3.4, 0.5, 1.15, 0.25), (-0.8, 0.58, 1.15, 0.0), (0.6, 0.5, 1.1, 0.25), (3.4, 0.14, 0.95, 0.6)):
        fl.append([(-bw_, y, top), (-bw_, y, (top + keel) / 2 + 0.1), (0.0, y, keel), (bw_, y, (top + keel) / 2 + 0.1), (bw_, y, top)])
    parts.append(hard(loft('fp-float', fl, mat=M.PAINT), 0.0, sharp=35))
    for y in (-2.2, 0.2):
        for sx in (-1, 1):
            parts.append(soft(tube('fp-strut', (sx * 0.4, y, 1.1), (sx * 0.5, y + 0.2, fz - 0.4), 0.05, 4, mat=M.PAINT)))
    for sx in (-1, 1):
        parts.append(hard(box('fp-tipfloat', 0.34, 1.9, 0.4, at=(sx * span * 0.4, -0.9, fz - 1.25), mat=M.PAINT), 0.1))
        parts.append(soft(tube('fp-tipstrut', (sx * span * 0.4, -0.9, fz - 1.05), (sx * span * 0.4, -1.0, fz - 0.3), 0.05, 4, mat=M.PAINT)))
    return join('floatplane', parts)


def crane(K, name, base, height, jib, yaw=0.0, lift=35.0, r=0.42):
    """A boat or aircraft crane: a post with a lattice jib. yaw 0 points the jib to -y."""
    M = K.M
    b = Vector(base)
    K.add(cyl(name + '-post', r, height, at=(b.x, b.y, b.z + height / 2), segs=8, r2=r * 0.7, mat=M.PAINT), 0.0)
    K.add(cyl(name + '-foot', r * 1.9, 0.5, at=(b.x, b.y, b.z + 0.25), segs=8, mat=M.PAINT), 0.04)
    head = b + Vector((0, 0, height))
    heel = b + Vector((0, 0, height * 0.42))
    d = rz((0, -math.cos(R(lift)), math.sin(R(lift))), yaw)
    tip = heel + d * jib
    side = rz((1, 0, 0), yaw)
    for sx in (-1, 1):
        K.add(tube(name + '-jib', heel + side * sx * 0.45, tip + side * sx * 0.1, 0.09, 4, mat=M.PAINT), 0.0)
    up = d.cross(side).normalized()
    if up.z < 0:
        up = -up
    K.add(tube(name + '-jib-top', heel + up * 0.9 + d * 0.8, tip, 0.08, 4, mat=M.PAINT), 0.0)
    n = 5
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        a = heel.lerp(tip, t0) + side * (0.45 - 0.35 * t0) * (1 if i % 2 else -1)
        c = heel.lerp(tip, t1) + side * (0.45 - 0.35 * t1) * (-1 if i % 2 else 1)
        K.add(tube(name + '-lace', a, c, 0.045, 3, mat=M.PAINT), 0.0)
        top0 = (heel + up * 0.9 + d * 0.8).lerp(tip, t1 * 0.92)
        K.add(tube(name + '-lace-up', heel.lerp(tip, t1) + side * (0.45 - 0.35 * t1) * (1 if i % 2 else -1), top0, 0.04, 3, mat=M.PAINT), 0.0)
    K.add(tube(name + '-stay', head, tip, 0.04, 3, mat=M.IRON), 0.0)
    K.add(tube(name + '-fall', tip, tip + Vector((0, 0, -jib * 0.35)), 0.035, 3, mat=M.IRON), 0.0)
    K.add(box(name + '-block', 0.3, 0.3, 0.5, at=tuple(tip + Vector((0, 0, -jib * 0.35 - 0.2))), mat=M.IRON), 0.0)
    K.add(cyl(name + '-cap', r * 0.9, 0.3, at=tuple(head + Vector((0, 0, 0.1))), segs=8, mat=M.PAINT), 0.0)
    return tip


# ---------------------------------------------------------------- ground tackle, screws, rudders

def anchor_gear(K, H, y_hawse, zrel, y_cap, x_cap, y_pipe, k=0.8):
    """Bower anchors in hawse pipes, chain along the deck over wildcats to the chain pipes."""
    M = K.M
    out = []
    z = H.D(H.u_of(y_hawse)) + zrel
    p, n, _ = H.side(y_hawse, z)
    ez = Vector((0, 0, 1)) - n * n.z
    ez.normalize()
    ex = n.cross(ez)
    # the anchor: built with the shank up z, crown at the bottom, flukes lying back against the plating (+y is outboard)
    a = [hard(box('anchor-shank', 0.3, 0.26, 2.7, at=(0, 0.3, 0.2), mat=M.IRON), 0.04),
         hard(box('anchor-crown', 2.3, 0.55, 0.5, at=(0, 0.3, -1.3), mat=M.IRON), 0.08)]
    for sx in (-1, 1):
        a.append(hard(prism('anchor-fluke', [(0.08, -1.3), (0.42, -1.3), (0.3, 0.45), (0.1, 0.5)], sx * 0.95 - 0.28, sx * 0.95 + 0.28, M.IRON), 0.04))
    a.append(soft(lathe_o('hawse-lip', [(1.0, 0.0), (0.95, 0.16), (0.55, 0.26), (0.5, 0.05)], segs=10, mat=M.PAINT, at=(0, 0, 1.55), rot=(-90, 0, 0)), 50))
    a.append(disc('hawse-hole', 0.52, 10, M.DARK, at=(0, 0.08, 1.55), rot=(-90, 0, 0)))
    anchor = join('anchor', a)
    anchor.data.transform(Matrix.Diagonal((k, 1.0, k, 1.0)))
    basis_xform(anchor, p - ez * 1.2 * k, ex, n, ez)
    out.append(both(anchor))
    # deck: hawse holes, chain, wildcats, chain pipes, a steel plate under it all
    xh = max(H.half(y_hawse + 5.0) - 2.2, 1.0)
    yh = y_hawse + 5.5
    path = [Vector((xh, yh, 0)), Vector((x_cap, y_cap - 0.9, 0)), Vector((x_cap - 0.4, y_pipe, 0))]
    places = []
    k = 0
    for q0, q1 in zip(path, path[1:]):
        d = q1 - q0
        m = max(1, round(d.length / 0.62))
        yaw = D2(math.atan2(-d.x, d.y))
        for i in range(m):
            q = q0 + d * ((i + 0.5) / m)
            for s in (1, -1):
                places.append(((s * q.x, q.y, H.deck(q.y, q.x) + 0.13), (0, 90 if k % 2 else 0, s * yaw)))
            k += 1
    out += copies(hard(box('chain-link', 0.4, 0.74, 0.13, mat=M.IRON), 0.0), places)
    for s in (1, -1):
        zc = H.deck(y_cap, x_cap)
        out.append(soft(lathe_o('wildcat', [(0.95, 0.0), (0.9, 0.16), (0.55, 0.3), (0.5, 0.62), (0.8, 0.8), (0.8, 0.92), (0.3, 1.0), (0.0, 1.0)], segs=10, mat=M.PAINT, at=(s * x_cap, y_cap, zc - 0.02)), 50))
        out.append(soft(lathe_o('deck-hawse', [(0.8, 0.0), (0.7, 0.2), (0.4, 0.1)], segs=8, mat=M.PAINT, at=(s * xh, yh - 0.3, H.deck(yh, xh) - 0.02)), 50))
        out.append(soft(lathe_o('chain-pipe', [(0.6, 0.0), (0.5, 0.3), (0.3, 0.2)], segs=8, mat=M.PAINT, at=(s * (x_cap - 0.4), y_pipe + 0.3, H.deck(y_pipe, x_cap) - 0.02)), 50))
    K.extend(out)


def screws(K, shafts, rudders, r_prop=2.4):
    """shafts: (x, y, z) of each propeller on the port side, mirrored. rudders: (x, y_fore, y_aft, z_top, z_bottom)."""
    M = K.M
    blade = hard(box('blade', r_prop * 0.5, 0.1, r_prop * 0.9, at=(0, 0, r_prop * 0.52), rot=(0, 0, 32), mat=M.IRON), 0.0)
    pr = [soft(lathe_o('prop-hub', [(0.0, -0.9), (0.45, -0.3), (0.45, 0.5), (0.3, 0.6)], segs=6, mat=M.IRON, rot=(90, 0, 0)))]
    for i in range(4):
        me = blade.data.copy()
        o = link(bpy.data.objects.new('blade', me))
        xform(o, rot=(0, i * 90, 0))
        pr.append(o)
    bpy.data.objects.remove(blade)
    prop = join('prop', pr)
    places = []
    for x, y, z in shafts:
        for s in (1, -1):
            places.append(((s * x, y, z), (0, 0, 0)))
            K.add(tube('shaft', (s * x * 0.9, y - 22, z + 2.6), (s * x, y, z), 0.3, 6, mat=M.RED), 0.0)
            K.add(box('shaft-strut', 0.22, 0.9, 3.0, at=(s * x * 0.97, y - 2.0, z + 1.6), rot=(0, s * -14, 0), mat=M.RED), 0.0)
    K.extend(copies(prop, places))
    for x, y0, y1, zt, zb in rudders:
        ob = prism('rudder', [(y0, zt), (y1, zt), (y1 - (y1 - y0) * 0.12, zb), (y0 + (y1 - y0) * 0.1, zb)], x - 0.28, x + 0.28, M.RED)
        K.add(ob, 0.1)


# ---------------------------------------------------------------- close looks while building

def focus_previews(name, regions, size=(1100, 700)):
    """With AXM_FOCUS=1 (or a comma list of labels), render extra close views after finish(): each region is
    (label, (x0, y0, z0), (x1, y1, z1), ((azimuth, elevation, distance factor), ...)). The kit's preview
    always frames the whole unit; a ship is too long for that to show the fittings."""
    want = os.environ.get('AXM_FOCUS')
    if not want:
        return
    import kit
    keep = kit._bounds
    for label, lo, hi, views, *rest in regions:
        if want != '1' and label not in want.split(','):
            continue
        kit._bounds = lambda lo=lo, hi=hi: (Vector(lo), Vector(hi))
        for p in kit.preview(name, views, size=size, samples=32, suffix='-' + label, ground=not rest):
            print('  focus', p)
    kit._bounds = keep


def ship_views(views):
    """AXM_VIEWS=0 skips the kit's own previews (for a quick count or a focus-only look)."""
    return () if os.environ.get('AXM_VIEWS') == '0' else views


def count_all():
    """With AXM_TALLY=1, print the triangles of every mesh and how often it is drawn."""
    if os.environ.get('AXM_TALLY') != '1':
        return
    seen = {}
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            n = sum(len(p.vertices) - 2 for p in o.data.polygons)
            c, _ = seen.get(o.data.name, (0, 0))
            seen[o.data.name] = (c + 1, n)
    for k, (c, n) in seen.items():
        print(f'    mesh {k}: {n} x{c} = {n * c}')
