# Medium tank. Sloped hull, cast turret, long 75 mm gun, six road wheels a side on link tracks.
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

reset()

PAINT = paint('paint', low=(0.1, 1.15), dirt=1.0, wear=1.0)
STEEL = plain('track', (0.07, 0.066, 0.062), rough=0.5, metal=0.8, rust=0.5, dirt=0.7, low=(0.0, 0.9), polish=0.8)
RUBBER = plain('rubber', (0.035, 0.035, 0.035), rough=0.86, dirt=0.9, bump=0.15)
GUNMETAL = plain('gunmetal', (0.085, 0.085, 0.09), rough=0.42, metal=0.9, dirt=0.3, vary=0.08)
EXHAUST = plain('exhaust', (0.17, 0.10, 0.07), rough=0.85, metal=0.3, rust=1.0, dirt=0.4)
CANVAS = plain('canvas', (0.31, 0.29, 0.21), rough=0.95, vary=0.2, dirt=0.7, bump=0.5, fine_scale=140.0)
TOOLWOOD = plain('toolwood', (0.34, 0.23, 0.12), rough=0.7, dirt=0.6)
GLASS = glass()

TX = 1.20          # track centre line, x
TW = 0.46          # track width
WHEEL_R = 0.32
WHEEL_Z = 0.36
WHEELS_Y = [-1.72, -1.03, -0.34, 0.35, 1.04, 1.73]
SPROCKET = (-2.44, 0.66, 0.30)   # y, z, radius
IDLER = (2.46, 0.63, 0.28)

static = []      # everything that never moves relative to the hull


def add(ob, width=0.008):
    static.append(hard(ob, width))
    return ob


# ---------------------------------------------------------------- hull

tub = prism('tub', [(-2.9, 1.04), (-2.3, 0.42), (2.42, 0.42), (2.9, 0.95), (2.9, 1.04)], -0.93, 0.93, PAINT)
add(tub, 0.02)

v = [(-1.44, -2.95, 1.04), (1.44, -2.95, 1.04), (1.44, 2.95, 1.04), (-1.44, 2.95, 1.04),
     (-1.13, -1.86, 1.62), (1.13, -1.86, 1.62), (1.13, 0.95, 1.62), (-1.13, 0.95, 1.62),
     (1.24, 2.95, 1.40), (-1.24, 2.95, 1.40)]
f = [(0, 3, 2, 1), (0, 1, 5, 4), (4, 5, 6, 7), (7, 6, 8, 9), (3, 9, 8, 2),
     (0, 4, 7, 3), (7, 9, 3), (1, 2, 6, 5), (6, 2, 8)]
upper = fix_normals(mesh_obj('upper', v, f, PAINT))
add(upper, 0.022)

# fenders run the length of the tracks, with curved guards at the front
for s in (-1, 1):
    add(box('fender', 0.50, 5.5, 0.025, at=(s * 1.21, 0.1, 1.035), mat=PAINT), 0.004)
    add(box('guard', 0.50, 0.42, 0.025, at=(s * 1.21, -2.82, 0.93), rot=(-38, 0, 0), mat=PAINT), 0.004)
    add(box('flap', 0.50, 0.30, 0.02, at=(s * 1.21, 2.98, 0.90), rot=(62, 0, 0), mat=PAINT), 0.004)
    for y in (-1.6, -0.2, 1.2, 2.4):
        add(box('stay', 0.03, 0.03, 0.16, at=(s * 1.41, y, 1.10), mat=PAINT), 0.0)

