# The battle models are built here, from code, in Blender. Run a unit file headless:
#
#   blender -b --factory-startup --python tools/axis-models/tank.py
#
# Every unit file builds its parts with the helpers below, gives the moving parts a pivot and an
# animation tag, and calls finish(). That unwraps everything onto one atlas, bakes the painted,
# worn surface to textures, renders a preview and writes build/<name>/ for pack.mjs to ship.
#
# Conventions the battle stage relies on:
#   - metres, z up, the unit faces -y (so it faces +z once exported)
#   - the ground (or waterline) is z = 0
#   - an object's origin is its pivot; custom property "anim" says how it moves
#   - empties named "muzzle*", "exhaust*", "smoke*" mark where effects come from
import bpy, bmesh, math, os, sys, json, time
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, 'build')
R = math.radians


# ---------------------------------------------------------------- scene

def reset(samples=24):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception as e:  # no GPU: the CPU still bakes, slowly
        print('gpu unavailable:', e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    return sc


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------- meshes

def mesh_obj(name, verts, faces, mat=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    return ob


def _bm_obj(name, bm, mat=None):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    return ob


def xform(ob, at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Bake a transform into the mesh data; the object stays at the origin."""
    m = Matrix.Translation(Vector(at)) @ Euler([R(a) for a in rot], 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    ob.data.transform(m)
    if m.determinant() < 0:
        ob.data.flip_normals()
    ob.data.update()
    return ob


def box(name, sx, sy, sz, at=(0, 0, 0), rot=(0, 0, 0), mat=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    ob = _bm_obj(name, bm, mat)
    return xform(ob, at, rot, (sx, sy, sz))


def cyl(name, r, depth, at=(0, 0, 0), rot=(0, 0, 0), segs=20, r2=None, mat=None, caps=True):
    """A cylinder along z before rot. rot=(0,90,0) lays it along x, rot=(90,0,0) along y."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    ob = _bm_obj(name, bm, mat)
    return xform(ob, at, rot)


def sphere(name, r, at=(0, 0, 0), scale=(1, 1, 1), segs=16, rings=10, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    ob = _bm_obj(name, bm, mat)
    return xform(ob, at, (0, 0, 0), scale)


def loft(name, rings, cap_start=True, cap_end=True, mat=None, close=True):
    """Skin a list of rings (each a list of points, all the same length) into a tube."""
    n = len(rings[0])
    verts = [p for ring in rings for p in ring]
    faces = []
    for i in range(len(rings) - 1):
        a, b = i * n, (i + 1) * n
        for j in range(n if close else n - 1):
            k = (j + 1) % n
            faces.append((a + j, a + k, b + k, b + j))
    if cap_start:
        faces.append(tuple(reversed(range(n))))
    if cap_end:
        faces.append(tuple(range((len(rings) - 1) * n, len(rings) * n)))
    ob = mesh_obj(name, verts, faces, mat)
    fix_normals(ob)
    return ob


def prism(name, outline_yz, x0, x1, mat=None):
    """A side profile (y, z points, in order) pushed across x from x0 to x1."""
    return loft(name, [[(x0, y, z) for y, z in outline_yz], [(x1, y, z) for y, z in outline_yz]], mat=mat)


def lathe(name, profile, segs=20, at=(0, 0, 0), rot=(0, 0, 0), mat=None):
    """Spin a profile of (radius, height) points about z. A radius of 0 at either end closes it."""
    rings = []
    for r, h in profile:
        rr = max(r, 1e-4)
        rings.append([(rr * math.cos(2 * math.pi * i / segs), rr * math.sin(2 * math.pi * i / segs), h) for i in range(segs)])
    ob = loft(name, rings, cap_start=profile[0][0] > 1e-3, cap_end=profile[-1][0] > 1e-3, mat=mat)
    weld(ob, 1e-4)
    return xform(ob, at, rot)


def superellipse(a, b, n=4.0, segs=24, at=(0, 0, 0), plane='xy'):
    """A rounded-rectangle ring. plane picks which two axes it lies in; at is its centre."""
    pts = []
    for i in range(segs):
        t = 2 * math.pi * i / segs
        c, s = math.cos(t), math.sin(t)
        u = a * math.copysign(abs(c) ** (2 / n), c)
        v = b * math.copysign(abs(s) ** (2 / n), s)
        if plane == 'xy':
            pts.append((at[0] + u, at[1] + v, at[2]))
        elif plane == 'xz':
            pts.append((at[0] + u, at[1], at[2] + v))
        else:
            pts.append((at[0], at[1] + u, at[2] + v))
    return pts


def fix_normals(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def weld(ob, dist=1e-4):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def bevel(ob, width=0.012, segs=1, angle=28):
    """Chamfer every hard edge. This is what catches the light and stops things looking like boxes."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > R(angle)]
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=width, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def shade(ob, angle=40):
    """Smooth shading with hard edges kept above the angle, then face-weighted normals."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0.0) > R(angle))
    bm.to_mesh(me)
    bm.free()
    me.update()
    return ob


def weighted_normals(ob):
    mod = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    mod.weight = 100
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def hard(ob, width=0.012, angle=28, sharp=50):
    """The usual finish for a machined or plated part: chamfer the hard edges, then smooth.
    finish() weights the normals of every mesh at the end, so joined parts keep the look."""
    if width > 0:
        bevel(ob, width, 1, angle)
    return shade(ob, sharp)


def weight_all():
    """Face-weighted normals on every mesh, shared meshes included."""
    done = {}
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            continue
        if o.data in done:
            o.data = done[o.data]
            continue
        src = o.data
        me = src.copy()
        tmp = link(bpy.data.objects.new('_wn', me))
        weighted_normals(tmp)
        bpy.data.objects.remove(tmp)
        me.name = src.name
        done[src] = me
        o.data = me


def soft(ob, angle=60):
    """The usual finish for a cast or rounded part."""
    return shade(ob, angle)


def set_mat(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return ob


def join(name, obs):
    """Merge objects into one mesh, keeping each one's materials."""
    obs = [o for o in obs if o is not None]
    bm = bmesh.new()
    mats = []
    for o in obs:
        remap = {}
        for i, m in enumerate(o.data.materials):
            if m not in mats:
                mats.append(m)
            remap[i] = mats.index(m)
        tmp = o.data.copy()
        tmp.transform(o.matrix_world)
        start = len(bm.faces)
        bm.from_mesh(tmp)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[start:]:
            f.material_index = remap.get(f.material_index, 0)
        bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for o in obs:
        data = o.data
        bpy.data.objects.remove(o)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    return link(bpy.data.objects.new(name, me))


def mirror_x(ob, name=None):
    """A mirrored copy across x = 0 (new mesh data)."""
    me = ob.data.copy()
    me.transform(Matrix.Diagonal((-1, 1, 1, 1)))
    me.flip_normals()
    return link(bpy.data.objects.new(name or ob.name + '.R', me))


def both(ob):
    """The object and its mirror, joined."""
    name = ob.name
    return join(name, [ob, mirror_x(ob)])


def instance(ob, name, at=(0, 0, 0), rot=(0, 0, 0)):
    """Another object drawing the same mesh: the battle stage draws all of them in one call."""
    o = link(bpy.data.objects.new(name, ob.data))
    o.location = at
    o.rotation_euler = [R(a) for a in rot]
    for k in ob.keys():
        o[k] = ob[k]
    return o


_PARKED = 0


def unwrap_now(ob):
    """Unwrap this object by itself and pin the result. Copies made afterwards share its piece of the
    atlas, so forty identical bolts cost the texture space of one."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=R(60), island_margin=0.02, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    keep = me.attributes.get('keep_uv') or me.attributes.new('keep_uv', 'INT', 'FACE')
    keep.data.foreach_set('value', [1] * len(me.polygons))
    # park it well away from everything else until the final pack, so nothing lands on top of it
    global _PARKED
    _PARKED += 1
    uv = me.uv_layers.active.data
    vals = [0.0] * (len(uv) * 2)
    uv.foreach_get('uv', vals)
    for i in range(0, len(vals), 2):
        vals[i] += 4.0 * _PARKED
    uv.foreach_set('uv', vals)
    return ob


def copies(proto, places, name=None):
    """Stamp a finished part (bevelled, shaded) at each (at, rot) and return the copies. The prototype
    is built at the origin and is used up. All copies share one piece of the atlas."""
    unwrap_now(proto)
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


def pivot(ob, at):
    """Move the object's origin to a point without moving the mesh."""
    at = Vector(at)
    ob.data.transform(Matrix.Translation(-at))
    ob.location = ob.location + at
    return ob


def parent(child, par):
    bpy.context.view_layer.update()
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()
    return child


def tag(ob, anim, **props):
    """How the battle stage moves this part: yaw, pitch, spin, track, rock, none."""
    ob['anim'] = anim
    for k, v in props.items():
        ob[k] = v
    return ob


def marker(name, at, par=None, **props):
    """An empty marking a point (muzzle, exhaust, smoke). It faces -y like the unit."""
    e = link(bpy.data.objects.new(name, None))
    e.empty_display_size = 0.2
    e.location = at
    for k, v in props.items():
        e[k] = v
    if par:
        parent(e, par)
    return e


SPECIAL = ('decal', 'propdisc')


def decal(name, w, h, at, rot=(0, 0, 0), par=None, kind='insignia'):
    """A flat panel for a national marking. It lies in the xy plane facing +z before rot; keep it
    3 to 5 mm clear of the surface under it. The stage draws the right nation's marking on it."""
    ob = mesh_obj(name, [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [(0, 1, 2, 3)])
    uv = ob.data.uv_layers.new(name='UVMap')
    uv.data.foreach_set('uv', [0, 0, 1, 0, 1, 1, 0, 1])
    xform(ob, at, rot)
    pivot(ob, at)
    tag(ob, 'decal', kind=kind)
    if par:
        parent(ob, par)
    return ob


def prop_disc(name, radius, at, par=None, rot=(0, 0, 0)):
    """The blur drawn in place of fast-spinning blades. A disc facing -y before rot, centred on the hub."""
    n = 24
    verts = [(0, 0, 0)] + [(radius * math.cos(2 * math.pi * i / n), 0, radius * math.sin(2 * math.pi * i / n)) for i in range(n)]
    faces = [(0, 1 + (i + 1) % n, 1 + i) for i in range(n)]
    ob = mesh_obj(name, verts, faces)
    uv = ob.data.uv_layers.new(name='UVMap')
    flat = []
    for poly in ob.data.polygons:
        for vi in poly.vertices:
            v = verts[vi]
            flat += [0.5 + v[0] / (2 * radius), 0.5 + v[2] / (2 * radius)]
    uv.data.foreach_set('uv', flat)
    xform(ob, at, rot)
    pivot(ob, at)
    tag(ob, 'propdisc')
    if par:
        parent(ob, par)
    return ob


def baked_meshes():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.get('anim') not in SPECIAL and not o.name.startswith('_')]


def describe():
    """Print the part tree the stage will see, and complain about anything it cannot use."""
    problems = []
    def walk(o, depth):
        extra = {k: (round(o[k], 3) if isinstance(o[k], float) else o[k]) for k in o.keys() if k not in ('anim',)}
        kind = o.get('anim') if o.type == 'MESH' else 'marker'
        print(f"  {'  ' * depth}{o.name}  [{kind}]  {extra if extra else ''}")
        if o.type == 'MESH' and o.get('anim') is None:
            problems.append(f'{o.name}: no anim tag (use tag(ob, "none") for fixed parts)')
        if any(abs(v - 1) > 1e-4 for v in o.scale):
            problems.append(f'{o.name}: scaled object (bake the scale into the mesh with xform)')
        for c in sorted(o.children, key=lambda c: c.name):
            walk(c, depth + 1)
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if o.parent is None and not o.name.startswith('_'):
            walk(o, 0)
    for p_ in problems:
        print('  PROBLEM:', p_)
    return problems


def tris(obs=None):
    seen, n = set(), 0
    for o in obs or bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        n += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return n


# ---------------------------------------------------------------- materials
# Each material ends in four named reroutes (albedo, rough, metal, mask) feeding a Principled BSDF.
# Baking re-routes one of them at a time into an emission shader. "mask" is how much of the surface
# is nation paint: the battle stage tints only that.

class Graph:
    def __init__(self, mat):
        self.mat = mat
        mat.use_nodes = True
        self.t = mat.node_tree
        self.t.nodes.clear()
        self.x = 0

    def n(self, kind, **props):
        node = self.t.nodes.new(kind)
        self.x += 180
        node.location = (self.x, 0)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.t.links.new(a, b)

    def val(self, v):
        node = self.n('ShaderNodeValue')
        node.outputs[0].default_value = v
        return node.outputs[0]

    def rgb(self, c):
        node = self.n('ShaderNodeRGB')
        node.outputs[0].default_value = (*c, 1) if len(c) == 3 else c
        return node.outputs[0]

    def _in(self, node, key, v):
        sock = node.inputs[key]
        if hasattr(v, 'is_output') or hasattr(v, 'links'):
            self.link(v, sock)
        else:
            sock.default_value = v

    def math(self, op, a, b=None, clamp=False):
        node = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        self._in(node, 0, a)
        if b is not None:
            self._in(node, 1, b)
        return node.outputs[0]

    def mix(self, fac, a, b):
        node = self.n('ShaderNodeMix', data_type='RGBA')
        ins = {s.identifier: s for s in node.inputs}
        for key, v in (('Factor_Float', fac), ('A_Color', a), ('B_Color', b)):
            sock = ins[key]
            if hasattr(v, 'is_output'):
                self.link(v, sock)
            elif key == 'Factor_Float':
                sock.default_value = v
            else:
                sock.default_value = (*v, 1) if len(v) == 3 else v
        return {s.identifier: s for s in node.outputs}['Result_Color']

    def mixf(self, fac, a, b):
        node = self.n('ShaderNodeMix', data_type='FLOAT')
        ins = {s.identifier: s for s in node.inputs}
        for key, v in (('Factor_Float', fac), ('A_Float', a), ('B_Float', b)):
            sock = ins[key]
            if hasattr(v, 'is_output'):
                self.link(v, sock)
            else:
                sock.default_value = v
        return {s.identifier: s for s in node.outputs}['Result_Float']

    def ramp(self, v, lo, hi):
        """Remap lo..hi to 0..1, clamped."""
        node = self.n('ShaderNodeMapRange', clamp=True)
        self._in(node, 'Value', v)
        node.inputs['From Min'].default_value = lo
        node.inputs['From Max'].default_value = hi
        return node.outputs['Result']

    def coords(self, scale=(1, 1, 1)):
        tc = self.n('ShaderNodeTexCoord')
        mp = self.n('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = scale
        self.link(tc.outputs['Object'], mp.inputs['Vector'])
        return mp.outputs['Vector']

    def noise(self, scale, detail=3.0, rough=0.55, vec=None, colour=False):
        node = self.n('ShaderNodeTexNoise')
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['Roughness'].default_value = rough
        if vec is not None:
            self.link(vec, node.inputs['Vector'])
        else:
            self.link(self.coords(), node.inputs['Vector'])
        return node.outputs['Color' if colour else 0]

    def finish(self, albedo, rough, metal, mask, bump=None, bump_strength=0.2, bump_distance=0.004):
        out = {}
        for name, v in (('albedo', albedo), ('rough', rough), ('metal', metal), ('mask', mask)):
            if not hasattr(v, 'is_output'):
                v = self.rgb(v) if isinstance(v, (tuple, list)) else self.val(v)
            rr = self.n('NodeReroute')
            rr.name = rr.label = 'ch_' + name
            self.link(v, rr.inputs[0])
            out[name] = rr.outputs[0]
        p = self.n('ShaderNodeBsdfPrincipled')
        p.name = 'principled'
        self.link(out['albedo'], p.inputs['Base Color'])
        self.link(out['rough'], p.inputs['Roughness'])
        self.link(out['metal'], p.inputs['Metallic'])
        if bump is not None:
            b = self.n('ShaderNodeBump')
            b.inputs['Strength'].default_value = bump_strength
            b.inputs['Distance'].default_value = bump_distance
            self.link(bump, b.inputs['Height'])
            self.link(b.outputs['Normal'], p.inputs['Normal'])
        o = self.n('ShaderNodeOutputMaterial')
        o.name = 'output'
        self.link(p.outputs[0], o.inputs['Surface'])
        e = self.n('ShaderNodeEmission')
        e.name = 'emit'
        return self.mat


def _wear(g, edge_radius, chip_scale, wear):
    """Where paint has chipped off: along hard edges and in scattered spots."""
    bev = g.n('ShaderNodeBevel', samples=6)
    bev.inputs['Radius'].default_value = edge_radius
    geo = g.n('ShaderNodeNewGeometry')
    dot = g.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    g.link(bev.outputs['Normal'], dot.inputs[0])
    g.link(geo.outputs['Normal'], dot.inputs[1])
    edge = g.ramp(g.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.003, 0.05)
    breakup = g.noise(chip_scale, 4.0, 0.7)
    on_edges = g.math('MULTIPLY', edge, g.ramp(breakup, 0.36 - 0.12 * wear, 0.52 - 0.12 * wear))
    spots = g.ramp(g.noise(chip_scale * 0.5, 6.0, 0.78), 0.72 - 0.05 * wear, 0.75 - 0.05 * wear)
    return g.math('MAXIMUM', on_edges, g.math('MULTIPLY', spots, 0.9 * wear))


def _dirt(g, amount, low=None, streaks=True):
    """Two kinds of dirt. Grime is dark: it sits in corners and runs down vertical faces. Dust is
    pale: it settles on top faces and is thrown up from the ground (low = (full below, none above))."""
    ao = g.n('ShaderNodeAmbientOcclusion', samples=8, only_local=False)
    ao.inputs['Distance'].default_value = 0.4
    cavity = g.ramp(ao.outputs['AO'], 0.93, 0.35)
    grime = g.math('MULTIPLY', cavity, g.ramp(g.noise(2.6, 4.0, 0.6), 0.1, 0.55))
    geo = g.n('ShaderNodeNewGeometry')
    sep = g.n('ShaderNodeSeparateXYZ')
    g.link(geo.outputs['Normal'], sep.inputs[0])
    if streaks:
        thin = g.noise(1.0, 2.0, 0.5, vec=g.coords((26, 26, 0.3)))
        patch = g.noise(1.3, 3.0, 0.6)
        side = g.ramp(g.math('ABSOLUTE', sep.outputs['Z']), 0.75, 0.3)
        run = g.math('MULTIPLY', g.math('MULTIPLY', g.ramp(thin, 0.5, 0.74), g.ramp(patch, 0.3, 0.62)), side)
        grime = g.math('MAXIMUM', grime, g.math('MULTIPLY', run, 0.85))
    dust = g.math('MULTIPLY', g.ramp(sep.outputs['Z'], 0.8, 1.0), g.math('MULTIPLY', g.ramp(g.noise(1.1, 4.0, 0.65), 0.42, 0.78), 0.4))
    if low is not None:
        pos = g.n('ShaderNodeSeparateXYZ')
        g.link(geo.outputs['Position'], pos.inputs[0])
        rise = g.ramp(pos.outputs['Z'], low[1], low[0])
        splash = g.math('MULTIPLY', g.math('POWER', rise, 1.6), g.ramp(g.noise(4.0, 5.0, 0.7), 0.2, 0.7))
        dust = g.math('MAXIMUM', dust, g.math('MULTIPLY', splash, 0.85))
    return g.math('MULTIPLY', grime, amount, clamp=True), g.math('MULTIPLY', dust, amount, clamp=True)


def paint(name='paint', grey=0.5, wear=1.0, dirt=1.0, low=None, gloss=0.5, dirt_colour=(0.2, 0.165, 0.12), streaks=True, panel=0.0):
    """Painted steel. Bakes neutral (linear 0.5) so each nation's colour can be laid over it; the
    light and dark of the paint carry through the tint, and chips and dust keep their own colour."""
    g = Graph(bpy.data.materials.new(name))
    tone = g.math('ADD', g.math('MULTIPLY', g.noise(0.6, 3.0, 0.5), 0.6), g.math('MULTIPLY', g.noise(4.0, 4.0, 0.65), 0.4))
    fade = g.mixf(g.ramp(tone, 0.3, 0.7), grey * 0.84, grey * 1.12)
    # sun-bleached on top, darker underneath
    geo = g.n('ShaderNodeNewGeometry')
    sep = g.n('ShaderNodeSeparateXYZ')
    g.link(geo.outputs['Normal'], sep.inputs[0])
    fade = g.math('MULTIPLY', fade, g.mixf(g.ramp(sep.outputs['Z'], -0.6, 0.9), 0.86, 1.08))
    # paint rubbed thin along the edges
    bev = g.n('ShaderNodeBevel', samples=6)
    bev.inputs['Radius'].default_value = 0.04
    dot = g.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    g.link(bev.outputs['Normal'], dot.inputs[0])
    g.link(geo.outputs['Normal'], dot.inputs[1])
    rub = g.math('MULTIPLY', g.ramp(g.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.002, 0.06), g.ramp(g.noise(9.0, 4.0, 0.6), 0.25, 0.65))
    fade = g.math('MULTIPLY', fade, g.mixf(rub, 1.0, 1.55))
    # a dark wash in the tight corners, grime in the wider ones and down the sides
    tight = g.n('ShaderNodeAmbientOcclusion', samples=8)
    tight.inputs['Distance'].default_value = 0.06
    fade = g.math('MULTIPLY', fade, g.mixf(g.ramp(tight.outputs['AO'], 0.85, 0.3), 1.0, 0.4))
    grime, dust = _dirt(g, dirt, low, streaks)
    fade = g.math('MULTIPLY', fade, g.mixf(grime, 1.0, 0.3))
    base = g.n('ShaderNodeCombineColor')
    for k in range(3):
        g.link(fade, base.inputs[k])
    chips = _wear(g, 0.03, 30.0, wear)
    rust = g.mix(g.noise(60, 2.0, 0.5), (0.16, 0.075, 0.04), (0.075, 0.062, 0.055))
    col = g.mix(chips, base.outputs[0], rust)
    col = g.mix(dust, col, dirt_colour)
    mask = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, chips), g.math('SUBTRACT', 1.0, g.math('MULTIPLY', dust, 0.9)))
    fine = g.noise(90.0, 3.0, 0.6)
    rough = g.mixf(dust, g.mixf(chips, g.mixf(grime, g.mixf(fine, gloss - 0.08, gloss + 0.1), 0.8), 0.36), 0.95)
    metal = g.math('MULTIPLY', chips, 0.75)
    bump = g.math('SUBTRACT', g.math('MULTIPLY', fine, 0.35), g.math('MULTIPLY', chips, 1.5))
    if panel > 0:
        br = g.n('ShaderNodeTexBrick', offset=0.5)
        br.inputs['Scale'].default_value = 1.0 / panel
        br.inputs['Mortar Size'].default_value = 0.006
        br.inputs['Mortar Smooth'].default_value = 0.3
        br.inputs['Color1'].default_value = (1, 1, 1, 1)
        br.inputs['Color2'].default_value = (1, 1, 1, 1)
        br.inputs['Mortar'].default_value = (0, 0, 0, 1)
        g.link(g.coords(), br.inputs['Vector'])
        bump = g.math('ADD', bump, g.math('MULTIPLY', br.outputs[1], -1.2))
    return g.finish(col, rough, metal, mask, bump, 0.45, 0.003)


def plain(name, colour, rough=0.6, metal=0.0, vary=0.12, dirt=0.6, rust=0.0, low=None, bump=0.25, dirt_colour=(0.2, 0.165, 0.12), mask=0.0, fine_scale=70.0, polish=0.0):
    """An unpainted surface: steel, rubber, canvas, concrete. polish brightens hard edges, as on worn track links."""
    g = Graph(bpy.data.materials.new(name))
    tone = g.noise(1.6, 4.0, 0.6)
    dark = tuple(c * (1 - vary) for c in colour)
    lite = tuple(min(1, c * (1 + vary)) for c in colour)
    col = g.mix(tone, dark, lite)
    r = rough
    m = metal
    if rust > 0:
        rr = g.ramp(g.noise(7.0, 5.0, 0.7), 0.62 - 0.3 * rust, 0.8 - 0.25 * rust)
        col = g.mix(rr, col, g.mix(g.noise(40, 2.0, 0.5), (0.15, 0.07, 0.035), (0.085, 0.05, 0.035)))
        r = g.mixf(rr, rough, 0.88)
        m = g.mixf(rr, metal, 0.1)
    if polish > 0:
        bev = g.n('ShaderNodeBevel', samples=6)
        bev.inputs['Radius'].default_value = 0.012
        geo = g.n('ShaderNodeNewGeometry')
        dot = g.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
        g.link(bev.outputs['Normal'], dot.inputs[0])
        g.link(geo.outputs['Normal'], dot.inputs[1])
        shine = g.math('MULTIPLY', g.ramp(g.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.004, 0.06), polish)
        col = g.mix(shine, col, (0.42, 0.41, 0.4))
        r = g.mixf(shine, r, 0.3)
        m = g.mixf(shine, m, 1.0)
    grime, dust = _dirt(g, dirt, low, True)
    dk = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    di = {s_.identifier: s_ for s_ in dk.inputs}
    g.link(grime, di['Factor_Float'])
    g.link(col, di['A_Color'])
    di['B_Color'].default_value = (0.4, 0.37, 0.34, 1)
    col = {s_.identifier: s_ for s_ in dk.outputs}['Result_Color']
    col = g.mix(dust, col, dirt_colour)
    r = g.mixf(dust, r, 0.95)
    if metal > 0 or rust > 0 or polish > 0:
        m = g.mixf(dust, m, 0.0)
    fine = g.noise(fine_scale, 3.0, 0.6)
    return g.finish(col, r, m, mask, fine, bump, 0.003)


def wood(name='wood', colour=(0.42, 0.31, 0.19), plank=0.14, length=2.4, dirt=0.5):
    """Deck planking, laid along y."""
    g = Graph(bpy.data.materials.new(name))
    br = g.n('ShaderNodeTexBrick', offset=0.5)
    br.inputs['Scale'].default_value = 1.0
    br.inputs['Mortar Size'].default_value = 0.008
    br.inputs['Mortar Smooth'].default_value = 0.2
    br.inputs['Brick Width'].default_value = length
    br.inputs['Row Height'].default_value = plank
    br.inputs['Color1'].default_value = (0.75, 0.75, 0.75, 1)
    br.inputs['Color2'].default_value = (1, 1, 1, 1)
    br.inputs['Mortar'].default_value = (0.12, 0.12, 0.12, 1)
    tc = g.n('ShaderNodeTexCoord')
    mp = g.n('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (0, 0, R(90))
    g.link(tc.outputs['Object'], mp.inputs['Vector'])
    g.link(mp.outputs['Vector'], br.inputs['Vector'])
    grain = g.noise(1.0, 4.0, 0.6, vec=g.coords((40, 2.5, 40)))
    c = g.mix(grain, tuple(x * 0.78 for x in colour), tuple(min(1, x * 1.15) for x in colour))
    cc = g.n('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    ins = {s.identifier: s for s in cc.inputs}
    ins['Factor_Float'].default_value = 1.0
    g.link(c, ins['A_Color'])
    g.link(br.outputs[0], ins['B_Color'])
    col = {s.identifier: s for s in cc.outputs}['Result_Color']
    grime, dust = _dirt(g, 0.7 * dirt, None, False)
    col = g.mix(g.math('MAXIMUM', grime, dust), col, (0.12, 0.1, 0.08))
    height = g.math('SUBTRACT', g.math('MULTIPLY', grain, 0.4), br.outputs[1])
    return g.finish(col, g.mixf(grain, 0.7, 0.85), 0.0, 0.0, height, 0.5, 0.004)


def glass(name='glass'):
    g = Graph(bpy.data.materials.new(name))
    return g.finish((0.03, 0.045, 0.05), 0.08, 0.0, 0.0)


# ---------------------------------------------------------------- bake

CHANNELS = ('albedo', 'mask', 'rough', 'metal')


def _edit(pick):
    bpy.ops.object.select_all(action='DESELECT')
    for o in pick:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pick[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.context.scene.tool_settings.mesh_select_mode = (False, False, True)


def _show(pick, pinned):
    """In edit mode: show only the pinned faces, only the free faces, or (None) everything; select what shows."""
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


def _unwrap(obs, margin):
    """One atlas for the whole unit. Faces pinned by unwrap_now keep their layout (and stay stacked on
    their copies); everything else is unwrapped here; then all of it is packed at one texel density."""
    datas, pick = set(), []
    for o in obs:
        if o.data not in datas:
            datas.add(o.data)
            pick.append(o)
            if not o.data.uv_layers:
                o.data.uv_layers.new(name='UVMap')
    _edit(pick)
    if _show(pick, False):
        bpy.ops.uv.smart_project(angle_limit=R(60), island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    _show(pick, None)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()          # one density everywhere; islands may now overlap
    if _show(pick, False):
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, margin=margin)   # the free islands, clear of each other again
    _show(pick, None)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, merge_overlap=True)   # bring the parked stacks in
    bpy.ops.object.mode_set(mode='OBJECT')
    return pick


def _pack(pick, margin, average=True):
    _edit(pick)
    _show(pick, None)
    bpy.ops.uv.select_all(action='SELECT')
    if average:
        bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=margin, merge_overlap=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def _apply_texel(obs):
    """Objects with a "texel" property get that much more (or less) atlas area. Call after a first
    pack: each such object's layout is scaled and moved clear, ready to be packed again."""
    changed = 0
    for o in obs:
        k = o.get('texel')
        if not k or k == 1:
            continue
        changed += 1
        uv = o.data.uv_layers.active.data
        vals = [0.0] * (len(uv) * 2)
        uv.foreach_get('uv', vals)
        for i in range(0, len(vals), 2):
            vals[i] = vals[i] * k + 40.0 * changed
            vals[i + 1] = vals[i + 1] * k
        uv.foreach_set('uv', vals)
    return changed > 0


def bake(name, size=2048, margin=0.003, samples=24, ao_samples=64):
    sc = bpy.context.scene
    obs = baked_meshes()
    # markings and propeller discs are drawn by the stage: they must not shade or dirty the bake
    for o in sc.objects:
        if o.get('anim') in SPECIAL:
            o.hide_render = True
    pick = _unwrap(obs, margin)
    if _apply_texel(pick):
        _pack(pick, margin, average=False)
    if os.environ.get('AXM_REUSE') == '1':
        # look again without baking again: the unwrap is deterministic, so last run's textures still fit
        images = {}
        for ch in CHANNELS + ('ao', 'normal'):
            img = bpy.data.images.load(os.path.join(BUILD, name, f'{ch}.png'))
            img.colorspace_settings.name = 'sRGB' if ch == 'albedo' else 'Non-Color'
            images[ch] = img
        return images
    out = os.path.join(BUILD, name)
    os.makedirs(out, exist_ok=True)
    mats = {m for o in pick for m in o.data.materials if m}
    images = {}
    for ch in CHANNELS + ('ao', 'normal'):
        img = bpy.data.images.new(f'{name}_{ch}', size, size, alpha=False)
        img.colorspace_settings.name = 'sRGB' if ch == 'albedo' else 'Non-Color'
        images[ch] = img
    tex = {}
    for m in mats:
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.name = 'bake_target'
        m.node_tree.nodes.active = node
        tex[m] = node
    bpy.ops.object.select_all(action='DESELECT')
    for o in pick:
        o.select_set(True)
    bpy.context.view_layer.objects.active = pick[0]
    sc.render.bake.margin = 12
    sc.render.bake.use_clear = True

    def run(kind, ch, n):
        sc.cycles.samples = n
        for m in mats:
            tex[m].image = images[ch]
            m.node_tree.nodes.active = tex[m]
        t = time.time()
        bpy.ops.object.bake(type=kind, margin=12, use_clear=True)
        images[ch].filepath_raw = os.path.join(out, f'{ch}.png')
        images[ch].file_format = 'PNG'
        images[ch].save()
        print(f'  baked {ch} in {time.time() - t:.1f}s')

    for ch in CHANNELS:
        for m in mats:
            nt = m.node_tree
            nt.links.new(nt.nodes['ch_' + ch].outputs[0], nt.nodes['emit'].inputs['Color'])
            nt.links.new(nt.nodes['emit'].outputs[0], nt.nodes['output'].inputs['Surface'])
        run('EMIT', ch, samples)
    for m in mats:
        nt = m.node_tree
        nt.links.new(nt.nodes['principled'].outputs[0], nt.nodes['output'].inputs['Surface'])
    run('NORMAL', 'normal', 8)
    run('AO', 'ao', ao_samples)
    return images


def baked_material(name, images, tint=None):
    """One material showing the baked textures, as the game will: used for the preview render."""
    m = bpy.data.materials.new(name + '_baked')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']

    def img(ch):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = images[ch]
        return n

    alb, msk, ao = img('albedo'), img('mask'), img('ao')
    col = alb.outputs['Color']
    if tint is not None:
        # the game's paint: nation colour scaled by the baked light and dark, laid over the mask
        lum = nt.nodes.new('ShaderNodeRGBToBW')
        nt.links.new(col, lum.inputs[0])
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = 2.0
        nt.links.new(lum.outputs[0], mul.inputs[0])
        sc = nt.nodes.new('ShaderNodeMix')
        sc.data_type = 'RGBA'
        sc.blend_type = 'MULTIPLY'
        si = {s.identifier: s for s in sc.inputs}
        si['Factor_Float'].default_value = 1.0
        si['A_Color'].default_value = (*tint, 1)
        nt.links.new(mul.outputs[0], si['B_Color'])
        mx = nt.nodes.new('ShaderNodeMix')
        mx.data_type = 'RGBA'
        mi = {s.identifier: s for s in mx.inputs}
        nt.links.new(msk.outputs['Color'], mi['Factor_Float'])
        nt.links.new(col, mi['A_Color'])
        nt.links.new({s.identifier: s for s in sc.outputs}['Result_Color'], mi['B_Color'])
        col = {s.identifier: s for s in mx.outputs}['Result_Color']
    aom = nt.nodes.new('ShaderNodeMix')
    aom.data_type = 'RGBA'
    aom.blend_type = 'MULTIPLY'
    ai = {s.identifier: s for s in aom.inputs}
    ai['Factor_Float'].default_value = 0.8
    nt.links.new(col, ai['A_Color'])
    nt.links.new(ao.outputs['Color'], ai['B_Color'])
    nt.links.new({s.identifier: s for s in aom.outputs}['Result_Color'], p.inputs['Base Color'])
    nt.links.new(img('rough').outputs['Color'], p.inputs['Roughness'])
    nt.links.new(img('metal').outputs['Color'], p.inputs['Metallic'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(img('normal').outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    return m


# ---------------------------------------------------------------- preview and export

def _bounds():
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.name.startswith('_'):
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def preview(name, views=((-38, 16), (142, 20), (-60, 8, 0.5)), size=(1100, 700), samples=48, ground=True, suffix=''):
    """Render the unit under a plain daylight sky. views are (azimuth, elevation) in degrees; azimuth 0 looks at the front."""
    sc = bpy.context.scene
    lo, hi = _bounds()
    centre = (lo + hi) / 2
    radius = (hi - lo).length / 2
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    sc.world = world
    nt = world.node_tree
    sky = nt.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'MULTIPLE_SCATTERING'
    except Exception:
        try:
            sky.sky_type = 'NISHITA'
        except Exception:
            pass
    for key, v in (('sun_elevation', R(38)), ('sun_rotation', R(-120)), ('sun_intensity', 1.0)):
        try:
            setattr(sky, key, v)
        except Exception:
            pass
    bg = nt.nodes['Background']
    bg.inputs['Strength'].default_value = 0.05
    nt.links.new(sky.outputs[0], bg.inputs['Color'])
    extra = []
    if ground:
        g = box('_ground', radius * 30, radius * 30, 0.02, at=(centre.x, centre.y, -0.012))
        gm = bpy.data.materials.new('_ground')
        gm.use_nodes = True
        gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.20, 0.19, 0.17, 1)
        gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.95
        g.data.materials.append(gm)
        extra.append(g)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 70
    cam = link(bpy.data.objects.new('cam', cam_data))
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    out = os.path.join(BUILD, name)
    os.makedirs(out, exist_ok=True)
    paths = []
    for i, view in enumerate(views):
        az, el = view[0], view[1]
        dist = radius * 4.6 * (view[2] if len(view) > 2 else 1.0)
        a, e = R(az), R(el)
        eye = centre + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
        cam.location = eye
        cam.rotation_euler = (centre - eye).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out, f'preview{suffix}-{i}.png')
        bpy.ops.render.render(write_still=True)
        paths.append(sc.render.filepath)
    for o in extra:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(cam)
    return paths


def export(name):
    out = os.path.join(BUILD, name)
    os.makedirs(out, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    path = os.path.join(out, 'model.glb')
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False, export_apply=False, export_extras=True,
        export_yup=True, export_materials='NONE', export_texcoords=True, export_normals=True,
        export_attributes=True, export_animations=False, export_cameras=False, export_lights=False,
    )
    return path


def finish(name, size=2048, tint=(0.13, 0.15, 0.075), views=((-38, 16), (142, 20), (-60, 8, 0.5)), bake_samples=24):
    """Bake, preview and export. Call it last."""
    t0 = time.time()
    sc = bpy.context.scene
    weight_all()
    meshes = baked_meshes()
    count = tris(meshes)
    unique = {o.data for o in meshes}
    print(f'[{name}] {len(meshes)} parts, {len(unique)} meshes, {count} triangles drawn')
    problems = describe()
    if os.environ.get('AXM_DRAFT') == '1':
        # shape check only: no bake, no export, grey paint
        for o in sc.objects:
            if o.get('anim') in SPECIAL:
                o.hide_render = True
        for path_ in preview(name, views, samples=24, suffix='-draft'):
            print('  draft', path_)
        return None
    images = bake(name, size, samples=bake_samples)
    path = export(name)
    lo, hi = _bounds()
    info = {
        'name': name, 'triangles': count, 'parts': len(meshes), 'meshes': len(unique), 'atlas': size,
        'size': [round(hi.x - lo.x, 3), round(hi.y - lo.y, 3), round(hi.z - lo.z, 3)], 'problems': problems,
        'min': [round(v, 3) for v in lo], 'max': [round(v, 3) for v in hi],
    }
    with open(os.path.join(BUILD, name, 'info.json'), 'w') as f:
        json.dump(info, f, indent=1)
    bm = baked_material(name, images, tint)
    for me in unique:
        me.materials.clear()
        me.materials.append(bm)
    for o in sc.objects:
        if o.get('anim') in SPECIAL:
            o.hide_render = True
    paths = preview(name, views)
    print(f'[{name}] done in {time.time() - t0:.0f}s -> {path}')
    for p in paths:
        print('  preview', p)
    return info
