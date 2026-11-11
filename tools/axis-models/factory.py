# Industrial complex, 1940s: a war factory on a 90 m by 70 m yard, main gate to -y, ground at z = 0.
# Three north-light machine halls, a power house with three brick chimneys, a water tower, storage
# tanks and a gas holder, a pipe rack between the buildings, a covered loading dock on a rail siding
# with goods wagons, and a gantry crane over the steel stockyard.
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *
from _big_helpers import *

far_camera()              # the kit's preview camera clips at 100 m
install_even_unwrap()     # one texel density for the buildings and for the hundreds of stamped parts
reset()

K = 0.3       # the kit's surface patterns were sized for a tank: stretch them three times
BRICK = brick('brick', course=0.2, length=0.6, k=K)
BRICKC = brick('brick-chimney', dark=(0.2, 0.085, 0.055), lite=(0.36, 0.16, 0.095), course=0.2, length=0.6, soot=0.6, k=K, soot_above=(12.0, 32.0))
LANES = [(-3.6, 3.6, -40.0, -4.0), (-38.0, 9.0, -9.6, -4.4), (2.0, 31.8, -8.6, -3.4), (27.2, 31.9, -33.0, -3.4), (6.6, 9.4, -4.0, 30.0)]
YARD = concrete('yard', colour=(0.2, 0.193, 0.178), slab=8.0, k=K, lanes=LANES)
CONC = concrete('trim', colour=(0.43, 0.42, 0.39), slab=2.5, stains=0.35, tyres=0.0, joint=0.03, k=K)
ROOF = corrugated('roof', (0.2, 0.215, 0.22), pitch=0.32, along='y', rust=0.55, k=K)
ROOFX = corrugated('roof-x', (0.2, 0.215, 0.22), pitch=0.32, along='x', rust=0.55, k=K)
LOUVRE = corrugated('louvre', (0.12, 0.13, 0.13), pitch=0.3, along='z', rust=0.3, k=K, depth=0.06)
PAINT = rescale(paint('paint', wear=0.9, dirt=1.0, low=(0.1, 2.0)), K)
PAINTW = add_plating(rescale(paint('paint-planks', wear=0.9, dirt=1.0, low=(0.4, 2.2)), K), 0.24, 6.0, seam=0.025, dark=0.35, depth=1.5)
PAINTT = add_plating(rescale(paint('paint-plates', wear=0.8, dirt=1.0, low=(0.1, 1.5)), K), 3.2, 1.5, seam=0.03, dark=0.25)
STEEL = rescale(plain('steel', (0.1, 0.09, 0.085), rough=0.55, metal=0.7, rust=0.8, dirt=0.6), K)
FRAME = rescale(plain('frame', (0.48, 0.48, 0.44), rough=0.7, dirt=0.9), K)
TIMBER = rescale(plain('timber', (0.11, 0.085, 0.06), rough=0.9, dirt=0.7, vary=0.2), K)
CRATE = rescale(plain('crate', (0.4, 0.29, 0.17), rough=0.8, dirt=0.7, vary=0.22), K)
TARP = rescale(plain('tarp', (0.17, 0.185, 0.125), rough=0.95, vary=0.2, dirt=0.7, bump=0.5), K)
COAL = rescale(plain('coal', (0.016, 0.016, 0.018), rough=0.7, vary=0.35, dirt=0.15, bump=1.0, fine_scale=24.0), K)
ORE = rescale(plain('ore', (0.23, 0.105, 0.055), rough=0.95, vary=0.3, dirt=0.3, bump=1.0, fine_scale=24.0), K)
BALLAST = rescale(plain('ballast', (0.19, 0.175, 0.16), rough=0.95, vary=0.25, dirt=0.5, bump=1.0, fine_scale=30.0), K)
DARK = rescale(plain('dark', (0.018, 0.018, 0.02), rough=0.9, dirt=0.2), K)
DRUM = rescale(plain('drum', (0.09, 0.15, 0.19), rough=0.5, metal=0.3, rust=0.6, dirt=0.7), K)
RUBBER = rescale(plain('rubber', (0.03, 0.03, 0.03), rough=0.88, dirt=0.8), K)
GLASS = glass()

S = []


def add(ob, w=0.0, sharp=50):
    S.append(hard(ob, w, sharp=sharp))
    return ob


def keep(mb, name, sharp=40):
    ob = mb.obj(name, sharp=sharp)
    S.append(ob)
    return ob


class Side:
    """One outside face of a rectangular building; u runs left to right as seen from outside."""

    def __init__(self, x0, x1, y0, y1, side):
        if side == 's':
            self.o, self.ud, self.n, self.len, self.rz = V((x0, y0, 0)), V((1, 0, 0)), V((0, -1, 0)), x1 - x0, 0
        elif side == 'n':
            self.o, self.ud, self.n, self.len, self.rz = V((x1, y1, 0)), V((-1, 0, 0)), V((0, 1, 0)), x1 - x0, 180
        elif side == 'e':
            self.o, self.ud, self.n, self.len, self.rz = V((x1, y0, 0)), V((0, 1, 0)), V((1, 0, 0)), y1 - y0, 90
        else:
            self.o, self.ud, self.n, self.len, self.rz = V((x0, y1, 0)), V((0, -1, 0)), V((-1, 0, 0)), y1 - y0, -90

    def p(self, u, v, d=0.0):
        return self.o + self.ud * u + V((0, 0, v)) + self.n * d

    def at(self, u, v, d=0.0):
        return (tuple(self.p(u, v, d)), (0, 0, self.rz))


def sides(x0, x1, y0, y1):
    return {k: Side(x0, x1, y0, y1, k) for k in 'snew'}


def band(mb, sd, z0, z1, proud, mat, gaps=()):
    """A projecting course along one face: plinth, string course or cornice."""
    cuts = [0.0]
    for a, b in sorted(gaps):
        cuts += [a, b]
    cuts.append(sd.len)
    for a, b in zip(cuts[0::2], cuts[1::2]):
        if b - a < 0.05:
            continue
        a2, b2 = a - (proud if a == 0 else 0), b + (proud if b == sd.len else 0)
        mb.poly([sd.p(a2, z0, proud), sd.p(b2, z0, proud), sd.p(b2, z1, proud), sd.p(a2, z1, proud)], mat, sd.n)
        mb.poly([sd.p(a2, z1, proud), sd.p(b2, z1, proud), sd.p(b2, z1, 0), sd.p(a2, z1, 0)], mat, (0, 0, 1))
        if z0 > 0.1:
            mb.poly([sd.p(a2, z0, proud), sd.p(b2, z0, proud), sd.p(b2, z0, 0), sd.p(a2, z0, 0)], mat, (0, 0, -1))
        for u, f in ((a2, -1), (b2, 1)):
            if 0 < u < sd.len:
                mb.poly([sd.p(u, z0, 0), sd.p(u, z0, proud), sd.p(u, z1, proud), sd.p(u, z1, 0)], mat, sd.ud * f)


def pilaster(mb, sd, u, z0, z1, mat, w=0.8, proud=0.32):
    a, b = u - w / 2, u + w / 2
    mb.poly([sd.p(a, z0, proud), sd.p(b, z0, proud), sd.p(b, z1, proud), sd.p(a, z1, proud)], mat, sd.n)
    mb.poly([sd.p(a, z0, 0), sd.p(a, z0, proud), sd.p(a, z1, proud), sd.p(a, z1, 0)], mat, -sd.ud)
    mb.poly([sd.p(b, z0, 0), sd.p(b, z0, proud), sd.p(b, z1, proud), sd.p(b, z1, 0)], mat, sd.ud)


def sliding_door(mb, sd, u0, u1, h, slide=0.55, mat=None):
    """A big door leaf hung on a rail, slid part-way off its opening (the opening is a hole in the wall)."""
    mat = mat or PAINT
    w = u1 - u0
    a = u0 + w * slide
    r0, r1 = min(u0, a) - 0.3, max(u1, a + w) + 0.3
    d0, d1 = 0.34, 0.44                       # the leaf hangs clear of the pilasters
    mb.poly([sd.p(a, 0.05, d1), sd.p(a + w, 0.05, d1), sd.p(a + w, h + 0.1, d1), sd.p(a, h + 0.1, d1)], mat, sd.n)
    mb.poly([sd.p(a, 0.05, d0), sd.p(a + w, 0.05, d0), sd.p(a + w, h + 0.1, d0), sd.p(a, h + 0.1, d0)], mat, -sd.n)
    for u, f in ((a, -1), (a + w, 1)):
        mb.poly([sd.p(u, 0.05, d0), sd.p(u, 0.05, d1), sd.p(u, h + 0.1, d1), sd.p(u, h + 0.1, d0)], mat, sd.ud * f)
    mb.poly([sd.p(a, h + 0.1, d0), sd.p(a + w, h + 0.1, d0), sd.p(a + w, h + 0.1, d1), sd.p(a, h + 0.1, d1)], mat, (0, 0, 1))
    for v in (0.3, h * 0.5, h - 0.2):          # ledges and braces on the leaf
        mb.beam(sd.p(a + 0.1, v, d1 + 0.04), sd.p(a + w - 0.1, v, d1 + 0.04), 0.08, 0.22, mat, up=tuple(sd.n))
    mb.beam(sd.p(a + 0.15, 0.4, d1 + 0.04), sd.p(a + w - 0.15, h * 0.5 - 0.1, d1 + 0.04), 0.08, 0.18, mat, up=tuple(sd.n))
    mb.beam(sd.p(a + 0.15, h - 0.3, d1 + 0.04), sd.p(a + w - 0.15, h * 0.5 + 0.1, d1 + 0.04), 0.08, 0.18, mat, up=tuple(sd.n))
    mb.beam(sd.p(r0, h + 0.3, d1 - 0.05), sd.p(r1, h + 0.3, d1 - 0.05), 0.14, 0.18, STEEL, caps=True)     # the rail, on brackets
    for u in (r0 + 0.2, (r0 + r1) / 2, r1 - 0.2):
        mb.beam(sd.p(u, h + 0.3, 0.0), sd.p(u, h + 0.3, d1 - 0.05), 0.1, 0.1, STEEL)


# ---------------------------------------------------------------- stamped units (each faces -y, origin at its sill)

def window_unit(w, h, nv, nh, arch=False, name='window'):
    m = MB()
    hw = w / 2
    out = [(-hw, 0), (hw, 0), (hw, h)]
    if arch:
        out += [(hw * math.cos(math.pi * i / 8), h + hw * math.sin(math.pi * i / 8)) for i in range(1, 8)]
    out.append((-hw, h))
    m.poly([(x, -0.03, z) for x, z in out], GLASS, (0, -1, 0))
    for i in range(1, nv + 1):
        x = -hw + w * i / (nv + 1)
        top = h + (math.sqrt(max(0.0, hw * hw - x * x)) if arch else 0)
        m.poly([(x - 0.05, -0.05, 0), (x + 0.05, -0.05, 0), (x + 0.05, -0.05, top), (x - 0.05, -0.05, top)], FRAME, (0, -1, 0))
    for j in range(1, nh + 1):
        z = h * j / (nh + 1) if not arch else h * j / nh
        m.poly([(-hw, -0.05, z - 0.05), (hw, -0.05, z - 0.05), (hw, -0.05, z + 0.05), (-hw, -0.05, z + 0.05)], FRAME, (0, -1, 0))
    # sill and head, standing proud of the brick
    m.poly([(-hw - 0.15, -0.14, -0.22), (hw + 0.15, -0.14, -0.22), (hw + 0.15, -0.14, 0), (-hw - 0.15, -0.14, 0)], CONC, (0, -1, 0))
    m.poly([(-hw - 0.15, -0.14, 0), (hw + 0.15, -0.14, 0), (hw + 0.15, 0, 0.04), (-hw - 0.15, 0, 0.04)], CONC, (0, 0, 1))
    if arch:
        ro = hw + 0.34
        for i in range(8):
            a0, a1 = math.pi * i / 8, math.pi * (i + 1) / 8
            m.poly([(hw * math.cos(a0), -0.08, h + hw * math.sin(a0)), (ro * math.cos(a0), -0.08, h + ro * math.sin(a0)),
                    (ro * math.cos(a1), -0.08, h + ro * math.sin(a1)), (hw * math.cos(a1), -0.08, h + hw * math.sin(a1))], CONC, (0, -1, 0))
    else:
        m.poly([(-hw - 0.2, -0.1, h), (hw + 0.2, -0.1, h), (hw + 0.2, -0.1, h + 0.38), (-hw - 0.2, -0.1, h + 0.38)], CONC, (0, -1, 0))
        m.poly([(-hw - 0.2, -0.1, h), (hw + 0.2, -0.1, h), (hw + 0.2, 0, h), (-hw - 0.2, 0, h)], CONC, (0, 0, -1))
    return m.obj(name)


