// The set: ground, sea, sky tint, foliage and flags. Everything here is built once per battle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POWERS } from '@bge/shared';
import { combatantHex, isPower } from '../model';
import type { Terrain } from '../timeline';
import { heightAt, valueNoise, SHORE_X, type Climate, type Scatter } from './layout';
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
  /** The sky dome: colour overhead, colour at the horizon (also the haze), and the sun's glow. */
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  /** Unit vector toward the sun. Low, so everything throws a long shadow. */
  sunDir: THREE.Vector3;
}

export function lookFor(climate: Climate, terrain: Terrain, cold: boolean): Look {
  const c = (hex: number) => new THREE.Color(hex);
  const base: Look = {
    grass: c(0x93a86a), desaturate: 0, dirt: c(0x5d4c38), bare: 0.24, foliage: c(0xffffff),
    waterDeep: c(0x0f3550), waterShallow: c(0x2c7c88), sun: c(0xffe6c2), sunIntensity: 3.4, fogDensity: 0.0034, dust: c(0x8a7a62),
    zenith: c(0x3d6294), horizon: c(0xcfc3ae), glow: c(0xffd9a6),
    sunDir: new THREE.Vector3(-0.66, 0.46, 0.44).normalize(),
  };
  if (climate === 'desert') {
    Object.assign(base, { grass: c(0xdcb87c), desaturate: 0.92, dirt: c(0xbf9258), bare: 0.5, foliage: c(0xc9c08a), sun: c(0xffe4b4), sunIntensity: 3.8, fogDensity: 0.003, dust: c(0xcaa873), zenith: c(0x4a7cb4), horizon: c(0xe9d3a8), glow: c(0xffe2ac) });
  } else if (climate === 'snow') {
    Object.assign(base, { grass: c(0xeef3f8), desaturate: 1, dirt: c(0x8d8e90), bare: 0.16, foliage: c(0xb9c7c4), sun: c(0xfff0dc), sunIntensity: 2.9, fogDensity: 0.0046, dust: c(0xe8edf2), zenith: c(0x587494), horizon: c(0xd9e0e6), glow: c(0xfff0d8) });
  } else if (climate === 'jungle') {
    Object.assign(base, { grass: c(0x86ac5c), desaturate: 0, dirt: c(0x55452f), bare: 0.2, foliage: c(0xd8f0c0), waterDeep: c(0x0f4a5e), waterShallow: c(0x35a39a), sun: c(0xffe8c0), sunIntensity: 3.5, fogDensity: 0.0038, dust: c(0x7a6a4c), zenith: c(0x3a6c94), horizon: c(0xc9d2b4) });
  }
  if (terrain === 'sea') {
    base.fogDensity = 0.0024;
    base.horizon = cold ? c(0xbfc9d0) : c(0xcfd5d2);
    if (cold) { base.waterDeep = c(0x1a3340); base.waterShallow = c(0x3b6670); base.zenith = c(0x54708c); }
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
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 });
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
        ${NOISE_GLSL}
        float groundRelief(vec2 w) { return bFbm(w * 0.42) * 0.7 + bNoise(w * 1.9) * 0.3; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 w = vGroundPos.xz;
          float away = length(cameraPosition - vGroundPos);
          // Three scales of one texture, each turned against the others: crisp blades up close,
          // broad colour far away, and no repeat that ever lines up.
          vec3 fineTex = texture2D(uGrass, w * 0.17).rgb;
          vec3 midTex = texture2D(uGrass, mat2(0.8, -0.6, 0.6, 0.8) * w * 0.047 + 0.37).rgb;
          vec3 farTex = texture2D(uGrass, mat2(0.6, 0.8, -0.8, 0.6) * w * 0.0105 + 0.11).rgb;
          float close = 1.0 - smoothstep(26.0, 130.0, away);
          vec3 tex = mix(mix(midTex, farTex, 0.55), mix(fineTex, midTex, 0.3), close);
          vec3 microTex = texture2D(uGrass, mat2(0.9, 0.44, -0.44, 0.9) * w * 0.58 + 0.5).rgb;
          tex = mix(tex, mix(tex, microTex, 0.62), 1.0 - smoothstep(8.0, 44.0, away));
          tex = clamp((tex - 0.36) * 1.3 + 0.36, 0.0, 1.0);
          tex = mix(vec3(0.3, 0.38, 0.2), tex, uHasGrass);
          float lum = dot(tex, vec3(0.3, 0.55, 0.15));
          vec3 ground = mix(tex * 1.9, vec3(lum * 1.75), uDesat) * uTint;
          // broad patches of lighter and darker growth
          ground *= mix(0.72, 1.16, bFbm(w * 0.013));
          // bare earth in scattered patches, and worn ground where the two lines stand
          float worn = (1.0 - smoothstep(6.0, 30.0, abs(abs(w.x) - 16.0))) * (1.0 - smoothstep(30.0, 60.0, abs(w.y)));
          float patches = bFbm(w * 0.06 + 40.0) * 0.72 + bNoise(w * 0.5) * 0.28;
          float bare = smoothstep(0.7 - uBare * 0.5 - worn * 0.2, 0.86 - uBare * 0.34, patches + worn * 0.1);
          vec3 dirt = uDirt * mix(0.6, 1.25, bNoise(w * 0.75)) * mix(0.85, 1.1, bNoise(w * 3.1));
          ground = mix(ground, dirt, bare * (1.0 - uDesat * 0.6));
          // wet sand at the waterline
          float beach = 1.0 - smoothstep(0.0, 2.6, vGroundPos.y);
          beach *= step(-1.0e5, uShore);
          ground = mix(ground, vec3(0.74, 0.66, 0.5) * mix(0.55, 1.0, smoothstep(-0.4, 1.4, vGroundPos.y)), beach);
          diffuseColor.rgb *= ground;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // fine relief, so the low sun rakes across the ground instead of lighting a flat sheet
          vec2 w = vGroundPos.xz;
          float fade = 1.0 - smoothstep(60.0, 220.0, length(cameraPosition - vGroundPos));
          float h0 = groundRelief(w);
          float hx = groundRelief(w + vec2(0.4, 0.0)) - h0;
          float hz = groundRelief(w + vec2(0.0, 0.4)) - h0;
          vec3 nWorld = inverseTransformDirection(normal, viewMatrix);
          nWorld = normalize(nWorld + vec3(-hx, 0.0, -hz) * 2.6 * fade);
          normal = normalize((viewMatrix * vec4(nWorld, 0.0)).xyz);
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

/** How high the open sea runs (1 = the full swell). The ships are small against it, so it is kept moderate. */
export const SEA_STATE = 0.62;

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
  const skyTint = look.horizon.clone().lerp(look.zenith, 0.45);
  const g = warpedPlane(3200, 200, 1.75);
  const calm = terrain === 'sea' ? SEA_STATE : 0.38;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCalm: { value: calm },
      uNormals: { value: normals },
      uHasNormals: { value: normals ? 1 : 0 },
      uDeep: { value: look.waterDeep },
      uShallow: { value: look.waterShallow },
      uSky: { value: skyTint },
      uSunDir: { value: look.sunDir.clone() },
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
        float cap = smoothstep(0.7, 0.98, vCrest + bFbm(uv * 0.5 + uTime * 0.05) * 0.5 - 0.24);
        float surf = shallow * smoothstep(0.55, 0.9, bFbm(vec2(uv.y * 0.12, uv.x * 0.5 + uTime * 0.55)) + shallow * 0.35);
        col = mix(col, vec3(0.93, 0.96, 0.97), clamp(cap * 0.42 + surf * 0.8, 0.0, 1.0));
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

/** A painted sky: clear overhead, hazy at the horizon, with a low sun and thin bands of cloud. */
export function buildSky(look: Look): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: look.zenith }, uHorizon: { value: look.horizon }, uGlow: { value: look.glow },
      uSunDir: { value: look.sunDir },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunDir;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.3));
        float sun = max(dot(d, uSunDir), 0.0);
        col += uGlow * (pow(sun, 5.0) * 0.32 + pow(sun, 48.0) * 0.7 + pow(sun, 1400.0) * 9.0);
        // high thin cloud, stretched toward the horizon
        // below the horizon there is no sky to compute (and a divide by nothing would poison the bloom)
        vec2 cuv = d.xz / max(d.y + 0.16, 0.08);
        float cloud = bFbm(cuv * 1.35 + 7.0) * 0.6 + bFbm(cuv * 3.4) * 0.4;
        float cover = smoothstep(0.56, 0.84, cloud) * smoothstep(0.0, 0.16, d.y);
        vec3 cloudCol = mix(uHorizon * 1.08, vec3(1.0), 0.45) + uGlow * pow(sun, 3.0) * 0.5;
        col = mix(col, cloudCol, cover * 0.7);
        col = mix(uHorizon * 0.92, col, smoothstep(-0.03, 0.02, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

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

// ---------- trees ----------

function lumpy(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (valueNoise(x * 2.1 + y * 1.3, z * 2.1 - y * 0.7, seed) - 0.5) * amount;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}

/** Unit-height tree shapes: a trunk and a crown, each one flat-shaded piece. */
function treeShapes(kind: 'broad' | 'conifer'): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  if (kind === 'conifer') {
    const trunk = new THREE.CylinderGeometry(0.025, 0.045, 0.3, 6).translate(0, 0.15, 0);
    const tiers = [0, 1, 2, 3].map((i) => new THREE.ConeGeometry(0.2 - i * 0.04, 0.34 - i * 0.03, 8).translate(0, 0.36 + i * 0.17, 0));
    return { trunk, crown: mergeGeometries(tiers, false)! };
  }
  const trunk = new THREE.CylinderGeometry(0.03, 0.055, 0.5, 6).translate(0, 0.25, 0);
  const lumps = [[0, 0.68, 0, 0.3], [0.17, 0.58, 0.06, 0.2], [-0.15, 0.6, -0.08, 0.21], [0.02, 0.56, -0.17, 0.18], [-0.04, 0.84, 0.05, 0.19]]
    .map(([x, y, z, r], i) => lumpy(new THREE.IcosahedronGeometry(r, 1), 0.34, 11 + i).translate(x, y, z));
  return { trunk, crown: mergeGeometries(lumps, false)! };
}

/** The woods around the field. Cheap shapes in the climate's colours, lit and shadowed like everything else. */
export function buildTrees(scatter: Scatter[], terrain: Terrain, climate: Climate, seed: number): THREE.Object3D {
  const group = new THREE.Group();
  group.name = 'trees';
  const trees = scatter.filter((s) => s.kind !== 'bush');
  if (trees.length === 0) return group;
  const conifer = (i: number) => climate === 'snow' || (climate === 'temperate' && i % 3 === 0);
  const crownColors: Record<Climate, number[]> = {
    temperate: [0x4f7a34, 0x5f8a3a, 0x416b30, 0x6a8f3e],
    jungle: [0x3f8a3a, 0x4f9a40, 0x2f7a34, 0x62a548],
    snow: [0x4d6a58, 0x5c7a66, 0xb8c8c6, 0x41604e],
    desert: [0x7a8a48, 0x8a9550],
  };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  for (const kind of ['broad', 'conifer'] as const) {
    const items = trees.filter((_, i) => conifer(i) === (kind === 'conifer'));
    if (items.length === 0) continue;
    const shapes = treeShapes(kind);
    const trunk = new THREE.InstancedMesh(shapes.trunk, new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95, flatShading: true }), items.length);
    const crown = new THREE.InstancedMesh(shapes.crown, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), items.length);
    items.forEach((s, i) => {
      // the scatter's scale was sized for the old models: read it as a height in metres
      const h = s.scale * (kind === 'conifer' ? 1.35 : 1.15);
      const wide = h * (0.9 + valueNoise(s.x * 0.3, s.z * 0.3, seed) * 0.35);
      q.setFromAxisAngle(up, s.yaw);
      m.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z, terrain, seed) - 0.2, s.z), q, new THREE.Vector3(wide, h, wide));
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      const shades = crownColors[climate];
      color.setHex(shades[Math.floor(valueNoise(s.x, s.z, seed + 5) * shades.length) % shades.length]);
      color.multiplyScalar(0.82 + valueNoise(s.z * 0.7, s.x * 0.7, seed + 9) * 0.36);
      crown.setColorAt(i, color);
    });
    for (const mesh of [trunk, crown]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  }
  return group;
}

