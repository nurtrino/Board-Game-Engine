"""Build complete, web-optimized Bloodborne miniatures from TTS bundles.

The old exporter picked one mesh by ``m_VertexCount``. Modern UnityPy moved
that value to ``m_VertexData.m_VertexCount``, so every count became zero and
the first mesh (often the 108-vertex ``default`` collider) won. Even when the
first mesh happened to be useful, multipart hunters and bosses lost most of
their sculpt and every material except one.

This exporter reconstructs every visible MeshRenderer with its Unity transform
and PBR material channels, writes one GLB per unique bundle, and delegates
lossless geometry compression plus WebP texture conversion to
``optimize-bloodborne-model.mjs``. Duplicate hunter/weapon bundle entries are
aliases in the manifest instead of duplicate files. It also recovers runtime
models hidden in nested enemy bags, a structure the golden extractor did not
descend into, and stages source standees (Iosefka) as transparent WebP.

Requirements: UnityPy, trimesh, numpy, Pillow, and the repository npm deps.
Run from anywhere with: ``python tools/tts-extract/extract-bloodborne.py``.
Pass ``--prune-legacy`` after the client has moved to GLB to remove obsolete
OBJ/JPG pairs from the public mini directory.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import struct
import sys
import tempfile
from typing import Any

import numpy as np
from PIL import Image
import trimesh
from trimesh.visual.material import PBRMaterial
import UnityPy
from UnityPy.export.MeshExporter import export_mesh_obj
from UnityPy.export.MeshRendererExporter import get_mesh


sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[2]
MODS = Path(os.environ.get(
    "TTS_MODS_DIR",
    Path.home() / "Documents" / "My Games" / "Tabletop Simulator" / "Mods",
))
BUNDLES = MODS / "Assetbundles"
WORKSHOP_SAVE = MODS / "Workshop" / "3572706204.json"
OUT = ROOT / "client" / "public" / "bloodborne" / "minis"
GOLD_MINIS = ROOT / "games" / "bloodborne" / "golden" / "minis.json"
SHARED_DATA = ROOT / "shared" / "src" / "bloodborne" / "data"
OPTIMIZER = ROOT / "tools" / "tts-extract" / "optimize-bloodborne-model.mjs"
VERIFIER = ROOT / "tools" / "verify" / "bloodborne-assets.mjs"

MAX_TEXTURE_SIZE = 1024
MAX_NORMAL_TEXTURE_SIZE = 512
SKIP_RENDERERS = {"default", "collider", "colider"}


def slug(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def munge(url: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", url)


def pptr_object(pointer: Any) -> Any | None:
    return pointer.deref_parse_as_object() if pointer else None


def properties(values: Any) -> dict[str, Any]:
    return {
        key if isinstance(key, str) else key.name: value
        for key, value in (values or [])
        if value is not None
    }


def component_transform_lh(transform: Any) -> np.ndarray:
    position = transform.m_LocalPosition
    rotation = transform.m_LocalRotation
    scale = transform.m_LocalScale
    matrix = (
        trimesh.transformations.translation_matrix([position.x, position.y, position.z])
        @ trimesh.transformations.quaternion_matrix([rotation.w, rotation.x, rotation.y, rotation.z])
        @ np.diag([scale.x, scale.y, scale.z, 1.0])
    )
    parent = pptr_object(transform.m_Father)
    return component_transform_lh(parent) @ matrix if parent is not None else matrix


def component_transform_rh(transform: Any) -> np.ndarray:
    # Unity is left-handed. UnityPy's OBJ exporter mirrors local X; conjugating
    # the Unity world matrix by the same reflection keeps transforms correct.
    mirror_x = np.diag([-1.0, 1.0, 1.0, 1.0])
    return mirror_x @ component_transform_lh(transform) @ mirror_x


def color_channels(color: Any | None) -> tuple[float, float, float, float]:
    if color is None:
        return (0.8, 0.8, 0.8, 1.0)
    return tuple(float(getattr(color, key, 1.0)) for key in "rgba")  # type: ignore[return-value]


def safe_material_name(renderer_index: int, material_index: int) -> str:
    return f"bb_{renderer_index}_{material_index}"


def texture_image(
    texture_env: Any | None,
    cache: dict[tuple[int, int, str], Image.Image],
    *,
    mode: str = "RGBA",
    max_size: int = MAX_TEXTURE_SIZE,
) -> tuple[Image.Image | None, int | None]:
    if not texture_env or not texture_env.m_Texture:
        return None, None
    path_id = int(texture_env.m_Texture.m_PathID)
    key = (path_id, max_size, mode)
    if key not in cache:
        texture = pptr_object(texture_env.m_Texture)
        image = texture.image.copy()
        if max(image.size) > max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        cache[key] = image.convert(mode)
    return cache[key], path_id


def packed_metallic_roughness(
    surface: Image.Image,
    base_color: Image.Image | None,
    *,
    gloss_scale: float,
    smoothness_from_albedo: bool,
    specular_workflow: bool,
) -> Image.Image:
    rgba = np.asarray(surface.convert("RGBA"), dtype=np.float32)
    if specular_workflow:
        # Core glTF has no spec/gloss workflow. Convert the specular intensity
        # to a conservative metallic estimate (4% dielectric floor), while
        # retaining source gloss in the roughness channel.
        specular = np.max(rgba[:, :, :3], axis=2) / 255.0
        metallic = np.clip((specular - 0.04) / 0.96, 0.0, 1.0)
    else:
        metallic = rgba[:, :, 0] / 255.0

    if smoothness_from_albedo and base_color is not None:
        albedo = base_color.resize(surface.size, Image.Resampling.LANCZOS).convert("RGBA")
        smoothness = np.asarray(albedo, dtype=np.float32)[:, :, 3] / 255.0
    else:
        smoothness = rgba[:, :, 3] / 255.0
    roughness = 1.0 - np.clip(smoothness * gloss_scale, 0.0, 1.0)

    packed = np.zeros((surface.height, surface.width, 3), dtype=np.uint8)
    packed[:, :, 1] = np.rint(roughness * 255.0).astype(np.uint8)
    packed[:, :, 2] = np.rint(metallic * 255.0).astype(np.uint8)
    return Image.fromarray(packed, mode="RGB")


def unpack_normal_map(
    texture_env: Any | None,
    cache: dict[tuple[int, int, str], Image.Image],
    *,
    bump_scale: float,
) -> tuple[Image.Image | None, int | None]:
    """Translate Unity RG/DXT5nm normals to glTF RGB tangent normals.

    Unity's Standard shader derives X from ``red * alpha``. That covers both
    RG maps (opaque alpha) and DXT5nm maps (constant red, X stored in alpha).
    It then derives the positive Z hemisphere from the scaled X/Y vector.
    Baking that operation is required because glTF samples RGB directly.
    """
    source, path_id = texture_image(
        texture_env,
        cache,
        mode="RGBA",
        max_size=MAX_NORMAL_TEXTURE_SIZE,
    )
    if source is None or path_id is None:
        return None, path_id
    scale = float(bump_scale) if np.isfinite(bump_scale) else 1.0
    key = (path_id, MAX_NORMAL_TEXTURE_SIZE, f"normal:{scale:.8g}")
    if key not in cache:
        rgba = np.asarray(source, dtype=np.float32) / 255.0
        x = (rgba[:, :, 0] * rgba[:, :, 3] * 2.0 - 1.0) * scale
        y = (rgba[:, :, 1] * 2.0 - 1.0) * scale
        z = np.sqrt(np.maximum(0.0, 1.0 - np.minimum(1.0, x * x + y * y)))
        normal = np.stack((x, y, z), axis=2)
        encoded = np.rint((np.clip(normal, -1.0, 1.0) * 0.5 + 0.5) * 255.0).astype(np.uint8)
        cache[key] = Image.fromarray(encoded, mode="RGB")
    return cache[key], path_id


def export_material(
    material: Any,
    renderer_index: int,
    material_index: int,
    directory: Path,
    image_cache: dict[tuple[int, int, str], Image.Image],
) -> tuple[str, str, PBRMaterial, set[int], dict[str, bool]]:
    """Convert a Unity Standard material to glTF metallic/roughness PBR."""
    name = safe_material_name(renderer_index, material_index)
    saved = material.m_SavedProperties
    colors = properties(saved.m_Colors)
    textures = properties(saved.m_TexEnvs)
    floats = properties(saved.m_Floats)
    keywords = set((getattr(material, "m_ShaderKeywords", "") or "").split())
    keywords.update(getattr(material, "m_ValidKeywords", []) or [])
    red, green, blue, alpha = color_channels(colors.get("_Color"))
    lines = [
        f"newmtl {name}",
        f"Kd {red:.6f} {green:.6f} {blue:.6f}",
        f"d {alpha:.6f}",
        "Ns 24",
        "illum 2",
    ]

    diffuse = textures.get("_MainTex") or textures.get("_BaseMap")
    base_image, base_id = texture_image(diffuse, image_cache, mode="RGBA")
    texture_ids = {base_id} if base_id is not None else set()
    if base_image is not None:
        filename = f"texture-{renderer_index}-{material_index}.png"
        base_image.save(directory / filename, format="PNG", optimize=True)
        lines.append(f"map_Kd {filename}")

    mode = float(floats.get("_Mode", 0.0))
    is_cutout = mode == 1.0 or "_ALPHATEST_ON" in keywords
    alpha_cutoff = float(floats.get("_Cutoff", 0.5)) if is_cutout else None

    normal_image, normal_id = unpack_normal_map(
        textures.get("_BumpMap"),
        image_cache,
        bump_scale=float(floats.get("_BumpScale", 1.0)),
    )
    if normal_id is not None:
        texture_ids.add(normal_id)

    metallic_env = textures.get("_MetallicGlossMap")
    specular_env = textures.get("_SpecGlossMap")
    surface_env = metallic_env if metallic_env and metallic_env.m_Texture else specular_env
    surface_image, surface_id = texture_image(surface_env, image_cache, mode="RGBA")
    if surface_id is not None:
        texture_ids.add(surface_id)
    gloss_scale = float(np.clip(floats.get("_GlossMapScale", 1.0), 0.0, 1.0))
    smoothness_from_albedo = float(floats.get("_SmoothnessTextureChannel", 0.0)) == 1.0
    metal_rough_image = None
    if surface_image is not None:
        metal_rough_image = packed_metallic_roughness(
            surface_image,
            base_image,
            gloss_scale=gloss_scale,
            smoothness_from_albedo=smoothness_from_albedo,
            specular_workflow=surface_env is specular_env,
        )
        metallic_factor = 1.0
        roughness_factor = 1.0
    else:
        metallic_factor = float(np.clip(floats.get("_Metallic", 0.0), 0.0, 1.0))
        roughness_factor = float(np.clip(1.0 - floats.get("_Glossiness", 0.0), 0.0, 1.0))

    emission_image, emission_id = texture_image(textures.get("_EmissionMap"), image_cache, mode="RGB")
    if emission_id is not None:
        texture_ids.add(emission_id)
    emission_color = color_channels(colors.get("_EmissionColor"))
    emission_intensity = float(floats.get("_EmissiveIntensity", 1.0))
    emission_factor = np.asarray(emission_color[:3], dtype=np.float64) * emission_intensity
    has_emission = emission_image is not None or np.any(emission_factor > 0)

    pbr = PBRMaterial(
        name=name,
        baseColorFactor=np.asarray([red, green, blue, alpha], dtype=np.float64),
        baseColorTexture=base_image,
        metallicFactor=metallic_factor,
        roughnessFactor=roughness_factor,
        metallicRoughnessTexture=metal_rough_image,
        normalTexture=normal_image,
        emissiveFactor=emission_factor if has_emission else None,
        emissiveTexture=emission_image,
        alphaMode="MASK" if is_cutout else "OPAQUE",
        alphaCutoff=alpha_cutoff,
        doubleSided=False,
    )
    flags = {
        "alpha": is_cutout,
        "normal": normal_image is not None,
        "metalRough": metal_rough_image is not None,
        "emissive": has_emission,
    }
    return name, "\n".join(lines), pbr, texture_ids, flags


def add_scene(target: trimesh.Scene, source: trimesh.Scene, prefix: str) -> None:
    for node in source.graph.nodes_geometry:
        transform, geometry_name = source.graph.get(node)
        target.add_geometry(
            source.geometry[geometry_name],
            node_name=f"{prefix}-{node}",
            geom_name=f"{prefix}-{geometry_name}",
            transform=transform,
        )


def reconstruct_bundle(bundle_path: Path, work_dir: Path) -> tuple[trimesh.Scene, dict[str, Any]]:
    environment = UnityPy.load(str(bundle_path))
    scene = trimesh.Scene()
    renderer_count = 0
    source_vertices = 0
    texture_ids: set[int] = set()
    image_cache: dict[tuple[int, int, str], Image.Image] = {}
    material_counts = {"alpha": 0, "normal": 0, "metalRough": 0, "emissive": 0}
    material_count = 0

    for object_index, object_reader in enumerate(environment.objects):
        if object_reader.type.name != "MeshRenderer":
            continue
        renderer = object_reader.read()
        if getattr(renderer, "m_Enabled", True) is False:
            continue
        game_object = pptr_object(renderer.m_GameObject)
        mesh = get_mesh(renderer)
        if game_object is None or mesh is None:
            continue
        if game_object.m_Name.lower() in SKIP_RENDERERS or mesh.m_Name.lower() in SKIP_RENDERERS:
            continue

        renderer_dir = work_dir / f"renderer-{object_index}"
        renderer_dir.mkdir()
        material_names: list[str | None] = []
        material_sources: list[str] = []
        pbr_materials: dict[str, PBRMaterial] = {}
        material_pointers = renderer.m_Materials or []
        for material_index in range(len(mesh.m_SubMeshes)):
            if material_index >= len(material_pointers) or not material_pointers[material_index]:
                material_names.append(None)
                continue
            material = pptr_object(material_pointers[material_index])
            material_name, material_source, pbr, material_texture_ids, flags = export_material(
                material, object_index, material_index, renderer_dir, image_cache
            )
            material_names.append(material_name)
            material_sources.append(material_source)
            pbr_materials[material_name] = pbr
            material_count += 1
            texture_ids.update(material_texture_ids)
            for flag, enabled in flags.items():
                material_counts[flag] += int(enabled)

        obj_path = renderer_dir / f"{mesh.m_Name}.obj"
        obj_path.write_text(export_mesh_obj(mesh, material_names), encoding="utf-8")
        (renderer_dir / f"{mesh.m_Name}.mtl").write_text(
            "\n\n".join(material_sources), encoding="utf-8"
        )
        rendered = trimesh.load(obj_path, force="scene", process=False)
        for geometry in rendered.geometry.values():
            material_name = getattr(geometry.visual.material, "name", None)
            if material_name in pbr_materials:
                geometry.visual.material = pbr_materials[material_name]
        rendered.apply_transform(component_transform_rh(pptr_object(game_object.m_Transform)))
        add_scene(scene, rendered, str(object_index))
        renderer_count += 1
        source_vertices += int(mesh.m_VertexData.m_VertexCount)

    if not scene.geometry:
        raise RuntimeError("bundle contains no visible mesh renderers")

    bounds = scene.bounds
    metadata = {
        "parts": renderer_count,
        "primitives": len(scene.geometry),
        "vertices": sum(len(geometry.vertices) for geometry in scene.geometry.values()),
        "sourceVertices": source_vertices,
        "triangles": sum(len(geometry.faces) for geometry in scene.geometry.values()),
        "textures": len(texture_ids),
        "materials": material_count,
        "alphaMaterials": material_counts["alpha"],
        "normalMaterials": material_counts["normal"],
        "metalRoughMaterials": material_counts["metalRough"],
        "emissiveMaterials": material_counts["emissive"],
        "bounds": {
            "min": [round(float(value), 6) for value in bounds[0]],
            "max": [round(float(value), 6) for value in bounds[1]],
            "size": [round(float(value), 6) for value in (bounds[1] - bounds[0])],
        },
    }
    return scene, metadata


def descendants(value: dict[str, Any]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for child in value.get("ContainedObjects", []):
        output.append(child)
        output.extend(descendants(child))
    for state in value.get("States", {}).values():
        output.append(state)
        output.extend(descendants(state))
    return output


def recover_runtime_sources(
    catalog: dict[str, dict[str, Any]],
    save: dict[str, Any],
) -> tuple[dict[str, str | None], dict[str, str | None], dict[str, str | None], dict[str, str]]:
    hunters = json.loads((SHARED_DATA / "hunters.json").read_text(encoding="utf-8"))
    enemies = json.loads((SHARED_DATA / "enemies.json").read_text(encoding="utf-8"))
    bosses = json.loads((SHARED_DATA / "bosses.json").read_text(encoding="utf-8"))
    top_by_slug = {
        slug(value.get("Nickname", "")): value
        for value in save["ObjectStates"]
        if value.get("Nickname")
    }
    standees: dict[str, str] = {}

    def recover(model_id: str) -> str | None:
        top = top_by_slug.get(model_id)
        if not top:
            return None
        nested = descendants(top)
        asset = next(
            (value for value in nested if value.get("CustomAssetbundle", {}).get("AssetbundleURL")),
            None,
        )
        if asset:
            url = asset["CustomAssetbundle"]["AssetbundleURL"]
            catalog.setdefault(model_id, {
                "bundle": munge(url) + ".unity3d",
                "url": url,
                "source": "runtime-recovered",
            })
            return model_id
        figurine = next(
            (value for value in nested if value.get("CustomImage", {}).get("ImageURL")),
            None,
        )
        if figurine:
            standees[model_id] = figurine["CustomImage"]["ImageURL"]
        return None

    hunter_runtime = {key: value.get("art", {}).get("mini") for key, value in hunters.items()}
    enemy_runtime = {
        key: value.get("mini") or recover(key)
        for key, value in enemies.items()
    }
    boss_runtime = {
        key: value.get("mini") or recover(key)
        for key, value in bosses.items()
    }
    return hunter_runtime, enemy_runtime, boss_runtime, standees


def cached_image(url: str) -> Path | None:
    stem = munge(url)
    for extension in (".png", ".jpg", ".jpeg"):
        candidate = MODS / "Images" / f"{stem}{extension}"
        if candidate.exists():
            return candidate
    return None


def stage_standee(model_id: str, url: str, output_dir: Path) -> dict[str, Any]:
    source = cached_image(url)
    if not source:
        raise FileNotFoundError(f"missing cached standee image for {model_id}")
    destination = output_dir / f"{model_id}-standee.webp"
    with Image.open(source) as image:
        image.thumbnail((MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE), Image.Resampling.LANCZOS)
        image.save(destination, format="WEBP", quality=84, method=6)
        width, height = image.size
    data = destination.read_bytes()
    return {
        "file": f"/bloodborne/minis/{destination.name}",
        "width": width,
        "height": height,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def canonical_slug(slugs: list[str]) -> str:
    hunter = next((value for value in slugs if value.endswith("-hunter")), None)
    if hunter:
        return hunter
    non_weapon = next((value for value in slugs if not value.endswith("-weapon")), None)
    return non_weapon or slugs[0]


def optimize(raw_path: Path, output_path: Path) -> None:
    result = subprocess.run(
        ["node", str(OPTIMIZER), str(raw_path), str(output_path)],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout or "GLB optimizer failed")


def optimized_glb_stats(path: Path) -> dict[str, int]:
    payload = path.read_bytes()
    if payload[:4] != b"glTF" or len(payload) < 20:
        raise RuntimeError("optimizer produced an invalid GLB")
    offset = 12
    document: dict[str, Any] | None = None
    while offset + 8 <= len(payload):
        length, chunk_type = struct.unpack_from("<II", payload, offset)
        chunk = payload[offset + 8:offset + 8 + length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
            break
        offset += 8 + length
    if document is None:
        raise RuntimeError("optimized GLB has no JSON chunk")
    accessors = document.get("accessors", [])
    vertices = 0
    triangles = 0
    primitives = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitives += 1
            vertices += int(accessors[primitive["attributes"]["POSITION"]]["count"])
            if "indices" in primitive:
                triangles += int(accessors[primitive["indices"]]["count"]) // 3
    materials = document.get("materials", [])
    return {
        "vertices": vertices,
        "triangles": triangles,
        "primitives": primitives,
        "textures": len(document.get("images", [])),
        "materials": len(materials),
        "alphaMaterials": sum(material.get("alphaMode") == "MASK" for material in materials),
        "normalMaterials": sum("normalTexture" in material for material in materials),
        "metalRoughMaterials": sum(
            "metallicRoughnessTexture" in material.get("pbrMetallicRoughness", {})
            for material in materials
        ),
        "emissiveMaterials": sum(
            "emissiveTexture" in material
            or any(value > 0 for value in material.get("emissiveFactor", []))
            for material in materials
        ),
    }


def write_scene_manifest(destination: Path, model_count: int, standee_count: int) -> None:
    scene_path = OUT.parent / "scene.json"
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    scene["minis"] = {
        "manifest": "/bloodborne/minis/minis-manifest.json",
        "models": model_count,
        "standees": standee_count,
    }
    with destination.open("w", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(scene, indent=1) + "\n")


def validate_staged_assets(mini_dir: Path, scene_file: Path) -> None:
    result = subprocess.run(
        [
            "node", str(VERIFIER),
            "--mini-dir", str(mini_dir.resolve()),
            "--scene", str(scene_file.resolve()),
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout or "staged asset validation failed")
    print(result.stdout.strip())


def commit_staged_assets(staged_dir: Path, staged_scene: Path) -> None:
    """Commit the validated mini directory as one versioned filesystem unit."""
    scene_path = OUT.parent / "scene.json"
    backup_dir = OUT.parent / f".minis-backup-{os.getpid()}"
    if backup_dir.exists():
        shutil.rmtree(backup_dir)

    had_live_assets = OUT.exists()
    if had_live_assets:
        os.replace(OUT, backup_dir)
    try:
        os.replace(staged_dir, OUT)
    except Exception:
        if had_live_assets and backup_dir.exists():
            os.replace(backup_dir, OUT)
        raise

    try:
        # A file replace is atomic on the same volume. The model directory and
        # its hash manifest have already moved together, so readers can never
        # observe a mixed model/manifest generation.
        os.replace(staged_scene, scene_path)
    except Exception:
        # Roll the directory back as well if the companion scene pointer fails.
        failed_dir = OUT.parent / f".minis-failed-{os.getpid()}"
        os.replace(OUT, failed_dir)
        if had_live_assets and backup_dir.exists():
            os.replace(backup_dir, OUT)
        shutil.rmtree(failed_dir, ignore_errors=True)
        raise

    if backup_dir.exists():
        shutil.rmtree(backup_dir)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prune-legacy",
        action="store_true",
        help="remove obsolete top-level OBJ/JPG mini files after successful GLB export",
    )
    args = parser.parse_args()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    staged_dir = Path(tempfile.mkdtemp(prefix=".minis-stage-", dir=OUT.parent))
    staged_scene = OUT.parent / f".scene-stage-{os.getpid()}.json"
    golden = json.loads(GOLD_MINIS.read_text(encoding="utf-8"))
    catalog = {
        key: {**value, "source": "golden"}
        for key, value in golden.items()
    }
    save = json.loads(WORKSHOP_SAVE.read_text(encoding="utf-8"))
    hunter_runtime, enemy_runtime, boss_runtime, standee_sources = recover_runtime_sources(
        catalog, save
    )

    bundle_groups: dict[str, list[str]] = {}
    for model_slug, entry in catalog.items():
        bundle_groups.setdefault(entry["bundle"], []).append(model_slug)

    models: dict[str, dict[str, Any]] = {}
    aliases: dict[str, str] = {}
    failures: list[tuple[str, str]] = []

    try:
        with tempfile.TemporaryDirectory(prefix="bloodborne-models-") as temp_root:
            temp = Path(temp_root)
            for index, (bundle, model_slugs) in enumerate(sorted(bundle_groups.items())):
                canonical = canonical_slug(model_slugs)
                source_path = BUNDLES / bundle
                print(f"[{index + 1:02}/{len(bundle_groups):02}] {canonical}", flush=True)
                if not source_path.exists():
                    failures.append((canonical, "bundle missing"))
                    continue
                try:
                    model_work = temp / canonical
                    model_work.mkdir()
                    scene, metadata = reconstruct_bundle(source_path, model_work)
                    raw_path = temp / f"{canonical}-raw.glb"
                    scene.export(raw_path)
                    output_path = staged_dir / f"{canonical}.glb"
                    optimize(raw_path, output_path)
                    optimized = optimized_glb_stats(output_path)
                    metadata["reconstructedVertices"] = metadata["vertices"]
                    metadata["sourceTextures"] = metadata["textures"]
                    for field in ("materials", "alphaMaterials", "normalMaterials", "metalRoughMaterials", "emissiveMaterials"):
                        metadata[f"source{field[0].upper()}{field[1:]}"] = metadata[field]
                    metadata.update(optimized)
                    payload = output_path.read_bytes()
                    models[canonical] = {
                        "file": f"/bloodborne/minis/{output_path.name}",
                        "aliases": sorted(value for value in model_slugs if value != canonical),
                        **metadata,
                        "bytes": len(payload),
                        "sha256": hashlib.sha256(payload).hexdigest(),
                    }
                    for value in model_slugs:
                        if value != canonical:
                            aliases[value] = canonical
                except Exception as error:  # keep auditing the remaining bundles
                    failures.append((canonical, str(error)[:240]))

        standees: dict[str, dict[str, Any]] = {}
        for model_id, url in standee_sources.items():
            try:
                standees[model_id] = stage_standee(model_id, url, staged_dir)
            except Exception as error:
                failures.append((model_id, str(error)[:240]))

        # Preserve the live directory if any source could not be rebuilt.
        if failures:
            print("\nFAILED MODELS:")
            for model_slug, reason in failures:
                print(f"  {model_slug}: {reason}")
            return 1

        def resolve_runtime(values: dict[str, str | None]) -> dict[str, str | None]:
            return {
                key: aliases.get(value, value) if value else None
                for key, value in values.items()
            }

        manifest = {
            "version": 2,
            "format": "glb",
            "compression": ["EXT_meshopt_compression", "EXT_texture_webp"],
            "models": dict(sorted(models.items())),
            "aliases": dict(sorted(aliases.items())),
            "standees": dict(sorted(standees.items())),
            "runtime": {
                "hunters": resolve_runtime(hunter_runtime),
                "enemies": resolve_runtime(enemy_runtime),
                "bosses": resolve_runtime(boss_runtime),
            },
            "totals": {
                "models": len(models),
                "aliases": len(aliases),
                "standees": len(standees),
                "bytes": sum(value["bytes"] for value in models.values())
                + sum(value["bytes"] for value in standees.values()),
                "vertices": sum(value["vertices"] for value in models.values()),
                "triangles": sum(value["triangles"] for value in models.values()),
                "materials": sum(value["materials"] for value in models.values()),
                "alphaMaterials": sum(value["alphaMaterials"] for value in models.values()),
                "normalMaterials": sum(value["normalMaterials"] for value in models.values()),
                "metalRoughMaterials": sum(value["metalRoughMaterials"] for value in models.values()),
                "emissiveMaterials": sum(value["emissiveMaterials"] for value in models.values()),
            },
        }
        with (staged_dir / "minis-manifest.json").open("w", encoding="utf-8", newline="\n") as output:
            output.write(json.dumps(manifest, indent=1) + "\n")
        write_scene_manifest(staged_scene, len(models), len(standees))

        validate_staged_assets(staged_dir, staged_scene)
        commit_staged_assets(staged_dir, staged_scene)

        if args.prune_legacy:
            print("legacy OBJ/JPG files omitted by transactional directory replacement")
        print(
            f"done: {len(models)} models, {len(aliases)} aliases, "
            f"{len(standees)} standees, {manifest['totals']['bytes'] / 1024 / 1024:.1f} MiB"
        )
        return 0
    finally:
        if staged_dir.exists():
            shutil.rmtree(staged_dir, ignore_errors=True)
        if staged_scene.exists():
            staged_scene.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