def door_unit():
    m = MB()
    m.poly([(-0.55, -0.04, 0), (0.55, -0.04, 0), (0.55, -0.04, 2.15), (-0.55, -0.04, 2.15)], PAINT, (0, -1, 0))
    m.poly([(-0.72, -0.1, 2.15), (0.72, -0.1, 2.15), (0.72, -0.1, 2.45), (-0.72, -0.1, 2.45)], CONC, (0, -1, 0))
    m.poly([(-0.72, -0.1, 2.15), (0.72, -0.1, 2.15), (0.72, 0, 2.15), (-0.72, 0, 2.15)], CONC, (0, 0, -1))
    m.poly([(-0.7, -0.5, 0), (0.7, -0.5, 0), (0.7, 0, 0.12), (-0.7, 0, 0.12)], CONC, (0, -0.3, 1))      # step
    m.poly([(-0.7, -0.5, 0), (0.7, -0.5, 0), (0.7, -0.5, -0.02), (-0.7, -0.5, -0.02)], CONC, (0, -1, 0))
    m.box((0.32, -0.09, 1.0), (0.42, -0.04, 1.12), STEEL, drop='+y')
    return m.obj('door')


WIN, ARCH, SMALL, PDOOR, GLAZE, VENTS = [], [], [], [], [], []
EAVE, TOOTH_H, LEAN, TOOTH = 8.0, 2.6, 0.9, 5.75
HALL_W = 16.0


def glazing_unit():
    """The glazed face of one roof tooth, the full width of a hall: origin at the foot of the face."""
    m = MB()
    nrm = V((-TOOTH_H, 0, LEAN)).normalized()

    def P(t, y, d=0.0):
        return V((LEAN * t, y, TOOTH_H * t)) + nrm * d
    m.poly([P(0, 0), P(0, HALL_W), P(0.16, HALL_W), P(0.16, 0)], PAINT, nrm)
    m.poly([P(0.16, 0.3, 0.02), P(0.16, HALL_W - 0.3, 0.02), P(0.97, HALL_W - 0.3, 0.02), P(0.97, 0.3, 0.02)], GLASS, nrm)
    for i in range(11):
        y = lerp(0.3, HALL_W - 0.3, i / 10)
        m.poly([P(0.16, y - 0.06, 0.05), P(0.16, y + 0.06, 0.05), P(0.97, y + 0.06, 0.05), P(0.97, y - 0.06, 0.05)], FRAME, nrm)
    for t in (0.18, 0.57, 0.95):
        m.poly([P(t - 0.025, 0.3, 0.05), P(t - 0.025, HALL_W - 0.3, 0.05), P(t + 0.025, HALL_W - 0.3, 0.05), P(t + 0.025, 0.3, 0.05)], FRAME, nrm)
    for y in (0.0, HALL_W - 0.3):
        m.poly([P(0.16, y, 0.0), P(0.16, y + 0.3, 0.0), P(1.0, y + 0.3, 0.0), P(1.0, y, 0.0)], PAINT, nrm)
    return m.obj('glazing')


# ---------------------------------------------------------------- the yard

HALLS = [(-40.0, 6.0, 14.0, 30.0), (-40.0, 6.0, -4.0, 12.0), (-34.0, -11.0, -26.0, -10.0)]
OFFICE = (-11.0, -6.0, -25.0, -11.0)
POWER = (10.0, 30.0, 12.0, 30.0)
ANNEX = (10.0, 30.0, 4.0, 12.0)
mb = MB()
holes = [(x0 + 0.3, x1 - 0.3, y0 + 0.3, y1 - 0.3) for x0, x1, y0, y1 in HALLS]
holes.append((POWER[0] + 0.3, POWER[1] - 0.3, ANNEX[2] + 0.3, POWER[3] - 0.3))
mb.floor(-48, 48, -38, 38, 0.02, holes, YARD, skirt=0.3)
keep(mb, 'yard')


# ---------------------------------------------------------------- machine halls

def hall(x0, x1, y0, y1, doors=(), vents=(1, 3, 5, 7), skip=()):
    """doors: (side, u0, u1, height, slide). skip: (side, u) window places left blank (a door goes there)."""
    n = round((x1 - x0) / TOOTH)
    sd = sides(x0, x1, y0, y1)
    mb = MB()
    holes = {k: [] for k in 'snew'}
    for side, u0, u1, h, sl in doors:
        holes[side].append((u0, u1, 0.02, h))

    def blocked(k, u):
        if any(k == s_ and abs(u - us) < 0.1 for s_, us in skip):
            return True
        for side, u0, u1, h, sl in doors:
            a = u0 + (u1 - u0) * sl
            if side == k and (u0 - 1.7 < u < u1 + 1.7 or a - 1.7 < u < a + (u1 - u0) + 1.7):
                return True
        return False
    for k in 'snew':
        mb.wall(sd[k].o, sd[k].ud, sd[k].n, (0, sd[k].len), (0, EAVE), holes[k], BRICK, 0.4, DARK, BRICK)
        gaps = [(h[0], h[1]) for h in holes[k]]
        band(mb, sd[k], 0.0, 0.9, 0.1, CONC, gaps)
        band(mb, sd[k], EAVE - 0.5, EAVE, 0.14, CONC)
    for side, u0, u1, h, sl in doors:
        sliding_door(mb, sd[side], u0, u1, h, slide=sl)
    for i in range(n):
        xi = x0 + i * TOOTH
        for yy, f in ((y0, -1), (y1, 1)):
            mb.poly([(xi, yy, EAVE), (xi + LEAN, yy, EAVE + TOOTH_H), (xi + TOOTH, yy, EAVE)], BRICK, (0, f, 0))
            mb.poly([(xi + LEAN - 0.05, yy + f * 0.12, EAVE + TOOTH_H + 0.05), (xi + TOOTH, yy + f * 0.12, EAVE + 0.18), (xi + TOOTH, yy, EAVE + 0.18), (xi + LEAN - 0.05, yy, EAVE + TOOTH_H + 0.05)], CONC, (0.3, 0, 1))
            mb.poly([(xi + LEAN - 0.05, yy + f * 0.12, EAVE + TOOTH_H + 0.05), (xi + TOOTH, yy + f * 0.12, EAVE + 0.18), (xi + TOOTH, yy + f * 0.12, EAVE - 0.02), (xi + LEAN - 0.05, yy + f * 0.12, EAVE + TOOTH_H - 0.15)], CONC, (0, f, 0))
        mb.poly([(xi + LEAN, y0 + 0.02, EAVE + TOOTH_H), (xi + TOOTH, y0 + 0.02, EAVE + 0.1), (xi + TOOTH, y1 - 0.02, EAVE + 0.1), (xi + LEAN, y1 - 0.02, EAVE + TOOTH_H)], ROOF, (0.3, 0, 1))
        mb.beam((xi + TOOTH - 0.12, y0 - 0.2, EAVE + 0.12), (xi + TOOTH - 0.12, y1 + 0.2, EAVE + 0.12), 0.4, 0.2, STEEL)           # valley gutter
        mb.tube((xi + LEAN, y0 - 0.1, EAVE + TOOTH_H + 0.04), (xi + LEAN, y1 + 0.1, EAVE + TOOTH_H + 0.04), 0.11, STEEL, 4)       # ridge roll
        GLAZE.append(((xi, y0, EAVE), (0, 0, 0)))
        if i in vents:
            for f in (0.27, 0.73):
                VENTS.append(((xi + LEAN + 1.3, lerp(y0, y1, f), EAVE + TOOTH_H - 0.95), (0, 0, 0)))
    # pilasters at every bay, windows between them
    for k in 'sn':
        for i in range(n + 1):
            pilaster(mb, sd[k], i * TOOTH, 0.9, EAVE - 0.5, BRICK)
            if 0 < i < n and i % 2 == 0:
                u = i * TOOTH + 0.55
                mb.tube(sd[k].p(u, 0.9, 0.14), sd[k].p(u, EAVE, 0.14), 0.09, STEEL, 4)                    # downpipe
        for i in range(n):
            u = (i + 0.5) * TOOTH
            if not blocked(k, u):
                WIN.append(sd[k].at(u, 2.2))
    for k in 'ew':
        for i in range(4):
            pilaster(mb, sd[k], HALL_W * i / 3, 0.9, EAVE - 0.5, BRICK)
        for i in range(3):
            u = HALL_W * (i + 0.5) / 3
            if not blocked(k, u):
                WIN.append(sd[k].at(u, 2.2))
    return mb, sd


def bay(i):
    return (i + 0.5) * TOOTH


mb, h1 = hall(*HALLS[0], doors=[('e', 5.7, 10.3, 5.6, 0.5)], vents=(1, 3, 5, 7), skip=(('s', bay(3)), ('n', bay(4)), ('w', 8.0)))
keep(mb, 'hall-1')
mb, h2 = hall(*HALLS[1], doors=[('s', TOOTH * 5 + 0.6, TOOTH * 6 - 0.6, 5.4, -0.5), ('e', 5.7, 10.3, 5.6, -0.5)], vents=(0, 2, 4, 6), skip=(('s', bay(2)), ('w', 8.0)))
keep(mb, 'hall-2')
mb, h3 = hall(*HALLS[2], doors=[('n', TOOTH * 2 + 0.6, TOOTH * 3 - 0.6, 5.4, 0.5)], vents=(1, 3), skip=(('s', bay(2)), ('w', 8.0), ('e', HALL_W / 6), ('e', HALL_W / 2), ('e', HALL_W * 5 / 6)))
keep(mb, 'hall-3')
PDOOR += [h1['s'].at(bay(3), 0.02), h1['n'].at(bay(4), 0.02), h2['s'].at(bay(2), 0.02), h2['w'].at(8.0, 0.02), h1['w'].at(8.0, 0.02),
          h3['s'].at(bay(2), 0.02), h3['w'].at(8.0, 0.02)]

# the works office on the end of the third hall: two storeys, flat roof behind a parapet
ox0, ox1, oy0, oy1 = OFFICE
mb = MB()
od = sides(ox0, ox1, oy0, oy1)
for k in 'sne':
    mb.wall(od[k].o, od[k].ud, od[k].n, (0, od[k].len), (0, 7.6), (), BRICK)
    band(mb, od[k], 0.0, 0.7, 0.08, CONC)
    band(mb, od[k], 3.5, 3.72, 0.07, CONC)
    band(mb, od[k], 7.3, 7.6, 0.14, CONC)
