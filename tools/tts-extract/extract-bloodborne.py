# Extract Bloodborne mini meshes + textures from the mod's Unity assetbundles
# into client/public/bloodborne/minis/. Consumes games/bloodborne/golden/minis.json
# (slug -> bundle filename) written by extract-bloodborne.mjs.
#
# Each bundle holds one TTS custom-model rig: pick the Mesh with the most
# vertices (the sculpt; others are bases/effects) and the largest Texture2D
# (the diffuse). Writes <slug>.obj + <slug>.jpg + minis-manifest.json with
# vertex counts and texture sizes. Idempotent: skips existing outputs.
# Run: python tools/tts-extract/extract-bloodborne.py
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import UnityPy

ROOT = os.path.join(os.path.dirname(__file__), '../..')
MODS = r'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Assetbundles'
OUT = os.path.join(ROOT, 'client/public/bloodborne/minis')
GOLD = os.path.join(ROOT, 'games/bloodborne/golden')
os.makedirs(OUT, exist_ok=True)

minis = json.load(open(os.path.join(GOLD, 'minis.json')))
manifest = {}
fails = []

for slug, info in minis.items():
    obj_path = os.path.join(OUT, slug + '.obj')
    tex_path = os.path.join(OUT, slug + '.jpg')
    entry = {}
    src = os.path.join(MODS, info['bundle'])
    if not os.path.exists(src):
        fails.append((slug, 'bundle missing'))
        continue
    if os.path.exists(obj_path) and os.path.exists(tex_path):
        manifest[slug] = {'obj': True, 'tex': True, 'cached': True}
        continue
    try:
        env = UnityPy.load(src)
        best_mesh, best_v = None, -1
        best_tex, best_px = None, -1
        for o in env.objects:
            if o.type.name == 'Mesh':
                d = o.read()
                v = getattr(d, 'm_VertexCount', 0) or 0
                if v > best_v:
                    best_mesh, best_v = d, v
            elif o.type.name == 'Texture2D':
                d = o.read()
                px = (d.m_Width or 0) * (d.m_Height or 0)
                if px > best_px:
                    best_tex, best_px = d, px
        if best_mesh is None:
            fails.append((slug, 'no mesh'))
            continue
        if not os.path.exists(obj_path):
            with open(obj_path, 'w', encoding='utf-8') as fh:
                fh.write(best_mesh.export())
        if best_tex is not None and not os.path.exists(tex_path):
            img = best_tex.image
            img = img.convert('RGB')
            # cap texture at 1024 for web
            if max(img.size) > 1024:
                r = 1024 / max(img.size)
                img = img.resize((int(img.size[0]*r), int(img.size[1]*r)))
            img.save(tex_path, quality=85)
        entry = {'verts': best_v, 'tex': best_tex is not None and [best_tex.m_Width, best_tex.m_Height]}
        manifest[slug] = entry
        print('ok', slug, 'verts:', best_v, 'tex:', entry['tex'])
    except Exception as e:
        fails.append((slug, str(e)[:120]))

json.dump(manifest, open(os.path.join(OUT, 'minis-manifest.json'), 'w'), indent=1)
print('done:', len(manifest), 'fails:', len(fails))
for f in fails:
    print('FAIL', f[0], f[1])