# glacis fittings
add(box('visor', 0.44, 0.07, 0.20, at=(-0.48, -2.33, 1.42), rot=(29, 0, 0), mat=PAINT), 0.012)
add(box('visor-slit', 0.26, 0.02, 0.035, at=(-0.48, -2.385, 1.44), rot=(29, 0, 0), mat=GLASS), 0.0)
add(sphere('mg-ball', 0.14, at=(0.52, -2.36, 1.36), scale=(1, 0.7, 1), segs=14, rings=8, mat=PAINT), 0.0)
add(cyl('mg-barrel', 0.022, 0.42, at=(0.52, -2.60, 1.37), rot=(86, 0, 0), segs=8, mat=GUNMETAL), 0.0)
# spare links bolted across the nose
static += copies(hard(box('spare', 0.36, 0.13, 0.035, mat=STEEL), 0.005), [((-0.84 + i * 0.42, -2.62, 1.235), (29, 0, 0)) for i in range(5)])
for s in (-1, 1):
    add(cyl('lamp', 0.075, 0.10, at=(s * 0.98, -2.56, 1.33), rot=(90, 0, 0), segs=12, mat=PAINT), 0.006)
    add(cyl('lamp-glass', 0.062, 0.012, at=(s * 0.98, -2.615, 1.33), rot=(90, 0, 0), segs=12, mat=GLASS), 0.0)
    add(box('lamp-post', 0.03, 0.03, 0.14, at=(s * 0.98, -2.52, 1.25), mat=PAINT), 0.0)
    add(box('tow-eye', 0.07, 0.22, 0.14, at=(s * 0.62, -2.78, 0.78), rot=(40, 0, 0), mat=PAINT), 0.012)
    add(box('tow-eye-r', 0.07, 0.2, 0.14, at=(s * 0.62, 2.92, 0.72), mat=PAINT), 0.012)

# hull roof: driver hatches
for x in (-0.48, 0.52):
    add(cyl('hatch', 0.27, 0.035, at=(x, -1.38, 1.635), segs=18, mat=PAINT), 0.008)
    add(box('hatch-handle', 0.14, 0.02, 0.03, at=(x, -1.30, 1.665), mat=PAINT), 0.0)
    add(box('periscope', 0.16, 0.07, 0.06, at=(x, -1.66, 1.65), mat=PAINT), 0.008)

# engine deck: louvred grilles, filler caps, access doors
for s in (-1, 1):
    add(box('grille-frame', 0.62, 1.05, 0.04, at=(s * 0.66, 1.92, 1.50), rot=(-7.3, 0, 0), mat=PAINT), 0.006)
    static += copies(hard(box('slat', 0.54, 0.035, 0.03, mat=PAINT), 0.0), [((s * 0.66, 1.50 + i * 0.105, 1.575 - i * 0.0134), (-32, 0, 0)) for i in range(9)])
add(box('engine-door', 0.56, 0.95, 0.03, at=(0, 1.9, 1.52), rot=(-7.3, 0, 0), mat=PAINT), 0.006)
for x in (-0.18, 0.18):
    add(cyl('filler', 0.05, 0.05, at=(x, 1.25, 1.61), segs=10, mat=PAINT), 0.006)
add(box('door-hinge', 0.5, 0.03, 0.03, at=(0, 1.44, 1.60), mat=PAINT), 0.0)

# rear plate: exhausts, access plate, tow cable
for s in (-1, 1):
    add(cyl('muffler', 0.10, 0.62, at=(s * 0.55, 2.98, 1.02), rot=(0, 90, 0), segs=12, mat=EXHAUST), 0.012)
    add(cyl('tailpipe', 0.04, 0.26, at=(s * 0.92, 3.04, 0.98), rot=(70, 0, 0), segs=8, mat=EXHAUST), 0.0)
    add(box('muffler-strap', 0.035, 0.22, 0.22, at=(s * 0.42, 2.98, 1.02), mat=PAINT), 0.004)
add(cyl('rear-plate', 0.24, 0.03, at=(0, 2.83, 0.74), rot=(-60, 0, 0), segs=16, mat=PAINT), 0.006)
for i in range(8):
    a = i * math.pi / 4
    add(cyl('bolt', 0.016, 0.02, at=(0.2 * math.cos(a), 2.84 + 0.1 * math.sin(a) * 0.87, 0.75 + 0.2 * math.sin(a) * 0.5), rot=(-60, 0, 0), segs=6, mat=PAINT), 0.0)