// ---------- flags ----------

export interface Flag { group: THREE.Group; cloth: THREE.Mesh; rest: Float32Array; phase: number }

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, points = 5, inner = 0.4) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** A nation's flag, drawn. */
export function flagCanvas(power: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 200;
  const ctx = c.getContext('2d')!;
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2;
  const fill = (color: string) => { ctx.fillStyle = color; };
  const disc = (r: number, color: string, x = cx, y = cy) => { fill(color); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  switch (power) {
    case 'germany':
      fill('#b3261e'); ctx.fillRect(0, 0, W, H);
      disc(72, '#f2f2f2');
      fill('#15161a'); ctx.fillRect(cx - 13, cy - 56, 26, 112); ctx.fillRect(cx - 56, cy - 13, 112, 26);
      break;
    case 'ussr':
      fill('#c1241b'); ctx.fillRect(0, 0, W, H);
      fill('#f2c230'); star(ctx, 78, 70, 44);
      break;
    case 'japan':
      fill('#f4f1ea'); ctx.fillRect(0, 0, W, H);
      fill('#c8281e');
      for (let i = 0; i < 16; i++) {
        const a0 = (i * Math.PI) / 8 - 0.1, a1 = (i * Math.PI) / 8 + 0.1;
        ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 30 + Math.cos(a0) * 400, cy + Math.sin(a0) * 400); ctx.lineTo(cx - 30 + Math.cos(a1) * 400, cy + Math.sin(a1) * 400); ctx.fill();
      }
      disc(46, '#c8281e', cx - 30);
      break;
    case 'uk':
      fill('#1f3f8f'); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = 34;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, H); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();
      ctx.strokeStyle = '#c8281e'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, H); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();
      fill('#f4f1ea'); ctx.fillRect(cx - 30, 0, 60, H); ctx.fillRect(0, cy - 30, W, 60);
      fill('#c8281e'); ctx.fillRect(cx - 17, 0, 34, H); ctx.fillRect(0, cy - 17, W, 34);
      break;
    case 'italy':
      fill('#1f8a43'); ctx.fillRect(0, 0, W / 3, H);
      fill('#f4f1ea'); ctx.fillRect(W / 3, 0, W / 3, H);
      fill('#c8281e'); ctx.fillRect((W * 2) / 3, 0, W / 3 + 1, H);
      break;
    case 'usa':
      fill('#f4f1ea'); ctx.fillRect(0, 0, W, H);
      fill('#b3261e');
      for (let i = 0; i < 7; i++) ctx.fillRect(0, (i * 2 * H) / 13, W, H / 13 + 0.5);
      fill('#254f9e'); ctx.fillRect(0, 0, 138, (H * 7) / 13);
      fill('#f4f1ea');
      for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) star(ctx, 16 + q * 26.5, 15 + r * 26, 8);
      break;
    case 'china':
      fill('#b3261e'); ctx.fillRect(0, 0, W, H);
      fill('#2a4fa3'); ctx.fillRect(0, 0, W / 2, H / 2);
      fill('#f4f1ea'); star(ctx, W / 4, H / 4, 40, 12, 0.6);
      disc(18, '#2a4fa3', W / 4, H / 4);
      disc(14, '#f4f1ea', W / 4, H / 4);
      break;
    default:
      fill(isPower(power) ? combatantHex(power) : '#777'); ctx.fillRect(0, 0, W, H);
      fill('#ffffff'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 92px "Inter Variable", Inter, system-ui, sans-serif';
      ctx.fillText(isPower(power) ? POWERS[power].short : '', cx, cy + 6, W - 50);
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,0.1)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  return c;
}

function flagTexture(power: string): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(flagCanvas(power));
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