mb.poly([(ox0, oy0 + 0.3, 7.2), (ox1 - 0.3, oy0 + 0.3, 7.2), (ox1 - 0.3, oy1 - 0.3, 7.2), (ox0, oy1 - 0.3, 7.2)], CONC, (0, 0, 1))
for k, (a, b) in (('s', (0, od['s'].len - 0.3)), ('n', (0.3, od['n'].len)), ('e', (0.3, od['e'].len - 0.3))):
    mb.poly([od[k].p(a, 7.2, -0.3), od[k].p(b, 7.2, -0.3), od[k].p(b, 7.6, -0.3), od[k].p(a, 7.6, -0.3)], BRICK, -od[k].n)
    mb.poly([od[k].p(a - 0.3, 7.6, -0.3), od[k].p(b + 0.3, 7.6, -0.3), od[k].p(b + 0.3, 7.6, 0), od[k].p(a - 0.3, 7.6, 0)], CONC, (0, 0, 1))
for v in (1.0, 4.4):
    for u in (1.6, 4.4, 7.0, 9.8, 12.4):
        if not (v < 2 and u == 7.0):
            SMALL.append(od['e'].at(u, v))
    for u in (1.4, 3.6):
        SMALL.append(od['s'].at(u, v))
        SMALL.append(od['n'].at(u, v))
PDOOR.append(od['e'].at(7.0, 0.02))
mb.box((ox1, oy0 + 6.0, 2.6), (ox1 + 1.3, oy0 + 8.0, 2.74), CONC)                 # porch
for y in (oy0 + 6.1, oy0 + 7.9):
    mb.tube((ox1 + 1.2, y, 0.02), (ox1 + 1.2, y, 2.6), 0.05, STEEL, 4)
mb.box((ox0 + 1.0, oy0 + 3.0, 7.2), (ox0 + 2.4, oy0 + 4.6, 9.0), BRICK, top=CONC, drop='-z')     # chimney stack and tank on the roof
add(cyl('roof-tank', 0.8, 1.5, at=(ox0 + 2.4, oy1 - 3.0, 8.15), segs=10, mat=PAINTT), 0.05)
keep(mb, 'office')


# ---------------------------------------------------------------- power house and boiler annex

px0, px1, py0, py1 = POWER
PH = 15.0
mb = MB()
pd = sides(px0, px1, py0, py1)
pholes = {'e': [(5.0, 8.5, 0.02, 5.6)], 's': [], 'n': [], 'w': []}
for k in 'snew':
    z0 = 9.0 if k == 's' else 0.0
    mb.wall(pd[k].o, pd[k].ud, pd[k].n, (0, pd[k].len), (z0, PH), pholes[k], BRICK, 0.45, DARK, BRICK)
    if k != 's':
        band(mb, pd[k], 0.0, 1.1, 0.12, CONC, [(h[0], h[1]) for h in pholes[k]])
    band(mb, pd[k], PH - 0.9, PH - 0.55, 0.12, CONC)
    band(mb, pd[k], PH - 0.3, PH, 0.22, CONC)
    nb = 4
    for i in range(nb + 1):
        pilaster(mb, pd[k], pd[k].len * i / nb, max(z0, 1.1), PH - 0.9, BRICK, w=1.0, proud=0.36)
sliding_door(mb, pd['e'], 5.0, 8.5, 5.6, slide=0.5)
RIDGE = PH + 3.8
xm = (px0 + px1) / 2
for yy, f in ((py0, -1), (py1, 1)):
    mb.poly([(px0, yy, PH), (xm, yy, RIDGE), (px1, yy, PH)], BRICK, (0, f, 0))
    for (xa, za), (xb, zb), fx in (((px0 - 0.3, PH - 0.11), (xm, RIDGE + 0.12), -1), ((px1 + 0.3, PH - 0.11), (xm, RIDGE + 0.12), 1)):     # barge boards
        mb.poly([(xa, yy + f * 0.3, za), (xb, yy + f * 0.3, zb), (xb, yy + f * 0.3, zb - 0.35), (xa, yy + f * 0.3, za - 0.35)], CONC, (0, f, 0))
for xa, fx in ((px0 - 0.4, -1), (px1 + 0.4, 1)):
    mb.poly([(xa, py0 - 0.3, PH - 0.15), (xm, py0 - 0.3, RIDGE + 0.1), (xm, py1 + 0.3, RIDGE + 0.1), (xa, py1 + 0.3, PH - 0.15)], ROOF, (fx * 0.4, 0, 1))
    mb.poly([(xa, py0 - 0.3, PH - 0.15), (xa, py1 + 0.3, PH - 0.15), (xa, py1 + 0.3, PH - 0.3), (xa, py0 - 0.3, PH - 0.3)], STEEL, (fx, 0, 0))
    mb.poly([(xa, py0 - 0.3, PH - 0.3), (xa, py1 + 0.3, PH - 0.3), (xa - fx * 0.4, py1 + 0.3, PH - 0.3), (xa - fx * 0.4, py0 - 0.3, PH - 0.3)], STEEL, (0, 0, -1))
# the ventilating monitor along the ridge
mx0, mx1, my0, my1 = xm - 2.2, xm + 2.2, py0 + 2.5, py1 - 2.5
mz0, mz1 = RIDGE - 0.85, RIDGE + 1.5
for xa, fx in ((mx0, -1), (mx1, 1)):
    mb.poly([(xa, my0, mz0), (xa, my1, mz0), (xa, my1, mz1), (xa, my0, mz1)], LOUVRE, (fx, 0, 0))
    mb.poly([(xa - fx * 0.35, my0 - 0.3, mz1 - 0.05), (xm, my0 - 0.3, mz1 + 0.75), (xm, my1 + 0.3, mz1 + 0.75), (xa - fx * 0.35, my1 + 0.3, mz1 - 0.05)], ROOF, (fx * 0.4, 0, 1))
for yy, f in ((my0, -1), (my1, 1)):
    mb.poly([(mx0, yy, mz0), (mx1, yy, mz0), (mx1, yy, mz1), (xm, yy, mz1 + 0.7), (mx0, yy, mz1)], PAINT, (0, f, 0))
for u in (2.5, 7.5, 12.5, 17.5):
    ARCH.append(pd['n'].at(u, 3.0))
for u in (2.25, 11.25, 15.75):
    ARCH.append(pd['w'].at(u, 3.0))
for u in (2.25, 15.75):
    ARCH.append(pd['e'].at(u, 3.0))
for u in (2.5, 7.5, 12.5, 17.5):
    SMALL.append(pd['s'].at(u, 11.2))
PDOOR += [pd['w'].at(6.75, 0.02)]

# boiler annex: lean-to roof against the power house, flues out to the chimneys
ax0, ax1, ay0, ay1 = ANNEX
AH0, AH1 = 8.2, 9.6
ad = sides(ax0, ax1, ay0, ay1)
mb.wall(ad['s'].o, ad['s'].ud, ad['s'].n, (0, 20), (0, AH0), (), BRICK)
band(mb, ad['s'], 0.0, 1.1, 0.12, CONC)
band(mb, ad['s'], AH0 - 0.35, AH0, 0.14, CONC)
for k, fx in (('w', -1), ('e', 1)):
    xx = ax0 if k == 'w' else ax1
    mb.poly([(xx, ay0, 0), (xx, ay1, 0), (xx, ay1, AH1), (xx, ay0, AH0)], BRICK, (fx, 0, 0))
    band(mb, ad[k], 0.0, 1.1, 0.12, CONC)
mb.poly([(ax0 - 0.3, ay0 - 0.4, AH0 - 0.05), (ax1 + 0.3, ay0 - 0.4, AH0 - 0.05), (ax1 + 0.3, ay1, AH1 + 0.05), (ax0 - 0.3, ay1, AH1 + 0.05)], ROOFX, (0, -0.3, 1))
mb.beam((ax0 - 0.3, ay0 - 0.45, AH0 - 0.12), (ax1 + 0.3, ay0 - 0.45, AH0 - 0.12), 0.28, 0.2, STEEL)
for i in range(5):
    pilaster(mb, ad['s'], 20 * i / 4, 1.1, AH0 - 0.35, BRICK, w=0.9)
for u in (2.6, 7.4, 12.6, 17.4):
    SMALL.append(ad['s'].at(u, 5.4))
SMALL += [ad['w'].at(2.0, 4.6), ad['w'].at(5.6, 4.6), ad['e'].at(5.8, 4.6)]
PDOOR += [ad['w'].at(4.0, 0.02)]
for xx in (14.0, 20.0, 26.0):         # roof lights on the lean-to
    z = lerp(AH0, AH1, 0.55)
    mb.box((xx - 0.9, 7.6, z + 0.02), (xx + 0.9, 9.4, z + 0.42), FRAME, top=GLASS, drop='-z')
power = keep(mb, 'power-house')

CHIM = [(13.0, 0.0, 36.0, 1.75, 1.05), (20.5, 0.0, 45.0, 2.0, 1.15), (28.0, 0.0, 31.0, 1.6, 1.0)]
mb = MB()
for i, (cx, cy, H, r0, r1) in enumerate(CHIM):
    b = r0 + 0.55
    cs = sides(cx - b, cx + b, cy - b, cy + b)
    for k in 'snew':
        mb.wall(cs[k].o, cs[k].ud, cs[k].n, (0, 2 * b), (0, 3.4), (), BRICKC)
        band(mb, cs[k], 0.0, 0.6, 0.1, CONC)
        band(mb, cs[k], 3.1, 3.4, 0.16, CONC)
    mb.poly([(cx - b, cy - b, 3.4), (cx + b, cy - b, 3.4), (cx + b, cy + b, 3.4), (cx - b, cy + b, 3.4)], CONC, (0, 0, 1))
    prof = [(r0, 3.4)]
    for f in (0.25, 0.5, 0.75):
        prof.append((lerp(r0, r1, f), lerp(3.4, H - 3.2, f)))
    prof += [(r1, H - 3.2), (r1 + 0.14, H - 3.0), (r1 + 0.14, H - 2.6), (r1, H - 2.4), (r1 * 0.98, H - 1.1), (r1 + 0.26, H - 0.75),
             (r1 + 0.26, H - 0.2), (r1 + 0.12, H), (r1 - 0.28, H), (r1 - 0.34, H - 1.6)]
    add(revolve('chimney', prof, 12, at=(cx, cy, 0), mat=BRICKC), 0.0, sharp=44)
    mb.poly([(cx + (r1 - 0.33) * math.cos(2 * math.pi * j / 12), cy + (r1 - 0.33) * math.sin(2 * math.pi * j / 12), H - 1.5) for j in range(12)], DARK, (0, 0, 1))
    for f in (0.3, 0.55, 0.8):          # iron hoops
        z = lerp(3.4, H - 3.2, f)
        r = lerp(r0, r1, f) + 0.02
        add(revolve('hoop', [(r, z - 0.14), (r + 0.06, z - 0.1), (r + 0.06, z + 0.1), (r, z + 0.14)], 12, at=(cx, cy, 0), mat=STEEL), 0.0, sharp=30)
    # flue from the boiler house, and a cleaning door
    mb.box((cx - 0.95, cy + b, 1.9), (cx + 0.95, ay0, 4.1), BRICKC, top=CONC, drop='-y +y')
    mb.box((cx - 0.4, cy - b - 0.06, 0.8), (cx + 0.4, cy - b, 1.9), STEEL, drop='+y')
    marker(f'smoke.{i + 1}', (cx, cy, H + 0.6))
