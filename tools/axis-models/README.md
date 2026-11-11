# Battle models

Every unit in the Axis & Allies battle is built from code in Blender. One file per unit. `kit.py` holds
the shared helpers; `tank.py` is the worked example to copy from.

```
"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup --python tools/axis-models/tank.py
AXM_DRAFT=1 <same command>      # shape check: grey previews (preview-draft-N.png), no bake, no export
AXM_REUSE=1 <same command>      # re-render the previews from the last bake (only if the geometry is unchanged)
```

A run writes `build/<name>/`: `model.glb` (geometry, part tree, tags), six texture maps, `info.json`
and `preview-0..2.png`. `node tools/axis-models/pack.mjs` turns the build folders into what the client ships.

## Rules the battle stage relies on

- Metres, real size. z is up. **The unit faces -y.** x = 0 is the centre line.
- The ground is z = 0. For ships and the surfaced submarine the **waterline** is z = 0 and the hull goes below it.
- Build mesh data in model space with objects left at the origin, then give each moving part its
  pivot with `pivot(ob, point)` and its parent with `parent(child, par)`.
- Never scale or mirror an object (`xform`, `mirror_x` and `both` bake it into the mesh instead).
- Every mesh object carries an `anim` tag (`tag(ob, kind, ...)`):

| tag | what the stage does | properties |
| --- | --- | --- |
| `none` | fixed to its parent | |
| `yaw` | turns about its own z to face a target | `speed` rad/s, optional `min`/`max` degrees from rest, `aims`: `surface` (default) or `air` |
| `pitch` | child of a yaw part; elevates about its own x; slides back when it fires | `min`, `max` degrees, `recoil` metres |
| `spin` | a wheel: turns about its own x with distance travelled | `radius` |
| `track` | a link track; needs the `_next` vertex data as in `tank.py` | `pitch` |
| `prop` | spins about its own y (the direction of flight) | `rpm` |
| `propdisc` | made with `prop_disc()`: the blur shown instead of the blades at speed | |
| `radar` | turns slowly about its own z | `rpm` |
| `bone` | a soldier's body part, posed by the stage | `bone` name |
| `decal` | made with `decal()`: a national marking, drawn by the stage | `kind` |

- A part that rests facing another way (an aft turret) is built facing -y at the origin and then
  placed with `instance(ob, name, at, rot)` or by rotating the object, so its own axes stay true.
  Wheels are never rotated: a rotated wheel would spin backwards.
- Markers are empties made with `marker(name, at, parent, kind=...)`: `muzzle*` (kind `cannon`, `mg`,
  `flak`, `naval`, `rifle`, `torpedo`), `exhaust*`, `smoke*` (funnel tops), `bomb` (release point).
  Parent a muzzle to the part that aims it.
- One root mesh, tagged `none`, named `hull` (vehicles, ships, aircraft) or `body`. Join everything
  that never moves into it. Keep the count of distinct meshes small (under about 14): each is a draw call.
- Identical parts must share mesh data: `instance()` for parts that move on their own (wheels,
  turrets of one kind), `copies()` for fixed repeats that get joined into a bigger mesh (bolts,
  slats, railing posts, portholes). Both share one piece of the texture atlas.

## Surfaces

Materials come from `paint()`, `plain()`, `wood()` and `glass()`. `paint()` bakes neutral grey with a
mask, and the stage lays each nation's colour over it, so anything that should take the nation's
colour (hull, turret, fuselage, uniform) must use a `paint()` material and nothing else should.
Everything is baked to one atlas per unit: albedo, paint mask, roughness, metal, normal, AO. `pack.mjs` stores the
mask in the albedo's alpha, lifted off zero, because WebP drops the colour under fully transparent pixels.

Chamfer hard edges with `hard(ob, width)`; it is the bevel highlights, the baked corner dirt and the
edge wear that make a part read as metal instead of as a box. Use `soft()` for cast and rounded parts.
