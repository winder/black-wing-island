// Fires: the Home Village bonfire, torches in halls, fire baskets on towers and
// at dungeon doors. Each fire is a bunch of low-poly flame tongues that sway,
// stretch and lick upwards (bits break off the top and vanish), with a warm
// glow, sparks drifting up and, for big fires, smoke. Everything moves in the
// shaders from one shared clock, so a hall full of torches is three draws and
// no work per frame.

import * as THREE from 'three';
import { hash2 } from './noise';

/** One fire, in its parent's space: the bottom of the flames and how tall they stand (m). */
export interface FireSpec { x: number; y: number; z: number; size: number; /** 0..1 */ smoke?: number }

const clock = { uTime: { value: 0 }, uNight: { value: 0 }, uWind: { value: new THREE.Vector2(0.14, 0.05) } };

/** Move every fire on; call once a frame. `nightness` 0 (day) .. 1 (night) brightens the glow. */
export function tickFires(dt: number, nightness: number) {
  clock.uTime.value = (clock.uTime.value + dt) % 3600;
  clock.uNight.value = nightness;
}

/** Wobbly, never-repeating-looking 0..1 flicker for a fire's light. */
export function flicker(t: number, seed = 0) {
  const n = Math.sin(t * 7.1 + seed) * 0.5 + Math.sin(t * 13.7 + seed * 2.3) * 0.3 + Math.sin(t * 29.3 + seed * 5.1) * 0.2;
  return 0.5 + 0.5 * n;
}

// The same wobble in GLSL, -1..1.
const NOISE = /* glsl */`
  float wob(float x) { return sin(x) * 0.5 + sin(x * 2.13 + 1.7) * 0.3 + sin(x * 4.37 + 0.3) * 0.2; }
`;

// ---------- Flame tongues ----------