ladder(mb, (20.5 - 2.02, -0.0, 3.4), (20.5 - 1.2, 0.0, 43.0), STEEL, w=0.45, step=1.1, out=(-1, 0, 0))
keep(mb, 'chimney-bases')


# ---------------------------------------------------------------- water tower

WX, WY = -39.4, -29.0
mb = MB()
TZ = 14.5
LEG0, LEG1 = 3.5, 2.5
corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
levels = [0.02, 4.9, 9.7, TZ]


def leg(c, z):
    f = (z - 0.02) / (TZ - 0.02)
    r = lerp(LEG0, LEG1, f)
    return V((WX + c[0] * r, WY + c[1] * r, z))


for c in corners:
    mb.beam(leg(c, 0.02), leg(c, TZ), 0.3, 0.3, PAINT)
    mb.box((WX + c[0] * LEG0 - 0.5, WY + c[1] * LEG0 - 0.5, 0.02), (WX + c[0] * LEG0 + 0.5, WY + c[1] * LEG0 + 0.5, 0.4), CONC, drop='-z')
for a, b in zip(corners, corners[1:] + corners[:1]):
    for z in levels[1:]:
        mb.beam(leg(a, z), leg(b, z), 0.2, 0.2, PAINT)
    for z0, z1 in zip(levels, levels[1:]):
        mb.tube(leg(a, z0 + 0.1), leg(b, z1 - 0.1), 0.05, PAINT, 3)
        mb.tube(leg(b, z0 + 0.1), leg(a, z1 - 0.1), 0.05, PAINT, 3)
mb.tube((WX, WY, 0.02), (WX, WY, TZ + 0.5), 0.32, PAINT, 6)                      # riser
tank = revolve('water-tank', [(0.4, TZ - 0.9), (1.9, TZ - 0.5), (3.0, TZ + 0.5), (3.3, TZ + 1.5), (3.3, TZ + 5.6), (3.42, TZ + 5.7), (3.42, TZ + 5.85), (2.0, TZ + 6.9), (0.25, TZ + 7.5), (0.0, TZ + 8.1)],
               14, at=(WX, WY, 0), mat=PAINTT)
weld(tank, 1e-3)
add(tank, 0.0, sharp=35)
for z in (TZ + 1.6, TZ + 3.55, TZ + 5.5):
    add(revolve('tank-hoop', [(3.3, z - 0.1), (3.37, z - 0.07), (3.37, z + 0.07), (3.3, z + 0.1)], 14, at=(WX, WY, 0), mat=PAINTT), 0.0, sharp=30)
# gallery round the tank with a railing, and the ladder up to it
GZ = TZ + 0.35
ring = [(WX + math.cos(2 * math.pi * i / 14), WY + math.sin(2 * math.pi * i / 14)) for i in range(14)]
wrail = Rails(PAINT, h=1.0, gap=10.0, t=0.06)
for (xa, ya), (xb, yb) in zip(ring, ring[1:] + ring[:1]):
    def R_(p, r):
        return (WX + (p[0] - WX) * r, WY + (p[1] - WY) * r)
    a0, a1, b0, b1 = R_((xa, ya), 2.9), R_((xa, ya), 4.3), R_((xb, yb), 2.9), R_((xb, yb), 4.3)
    mb.poly([(*a0, GZ), (*a1, GZ), (*b1, GZ), (*b0, GZ)], STEEL, (0, 0, 1))
    mb.poly([(*a0, GZ - 0.1), (*a1, GZ - 0.1), (*b1, GZ - 0.1), (*b0, GZ - 0.1)], PAINT, (0, 0, -1))
    mb.poly([(*a1, GZ - 0.1), (*b1, GZ - 0.1), (*b1, GZ), (*a1, GZ)], PAINT, (xa + xb - 2 * WX, ya + yb - 2 * WY, 0))
wrail.run(mb, [(WX + (x - WX) * 4.25, WY + (y - WY) * 4.25, GZ) for x, y in ring], closed=True)
for c in corners:
    mb.beam(leg(c, TZ - 2.0), (WX + c[0] * 2.95, WY + c[1] * 2.95, GZ - 0.1), 0.14, 0.14, PAINT)
ladder(mb, (WX + LEG0 + 0.35, WY, 0.02), (WX + 4.35, WY, GZ + 1.0), PAINT, w=0.5, step=0.6, out=(1, 0, 0))
keep(mb, 'water-tower')
S += wrail.build()


# ---------------------------------------------------------------- storage tanks and gas holder

def stair_round(mb, cx, cy, r, z0, z1, a0, a1, n=10, w=0.9):
    """A stair wound round a tank, with an outer handrail."""
    prev = None
    for i in range(n + 1):
        a = math.radians(lerp(a0, a1, i / n))
        z = lerp(z0, z1, i / n)
        inner = V((cx + (r + 0.05) * math.cos(a), cy + (r + 0.05) * math.sin(a), z))
        outer = V((cx + (r + w) * math.cos(a), cy + (r + w) * math.sin(a), z))
        if prev:
            pi_, po = prev
            mb.poly([pi_, po, outer, inner], STEEL, (0, 0, 1))
            mb.poly([pi_ - V((0, 0, 0.12)), po - V((0, 0, 0.12)), outer - V((0, 0, 0.12)), inner - V((0, 0, 0.12))], PAINT, (0, 0, -1))
            mb.poly([po - V((0, 0, 0.3)), outer - V((0, 0, 0.3)), outer + V((0, 0, 0.05)), po + V((0, 0, 0.05))], PAINT, (outer.x - cx, outer.y - cy, 0))
            mb.tube(po + V((0, 0, 1.0)), outer + V((0, 0, 1.0)), 0.03, PAINT, 3)
        mb.tube(outer, outer + V((0, 0, 1.0)), 0.03, PAINT, 3)
        if i % 3 == 0 and z > 1.3:
            mb.beam(outer - V((0, 0, 0.2)), V((cx + r * math.cos(a), cy + r * math.sin(a), z - 0.9)), 0.07, 0.07, PAINT)
        prev = (inner, outer)


TANKS = [(13.0, -27.0), (21.5, -27.0)]
TR, TH = 3.6, 7.6
mb = MB()
trail = Rails(PAINT, h=1.0, gap=10.0, t=0.06, mids=(0.5,))
for i, (cx, cy) in enumerate(TANKS):
    t = revolve('tank', [(TR + 0.35, 0.02), (TR + 0.35, 0.4), (TR, 0.45), (TR, TH), (TR + 0.08, TH + 0.02), (TR + 0.08, TH + 0.14), (TR - 0.1, TH + 0.2), (0.6, TH + 0.85), (0.0, TH + 0.9)], 18, at=(cx, cy, 0), mat=PAINTT)
    weld(t, 1e-3)
    add(t, 0.0, sharp=35)
    a0 = 200 if i == 0 else -20
    stair_round(mb, cx, cy, TR, 0.05, TH + 0.15, a0, a0 + 115 * (1 if i == 0 else -1), 10)
    trail.run(mb, [(cx + (TR - 0.12) * math.cos(2 * math.pi * j / 18), cy + (TR - 0.12) * math.sin(2 * math.pi * j / 18), TH + 0.2) for j in range(18)], closed=True)
    add(cyl('tank-hatch', 0.45, 0.25, at=(cx + 1.6, cy, TH + 0.7), segs=8, mat=PAINTT), 0.04)
    mb.tube((cx, cy, TH + 0.85), (cx, cy, TH + 1.6), 0.12, PAINT, 5, caps=True)
    # outlet pipe and valve
    mb.tube((cx, cy + TR - 0.1, 0.7), (cx, cy + TR + 1.6, 0.7), 0.16, PAINT, 6)
    mb.box((cx - 0.25, cy + TR + 0.5, 0.45), (cx + 0.25, cy + TR + 0.9, 1.0), PAINT)
mb.tube((TANKS[0][0], TANKS[0][1] + TR + 1.6, 0.7), (TANKS[1][0], TANKS[1][1] + TR + 1.6, 0.7), 0.16, PAINT, 6)
mb.tube((17.2, -27.0 + TR + 1.6, 0.7), (17.2, -19.6, 0.7), 0.16, PAINT, 6)
# the bund wall round them
bx0, bx1, by0, by1 = 8.7, 25.9, -31.7, -21.0
for lo, hi in (((bx0, by0, 0.02), (bx1, by0 + 0.3, 1.1)), ((bx0, by1 - 0.3, 0.02), (bx1, by1, 1.1)), ((bx0, by0 + 0.3, 0.02), (bx0 + 0.3, by1 - 0.3, 1.1)), ((bx1 - 0.3, by0 + 0.3, 0.02), (bx1, by1 - 0.3, 1.1))):
    mb.box(lo, hi, CONC, drop='-z')
mb.box((bx1, -26.0, 0.02), (bx1 + 1.2, -24.8, 1.1), CONC, drop='-z -x')                # steps over the bund
mb.box((bx1 - 1.5, -26.0, 0.02), (bx1 - 0.3, -24.8, 0.55), CONC, drop='-z')
keep(mb, 'tanks')
S += trail.build()

GX, GY, GR = 18.0, -13.6, 5.6
mb = MB()
g1 = revolve('holder-tank', [(GR + 0.3, 0.02), (GR + 0.3, 3.6), (GR + 0.42, 3.65), (GR + 0.42, 3.95), (GR + 0.1, 4.0)], 20, at=(GX, GY, 0), mat=PAINTT)
add(g1, 0.0, sharp=35)
g2 = revolve('holder-lift', [(GR, 3.9), (GR, 8.6), (GR - 0.05, 8.75), (GR * 0.75, 9.35), (GR * 0.4, 9.75), (0.0, 9.9)], 20, at=(GX, GY, 0), mat=PAINTT)
weld(g2, 1e-3)
add(g2, 0.0, sharp=35)
NC = 8
cols = [(GX + (GR + 0.75) * math.cos(2 * math.pi * (i + 0.5) / NC), GY + (GR + 0.75) * math.sin(2 * math.pi * (i + 0.5) / NC)) for i in range(NC)]
for i, (x, y) in enumerate(cols):
    x2, y2 = cols[(i + 1) % NC]
    mb.beam((x, y, 0.02), (x, y, 13.0), 0.34, 0.34, PAINT, caps=True, up=(x - GX, y - GY, 0))
    for z in (7.0, 12.7):
        mb.beam((x, y, z), (x2, y2, z), 0.2, 0.3, PAINT)
    mb.tube((x, y, 7.2), (x2, y2, 12.5), 0.045, PAINT, 3)
    mb.tube((x2, y2, 7.2), (x, y, 12.5), 0.045, PAINT, 3)
    rx, ry = GX + GR * math.cos(2 * math.pi * (i + 0.5) / NC), GY + GR * math.sin(2 * math.pi * (i + 0.5) / NC)
    mb.beam((x, y, 8.4), (rx, ry, 8.4), 0.16, 0.3, STEEL)                             # guide roller carriage
ladder(mb, (cols[5][0] - 0.25, cols[5][1] - 0.2, 0.02), (cols[5][0] - 0.25, cols[5][1] - 0.2, 12.9), PAINT, w=0.45, step=0.7, out=(cols[5][0] - GX, cols[5][1] - GY, 0))
keep(mb, 'gas-holder')


# ---------------------------------------------------------------- pipe rack between the buildings

mb = MB()
PZ = 6.3
RX = 8.0