# stowage: tools on the left fender, boxes and a rolled tarpaulin on the right and rear
add(cyl('shovel-shaft', 0.016, 1.05, at=(-1.26, -0.5, 1.085), rot=(90, 0, 0), segs=6, mat=TOOLWOOD), 0.0)
add(box('shovel-blade', 0.17, 0.24, 0.02, at=(-1.26, -1.12, 1.075), mat=STEEL), 0.004)
add(cyl('crowbar', 0.013, 1.3, at=(-1.36, 0.9, 1.07), rot=(90, 0, 0), segs=6, mat=STEEL), 0.0)
add(box('axe-head', 0.05, 0.16, 0.10, at=(-1.2, 0.72, 1.10), mat=STEEL), 0.006)
add(cyl('axe-shaft', 0.015, 0.7, at=(-1.2, 1.05, 1.085), rot=(90, 0, 0), segs=6, mat=TOOLWOOD), 0.0)
add(box('toolbox', 0.36, 0.72, 0.20, at=(1.22, -0.8, 1.15), mat=PAINT), 0.012)
add(box('toolbox-lid', 0.38, 0.74, 0.02, at=(1.22, -0.8, 1.255), mat=PAINT), 0.004)
for y in (-1.05, -0.55):
    add(box('latch', 0.02, 0.05, 0.06, at=(1.41, y, 1.22), mat=STEEL), 0.0)
for i in range(2):
    add(box('jerrycan', 0.14, 0.34, 0.44, at=(1.3, 0.55 + i * 0.4, 1.27), mat=PAINT), 0.02)
    add(cyl('jerrycan-cap', 0.03, 0.04, at=(1.3, 0.45 + i * 0.4, 1.50), segs=8, mat=PAINT), 0.0)
add(cyl('tarp', 0.14, 1.5, at=(0, 2.55, 1.56), rot=(0, 90, 0), segs=12, mat=CANVAS), 0.02)
for x in (-0.5, 0.5):
    add(box('tarp-strap', 0.04, 0.30, 0.30, at=(x, 2.55, 1.56), mat=TOOLWOOD), 0.004)
add(box('crate', 0.5, 0.36, 0.26, at=(-0.62, 2.42, 1.58), rot=(-7.3, 0, 0), mat=TOOLWOOD), 0.01)

# tow cable looped along the right side of the engine deck
cable = []
for i in range(40):
    t = i / 40 * 2 * math.pi
    cable.append((0.95 + 0.14 * math.cos(t), 1.75 + 0.7 * math.sin(t)))
places = []
for (x0, y0), (x1, y1) in zip(cable, cable[1:] + cable[:1]):
    mid = ((x0 + x1) / 2, (y0 + y1) / 2)
    places.append(((mid[0], mid[1], 1.555 - (mid[1] - 0.95) * 0.128), (0, 90, math.degrees(math.atan2(y1 - y0, x1 - x0)))))
static += copies(cyl('cable', 0.014, 0.125, segs=5, mat=STEEL, caps=False), places)

# suspension: bogie arms and return rollers
for s in (-1, 1):
    for y in WHEELS_Y:
        add(box('arm', 0.10, 0.34, 0.09, at=(s * 0.99, y + 0.14, WHEEL_Z + 0.07), rot=(24, 0, 0), mat=PAINT), 0.01)
        add(cyl('axle', 0.05, 0.3, at=(s * 1.05, y, WHEEL_Z), rot=(0, 90, 0), segs=8, mat=PAINT), 0.0)
    for y in (-1.38, 0.0, 1.38):
        add(cyl('roller', 0.10, 0.30, at=(s * TX, y, 0.835), rot=(0, 90, 0), segs=12, mat=PAINT), 0.008)
        add(box('roller-arm', 0.24, 0.08, 0.08, at=(s * 1.02, y, 0.835), mat=PAINT), 0.008)
    add(cyl('final-drive', 0.20, 0.16, at=(s * 0.98, SPROCKET[0], SPROCKET[1]), rot=(0, 90, 0), segs=14, mat=PAINT), 0.012)
    add(cyl('idler-mount', 0.12, 0.16, at=(s * 0.98, IDLER[0], IDLER[1]), rot=(0, 90, 0), segs=12, mat=PAINT), 0.012)