/** A tongue of flame: fat near the bottom, drawn up to a point, y 0..1, radius ~0.5. */
function tongueGeometry() {
  const rings: [number, number][] = [[0, 0.32], [0.18, 0.5], [0.42, 0.42], [0.66, 0.26], [0.86, 0.1]];
  const sides = 5;
  const pos: number[] = [], idx: number[] = [];
  rings.forEach(([y, r], i) => {
    for (let s = 0; s < sides; s++) {
      const a = ((s + (i % 2) * 0.5) / sides) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  });
  const tip = pos.length / 3; pos.push(0, 1, 0);
  const bottom = tip + 1; pos.push(0, 0, 0);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s, b = i * sides + (s + 1) % sides, c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  const top = (rings.length - 1) * sides;
  for (let s = 0; s < sides; s++) {
    idx.push(top + s, tip, top + (s + 1) % sides);
    idx.push(s, (s + 1) % sides, bottom);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// kind: 0 outer, 1 middle, 2 core, 3 a lick that breaks off the top.
const TONGUE_VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime; uniform vec2 uWind;
  attribute vec3 aBase; attribute float aSize; attribute vec3 aOff; attribute vec3 aShape; attribute float aSeed;
  varying float vY; varying float vKind; varying float vFade; varying vec3 vView;
  ${NOISE}
  void main() {
    float t = uTime, s = aSeed * 37.0, kind = aShape.z;
    float w = aShape.x * (1.0 + 0.1 * wob(t * 7.3 + s * 1.3));
    float h = aShape.y * (1.0 + 0.2 * wob(t * 6.1 + s));
    vec3 off = aOff;
    vFade = 1.0;
    if (kind > 2.5) {
      float life = fract(t * (1.3 + aSeed * 0.8) + aSeed * 7.0);
      off.y += life * 0.75;
      off.xz += vec2(wob(s + life * 4.0), wob(s * 1.7 + life * 4.0)) * 0.12 * life;
      w *= 1.0 - life * 0.8;
      h *= 1.0 - life * 0.6;
      vFade = 1.0 - life * life;
    }
    float y = position.y;
    vec3 q = vec3(position.x * w, y * h, position.z * w);
    // A slow twist, then a sway that grows with height, and ripples running up.
    float a = aSeed * 6.28 + t * (fract(aSeed * 3.1) - 0.5) * 2.0 + y * 1.4;
    q.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * q.xz;
    vec2 sway = vec2(wob(t * 2.3 + s), wob(t * 2.9 + s * 2.0 + 4.0)) * 0.2 + uWind;
    vec2 ripple = vec2(sin(t * 11.0 - y * 7.0 + s), cos(t * 9.0 - y * 6.0 + s * 1.3)) * 0.05;
    q.xz += (sway * y * y + ripple * y) * h;
    vec4 mvPosition = modelViewMatrix * vec4(aBase + (off + q) * aSize, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vY = y; vKind = kind; vView = mvPosition.xyz;
    #include <fog_vertex>
  }
`;

const TONGUE_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  varying float vY; varying float vKind; varying float vFade; varying vec3 vView;
  void main() {
    vec3 lo, hi; float alpha;
    if (vKind < 0.5) { lo = vec3(1.0, 0.55, 0.1); hi = vec3(0.82, 0.16, 0.05); alpha = 0.9; }
    else if (vKind < 1.5) { lo = vec3(1.0, 0.72, 0.18); hi = vec3(1.0, 0.38, 0.06); alpha = 0.92; }
    else if (vKind < 2.5) { lo = vec3(1.0, 0.98, 0.82); hi = vec3(1.0, 0.82, 0.3); alpha = 0.95; }
    else { lo = vec3(1.0, 0.6, 0.12); hi = vec3(0.9, 0.22, 0.05); alpha = 0.9; }
    vec3 c = mix(lo, hi, smoothstep(0.05, 0.95, vY));
    // Facets, like everything else on the Island.
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    c *= 0.8 + 0.25 * abs(n.z);
    gl_FragColor = vec4(c, alpha * vFade * (1.0 - smoothstep(0.75, 1.0, vY) * 0.4));
    #include <fog_fragment>
  }
`;

// ---------- Glow and sparks (added light), smoke (ordinary blending) ----------

/** Camera-facing quads; aKind 0 glow, 1 spark, 2 smoke. */
const PUFF_VERT = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  uniform float uTime; uniform float uNight; uniform vec2 uWind;
  attribute vec3 aBase; attribute float aSize; attribute float aSeed; attribute float aKind;
  varying vec2 vUv; varying float vLife; varying float vKind; varying float vBright;
  ${NOISE}
  void main() {
    float t = uTime, s = aSeed * 41.0;
    vec3 c = aBase; float r; vLife = 0.0; vBright = 1.0;
    float spin = 0.0;
    if (aKind < 0.5) {
      c.y += aSize * 0.45;
      r = aSize * 1.25;
      vBright = (0.3 + 0.7 * uNight) * (0.85 + 0.15 * wob(t * 9.0 + s));
    } else if (aKind < 1.5) {
      float life = fract(t * (0.45 + aSeed * 0.5) + aSeed * 13.0);
      float swirl = s + life * 6.0;
      c += vec3(wob(swirl) * 0.3 + uWind.x * life * 1.5, 0.3 + life * 2.4, wob(swirl * 1.3 + 2.0) * 0.3 + uWind.y * life * 1.5) * aSize;
      r = aSize * 0.035 + 0.06;
      vLife = life;
      vBright = (1.0 - life) * (0.6 + 0.4 * sin(t * 25.0 + s));
    } else {
      float life = fract(t * (0.12 + aSeed * 0.06) + aSeed * 5.0);
      c += vec3(wob(s + life * 2.0) * 0.25 + uWind.x * life * 5.0, 0.8 + life * 3.5, wob(s * 1.7 + life * 2.0) * 0.25 + uWind.y * life * 5.0) * aSize;
      r = aSize * (0.25 + life * 0.9);
      vLife = life;
      spin = aSeed * 6.28 + life * 1.5;
    }
    vec4 mv = modelViewMatrix * vec4(c, 1.0);
    vec2 corner = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * position.xy;
    mv.xy += corner * r;
    if (aKind < 0.5) mv.z += r * 0.6; // nearer the camera, so the ground cuts less of it off
    vec4 mvPosition = mv;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy; vKind = aKind;
    #include <fog_vertex>
  }
`;

const GLOW_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  varying vec2 vUv; varying float vLife; varying float vKind; varying float vBright;
  void main() {
    float d = length(vUv) * 2.0;
    if (d > 1.0) discard;
    vec3 c;
    float a;
    if (vKind < 0.5) { c = vec3(1.0, 0.45, 0.12); a = pow(1.0 - d, 2.2) * 0.55; }
    else { c = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.3, 0.05), vLife); a = 1.0 - smoothstep(0.4, 1.0, d); }
    c *= a * vBright;
    #ifdef USE_FOG
      c *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor = vec4(c, 1.0);
  }
`;

const SMOKE_FRAG = /* glsl */`
  #include <common>
  #include <fog_pars_fragment>
  uniform float uNight;
  varying vec2 vUv; varying float vLife; varying float vKind; varying float vBright;
  void main() {
    // A hexagon, soft at the edge: a low-poly puff.
    vec2 p = abs(vUv) * 2.0;
    float d = max(p.x * 0.866 + p.y * 0.5, p.y);
    if (d > 1.0) discard;
    vec3 c = mix(vec3(0.24, 0.22, 0.21), vec3(0.55, 0.53, 0.5), vLife) * (1.0 - 0.65 * uNight);
    float a = (1.0 - smoothstep(0.6, 1.0, d)) * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife) * 0.5;
    gl_FragColor = vec4(c, a);
    #include <fog_fragment>
  }
`;

function material(vertexShader: string, fragmentShader: string, blending: THREE.Blending) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader, blending,
    uniforms: { ...clock, ...THREE.UniformsLib.fog },
    transparent: true, depthWrite: false, fog: true,
  });
}

/** Ring layout of one fire's tongues, in units of its height: [x, y, z, width, height, kind]. */
function tongues(i: number): number[][] {
  const out: number[][] = [];
  const h = (k: number) => hash2(i, k, 401);
  const ring = (n: number, r: number, w: number, lo: number, hi: number, kind: number, y = 0) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n + h(out.length) * 0.3) * Math.PI * 2;
      out.push([Math.cos(a) * r, y, Math.sin(a) * r, w, lo + (hi - lo) * h(out.length + 50), kind]);
    }
  };
  ring(5, 0.2, 0.5, 0.5, 0.75, 0);
  ring(3, 0.1, 0.42, 0.72, 0.95, 1);
  ring(2, 0.05, 0.3, 0.45, 0.6, 2);
  ring(4, 0.12, 0.26, 0.3, 0.4, 3, 0.5);
  return out;
}

