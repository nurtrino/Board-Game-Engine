// One draw call of soft round particles: smoke, dust, spray, fire, sparks, tracers.
// Two instances are used by the stage, one alpha blended and one additive.
import * as THREE from 'three';

export interface Puff {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  size: number;
  /** Size multiplier reached at the end of life. */
  grow?: number;
  r: number; g: number; b: number;
  alpha?: number;
  /** Velocity kept per second (1 = no drag). */
  drag?: number;
  gravity?: number;
}

const STRIDE = 16; // x y z vx vy vz age life size grow r g b alpha drag gravity

export class Particles {
  readonly points: THREE.Points;
  private data: Float32Array;
  private count = 0;
  private pos: THREE.BufferAttribute;
  private col: THREE.BufferAttribute;
  private size: THREE.BufferAttribute;
  private material: THREE.ShaderMaterial;

  constructor(private max: number, additive: boolean) {
    this.data = new Float32Array(max * STRIDE);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 4), 4);
    this.size = new THREE.BufferAttribute(new Float32Array(max), 1);
    for (const a of [this.pos, this.col, this.size]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aSize', this.size);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uScale: { value: 600 },
        uFogColor: { value: new THREE.Color(0x8a9199) },
        uFogDensity: { value: 0.004 },
        uAdditive: { value: additive ? 1 : 0 },
      },
      vertexShader: /* glsl */`
        attribute vec4 aColor; attribute float aSize;
        uniform float uScale;
        varying vec4 vColor; varying float vDepth;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vColor = aColor; vDepth = -mv.z;
          gl_PointSize = min(512.0, aSize * uScale / max(0.5, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFogColor; uniform float uFogDensity; uniform float uAdditive;
        varying vec4 vColor; varying float vDepth;
        float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float pNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          a *= a;
          // smoke is not a disc: break its edge up and light it from above
          float billow = pNoise(gl_PointCoord * 3.4 + vColor.rg * 37.0 + vDepth * 0.013);
          a *= mix(1.0, 0.45 + billow * 1.05, 1.0 - uAdditive);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          vec3 lit = vColor.rgb * mix(1.0, 0.72 + (1.0 - gl_PointCoord.y) * 0.62, 1.0 - uAdditive);
          vec3 c = mix(lit, uFogColor, fog * (1.0 - uAdditive)) * (1.0 + uAdditive * 1.8);
          float alpha = vColor.a * a * (1.0 - fog * uAdditive);
          gl_FragColor = vec4(c, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  setView(pixelHeight: number, fovDeg: number, fogColor: THREE.Color, fogDensity: number) {
    this.material.uniforms.uScale.value = pixelHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    (this.material.uniforms.uFogColor.value as THREE.Color).copy(fogColor);
    this.material.uniforms.uFogDensity.value = fogDensity;
  }

  emit(p: Puff) {
    let i = this.count;
    if (i >= this.max) {
      // Full: recycle the oldest-looking slot instead of dropping the new puff.
      i = Math.floor(Math.random() * this.max);
    } else this.count += 1;
    const d = this.data, o = i * STRIDE;
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z;
    d[o + 3] = p.vx ?? 0; d[o + 4] = p.vy ?? 0; d[o + 5] = p.vz ?? 0;
    d[o + 6] = 0; d[o + 7] = Math.max(0.01, p.life);
    d[o + 8] = p.size; d[o + 9] = p.grow ?? 1;
    d[o + 10] = p.r; d[o + 11] = p.g; d[o + 12] = p.b; d[o + 13] = p.alpha ?? 1;
    d[o + 14] = p.drag ?? 1; d[o + 15] = p.gravity ?? 0;
  }

  update(dt: number) {
    const d = this.data;
    const pos = this.pos.array as Float32Array;
    const col = this.col.array as Float32Array;
    const size = this.size.array as Float32Array;
    let n = this.count;
    for (let i = 0; i < n;) {
      const o = i * STRIDE;
      d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) {
        n -= 1;
        if (i !== n) d.copyWithin(o, n * STRIDE, n * STRIDE + STRIDE);
        continue;
      }
      const drag = Math.pow(d[o + 14], dt);
      d[o + 3] *= drag; d[o + 4] = d[o + 4] * drag - d[o + 15] * dt; d[o + 5] *= drag;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      const k = d[o + 6] / d[o + 7];
      pos[i * 3] = d[o]; pos[i * 3 + 1] = d[o + 1]; pos[i * 3 + 2] = d[o + 2];
      size[i] = d[o + 8] * (1 + (d[o + 9] - 1) * k);
      // quick in, slow out
      const fade = Math.min(1, k * 8) * (1 - k) * (1 - k * 0.35);
      col[i * 4] = d[o + 10]; col[i * 4 + 1] = d[o + 11]; col[i * 4 + 2] = d[o + 12]; col[i * 4 + 3] = d[o + 13] * fade;
      i += 1;
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    if (n > 0) {
      this.pos.needsUpdate = true;
      this.col.needsUpdate = true;
      this.size.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