hull = join('hull', static)
tag(hull, 'none')

# ---------------------------------------------------------------- running gear

def wheel_disc(r_rim, x):
    d = lathe('disc', [(0.0, 0.050), (0.075, 0.050), (0.095, 0.028), (r_rim - 0.04, 0.02), (r_rim, 0.045), (r_rim, -0.045), (0.0, -0.045)], segs=16, rot=(0, 90, 0), mat=PAINT)
    return xform(hard(d, 0.0), at=(x, 0, 0))


def road_wheel():
    parts = []
    for x in (-0.085, 0.085):
        parts.append(wheel_disc(0.255, x))
        tyre = lathe('tyre', [(0.25, -0.052), (0.312, -0.048), (0.32, 0.0), (0.312, 0.048), (0.25, 0.052)], segs=16, rot=(0, 90, 0), mat=RUBBER)
        parts.append(xform(hard(tyre, 0.0), at=(x, 0, 0)))
        for i in range(6):
            a = i * math.pi / 3
            parts.append(hard(cyl('nut', 0.014, 0.02, at=(x + math.copysign(0.052, x), 0.055 * math.cos(a), 0.055 * math.sin(a)), rot=(0, 90, 0), segs=6, mat=PAINT), 0.0))
    return join('wheel', parts)


def sprocket():
    parts = [hard(cyl('hub', 0.11, 0.30, rot=(0, 90, 0), segs=14, mat=PAINT), 0.01)]
    for x in (-0.1, 0.1):
        parts.append(hard(cyl('ring', SPROCKET[2] - 0.05, 0.03, at=(x, 0, 0), rot=(0, 90, 0), segs=20, mat=STEEL), 0.004))
        for i in range(14):
            a = i * 2 * math.pi / 14
            parts.append(hard(box('tooth', 0.028, 0.055, 0.075, at=(x, (SPROCKET[2] - 0.035) * math.cos(a), (SPROCKET[2] - 0.035) * math.sin(a)), rot=(math.degrees(a) + 90, 0, 0), mat=STEEL), 0.006))
        parts.append(hard(lathe('dish', [(0.0, 0.06), (0.10, 0.05), (0.2, 0.015), (0.2, 0.0), (0.0, 0.0)], segs=14, rot=(0, math.copysign(90, x), 0), at=(x, 0, 0), mat=PAINT), 0.0))
    return join('sprocket', parts)


def idler():
    parts = [hard(cyl('hub', 0.08, 0.3, rot=(0, 90, 0), segs=12, mat=PAINT), 0.008)]
    for x in (-0.09, 0.09):
        rim = lathe('rim', [(IDLER[2] - 0.05, -0.04), (IDLER[2], -0.035), (IDLER[2], 0.035), (IDLER[2] - 0.05, 0.04)], segs=18, rot=(0, 90, 0), at=(x, 0, 0), mat=STEEL)
        parts.append(hard(rim, 0.0))
        for i in range(6):
            a = i * math.pi / 3
            rr = (IDLER[2] - 0.05) / 2 + 0.03
            parts.append(hard(box('spoke', 0.03, 0.06, IDLER[2] - 0.1, at=(x, -rr * math.sin(a), rr * math.cos(a)), rot=(math.degrees(a), 0, 0), mat=PAINT), 0.006))
    return join('idler', parts)


wheel = road_wheel()
wheel.location = (TX, WHEELS_Y[0], WHEEL_Z)
tag(wheel, 'spin', radius=WHEEL_R)
for s in (-1, 1):
    for i, y in enumerate(WHEELS_Y):
        if s == 1 and i == 0:
            continue
        instance(wheel, f'wheel.{"L" if s < 0 else "R"}{i}', at=(s * TX, y, WHEEL_Z))
