// The set: ground, sea, sky tint, foliage and flags. Everything here is built once per battle.
import * as THREE from 'three';
import { POWERS } from '@bge/shared';
import { combatantHex, isPower } from '../model';
import type { Terrain } from '../timeline';
import { heightAt, SHORE_X, type Climate, type Scatter } from './layout';
import type { FoliageModel } from './assets';

export interface Look {
  /** Multiplies the grass texture. */
  grass: THREE.Color;
  /** 0 keeps the texture colour, 1 uses only its brightness (sand, snow). */
  desaturate: number;
  dirt: THREE.Color;
  /** How much bare earth shows through. */
  bare: number;
  foliage: THREE.Color;
  waterDeep: THREE.Color;
  waterShallow: THREE.Color;
  /** Scene exposure and light warmth. */
  sun: THREE.Color;
  sunIntensity: number;
  fogDensity: number;
  dust: THREE.Color;
}

export function lookFor(climate: Climate, terrain: Terrain, cold: boolean): Look {
  const c = (hex: number) => new THREE.Color(hex);
  const base: Look = {
    grass: c(0xb9c79a), desaturate: 0, dirt: c(0x6b5a44), bare: 0.38, foliage: c(0xffffff),
    waterDeep: c(0x123a52), waterShallow: c(0x2f7f86), sun: c(0xfff2dd), sunIntensity: 2.4, fogDensity: 0.0042, dust: c(0x8a7a62),
  };
  if (climate === 'desert') {
    Object.assign(base, { grass: c(0xe6c489), desaturate: 0.92, dirt: c(0xc79a5e), bare: 0.55, foliage: c(0xc9c08a), sun: c(0xffe9c4), sunIntensity: 3, fogDensity: 0.0034, dust: c(0xcaa873) });
  } else if (climate === 'snow') {
    Object.assign(base, { grass: c(0xf1f5fa), desaturate: 1, dirt: c(0x8d8e90), bare: 0.2, foliage: c(0xb9c7c4), sun: c(0xe8f0ff), sunIntensity: 2.1, fogDensity: 0.0056, dust: c(0xe8edf2) });
  } else if (climate === 'jungle') {
    Object.assign(base, { grass: c(0x9fc77a), desaturate: 0, dirt: c(0x5a4a34), bare: 0.3, foliage: c(0xd8f0c0), waterDeep: c(0x0f4a5e), waterShallow: c(0x35a39a), sun: c(0xfff0cf), sunIntensity: 2.7, fogDensity: 0.0046, dust: c(0x7a6a4c) });
  }
  if (terrain === 'sea') {
    base.fogDensity = 0.0026;
    if (cold) { base.waterDeep = c(0x1a3340); base.waterShallow = c(0x3b6670); }
  }
  return base;
}

// ---------- a grid that is fine in the middle and coarse far away ----------

function warpedPlane(size: number, segments: number, power: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(2, 2, segments, segments);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const half = size / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setX(i, Math.sign(x) * Math.pow(Math.abs(x), power) * half);
    p.setZ(i, Math.sign(z) * Math.pow(Math.abs(z), power) * half);
  }
  return g;
}

// ---------- ground ----------

const NOISE_GLSL = /* glsl */`
  float bHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float bNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(bHash(i), bHash(i + vec2(1.0, 0.0)), f.x), mix(bHash(i + vec2(0.0, 1.0)), bHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float bFbm(vec2 p) { return bNoise(p) * 0.55 + bNoise(p * 2.3 + 11.0) * 0.3 + bNoise(p * 5.1 + 3.0) * 0.15; }
`;

