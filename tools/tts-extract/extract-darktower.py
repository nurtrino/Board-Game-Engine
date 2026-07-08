# Extract Dark Tower assets: reel/LCD/arc textures + all sounds from the mod's
# Unity assetbundles into client/public/darktower/.
# Run: python tools/tts-extract/extract-darktower.py
import io, sys, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import UnityPy

MODS = r'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Assetbundles'
OUT = os.path.join(os.path.dirname(__file__), '../../client/public/darktower')
os.makedirs(OUT, exist_ok=True)

BUNDLES = {
    'lcd': 'httpcloud3steamusercontentcomugc8211888971537175132E23298A9FA8DAC0C98C6110ECA3F2BA279FE85D.unity3d',
    'arc': 'httpcloud3steamusercontentcomugc821188897153777327408717B21F92A2EEF97D2BD5E6AFAA1A3982F280.unity3d',
    'reels': 'httpcloud3steamusercontentcomugc821188897153779313AEBF8FA256DAD100672282B2266D3CF4692D6B8F.unity3d',
    'sounds': 'httpcloud3steamusercontentcomugc9923664210297446612C0F5AD022CE829F68722060F3A3AA3910E3CBAF.unity3d',
}

manifest = {'textures': {}, 'sounds': [], 'soundOrder': []}

for tag, f in BUNDLES.items():
    env = UnityPy.load(os.path.join(MODS, f))
    for obj in env.objects:
        t = obj.type.name
        if t == 'Texture2D':
            d = obj.read()
            name = f'{tag}-{d.m_Name}'.replace(' ', '_')
            img = d.image
            img.save(os.path.join(OUT, name + '.png'))
            manifest['textures'][name] = [d.m_Width, d.m_Height]
        elif t == 'AudioClip':
            d = obj.read()
            for clip_name, data in d.samples.items():
                name = d.m_Name.replace(' ', '_')
                with open(os.path.join(OUT, 'sfx-' + name + '.wav'), 'wb') as fh:
                    fh.write(data)
                manifest['sounds'].append(name)

# The soundboard's TTS trigger order: TTS enumerates the bundle's AssetBundle
# effects; capture raw object order for reference so indices can be mapped.
env = UnityPy.load(os.path.join(MODS, BUNDLES['sounds']))
order = []
for obj in env.objects:
    if obj.type.name == 'AudioClip':
        order.append(obj.read().m_Name)
manifest['soundOrder'] = order

with open(os.path.join(OUT, 'bundle-manifest.json'), 'w') as fh:
    json.dump(manifest, fh, indent=1)
print('textures:', len(manifest['textures']), 'sounds:', len(manifest['sounds']))
print('audio object order:', ', '.join(order))