def trestle(x, y, along_y=True, z=PZ, w=2.3):
    a, b = ((x - w / 2, y), (x + w / 2, y)) if along_y else ((x, y - w / 2), (x, y + w / 2))
    for p in (a, b):
        mb.beam((*p, 0.02), (*p, z), 0.22, 0.22, PAINT)
        mb.box((p[0] - 0.3, p[1] - 0.3, 0.02), (p[0] + 0.3, p[1] + 0.3, 0.3), CONC, drop='-z')
    mb.beam((a[0], a[1], z - 0.12), (b[0], b[1], z - 0.12), 0.22, 0.26, PAINT, caps=True)
    mb.beam((a[0], a[1], z - 2.6), (b[0], b[1], z - 2.6), 0.14, 0.14, PAINT)
    mb.tube((a[0], a[1], z - 2.5), (b[0], b[1], z - 0.3), 0.04, PAINT, 3)
    mb.tube((b[0], b[1], z - 2.5), (a[0], a[1], z - 0.3), 0.04, PAINT, 3)


def pipe(pts, r, mat=None, segs=6):
    pts = [V(p) for p in pts]
    for a, b in zip(pts, pts[1:]):
        d = (b - a).normalized() * r * 0.7
        mb.tube(a - d, b + d, r, mat or PAINT, segs)


TY = [28.0, 22.0, 16.0, 10.0, 4.0, -2.0, -8.0]
for y in TY:
    trestle(RX, y)
for sx in (-1, 1):
    mb.beam((RX + sx * 1.05, TY[0] + 0.4, PZ - 0.14), (RX + sx * 1.05, TY[-1] - 0.4, PZ - 0.14), 0.14, 0.26, PAINT, caps=True)
    for ya, yb in zip(TY, TY[1:]):
        mb.tube((RX + sx * 1.05, ya, PZ - 0.2), (RX + sx * 1.05, (ya + yb) / 2, PZ - 1.1), 0.04, PAINT, 3)
        mb.tube((RX + sx * 1.05, yb, PZ - 0.2), (RX + sx * 1.05, (ya + yb) / 2, PZ - 1.1), 0.04, PAINT, 3)
BIG = PZ + 0.42
# the gas main, with an expansion loop, from the holder to the power house
pipe([(GX - 4.9, GY + 3.25, 1.5), (GX - 5.6, GY + 3.7, 1.5), (GX - 5.6, GY + 3.7, BIG), (RX + 0.1, -8.2, BIG), (RX + 0.1, 9.0, BIG), (RX + 0.1, 9.0, BIG + 1.5), (RX + 0.1, 12.6, BIG + 1.5), (RX + 0.1, 12.6, BIG),
      (RX + 0.1, 21.0, BIG), (px0 + 0.2, 21.0, BIG)], 0.36, PAINTT, 7)
pipe([(RX - 0.75, 26.0, PZ + 0.2), (RX - 0.75, -6.5, PZ + 0.2)], 0.17, STEEL, 5)                       # steam
pipe([(6.1, 24.0, PZ + 0.2), (RX - 0.75, 24.0, PZ + 0.2)], 0.17, STEEL, 5)
pipe([(6.1, 2.0, PZ + 0.2), (RX - 0.75, 2.0, PZ + 0.2)], 0.17, STEEL, 5)
pipe([(px0 + 0.2, 16.5, PZ + 0.16), (RX + 0.85, 16.5, PZ + 0.16), (RX + 0.85, -6.5, PZ + 0.16), (RX + 0.85, -6.5, 0.4)], 0.13, STEEL, 5)   # water
# a second bridge from hall 2 over the lane to hall 3
BX = -19.0
trestle(BX, -7.0, along_y=False, z=5.9, w=1.6)
pipe([(BX - 0.4, -3.9, 6.2), (BX - 0.4, -10.1, 6.2)], 0.2, STEEL, 6)
pipe([(BX + 0.3, -3.9, 6.15), (BX + 0.3, -10.1, 6.15)], 0.13, PAINT, 5)
for sx in (-0.75, 0.75):
    mb.beam((BX + sx, -4.0, 5.85), (BX + sx, -10.0, 5.85), 0.12, 0.2, PAINT)
# coal elevator against the boiler house, fed from the heap
mb.box((ax1 + 0.05, 6.6, 0.02), (ax1 + 1.5, 8.2, 10.8), ROOFX, top=PAINT, drop='-z -x')
mb.beam((ax1 + 0.8, 7.4, 9.9), (ax1 - 0.6, 7.4, 8.8), 0.8, 0.8, PAINT, caps=True)
mb.box((ax1 + 1.5, 6.4, 0.02), (ax1 + 3.2, 8.4, 1.5), PAINT, drop='-z -x')
keep(mb, 'pipes')


# ---------------------------------------------------------------- rail siding, wagons, loading dock

TX = 40.3
RAILZ = 0.42
mb = MB()
ty0, ty1 = -37.5, 31.8
for a, b, z0, z1 in ((1.9, 1.45, 0.02, 0.26),):
    mb.poly([(TX - b, ty0, z1), (TX + b, ty0, z1), (TX + b, ty1, z1), (TX - b, ty1, z1)], BALLAST, (0, 0, 1))
    for sx in (-1, 1):
        mb.poly([(TX + sx * a, ty0, z0), (TX + sx * b, ty0, z1), (TX + sx * b, ty1, z1), (TX + sx * a, ty1, z0)], BALLAST, (sx, 0, 0.6))
    mb.poly([(TX - a, ty1, z0), (TX + a, ty1, z0), (TX + b, ty1, z1), (TX - b, ty1, z1)], BALLAST, (0, 1, 0.5))
    mb.poly([(TX - a, ty0, z0), (TX + a, ty0, z0), (TX + b, ty0, z1), (TX - b, ty0, z1)], BALLAST, (0, -1, 0.5))
for sx in (-1, 1):
    mb.beam((TX + sx * 0.75, ty0 + 0.2, RAILZ - 0.075), (TX + sx * 0.75, ty1 - 0.9, RAILZ - 0.075), 0.09, 0.15, STEEL, caps=True)
# buffer stop
by = ty1 - 1.2
for sx in (-1, 1):
    mb.beam((TX + sx * 0.75, by - 1.9, RAILZ), (TX + sx * 0.75, by, RAILZ + 1.1), 0.12, 0.16, STEEL)
    mb.beam((TX + sx * 0.75, by, RAILZ), (TX + sx * 0.75, by, RAILZ + 1.15), 0.12, 0.16, STEEL)
mb.box((TX - 1.3, by - 0.28, RAILZ + 0.75), (TX + 1.3, by + 0.05, RAILZ + 1.2), TIMBER)
keep(mb, 'track')
sl = MB()
sl.box((-1.3, -0.13, 0.0), (1.3, 0.13, 0.11), TIMBER, drop='-z -x +x')
S += copies(sl.obj('sleeper'), [((TX, ty0 + 0.5 + i * 1.05, 0.26), (0, 0, 0)) for i in range(int((ty1 - ty0 - 1.6) / 1.05))])


def wagon_base(m, L=7.6):
    for sx in (-1, 1):
        m.beam((sx * 1.0, -L / 2, 1.08), (sx * 1.0, L / 2, 1.08), 0.12, 0.3, STEEL)
        for wy in (-2.3, 2.3):
            m.tube((sx * 0.68, wy, 0.48), (sx * 0.82, wy, 0.48), 0.48, STEEL, 7, caps=True)
            m.box((sx * 1.0 - 0.05, wy - 0.35, 0.4), (sx * 1.0 + 0.05, wy + 0.35, 0.95), STEEL, drop='+z')
        for ey in (-1, 1):
            m.tube((sx * 0.9, ey * L / 2, 1.08), (sx * 0.9, ey * (L / 2 + 0.55), 1.08), 0.09, STEEL, 5, r2=0.24, caps=True)
    for ey in (-1, 1):
        m.box((-1.35, ey * L / 2 - 0.08, 0.92), (1.35, ey * L / 2 + 0.08, 1.24), STEEL)


def van():
    m = MB()
    wagon_base(m)
    m.box((-1.35, -3.8, 1.24), (1.35, 3.8, 3.4), PAINTW, drop='-z +z')
    arc = [(-1.42, 3.36), (-0.9, 3.66), (0.0, 3.78), (0.9, 3.66), (1.42, 3.36)]
    for (xa, za), (xb, zb) in zip(arc, arc[1:]):
        m.poly([(xa, -3.9, za), (xb, -3.9, zb), (xb, 3.9, zb), (xa, 3.9, za)], TARP, (xa + xb, 0, 2))
    for ey in (-1, 1):
        m.poly([(x, ey * 3.8, z) for x, z in arc], PAINTW, (0, ey, 0))
    for sx in (-1, 1):
        m.box((sx * 1.35 - 0.06, -0.95, 1.3), (sx * 1.35 + 0.06, 0.95, 3.25), PAINTW, drop='-z')
        m.beam((sx * 1.44, -2.0, 3.3), (sx * 1.44, 1.0, 3.3), 0.05, 0.08, STEEL)
        for y in (-3.74, 3.74):
            m.beam((sx * 1.38, y, 1.24), (sx * 1.38, y, 3.38), 0.08, 0.12, STEEL, up=(0, 1, 0))
    return m.obj('van')


def open_wagon():
    m = MB()
    wagon_base(m)
    lo, hi = V((-1.35, -3.8, 1.24)), V((1.35, 3.8, 2.75))
    m.box(lo, hi, PAINTW, drop='-z +z')
    t = 0.09
    for (a, b, n) in (((lo.x + t, lo.y + t), (lo.x + t, hi.y - t), (1, 0, 0)), ((hi.x - t, lo.y + t), (hi.x - t, hi.y - t), (-1, 0, 0)),
                      ((lo.x + t, lo.y + t), (hi.x - t, lo.y + t), (0, 1, 0)), ((lo.x + t, hi.y - t), (hi.x - t, hi.y - t), (0, -1, 0))):
        m.poly([(a[0], a[1], 2.1), (b[0], b[1], 2.1), (b[0], b[1], hi.z), (a[0], a[1], hi.z)], PAINTW, n)
    m.poly([(lo.x, lo.y, hi.z), (hi.x, lo.y, hi.z), (hi.x - t, lo.y + t, hi.z), (lo.x + t, lo.y + t, hi.z)], PAINTW, (0, 0, 1))
    m.poly([(lo.x, hi.y, hi.z), (hi.x, hi.y, hi.z), (hi.x - t, hi.y - t, hi.z), (lo.x + t, hi.y - t, hi.z)], PAINTW, (0, 0, 1))
    m.poly([(lo.x, lo.y, hi.z), (lo.x, hi.y, hi.z), (lo.x + t, hi.y - t, hi.z), (lo.x + t, lo.y + t, hi.z)], PAINTW, (0, 0, 1))
    m.poly([(hi.x, lo.y, hi.z), (hi.x, hi.y, hi.z), (hi.x - t, hi.y - t, hi.z), (hi.x - t, lo.y + t, hi.z)], PAINTW, (0, 0, 1))
    rnd = random.Random(5)
    nx, ny = 3, 7
    grid = [[V((lerp(lo.x + t, hi.x - t, i / nx), lerp(lo.y + t, hi.y - t, j / ny), 2.35 + (0.0 if i in (0, nx) or j in (0, ny) else 0.25 + 0.3 * rnd.random()))) for i in range(nx + 1)] for j in range(ny + 1)]
    for j in range(ny):
        for i in range(nx):
            m.poly([grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]], COAL, (0, 0, 1))
    for sx in (-1, 1):
        for y in (-3.74, -1.2, 1.2, 3.74):
            m.beam((sx * 1.38, y, 1.24), (sx * 1.38, y, 2.75), 0.08, 0.12, STEEL, up=(0, 1, 0))
    return m.obj('open-wagon', sharp=55)