export function buildGround(terrain: Terrain, look: Look, grass: THREE.Texture | null, seed: number): THREE.Mesh {
  const g = warpedPlane(1500, 176, 1.55);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i), terrain, seed));
  g.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  const uniforms = {
    uGrass: { value: grass },
    uHasGrass: { value: grass ? 1 : 0 },
    uTint: { value: look.grass },
    uDirt: { value: look.dirt },
    uDesat: { value: look.desaturate },
    uBare: { value: look.bare },
    uShore: { value: terrain === 'shore' ? SHORE_X : -1e6 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGroundPos;
        uniform sampler2D uGrass; uniform float uHasGrass; uniform vec3 uTint; uniform vec3 uDirt;
        uniform float uDesat; uniform float uBare; uniform float uShore;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 w = vGroundPos.xz;
          // Two scales of the same texture, rotated against each other, so no repeat ever lines up.
          vec3 fineTex = texture2D(uGrass, w * 0.085).rgb;
          vec3 broadTex = texture2D(uGrass, mat2(0.8, -0.6, 0.6, 0.8) * w * 0.019 + 0.37).rgb;
          vec3 tex = mix(vec3(0.42, 0.5, 0.3), mix(fineTex, broadTex, 0.5) * 1.25, uHasGrass);
          float lum = dot(tex, vec3(0.3, 0.55, 0.15));
          vec3 ground = mix(tex, vec3(lum * 1.55), uDesat) * uTint;
          // broad patches of lighter and darker growth
          float macro = bFbm(w * 0.011);
          ground *= mix(0.7, 1.22, macro);
          // bare earth: scattered patches, heavier where the armies churn the middle of the field
          float churn = 1.0 - smoothstep(18.0, 70.0, length(w * vec2(0.55, 1.0)));
          float patches = bFbm(w * 0.045 + 40.0);
          float bare = smoothstep(0.62 - uBare * 0.5 - churn * 0.22, 0.86 - uBare * 0.3, patches + churn * 0.12);
          vec3 dirt = uDirt * mix(0.75, 1.2, bNoise(w * 0.6));
          ground = mix(ground, dirt, bare * (1.0 - uDesat * 0.6));
          // wet sand at the waterline
          float beach = 1.0 - smoothstep(0.0, 2.6, vGroundPos.y);
          beach *= step(-1.0e5, uShore);
          ground = mix(ground, vec3(0.74, 0.66, 0.5) * mix(0.55, 1.0, smoothstep(-0.4, 1.4, vGroundPos.y)), beach);
          diffuseColor.rgb *= ground;
        }`);
  };
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

// ---------- sea ----------

export interface Swell { dir: [number, number]; amp: number; len: number; speed: number }
export const SWELL: Swell[] = [
  { dir: [0.86, 0.5], amp: 0.62, len: 46, speed: 0.9 },
  { dir: [-0.35, 0.94], amp: 0.3, len: 23, speed: 1.15 },
  { dir: [0.6, -0.8], amp: 0.14, len: 11, speed: 1.5 },
];

/** Height of the sea surface. The water shader computes exactly the same sum. */
export function waveHeight(x: number, z: number, t: number, calm = 1): number {
  let h = 0;
  for (const w of SWELL) {
    const k = (Math.PI * 2) / w.len;
    h += Math.sin((x * w.dir[0] + z * w.dir[1]) * k + t * w.speed) * w.amp;
  }
  return h * calm;
}

export function buildWater(terrain: Terrain, look: Look, normals: THREE.Texture | null, fogColor: THREE.Color): THREE.Mesh {
  const g = warpedPlane(3200, 200, 1.75);
  const calm = terrain === 'sea' ? 1 : 0.38;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCalm: { value: calm },
      uNormals: { value: normals },
      uHasNormals: { value: normals ? 1 : 0 },
      uDeep: { value: look.waterDeep },
      uShallow: { value: look.waterShallow },
      uSky: { value: fogColor.clone() },
      uSunDir: { value: new THREE.Vector3(-0.45, 0.62, 0.64).normalize() },
      uSunColor: { value: look.sun },
      uFogColor: { value: fogColor },
      uFogDensity: { value: look.fogDensity },
      uShore: { value: terrain === 'shore' ? SHORE_X : -1e6 },
      uDir: { value: SWELL.map((w) => new THREE.Vector2(w.dir[0], w.dir[1])) },
      uWave: { value: SWELL.map((w) => new THREE.Vector3(w.amp, (Math.PI * 2) / w.len, w.speed)) },
    },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uCalm; uniform vec2 uDir[3]; uniform vec3 uWave[3];
      varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
      void main() {
        vec3 p = position;
        float distant = smoothstep(260.0, 700.0, length(p.xz));
        float h = 0.0; vec2 slope = vec2(0.0);
        for (int i = 0; i < 3; i++) {
          // short waves cannot be drawn on the coarse far grid, so they fade out with distance
          float keep = i == 0 ? 1.0 - distant * 0.6 : 1.0 - distant;
          float ph = dot(p.xz, uDir[i]) * uWave[i].y + uTime * uWave[i].z;
          h += sin(ph) * uWave[i].x * keep;
          slope += uDir[i] * cos(ph) * uWave[i].x * uWave[i].y * keep;
        }
        p.y += h * uCalm;
        vCrest = h * uCalm;
        vNormal = normalize(vec3(-slope.x * uCalm, 1.0, -slope.y * uCalm));
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uNormals; uniform float uHasNormals;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunDir; uniform vec3 uSunColor;
      uniform vec3 uFogColor; uniform float uFogDensity; uniform float uShore;
      varying vec3 vWorld; varying vec3 vNormal; varying float vCrest;
      ${NOISE_GLSL}
      void main() {
        vec3 view = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        // ripples: two layers of the normal map drifting across each other, weaker far away
        vec2 uv = vWorld.xz;
        vec3 n1 = texture2D(uNormals, uv * 0.045 + vec2(uTime * 0.021, uTime * 0.013)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormals, uv * 0.017 - vec2(uTime * 0.012, -uTime * 0.017)).xyz * 2.0 - 1.0;
        vec3 ripple = mix(vec3(0.0, 0.0, 1.0), normalize(n1 + n2), uHasNormals);
        float rippleAmt = 0.34 / (1.0 + dist * 0.006);
        vec3 n = normalize(vNormal + vec3(ripple.x, 0.0, ripple.y) * rippleAmt);
        float fres = pow(1.0 - max(dot(n, view), 0.0), 5.0);
        fres = 0.03 + 0.97 * fres;
        // body colour: deep, lifting toward the lit side of each swell
        float lift = smoothstep(-0.7, 0.9, vCrest);
        vec3 body = mix(uDeep, uShallow, lift * 0.42 + 0.1 * bFbm(uv * 0.01));
        // shallows off a beach
        float shallow = 1.0 - smoothstep(0.0, 34.0, uShore - vWorld.x);
        shallow *= step(-1.0e5, uShore);
        body = mix(body, uShallow * 1.25, shallow * 0.75);
        vec3 sky = uSky * (0.85 + 0.5 * max(n.y, 0.0));
        vec3 col = mix(body, sky, fres * 0.85);
        // sun glitter
        vec3 h = normalize(uSunDir + view);
        float spec = pow(max(dot(n, h), 0.0), 220.0);
        col += uSunColor * spec * 1.6;
        float sss = pow(max(dot(view, -uSunDir), 0.0), 3.0) * lift;
        col += uShallow * sss * 0.25;
        // foam: whitecaps on the highest crests, and a moving line of surf at the beach
        float cap = smoothstep(0.62, 0.95, vCrest + bFbm(uv * 0.35 + uTime * 0.05) * 0.45 - 0.22);
        float surf = shallow * smoothstep(0.55, 0.9, bFbm(vec2(uv.y * 0.12, uv.x * 0.5 + uTime * 0.55)) + shallow * 0.35);
        col = mix(col, vec3(0.93, 0.96, 0.97), clamp(cap * 0.75 + surf * 0.8, 0.0, 1.0));
        float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, material);
  mesh.frustumCulled = false;
  mesh.name = 'water';
  return mesh;
}

// ---------- sky ----------

/** Average colour of the sky just above the horizon, so the fog meets the sky without a seam. */
export function horizonColor(sky: THREE.DataTexture | null, fallback: THREE.Color): THREE.Color {
  const img = sky?.image as { data?: ArrayLike<number>; width: number; height: number } | undefined;
  if (!sky || !img?.data || !img.width) return fallback.clone();
  const half = sky.type === THREE.HalfFloatType;
  const read = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(img.data![i]) : img.data![i]);
  let r = 0, g = 0, b = 0, n = 0;
  // rows a little above the horizon; the file stores the top row first
  for (const v of [0.455, 0.47, 0.485]) {
    const y = Math.min(img.height - 1, Math.max(0, Math.round(v * img.height)));
    for (let x = 0; x < img.width; x += 24) {
      const o = (y * img.width + x) * 4;
      r += Math.min(4, read(o)); g += Math.min(4, read(o + 1)); b += Math.min(4, read(o + 2));
      n += 1;
    }
  }
  if (n === 0 || !Number.isFinite(r + g + b)) return fallback.clone();
  return new THREE.Color(r / n, g / n, b / n);
}

// ---------- foliage ----------

export function buildFoliage(models: Record<string, FoliageModel | null>, scatter: Scatter[], terrain: Terrain, look: Look, seed: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'foliage';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const kind of ['tree1', 'tree2', 'bush'] as const) {
    const model = models[kind];
    const items = scatter.filter((s) => s.kind === kind);
    if (!model || items.length === 0) continue;
    for (const part of model.parts) {
      const material = part.material.clone();
      material.color.multiply(look.foliage);
      const mesh = new THREE.InstancedMesh(part.geometry, material, items.length);
      items.forEach((s, i) => {
        q.setFromAxisAngle(up, s.yaw);
        m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z, terrain, seed) - 0.15, s.z), q, new THREE.Vector3(s.scale, s.scale, s.scale));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.castShadow = false; // leaf cards in the shadow pass cost more than they show
      mesh.receiveShadow = true;
      mesh.userData.sharedGeometry = true;
      mesh.userData.sharedMaps = true;
      group.add(mesh);
    }
  }
  return group;
}

// ---------- flags ----------

export interface Flag { group: THREE.Group; cloth: THREE.Mesh; rest: Float32Array; phase: number }

function flagTexture(power: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const ctx = c.getContext('2d')!;
  const hex = combatantHex(power);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  const shade = ctx.createLinearGradient(0, 0, 0, c.height);
  shade.addColorStop(0, 'rgba(255,255,255,0.16)');
  shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 6;
  ctx.strokeRect(9, 9, c.width - 18, c.height - 18);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 92px "Inter Variable", Inter, system-ui, sans-serif';
  const label = power === 'china' ? 'CHN' : isPower(power) ? POWERS[power].short : '';
  ctx.fillText(label, c.width / 2, c.height / 2 + 6, c.width - 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildFlag(power: string, height: number): Flag {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.15, height, 8),
    new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 }),
  );
  pole.position.y = height / 2;
  pole.castShadow = true;
  group.add(pole);
  const w = height * 0.62, h = height * 0.39;
  const g = new THREE.PlaneGeometry(w, h, 14, 6);
  g.translate(w / 2, 0, 0);
  const cloth = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: flagTexture(power), side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }));
  cloth.position.set(0.1, height - h / 2 - 0.15, 0);
  cloth.castShadow = true;
  group.add(cloth);
  return { group, cloth, rest: Float32Array.from(g.attributes.position.array as Float32Array), phase: Math.random() * 6 };
}

export function waveFlag(flag: Flag, t: number) {
  const p = flag.cloth.geometry.attributes.position as THREE.BufferAttribute;
  const rest = flag.rest;
  for (let i = 0; i < p.count; i++) {
    const x = rest[i * 3], y = rest[i * 3 + 1];
    const k = x * 0.16; // the hoist is pinned, the fly moves most
    p.setZ(i, Math.sin(x * 0.95 - t * 5.2 + flag.phase + y * 0.4) * 0.34 * k + Math.sin(x * 0.4 - t * 2.3) * 0.2 * k);
    p.setY(i, y - k * k * 0.1);
  }
  p.needsUpdate = true;
  flag.cloth.geometry.computeVertexNormals();
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Sprite).isSprite) return;
    if (mesh.userData.sharedGeometry !== true) mesh.geometry?.dispose();
    if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) (mesh as unknown as THREE.InstancedMesh).dispose();
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!mat) continue;
      const map = (mat as THREE.MeshStandardMaterial).map;
      if (map && mesh.userData.sharedMaps !== true) map.dispose();
      mat.dispose();
    }
  });
}