/** A batch of fires: flames, glow and sparks, and smoke if any of them smoke. */
export class Fires extends THREE.Group {
  constructor(specs: FireSpec[]) {
    super();
    if (!specs.length) return;
    const sphere = new THREE.Sphere();
    new THREE.Box3().setFromPoints(specs.map((f) => new THREE.Vector3(f.x, f.y + f.size * 2, f.z))).getBoundingSphere(sphere);
    sphere.radius += Math.max(...specs.map((f) => f.size)) * 5;

    // Flames.
    const tg = tongueGeometry();
    const base: number[] = [], size: number[] = [], off: number[] = [], shape: number[] = [], seed: number[] = [];
    specs.forEach((f, i) => {
      tongues(i).forEach(([x, y, z, w, h, kind], k) => {
        base.push(f.x, f.y, f.z); size.push(f.size); off.push(x, y, z); shape.push(w, h, kind); seed.push(hash2(i, k, 402));
      });
    });
    const inst = (a: number[], n: number) => new THREE.InstancedBufferAttribute(new Float32Array(a), n);
    tg.setAttribute('aBase', inst(base, 3));
    tg.setAttribute('aSize', inst(size, 1));
    tg.setAttribute('aOff', inst(off, 3));
    tg.setAttribute('aShape', inst(shape, 3));
    tg.setAttribute('aSeed', inst(seed, 1));
    tg.instanceCount = seed.length;
    tg.boundingSphere = sphere.clone();
    const flames = new THREE.Mesh(tg, material(TONGUE_VERT, TONGUE_FRAG, THREE.NormalBlending));
    flames.renderOrder = 1;
    this.add(flames);

    // Glow, sparks and smoke share a quad.
    const puffs = (kinds: (f: FireSpec) => number[]) => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const base: number[] = [], size: number[] = [], seed: number[] = [], kind: number[] = [];
      specs.forEach((f, i) => kinds(f).forEach((k, j) => {
        base.push(f.x, f.y, f.z); size.push(f.size); seed.push(hash2(i, j, 403)); kind.push(k);
      }));
      g.setAttribute('aBase', inst(base, 3));
      g.setAttribute('aSize', inst(size, 1));
      g.setAttribute('aSeed', inst(seed, 1));
      g.setAttribute('aKind', inst(kind, 1));
      g.instanceCount = seed.length;
      g.boundingSphere = sphere.clone();
      return g;
    };
    const glow = new THREE.Mesh(
      puffs((f) => [0, ...Array(Math.round(8 + f.size * 2)).fill(1)]),
      material(PUFF_VERT, GLOW_FRAG, THREE.AdditiveBlending),
    );
    glow.renderOrder = 2;
    this.add(glow);
    if (specs.some((f) => f.smoke)) {
      const smoke = new THREE.Mesh(puffs((f) => Array(Math.round((f.smoke ?? 0) * 14)).fill(2)), material(PUFF_VERT, SMOKE_FRAG, THREE.NormalBlending));
      smoke.renderOrder = 0;
      this.add(smoke);
    }
  }

  /** Let go of the GPU buffers (when an Interior is left, or a place rebuilt). */
  dispose() {
    for (const o of this.children) {
      const m = o as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