def flat_wagon():
    m = MB()
    wagon_base(m)
    m.box((-1.4, -3.8, 1.24), (1.4, 3.8, 1.4), PAINTW, top=TIMBER, drop='-z')
    for sx in (-1, 1):
        for y in (-3.3, -1.1, 1.1, 3.3):
            m.beam((sx * 1.44, y, 1.24), (sx * 1.44, y, 2.0), 0.09, 0.09, STEEL, up=(0, 1, 0))
        m.box((sx * 1.3 - 0.22, -2.75, 1.4), (sx * 1.3 + 0.22, 2.75, 1.78), STEEL, drop='-z')           # tracks showing under the hem
    # the tank under its sheet: hull, turret and a lashed-down barrel, all softened by canvas
    half = [(1.56, 0.3), (1.6, 0.95), (1.12, 1.2), (1.0, 1.52), (0.0, 1.6)]
    stations = [(-2.95, 0.55, 1.0), (-2.3, 0.95, 1.0), (-1.0, 1.0, 1.0), (-0.6, 1.0, 1.42), (0.9, 1.0, 1.42), (1.3, 1.0, 1.0), (2.4, 1.0, 1.0), (2.95, 0.75, 1.0)]
    rings = []
    for y, sc, tur in stations:
        pts = [(x, 1.4 + (z - 0.3) * sc * (tur if j >= 3 else 1.0) + 0.3) for j, (x, z) in enumerate(half)]
        rings.append([V((-x, y, z)) for x, z in pts[:-1]] + [V((0, y, pts[-1][1]))] + [V((x, y, z)) for x, z in reversed(pts[:-1])])
    for a, b in zip(rings, rings[1:]):
        for i in range(len(a) - 1):
            c = (a[i] + a[i + 1] + b[i] + b[i + 1]) / 4
            m.poly([a[i], a[i + 1], b[i + 1], b[i]], TARP, (c.x, 0, c.z - 1.6))
    m.poly(rings[0], TARP, (0, -1, 0))
    m.poly(rings[-1], TARP, (0, 1, 0))
    m.tube((0.0, -0.5, 3.1), (0.0, -3.5, 2.55), 0.16, TARP, 5, r2=0.13, caps=True)
    for y in (-2.0, 0.2, 2.0):                          # lashings
        m.tube((-1.44, y, 1.5), (-1.05, y, 2.72 if abs(y) > 1 else 3.02), 0.025, STEEL, 3)
        m.tube((1.44, y, 1.5), (1.05, y, 2.72 if abs(y) > 1 else 3.02), 0.025, STEEL, 3)
    return m.obj('flat-wagon', sharp=55)


def loco():
    """A works shunter: a small four-wheeled tank engine, facing -y."""
    m = MB()
    m.box((-1.2, -3.2, 0.72), (1.2, 3.2, 1.1), STEEL)
    for sx in (-1, 1):
        for wy in (-1.35, 1.35):
            m.tube((sx * 0.66, wy, 0.6), (sx * 0.84, wy, 0.6), 0.6, STEEL, 8, caps=True)
        m.beam((sx * 0.98, -1.5, 0.5), (sx * 0.98, 1.5, 0.62), 0.07, 0.14, STEEL, shared=False)
        m.box((sx * 1.15 - 0.2, -3.0, 0.42), (sx * 1.15 + 0.2, -2.0, 1.0), PAINT)
        m.box((sx * 1.02 - 0.26, -2.1, 1.1), (sx * 1.02 + 0.26, 0.6, 2.35), PAINT, drop='-z')
        for ey in (-1, 1):
            m.tube((sx * 0.9, ey * 3.2, 0.95), (sx * 0.9, ey * 3.75, 0.95), 0.09, STEEL, 5, r2=0.24, caps=True)
        m.poly([(sx * 1.26, 0.9, 2.45), (sx * 1.26, 2.2, 2.45), (sx * 1.26, 2.2, 3.1), (sx * 1.26, 0.9, 3.1)], GLASS, (sx, 0, 0))
        m.poly([(sx * 0.35, 0.59, 2.6), (sx * 0.95, 0.59, 2.6), (sx * 0.95, 0.59, 3.05), (sx * 0.35, 0.59, 3.05)], GLASS, (0, -1, 0))
    m.tube((0, -3.05, 1.92), (0, 0.6, 1.92), 0.76, PAINT, 9, caps=True)
    m.tube((0, -3.12, 1.92), (0, -3.05, 1.92), 0.6, DARK, 9, caps=True)
    m.tube((0, -2.5, 2.6), (0, -2.5, 3.65), 0.2, DARK, 6, r2=0.27, caps=True)
    m.tube((0, -1.1, 2.6), (0, -1.1, 3.05), 0.34, PAINT, 6, r2=0.22, caps=True)
    m.box((-1.25, 0.6, 1.1), (1.25, 2.55, 3.3), PAINT, drop='-z +z')
    m.box((-1.38, 0.4, 3.3), (1.38, 2.75, 3.42), DARK)
    m.box((-1.2, 2.55, 1.1), (1.2, 3.2, 2.5), PAINT, top=COAL, drop='-z')
    return m.obj('loco', sharp=50)


S += copies(loco(), [((TX, 8.4, RAILZ), (0, 0, 0))])
S += copies(van(), [((TX, -26.0, RAILZ), (0, 0, 0)), ((TX, -16.6, RAILZ), (0, 0, 0))])
S += copies(open_wagon(), [((TX, -1.5, RAILZ), (0, 0, 0))])
S += copies(flat_wagon(), [((TX, 20.5, RAILZ), (0, 0, 0))])

# loading dock under a canopy
DX0, DX1, DY0, DY1, DZ = 32.0, 37.6, -31.0, -8.0, 1.3
mb = MB()
mb.box((DX0, DY0, 0.02), (DX1, DY1, DZ), CONC, drop='-z')
mb.box((DX0 - 0.12, DY0, DZ - 0.25), (DX0, DY1, DZ), TIMBER, drop='+x')                 # timber fender along the lorry side
ramp = [(DX0 + 0.6, DY1), (DX1 - 0.4, DY1), (DX1 - 0.4, DY1 + 6.0), (DX0 + 0.6, DY1 + 6.0)]
mb.poly([(ramp[0][0], ramp[0][1], DZ), (ramp[1][0], ramp[1][1], DZ), (ramp[2][0], ramp[2][1], 0.02), (ramp[3][0], ramp[3][1], 0.02)], CONC, (0, 0.2, 1))
for x in (ramp[0][0], ramp[1][0]):
    mb.poly([(x, DY1, 0.02), (x, DY1, DZ), (x, DY1 + 6.0, 0.02)], CONC, (-1 if x < 35 else 1, 0, 0))
CE, CR = 5.4, 6.5       # canopy eave and ridge
cxm = (DX0 + DX1 + 0.3) / 2
PY = [DY0 + 0.6 + i * (DY1 - DY0 - 1.2) / 5 for i in range(6)]
for y in PY:
    for x in (DX0 + 0.5, DX1 - 0.4):
        mb.beam((x, y, DZ), (x, y, CE), 0.2, 0.2, PAINT)
    mb.beam((DX0 - 0.9, y, CE), (DX1 + 1.2, y, CE), 0.14, 0.22, PAINT, caps=True)
    mb.beam((DX0 - 0.9, y, CE + 0.08), (cxm, y, CR - 0.06), 0.12, 0.16, PAINT)
    mb.beam((DX1 + 1.2, y, CE + 0.08), (cxm, y, CR - 0.06), 0.12, 0.16, PAINT)
    mb.beam((cxm, y, CE + 0.1), (cxm, y, CR - 0.1), 0.1, 0.1, PAINT)
for xa, fx in ((DX0 - 1.1, -1), (DX1 + 1.4, 1)):
    mb.poly([(xa, DY0 - 0.5, CE + 0.05), (cxm, DY0 - 0.5, CR + 0.08), (cxm, DY1 + 0.5, CR + 0.08), (xa, DY1 + 0.5, CE + 0.05)], ROOF, (fx * 0.3, 0, 1))
    mb.poly([(xa, DY0 - 0.5, CE - 0.02), (cxm, DY0 - 0.5, CR + 0.01), (cxm, DY1 + 0.5, CR + 0.01), (xa, DY1 + 0.5, CE - 0.02)], ROOF, (-fx * 0.3, 0, -1))
    mb.poly([(xa, DY0 - 0.5, CE - 0.3), (xa, DY1 + 0.5, CE - 0.3), (xa, DY1 + 0.5, CE + 0.05), (xa, DY0 - 0.5, CE + 0.05)], TIMBER, (fx, 0, 0))
    mb.poly([(xa + 0.02 * fx, DY0 - 0.5, CE - 0.3), (xa + 0.02 * fx, DY1 + 0.5, CE - 0.3), (xa + 0.02 * fx, DY1 + 0.5, CE + 0.05), (xa + 0.02 * fx, DY0 - 0.5, CE + 0.05)], TIMBER, (-fx, 0, 0))
mb.tube((cxm, DY0 - 0.55, CR + 0.1), (cxm, DY1 + 0.55, CR + 0.1), 0.1, STEEL, 4)
for i in range(4):
    mb.box((DX0 + 1.0, DY0 - 0.35 * (i + 1), 0.02), (DX0 + 2.6, DY0 - 0.35 * i, DZ - 0.3 * (i + 1) + 0.02), CONC, drop='-z +y')
keep(mb, 'dock')
rnd = random.Random(11)
CR8, DRUMS = [], []
for i in range(16):
    x, y = DX0 + 1.5 + rnd.random() * 3.0, DY0 + 1.5 + rnd.random() * 20.0
    if i % 4 == 3 and CR8:
        px_, py_, _ = CR8[-1][0]
        CR8.append(((px_ + 0.1, py_ - 0.05, DZ + 1.0), (0, 0, rnd.uniform(-20, 20))))
    else:
        CR8.append(((x, y, DZ), (0, 0, rnd.uniform(-12, 12))))
for (x, y) in ((29.0, -5.0), (27.6, -4.2), (7.4, -12.5), (-3.0, 8.0)):
    CR8.append(((x, y, 0.02), (0, 0, rnd.uniform(0, 90))))
crate = MB()
crate.box((-0.6, -0.5, 0.0), (0.6, 0.5, 1.0), CRATE, drop='-z')
for z in (0.12, 0.88):
    crate.beam((-0.63, -0.53, z), (0.63, -0.53, z), 0.05, 0.12, CRATE)
    crate.beam((-0.63, 0.53, z), (0.63, 0.53, z), 0.05, 0.12, CRATE)
S += copies(crate.obj('crate'), CR8)
for j in range(3):
    for i in range(4):
        DRUMS.append(((DX0 + 0.9 + i * 0.72, DY1 - 1.2 - j * 0.72, DZ), (0, 0, 0)))
for i in range(5):
    DRUMS.append(((9.6 + i * 0.75, -20.2, 0.02), (0, 0, 0)))
    DRUMS.append(((9.95 + i * 0.75, -19.5, 0.02), (0, 0, 0)))
DRUMS += [((31.0, 11.2, 0.02), (0, 0, 0)), ((31.6, 10.7, 0.02), (0, 0, 0)), ((-5.2, -9.6, 0.02), (0, 0, 0)), ((-4.5, -9.4, 0.02), (0, 0, 0))]
drum = revolve('drum', [(0.3, 0.0), (0.3, 0.9), (0.27, 0.9), (0.26, 0.86), (0.0, 0.86)], 7, mat=DRUM)
weld(drum, 1e-3)
S += copies(hard(drum, 0.0, sharp=35), DRUMS)