sp = sprocket()
sp.location = (TX, SPROCKET[0], SPROCKET[1])
tag(sp, 'spin', radius=SPROCKET[2])
instance(sp, 'sprocket.L', at=(-TX, SPROCKET[0], SPROCKET[1]))
idl = idler()
idl.location = (TX, IDLER[0], IDLER[1])
tag(idl, 'spin', radius=IDLER[2])
instance(idl, 'idler.L', at=(-TX, IDLER[0], IDLER[1]))


# ---------------------------------------------------------------- tracks
# One mesh per side. Every vertex also carries where it will be one link further round the loop
# ("_next"), so the stage can run the track by blending between the two and repeating.

def hull2d(points):
    pts = sorted(set(points))
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper_ = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper_) >= 2 and cross(upper_[-2], upper_[-1], p) <= 0:
            upper_.pop()
        upper_.append(p)
    return lower[:-1] + upper_[:-1]   # counter-clockwise in (y, z)


def track_path(pitch_goal=0.15, half=0.02):
    circles = [(SPROCKET[0], SPROCKET[1], SPROCKET[2]), (IDLER[0], IDLER[1], IDLER[2])] + [(y, WHEEL_Z, WHEEL_R) for y in WHEELS_Y]
    pts = []
    for cy, cz, r in circles:
        for i in range(48):
            a = i * 2 * math.pi / 48
            pts.append((round(cy + (r + half) * math.cos(a), 5), round(cz + (r + half) * math.sin(a), 5)))
    loop = hull2d(pts)
    seg = [math.dist(loop[i], loop[(i + 1) % len(loop)]) for i in range(len(loop))]
    total = sum(seg)
    n = round(total / pitch_goal)
    pitch = total / n
    frames = []
    i, acc = 0, 0.0
    for k in range(n):
        d = k * pitch
        while acc + seg[i] < d:
            acc += seg[i]
            i += 1
        t = (d - acc) / seg[i]
        a, b = loop[i], loop[(i + 1) % len(loop)]
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        frames.append(p)
    out = []
    for k in range(n):
        a, b = frames[k - 1], frames[(k + 1) % n]
        ty, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(ty, tz)
        ty, tz = ty / ln, tz / ln
        # columns: along the run, across the track (x), outward
        m = Matrix(((0, 1, 0, 0), (ty, 0, tz, frames[k][0]), (tz, 0, -ty, frames[k][1]), (0, 0, 0, 1)))
        out.append(m)
    return out, pitch


def link_shape(pitch):
    """One track link in its own frame: x along the run, y across, z outward. Unwrapped once; every
    link shares that piece of the atlas."""
    parts = [box('plate', pitch * 0.9, TW, 0.036), box('grouser', pitch * 0.32, TW * 0.94, 0.03, at=(0, 0, 0.03)),
             box('horn', pitch * 0.34, 0.05, 0.075, at=(0, 0, -0.054))]
    one = join('link', parts)
    unwrap_now(one)
    me = one.data
    verts = [v.co.copy() for v in me.vertices]
    faces = [list(p.vertices) for p in me.polygons]
    uvs = [d.uv.copy() for d in me.uv_layers.active.data]
    bpy.data.objects.remove(one)
    bpy.data.meshes.remove(me)
    return verts, faces, uvs


