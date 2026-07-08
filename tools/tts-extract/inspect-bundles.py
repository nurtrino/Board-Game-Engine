# List the contents of the Dark Tower mod's Unity assetbundles: every object
# type/name, mesh sizes, texture sizes — to identify the tower model.
# Run: python tools/tts-extract/inspect-bundles.py
import io, sys, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import UnityPy

MODS = r'C:/Users/chase/Documents/My Games/Tabletop Simulator/Mods/Assetbundles'
FILES = [
    'httpcloud3steamusercontentcomugc8211888971537175132E23298A9FA8DAC0C98C6110ECA3F2BA279FE85D.unity3d',
    'httpcloud3steamusercontentcomugc821188897153777327408717B21F92A2EEF97D2BD5E6AFAA1A3982F280.unity3d',
    'httpcloud3steamusercontentcomugc821188897153779313AEBF8FA256DAD100672282B2266D3CF4692D6B8F.unity3d',
    'httpcloud3steamusercontentcomugc9923664210297446612C0F5AD022CE829F68722060F3A3AA3910E3CBAF.unity3d',
]

for f in FILES:
    p = os.path.join(MODS, f)
    print('='*20, f[-40:], f'{os.path.getsize(p)/1024:.0f}kb')
    env = UnityPy.load(p)
    for obj in env.objects:
        t = obj.type.name
        if t in ('Mesh', 'Texture2D', 'GameObject', 'AudioClip', 'Material', 'Shader', 'AnimationClip'):
            try:
                d = obj.read()
                name = getattr(d, 'm_Name', getattr(d, 'name', '?'))
                extra = ''
                if t == 'Mesh':
                    extra = f' verts={d.m_VertexData.m_VertexCount if hasattr(d,"m_VertexData") else "?"}'
                if t == 'Texture2D':
                    extra = f' {d.m_Width}x{d.m_Height}'
                print(f'  {t:14} {name}{extra}')
            except Exception as e:
                print(f'  {t:14} <unreadable: {e}>')