def lorry():
    """A three-ton lorry with a canvas tilt, facing -y."""
    parts = []
    m = MB()
    for sx in (-1, 1):
        m.beam((sx * 0.42, -2.9, 0.78), (sx * 0.42, 3.1, 0.78), 0.1, 0.2, STEEL)
        m.tube((sx * 0.78, -2.05, 0.46), (sx * 1.04, -2.05, 0.46), 0.46, RUBBER, 8, caps=True)
        m.tube((sx * 0.62, 1.85, 0.46), (sx * 1.08, 1.85, 0.46), 0.46, RUBBER, 8, caps=True)
        m.box((sx * 0.92 - 0.2, -2.7, 0.9), (sx * 0.92 + 0.2, -1.4, 1.02), PAINT)                 # mudguard
        m.box((sx * 0.72 - 0.11, -3.2, 1.05), (sx * 0.72 + 0.11, -3.12, 1.3), GLASS, drop='+y')    # headlamps
    m.box((-1.0, -3.2, 0.62), (1.0, -3.08, 0.8), STEEL)                                           # bumper
    m.poly([(-0.42, -3.07, 0.95), (0.42, -3.07, 0.95), (0.42, -3.07, 1.68), (-0.42, -3.07, 1.68)], DARK, (0, -1, 0))   # radiator
    m.poly([(-0.72, -1.84, 1.78), (0.72, -1.84, 1.78), (0.68, -1.72, 2.26), (-0.68, -1.72, 2.26)], GLASS, (0, -1, 0.2))
    for sx in (-1, 1):
        m.poly([(sx * 0.93, -1.6, 1.75), (sx * 0.93, -0.75, 1.75), (sx * 0.93, -0.75, 2.22), (sx * 0.93, -1.5, 2.22)], GLASS, (sx, 0, 0))
    m.box((-1.1, -0.42, 1.0), (1.1, 3.25, 1.16), PAINT, top=TIMBER)
    m.box((-1.1, -0.42, 1.16), (1.1, 3.25, 1.6), PAINT, drop='-z +z')
    tilt = [(-1.12, 1.6), (-1.12, 2.45), (-0.7, 2.85), (0.7, 2.85), (1.12, 2.45), (1.12, 1.6)]
    for (xa, za), (xb, zb) in zip(tilt, tilt[1:]):
        m.poly([(xa, -0.44, za), (xb, -0.44, zb), (xb, 3.27, zb), (xa, 3.27, za)], TARP, (xa + xb, 0, za + zb - 4.2))
    m.poly([(x, -0.44, z) for x, z in tilt], TARP, (0, -1, 0))
    m.poly([(x, 3.27, z) for x, z in tilt[1:-1]], TARP, (0, 1, 0))
    m.poly([(-1.12, 3.27, 1.6), (1.12, 3.27, 1.6), (1.12, 3.27, 2.45), (-1.12, 3.27, 2.45)], DARK, (0, 1, 0))
    parts.append(m.obj('lorry-bits', sharp=45))
    parts.append(hard(prism('bonnet', [(-3.08, 0.9), (-3.08, 1.62), (-1.85, 1.74), (-1.85, 0.9)], -0.6, 0.6, PAINT), 0.05))
    parts.append(hard(prism('cab', [(-1.85, 0.86), (-1.85, 1.76), (-1.7, 2.34), (-0.5, 2.34), (-0.5, 0.86)], -0.92, 0.92, PAINT), 0.06))
    return join('lorry', parts)


S += copies(lorry(), [((29.9, -23.5, 0.02), (0, 0, 0)), ((30.1, -12.6, 0.02), (0, 0, 180))])


# ---------------------------------------------------------------- gantry crane and stockyard

GA, GB, GY0, GY1, GZ_ = 31.7, 43.3, 13.0, 31.4, 9.4
mb = MB()
for x in (GA, GB):
    for y in (GY0 + 0.4, (GY0 + GY1) / 2, GY1 - 0.4):
        mb.beam((x, y, 0.02), (x, y, GZ_), 0.36, 0.36, PAINT)
        mb.box((x - 0.5, y - 0.5, 0.02), (x + 0.5, y + 0.5, 0.35), CONC, drop='-z')
        for f in (-1, 1):
            if GY0 < y + f * 2.2 < GY1:
                mb.beam((x, y + f * 2.2, GZ_ - 0.4), (x, y, GZ_ - 2.6), 0.16, 0.16, PAINT)
    mb.beam((x, GY0 - 0.3, GZ_ + 0.3), (x, GY1 + 0.3, GZ_ + 0.3), 0.4, 0.75, PAINT, caps=True)
    mb.beam((x, GY0 - 0.2, GZ_ + 0.72), (x, GY1 + 0.2, GZ_ + 0.72), 0.1, 0.1, STEEL)
    ya, yb = GY0 + 0.4, (GY0 + GY1) / 2
    mb.tube((x, ya, 0.4), (x, yb, GZ_ - 0.6), 0.05, PAINT, 3)
    mb.tube((x, yb, 0.4), (x, ya, GZ_ - 0.6), 0.05, PAINT, 3)
CYB = 21.5         # where the bridge stands
for dy in (-1.1, 1.1):
    mb.beam((GA - 0.5, CYB + dy, GZ_ + 1.45), (GB + 0.5, CYB + dy, GZ_ + 1.45), 0.34, 1.1, PAINT, caps=True)
for x in (GA, GB):
    mb.box((x - 0.4, CYB - 2.0, GZ_ + 0.78), (x + 0.4, CYB + 2.0, GZ_ + 1.3), PAINT)
crail = Rails(PAINT, h=1.0, gap=2.9, t=0.06)
mb.box((GA, CYB - 2.1, GZ_ + 1.95), (GB, CYB - 1.3, GZ_ + 2.02), STEEL)
crail.run(mb, [(GA, CYB - 2.05, GZ_ + 2.02), (GB, CYB - 2.05, GZ_ + 2.02)])
TRX = 37.2
mb.box((TRX - 1.1, CYB - 1.35, GZ_ + 2.0), (TRX + 1.1, CYB + 1.35, GZ_ + 2.7), PAINT)
mb.tube((TRX - 0.7, CYB, GZ_ + 2.95), (TRX + 0.7, CYB, GZ_ + 2.95), 0.4, STEEL, 7, caps=True)
for dx in (-0.25, 0.25):
    mb.tube((TRX + dx, CYB, GZ_ + 2.6), (TRX + dx, CYB, 5.2), 0.03, STEEL, 3)
mb.box((TRX - 0.4, CYB - 0.2, 4.5), (TRX + 0.4, CYB + 0.2, 5.2), STEEL)
mb.tube((TRX, CYB, 4.5), (TRX, CYB, 3.9), 0.07, STEEL, 4)
mb.box((GA + 0.5, CYB + 1.3, GZ_ - 1.4), (GA + 2.4, CYB + 3.0, GZ_ + 0.9), PAINT)             # driver's cab
mb.box((GA + 0.45, CYB + 1.5, GZ_ - 0.3), (GA + 2.45, CYB + 3.05, GZ_ + 0.5), GLASS, drop='-y')
keep(mb, 'gantry')
S += crail.build()
# steel stock: joists, plate and bar on timber bearers
ib = MB()
prof = [(-0.15, 0), (0.15, 0), (0.15, 0.05), (0.03, 0.05), (0.03, 0.31), (0.15, 0.31), (0.15, 0.36), (-0.15, 0.36), (-0.15, 0.31), (-0.03, 0.31), (-0.03, 0.05), (-0.15, 0.05)]
for (xa, za), (xb, zb) in zip(prof, prof[1:] + prof[:1]):
    if abs(xa - xb) > 0.2 or abs(za - zb) > 0.2:
        ib.poly([(xa, -4.5, za), (xb, -4.5, zb), (xb, 4.5, zb), (xa, 4.5, za)], STEEL, (xa + xb, 0, za + zb - 0.36))
for ey in (-1, 1):
    ib.poly([(-0.15, ey * 4.5, 0), (0.15, ey * 4.5, 0), (0.15, ey * 4.5, 0.36), (-0.15, ey * 4.5, 0.36)], STEEL, (0, ey, 0))
JO = []
for row in range(3):
    for i in range(5 - row):
        JO.append(((33.0 + i * 0.36 + row * 0.18, 18.8, 0.3 + row * 0.37), (0, 0, 0)))
for i in range(4):
    JO.append(((35.6 + i * 0.37, 26.0, 0.3), (0, 0, 2)))
S += copies(ib.obj('joist'), JO)
mb = MB()
for y in (15.5, 18.8, 22.0, 24.0, 26.2, 28.5):
    mb.box((32.6, y - 0.12, 0.02), (37.6, y + 0.12, 0.3), TIMBER, drop='-z')
for i in range(4):
    mb.box((35.4 + 0.03 * i, 14.6 + 0.05 * i, 0.3 + i * 0.09), (37.5 + 0.03 * i, 20.8 - 0.04 * i, 0.38 + i * 0.09), STEEL, drop='-z')       # plate
for i in range(6):
    mb.tube((32.9 + i * 0.3, 23.9, 0.44), (32.9 + i * 0.3, 30.2, 0.44), 0.14, STEEL, 6, caps=True)                                        # round bar
for i in range(5):
    mb.tube((33.05 + i * 0.3, 24.1, 0.7), (33.05 + i * 0.3, 30.0, 0.7), 0.14, STEEL, 6, caps=True)
# the load on the hook: a bundle of joists
mb.box((TRX - 0.45, CYB - 3.5, 3.4), (TRX + 0.45, CYB + 3.5, 3.9), STEEL)
keep(mb, 'stock')


def mound(mb, cx, cy, rx, ry, h, mat, seed, rings=4, segs=12):
    rnd = random.Random(seed)
    rows = []
    for i in range(1, rings + 1):
        f = i / rings
        row = []
        for j in range(segs):
            a = 2 * math.pi * (j + 0.5 * (i % 2)) / segs
            k = 1 + (rnd.random() - 0.5) * 0.28
            z = 0.02 if i == rings else h * (1 - f ** 1.35) * (0.82 + 0.36 * rnd.random())
            row.append(V((cx + rx * f * k * math.cos(a), cy + ry * f * k * math.sin(a), z)))
        rows.append(row)
    top = V((cx + 0.2, cy - 0.1, h))
    for j in range(segs):
        mb.poly([top, rows[0][j], rows[0][(j + 1) % segs]], mat, (0, 0, 1))
    for a, b in zip(rows, rows[1:]):
        for j in range(segs):
            k = (j + 1) % segs
            mb.poly([a[j], b[j], b[k]], mat, (0, 0, 1))
            mb.poly([a[j], b[k], a[k]], mat, (0, 0, 1))


mb = MB()
mound(mb, 34.6, 7.4, 3.3, 3.2, 2.9, COAL, 3)
mound(mb, 35.6, 3.2, 2.2, 2.4, 1.7, COAL, 4, rings=3, segs=10)
mound(mb, 34.4, -2.6, 2.9, 2.8, 2.3, ORE, 7)
mound(mb, -43.0, 20.0, 1.3, 3.0, 1.2, COAL, 9, rings=3, segs=8)
keep(mb, 'heaps', sharp=70)


# ---------------------------------------------------------------- perimeter wall, gate, gatehouse, lamps