def build_track(name, x):
    frames, pitch = track_path()
    lv, lf, luv = link_shape(pitch)
    verts, faces, nxt = [], [], []
    side = Matrix.Translation((x, 0, 0))
    for k, m in enumerate(frames):
        m2 = frames[(k + 1) % len(frames)]
        base = len(verts)
        for p in lv:
            verts.append(side @ m @ p)
            nxt.append(side @ m2 @ p)
        faces += [[base + i for i in f] for f in lf]
    ob = mesh_obj(name, verts, faces, STEEL)
    me = ob.data
    uv = me.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', [c for _ in frames for p in luv for c in p])
    keep = me.attributes.new('keep_uv', 'INT', 'FACE')
    keep.data.foreach_set('value', [1] * len(me.polygons))
    attr = me.attributes.new('_next', 'FLOAT_VECTOR', 'POINT')
    # stored in the exported axes (y up), since the exporter converts positions but not custom data
    attr.data.foreach_set('vector', [c for p in nxt for c in (p.x, p.z, -p.y)])
    shade(ob, 30)
    tag(ob, 'track', pitch=pitch)
    ob['texel'] = 2.0
    return ob


build_track('track.L', -TX)
build_track('track.R', TX)

# ---------------------------------------------------------------- turret

TURRET_PIVOT = (0, -0.18, 1.62)
tparts = []
rings = [
    superellipse(0.99, 1.20, 3.2, 28, at=(0, -0.20, 1.60)),
    superellipse(1.05, 1.30, 3.0, 28, at=(0, -0.16, 1.80)),
    superellipse(0.99, 1.26, 3.0, 28, at=(0, -0.10, 2.10)),
    superellipse(0.86, 1.12, 2.8, 28, at=(0, -0.05, 2.31)),
    superellipse(0.66, 0.92, 2.6, 28, at=(0, -0.03, 2.38)),
]
shell = loft('turret-shell', rings, cap_start=True, cap_end=True, mat=PAINT)
tparts.append(soft(shell, 62))
tparts.append(hard(cyl('turret-ring', 0.98, 0.07, at=(0, -0.18, 1.615), segs=28, mat=PAINT), 0.008))
# bustle bin and its lid
tparts.append(hard(box('bin', 1.25, 0.42, 0.36, at=(0, 1.26, 1.98), mat=PAINT), 0.014))
tparts.append(hard(box('bin-lid', 1.28, 0.45, 0.02, at=(0, 1.26, 2.17), mat=PAINT), 0.004))
for x in (-0.4, 0.4):
    tparts.append(hard(box('bin-latch', 0.05, 0.02, 0.07, at=(x, 1.48, 2.12), mat=STEEL), 0.0))
# commander's cupola with vision blocks, and the loader's hatch
tparts.append(hard(cyl('cupola', 0.30, 0.20, at=(0.40, 0.22, 2.46), segs=18, mat=PAINT), 0.014))
tparts.append(hard(cyl('cupola-lid', 0.25, 0.035, at=(0.40, 0.22, 2.575), segs=18, mat=PAINT), 0.008))
for i in range(6):
    a = i * math.pi / 3 + 0.3
    tparts.append(hard(box('vision', 0.11, 0.035, 0.05, at=(0.40 + 0.3 * math.cos(a), 0.22 + 0.3 * math.sin(a), 2.50), rot=(0, 0, math.degrees(a) + 90), mat=GLASS), 0.0))
tparts.append(hard(cyl('loader-hatch', 0.25, 0.03, at=(-0.40, 0.24, 2.385), segs=16, mat=PAINT), 0.008))
tparts.append(hard(box('loader-handle', 0.14, 0.02, 0.03, at=(-0.40, 0.3, 2.41), mat=PAINT), 0.0))
tparts.append(hard(sphere('vent', 0.13, at=(0, -0.55, 2.37), scale=(1, 1, 0.5), segs=12, rings=6, mat=PAINT), 0.0))
tparts.append(hard(box('sight', 0.10, 0.10, 0.10, at=(-0.36, -0.62, 2.40), mat=PAINT), 0.01))
# lifting eyes, spare links on the cheeks, aerial
for x, y in ((-0.8, -0.62), (0.8, -0.62), (-0.72, 0.75), (0.72, 0.75)):
    tparts.append(hard(box('lift-eye', 0.035, 0.11, 0.07, at=(x, y, 2.30), rot=(0, math.copysign(24, -x), 0), mat=PAINT), 0.008))
for s in (-1, 1):
    for i in range(3):
        tparts.append(hard(box('cheek-link', 0.035, 0.15, 0.40, at=(s * 1.045, 0.25 + i * 0.17, 1.98), rot=(0, s * -6, 0), mat=STEEL), 0.005))
    tparts.append(hard(box('grab', 0.02, 0.5, 0.02, at=(s * 1.01, -0.55, 2.12), mat=PAINT), 0.0))
tparts.append(hard(cyl('aerial-base', 0.035, 0.10, at=(-0.62, 0.98, 2.33), segs=8, mat=PAINT), 0.006))
tparts.append(cyl('aerial', 0.007, 1.9, at=(-0.62, 0.98, 3.3), segs=5, mat=GUNMETAL))
# a machine gun on the cupola ring
tparts.append(hard(box('aamg-body', 0.07, 0.42, 0.10, at=(0.40, -0.20, 2.72), mat=GUNMETAL), 0.01))
tparts.append(cyl('aamg-barrel', 0.016, 0.55, at=(0.40, -0.66, 2.74), rot=(90, 0, 0), segs=6, mat=GUNMETAL))
tparts.append(hard(box('aamg-post', 0.04, 0.04, 0.18, at=(0.40, -0.06, 2.63), mat=PAINT), 0.006))
tparts.append(hard(box('aamg-box', 0.12, 0.16, 0.14, at=(0.29, -0.16, 2.70), mat=PAINT), 0.008))
turret = join('turret', tparts)
pivot(turret, TURRET_PIVOT)
tag(turret, 'yaw', speed=0.6)

# ---------------------------------------------------------------- gun

TRUNNION = (0, -1.28, 1.98)
gparts = []
mant = loft('mantlet', [
    superellipse(0.50, 0.34, 3.0, 20, at=(0, -1.22, 1.98), plane='xz'),
    superellipse(0.46, 0.31, 3.0, 20, at=(0, -1.44, 1.98), plane='xz'),
    superellipse(0.26, 0.22, 2.4, 20, at=(0, -1.58, 1.98), plane='xz'),
], mat=PAINT)
gparts.append(soft(mant, 50))
barrel = lathe('barrel', [(0.0, 0.0), (0.135, 0.0), (0.135, 0.42), (0.105, 0.50), (0.098, 0.95), (0.075, 1.02), (0.062, 2.86),
                          (0.066, 2.88), (0.066, 2.96), (0.095, 2.98), (0.095, 3.26), (0.066, 3.28), (0.066, 3.32), (0.045, 3.32), (0.045, 3.0), (0.0, 3.0)],
               segs=18, at=(0, -1.5, 1.98), rot=(90, 0, 0), mat=PAINT)
gparts.append(hard(barrel, 0.0, sharp=35))
# muzzle brake ports
for s in (-1, 1):
    gparts.append(hard(box('port', 0.05, 0.16, 0.08, at=(s * 0.085, -4.62, 1.98), mat=GUNMETAL), 0.004))
gparts.append(cyl('coax', 0.02, 0.3, at=(0.27, -1.62, 2.02), rot=(90, 0, 0), segs=6, mat=GUNMETAL))
gparts.append(hard(box('gun-sight-port', 0.07, 0.03, 0.07, at=(-0.28, -1.5, 2.08), mat=GLASS), 0.0))
gun = join('gun', gparts)
pivot(gun, TRUNNION)
parent(gun, turret)
tag(gun, 'pitch', min=-8, max=20, recoil=0.32)
marker('muzzle', (0, -4.86, 1.98), gun, kind='cannon')
marker('muzzle.mg', (0.27, -1.8, 2.02), gun, kind='mg')
marker('exhaust.L', (-0.92, 3.18, 0.94), hull)
marker('exhaust.R', (0.92, 3.18, 0.94), hull)
marker('hatch', (0.40, 0.22, 2.6), turret)

finish('tank', size=2048)