WX0, WX1, WY0, WY1, WH = -44.8, 44.8, -34.8, 34.8, 2.9
mb = MB()
PIERS = []


def wall_run(a, b, every=6.4):
    a, b = V((*a, 0)), V((*b, 0))
    d = (b - a).normalized()
    n = V((d.y, -d.x, 0)) * 0.2
    for f in (1, -1):
        mb.poly([a + n * f + V((0, 0, 0.02)), b + n * f + V((0, 0, 0.02)), b + n * f + V((0, 0, WH)), a + n * f + V((0, 0, WH))], BRICK, n * f)
    c = n * 1.4
    mb.poly([a + c + V((0, 0, WH)), b + c + V((0, 0, WH)), b + V((0, 0, WH + 0.16)), a + V((0, 0, WH + 0.16))], CONC, V((n.x, n.y, 0.3)))
    mb.poly([a - c + V((0, 0, WH)), b - c + V((0, 0, WH)), b + V((0, 0, WH + 0.16)), a + V((0, 0, WH + 0.16))], CONC, V((-n.x, -n.y, 0.3)))
    k = max(1, round((b - a).length / every))
    for i in range(k + 1):
        PIERS.append((tuple(a.lerp(b, i / k)), (0, 0, 0)))


GATE = (-4.2, 4.2)
RGATE = (TX - 2.6, TX + 2.6)
wall_run((WX0, WY0), (GATE[0] - 0.6, WY0))
wall_run((GATE[1] + 0.6, WY0), (RGATE[0], WY0))
wall_run((RGATE[1], WY0), (WX1, WY0), every=3)
wall_run((WX1, WY0), (WX1, WY1))
wall_run((WX1, WY1), (WX0, WY1))
wall_run((WX0, WY1), (WX0, WY0))
pier = MB()
pier.box((-0.42, -0.42, 0.02), (0.42, 0.42, WH + 0.3), BRICK, drop='-z +z')
pier.poly([(-0.5, -0.5, WH + 0.3), (0.5, -0.5, WH + 0.3), (0.5, 0.5, WH + 0.3), (-0.5, 0.5, WH + 0.3)], CONC, (0, 0, 1))
seen = set()
PIERS = [p for p in PIERS if not (p[0] in seen or seen.add(p[0]))]
S += copies(pier.obj('pier'), PIERS)
# the main gate: tall brick pillars, an iron overthrow, the leaves standing open
for gx in GATE:
    x = gx + (0.0 if gx > 0 else 0.0)
    mb.box((x - 0.7, WY0 - 0.7, 0.02), (x + 0.7, WY0 + 0.7, 4.6), BRICK, drop='-z +z')
    mb.box((x - 0.82, WY0 - 0.82, 4.6), (x + 0.82, WY0 + 0.82, 4.95), CONC)
    mb.box((x - 0.5, WY0 - 0.5, 4.95), (x + 0.5, WY0 + 0.5, 5.3), CONC, drop='-z')
    mb.box((x - 0.8, WY0 - 0.8, 0.02), (x + 0.8, WY0 + 0.8, 0.7), CONC, drop='-z')
arc = [(lerp(GATE[0] + 0.6, GATE[1] - 0.6, i / 8), 5.1 + 1.25 * math.sin(math.pi * i / 8)) for i in range(9)]
for (xa, za), (xb, zb) in zip(arc, arc[1:]):
    mb.beam((xa, WY0, za), (xb, WY0, zb), 0.2, 0.2, PAINT, shared=True)
    mb.beam((xa, WY0, za - 0.8), (xb, WY0, zb - 0.8), 0.16, 0.16, PAINT)
for xa, za in arc[1:-1]:
    mb.beam((xa, WY0, za - 0.8), (xa, WY0, za), 0.09, 0.09, PAINT)
mb.box((-2.4, WY0 - 0.06, 5.55), (2.4, WY0 + 0.06, 6.1), PAINT)            # the name board, left blank
leaf = MB()
for z in (0.25, 1.9, 3.5):
    leaf.beam((0.0, 0, z), (3.5, 0, z), 0.09, 0.12, PAINT)
for x in (0.05, 3.45):
    leaf.beam((x, 0, 0.1), (x, 0, 3.7), 0.12, 0.09, PAINT, caps=True)
for i in range(1, 9):
    leaf.tube((3.5 * i / 9, 0, 0.25), (3.5 * i / 9, 0, 3.75), 0.03, PAINT, 3)
leaf.tube((0.1, 0, 0.3), (3.4, 0, 1.85), 0.03, PAINT, 3)
leaf.poly([(0.1, -0.04, 0.3), (3.4, -0.04, 0.3), (3.4, -0.04, 1.2), (0.1, -0.04, 1.2)], PAINT, (0, -1, 0))
leaf.poly([(0.1, 0.04, 0.3), (3.4, 0.04, 0.3), (3.4, 0.04, 1.2), (0.1, 0.04, 1.2)], PAINT, (0, 1, 0))
S += copies(leaf.obj('gate-leaf'), [((GATE[0] + 0.72, WY0 + 0.1, 0.05), (0, 0, 72)), ((GATE[1] - 0.72, WY0 + 0.1, 0.05), (0, 0, 108)),
                                    ((RGATE[0] + 0.1, WY0, 0.05), (0, 0, 80)), ((RGATE[1] - 0.1, WY0, 0.05), (0, 0, 100))])
# gatehouse
hx0, hx1, hy0, hy1 = 5.0, 8.4, -33.6, -29.2
hd = sides(hx0, hx1, hy0, hy1)
for k in 'snew':
    mb.wall(hd[k].o, hd[k].ud, hd[k].n, (0, hd[k].len), (0, 3.1), (), BRICK)
    band(mb, hd[k], 0.0, 0.5, 0.07, CONC)
hm = (hy0 + hy1) / 2
for xx, f in ((hx0, -1), (hx1, 1)):
    mb.poly([(xx, hy0, 3.1), (xx, hm, 4.3), (xx, hy1, 3.1)], BRICK, (f, 0, 0))
for ya, f in ((hy0 - 0.4, -1), (hy1 + 0.4, 1)):
    mb.poly([(hx0 - 0.4, ya, 2.95), (hx1 + 0.4, ya, 2.95), (hx1 + 0.4, hm, 4.42), (hx0 - 0.4, hm, 4.42)], ROOFX, (0, f * 0.4, 1))
    mb.poly([(hx0 - 0.4, ya, 2.88), (hx1 + 0.4, ya, 2.88), (hx1 + 0.4, hm, 4.35), (hx0 - 0.4, hm, 4.35)], TIMBER, (0, -f * 0.4, -1))
mb.box((hx0 + 0.6, hy1 - 1.2, 3.6), (hx0 + 1.2, hy1 - 0.6, 5.0), BRICK, top=CONC, drop='-z')
SMALL += [hd['w'].at(1.3, 1.0), hd['w'].at(3.2, 1.0), hd['s'].at(1.7, 1.0), hd['e'].at(2.2, 1.0)]
PDOOR.append(hd['n'].at(1.7, 0.02))
# the barrier across the gateway
mb.beam((4.4, WY0 + 2.2, 0.02), (4.4, WY0 + 2.2, 1.2), 0.2, 0.2, PAINT, caps=True)
mb.beam((4.9, WY0 + 2.2, 1.1), (-3.6, WY0 + 2.2, 1.9), 0.1, 0.1, FRAME, caps=True)
mb.box((4.6, WY0 + 2.05, 0.8), (5.3, WY0 + 2.35, 1.3), STEEL)
keep(mb, 'walls')

lamp = MB()
lamp.tube((0, 0, 0), (0, 0, 6.6), 0.1, PAINT, 5, r2=0.06)
lamp.tube((0, 0, 6.5), (0, -0.7, 7.1), 0.04, PAINT, 3)
lamp.tube((0, -0.7, 7.1), (0, -1.5, 7.05), 0.04, PAINT, 3)
lamp.tube((0, -1.5, 7.08), (0, -1.5, 6.85), 0.07, PAINT, 6, r2=0.38)
lamp.poly([(0.3 * math.cos(i * math.pi / 3), -1.5 + 0.3 * math.sin(i * math.pi / 3), 6.86) for i in range(6)], FRAME, (0, 0, -1))
lamp.box((-0.16, -0.16, 0.0), (0.16, 0.16, 0.9), PAINT, drop='-z')
LAMPS = [((-5.4, -30.5, 0.02), (0, 0, -90)), ((-5.4, -8.0, 0.02), (0, 0, -90)), ((8.9, -19.0, 0.02), (0, 0, 90)), ((27.8, -18.0, 0.02), (0, 0, -90)), ((27.5, -33.0, 0.02), (0, 0, 180)),
         ((-25.0, -7.0, 0.02), (0, 0, 0)), ((-37.5, -7.0, 0.02), (0, 0, 0)), ((-42.6, 5.0, 0.02), (0, 0, -90)), ((-42.6, 24.0, 0.02), (0, 0, -90)), ((-15.0, 32.5, 0.02), (0, 0, 0)),
         ((31.0, -2.0, 0.02), (0, 0, -90)), ((38.2, 11.8, 0.02), (0, 0, 180)), ((-20.0, -31.5, 0.02), (0, 0, 180))]
S += copies(lamp.obj('lamp', sharp=50), LAMPS)

# roof ventilators, windows, doors, glazing: one mesh each, stamped everywhere
vent = revolve('vent', [(0.34, 0.0), (0.34, 0.8), (0.62, 0.95), (0.62, 1.15), (0.0, 1.42)], 6, mat=PAINT)
weld(vent, 1e-3)
S += copies(hard(vent, 0.0, sharp=35), VENTS)
S += copies(window_unit(2.9, 4.6, 3, 5), WIN)
S += copies(window_unit(2.5, 6.4, 2, 6, arch=True, name='arched-window'), ARCH)
S += copies(window_unit(1.3, 1.7, 1, 2, name='small-window'), SMALL)
S += copies(door_unit(), PDOOR)
S += copies(glazing_unit(), GLAZE)

# what the shared strut patches look like is settled by these strips high on the power house's north wall
S.append(shared_tail(pd['n'].p(0.9, 11.05), pd['n'].ud, pd['n'].n, only=[PAINT, PAINTT, PAINTW, STEEL, CONC, BRICK, FRAME, TIMBER], step=0.34))
hull = join('hull', S)
tag(hull, 'none')
vx, vy, vz = VENTS[5][0]
marker('smoke.4', (vx, vy, vz + 1.6))
for o in bpy.context.scene.objects:
    if o.type == 'EMPTY':
        parent(o, hull)

if os.environ.get('AXM_UVTEST'):      # how well does it unwrap? (no bake)
    weight_all()
    even_unwrap(baked_meshes(), 0.003)
    sys.exit(0)

VIEWS = ((-38, 24, 0.8), (142, 30, 0.8), (-72, 9, 0.74), (-22, 13, 0.42))
finish('factory', size=int(os.environ.get('AXM_SIZE', 4096)), views=VIEWS)
if os.environ.get('AXM_SHOTS'):
    shots('factory', [
        ((-30, -75, 16), (0, -20, 5), 40),          # gate and court from the street
        ((70, -45, 22), (30, -10, 4), 45),          # dock, siding, lorries
        ((75, 60, 30), (28, 12, 7), 45),            # gantry, power house, chimneys
        ((0, -5, 160), (0, 0, 0), 40),              # straight down
        ((-70, 0, 14), (-25, 0, 6), 45),            # halls from the west
        ((2, -32, 9), (20, -8, 7), 30),             # tanks, holder, chimneys from inside the court
    ])
