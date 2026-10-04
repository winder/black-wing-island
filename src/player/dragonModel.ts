// A low-poly dragon with a skeleton, so it can walk, flap and swish its tail
// smoothly. Used for the Player Dragon (black) and for Villagers (other colours).
//
// The body is one continuous skin lofted along the spine from snout to tail
// tip; legs and wing bones are tubes along their bones; the wing membrane is
// stretched between the fingers and the flank. Everything is skinned to one
// skeleton, which `DragonAnimator` poses every frame.
//
// The model faces -z and stands on y = 0. It's about 17 m nose to tail-tip and
// 22 m across the wings. In the bind pose every bone has no rotation, the legs
// hang straight down and the wings are spread flat.

import * as THREE from 'three';
import { DragonAnimator, DragonMotion } from './dragonAnim';

export type { DragonMotion };

export interface LegBones {
  /** Thigh or upper arm. */
  upper: THREE.Bone;
  lower: THREE.Bone;
  /** The long foot bone of a hind leg (front legs don't have one). */
  ankle: THREE.Bone | null;
  /** Foot or hand: the toes hang off it. */
  foot: THREE.Bone;
  lengths: number[];
  front: boolean;
}

export interface WingBones {
  arm: THREE.Bone;
  forearm: THREE.Bone;
  hand: THREE.Bone;
  fingers: THREE.Bone[];
  side: 1 | -1;
}

export interface DragonBones {
  hips: THREE.Bone;
  chest: THREE.Bone;
  neck: THREE.Bone[];
  head: THREE.Bone;
  jaw: THREE.Bone;
  tail: THREE.Bone[];
  legs: { fl: LegBones; fr: LegBones; hl: LegBones; hr: LegBones };
  wings: { l: WingBones; r: WingBones };
  all: THREE.Bone[];
}

export interface DragonModel {
  root: THREE.Group;
  /** Body, head, legs and tail. Hidden for the first-person wings. */
  body: THREE.SkinnedMesh;
  /** Both wings: arm bones and membranes. */
  wings: THREE.SkinnedMesh;
  eyes: THREE.SkinnedMesh;
  bones: DragonBones;
  anim: DragonAnimator;
  /** Animate for this frame. Put `root` where the dragon is first. */
  update(dt: number, motion: DragonMotion): void;
}

// ---------- shape ----------

/** Wing finger directions (radians back from straight out) and lengths. */
export const FINGERS: [number, number][] = [[-0.2, 5.0], [0.38, 4.7], [0.9, 4.1], [1.38, 3.5]];

const SHOULDER = new THREE.Vector3(0.7, 3.6, -1.0);
const ARM = 2.4, FOREARM = 3.1;
/** Where the back of the membrane meets the body. */
const FLANK = new THREE.Vector3(1.0, 3.05, 2.0);

// The spine from snout tip to tail tip: [z, y, half width, half height].
const SPINE: [number, number, number, number][] = [
  [-6.0, 4.28, 0.04, 0.04],
  [-5.75, 4.33, 0.24, 0.2],
  [-5.3, 4.43, 0.34, 0.27],
  [-4.75, 4.58, 0.43, 0.36],
  [-4.25, 4.72, 0.5, 0.44],
  [-3.85, 4.72, 0.46, 0.44],
  [-3.45, 4.52, 0.38, 0.4],
  [-2.85, 4.12, 0.44, 0.48],
  [-2.2, 3.62, 0.6, 0.66],
  [-1.5, 3.2, 0.92, 0.98],
  [-0.6, 2.96, 1.22, 1.28],
  [0.4, 2.86, 1.3, 1.26],
  [1.4, 2.86, 1.1, 1.1],
  [2.4, 2.76, 0.8, 0.8],
  [3.6, 2.52, 0.6, 0.58],
  [5.0, 2.18, 0.46, 0.43],
  [6.4, 1.84, 0.34, 0.31],
  [7.8, 1.54, 0.24, 0.22],
  [9.2, 1.3, 0.15, 0.14],
  [10.4, 1.15, 0.08, 0.07],
  [11.0, 1.1, 0.02, 0.02],
];
/** Where the head joint sits; everything in front of it is rigid skull. */
const HEAD_Z = -3.85;
const NECK_Z = [-3.25, -2.6, -1.95];
const CHEST_Z = -0.9, HIPS_Z = 1.2;
const TAIL_Z = [2.3, 3.2, 4.1, 5.0, 5.9, 6.8, 7.7, 8.6, 9.5, 10.3];

// Leg roots (right side) and segment lengths, top to bottom.
const HIND_HIP = new THREE.Vector3(0.85, 2.45, 1.45);
const HIND_LEN = [1.3, 1.2, 0.62];
const FRONT_HIP = new THREE.Vector3(0.75, 2.55, -1.2);
const FRONT_LEN = [1.15, 1.1];

// ---------- skin building ----------

type Weights = [THREE.Bone, number][];
interface Pt { p: THREE.Vector3; w: Weights }

/** Collects flat-coloured, skinned triangles. */
class Skin {
  private pos: number[] = [];
  private col: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];

  constructor(private index: Map<THREE.Bone, number>) {}

  /** One triangle; `inside` (a point inside the solid) makes it face outwards. */
  tri(a: Pt, b: Pt, c: Pt, color: THREE.Color, inside?: THREE.Vector3) {
    if (inside) {
      const n = new THREE.Vector3().crossVectors(b.p.clone().sub(a.p), c.p.clone().sub(a.p));
      const out = a.p.clone().add(b.p).add(c.p).divideScalar(3).sub(inside);
      if (n.dot(out) < 0) [b, c] = [c, b];
    }
    for (const v of [a, b, c]) {
      this.pos.push(v.p.x, v.p.y, v.p.z);
      this.col.push(color.r, color.g, color.b);
      const w = [...v.w].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const total = w.reduce((s, x) => s + x[1], 0) || 1;
      for (let i = 0; i < 4; i++) {
        this.si.push(w[i] ? this.index.get(w[i][0])! : 0);
        this.sw.push(w[i] ? w[i][1] / total : 0);
      }
    }
  }

  quad(a: Pt, b: Pt, c: Pt, d: Pt, color: THREE.Color, inside?: THREE.Vector3) {
    this.tri(a, b, c, color, inside);
    this.tri(a, c, d, color, inside);
  }

  /** A three.js primitive, transformed, all on the given weights. */
  shape(geo: THREE.BufferGeometry, m: THREE.Matrix4, w: Weights, color: THREE.Color) {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
    const p = g.getAttribute('position');
    const at = (i: number) => ({ p: new THREE.Vector3().fromBufferAttribute(p, i), w });
    for (let i = 0; i < p.count; i += 3) this.tri(at(i), at(i + 1), at(i + 2), color);
  }

  /**
   * A tube through rings of points. Each ring is `sides` points around `c`;
   * `color` picks each face's colour from how far up the ring it is (1 top, -1 bottom).
   */
  tube(rings: { pts: Pt[]; c: THREE.Vector3 }[], color: (up: number, ring: number, side: number) => THREE.Color, ends = true) {
    const n = rings[0].pts.length;
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r], B = rings[r + 1];
      const inside = A.c.clone().add(B.c).multiplyScalar(0.5);
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        const up = (A.pts[j].p.y + A.pts[k].p.y - 2 * A.c.y) / 2;
        const half = Math.max(1e-3, Math.abs(A.pts[0].p.y - A.c.y));
        this.quad(A.pts[j], A.pts[k], B.pts[k], B.pts[j], color(up / half, r, j), inside);
      }
    }
    if (!ends) return;
    for (const [ring, next] of [[rings[0], rings[1]], [rings[rings.length - 1], rings[rings.length - 2]]]) {
      const mid = { p: ring.c, w: ring.pts[0].w };
      for (let j = 0; j < n; j++) this.tri(mid, ring.pts[j], ring.pts[(j + 1) % n], color(0, 0, j), next.c);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    return g;
  }
}

/**
 * Skin weights along a chain of bones. Each bone owns a stretch [from, to] of
 * some coordinate (z along the spine, height down a leg); near the joins the
 * weight is shared, over `blend` either side.
 */
function chainWeights(segs: { bone: THREE.Bone; from: number; to: number; blend?: number }[]) {
  return (s: number): Weights => {
    let k = segs.findIndex((g) => s <= g.to);
    if (k < 0) k = segs.length - 1;
    const g = segs[k];
    const w: Weights = [[g.bone, 1]];
    const join = (other: typeof g | undefined, d: number) => {
      if (!other) return;
      const h = Math.min(g.blend ?? 0.6, other.blend ?? 0.6, (g.to - g.from) * 0.45, (other.to - other.from) * 0.45);
      if (d < h) {
        const t = 0.5 * (1 - d / h);
        w[0][1] -= t;
        w.push([other.bone, t]);
      }
    };
    join(segs[k - 1], s - g.from);
    join(segs[k + 1], g.to - s);
    return w;
  };
}

function mix(a: Weights, b: Weights, t: number): Weights {
  return [...a.map(([bn, w]) => [bn, w * (1 - t)] as [THREE.Bone, number]), ...b.map(([bn, w]) => [bn, w * t] as [THREE.Bone, number])];
}

/** Brightness wobble so neighbouring faces aren't identical. */
function jitter(c: THREE.Color, a: number, b: number) {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return c.clone().multiplyScalar(0.94 + (h - Math.floor(h)) * 0.12);
}

// ---------- the dragon ----------

export function makeDragon(color = '#16131c', accent = '#3b2f52'): DragonModel {
  const bodyC = new THREE.Color(color), bellyC = new THREE.Color(accent);
  const membraneC = new THREE.Color(accent).lerp(new THREE.Color(color), 0.35);
  const hornC = new THREE.Color(accent).lerp(new THREE.Color('#e8dcc0'), 0.45);
  const clawC = new THREE.Color('#d8d0bc');
  const mouthC = new THREE.Color('#7a2228');

  // --- skeleton ---
  const all: THREE.Bone[] = [];
  const bind = new Map<THREE.Bone, THREE.Vector3>();
  const bone = (parent: THREE.Bone | null, at: THREE.Vector3, order: THREE.EulerOrder = 'YXZ') => {
    const b = new THREE.Bone();
    b.rotation.order = order;
    b.position.copy(at).sub(parent ? bind.get(parent)! : new THREE.Vector3());
    parent?.add(b);
    bind.set(b, at.clone());
    all.push(b);
    return b;
  };

  // The spine follows a smooth curve through SPINE.
  const centre = new THREE.CatmullRomCurve3(SPINE.map(([z, y]) => new THREE.Vector3(0, y, z)), false, 'centripetal');
  const radius = new THREE.CatmullRomCurve3(SPINE.map(([, , rx, ry], i) => new THREE.Vector3(rx, ry, i)), false, 'centripetal');
  // Both curves share the parameter t, so look things up by t.
  const samples = Array.from({ length: 401 }, (_, i) => ({ t: i / 400, z: centre.getPoint(i / 400).z }));
  const tAt = (z: number) => samples.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a)).t;
  const spineAt = (z: number) => centre.getPoint(tAt(z));
  const radiusAt = (z: number) => radius.getPoint(tAt(z));

  const hips = bone(null, spineAt(HIPS_Z));
  const chest = bone(hips, spineAt(CHEST_Z));
  const neck: THREE.Bone[] = [];
  let prev = chest;
  for (const z of NECK_Z.slice().reverse()) neck.push((prev = bone(prev, spineAt(z))));
  neck.reverse(); // neck[0] next to the head
  const head = bone(neck[0], spineAt(HEAD_Z));
  const jaw = bone(head, new THREE.Vector3(0, 4.4, -3.95));
  const tail: THREE.Bone[] = [];
  prev = hips;
  for (const z of TAIL_Z) tail.push((prev = bone(prev, spineAt(z))));

  const makeLeg = (side: number, front: boolean): LegBones => {
    const top = (front ? FRONT_HIP : HIND_HIP).clone().setX((front ? FRONT_HIP : HIND_HIP).x * side);
    const lengths = front ? FRONT_LEN : HIND_LEN;
    const at = top.clone();
    const upper = bone(front ? chest : hips, at.clone());
    at.y -= lengths[0];
    const lower = bone(upper, at.clone());
    at.y -= lengths[1];
    let ankle: THREE.Bone | null = null;
    let parent = lower;
    if (!front) {
      ankle = bone(lower, at.clone());
      at.y -= lengths[2];
      parent = ankle;
    }
    const foot = bone(parent, at.clone());
    return { upper, lower, ankle, foot, lengths, front };
  };
  const legs = { fl: makeLeg(-1, true), fr: makeLeg(1, true), hl: makeLeg(-1, false), hr: makeLeg(1, false) };

  const makeWingBones = (side: 1 | -1): WingBones => {
    const s = SHOULDER.clone().setX(SHOULDER.x * side);
    const arm = bone(chest, s, 'YZX');
    const forearm = bone(arm, s.clone().setX(s.x + side * ARM), 'YZX');
    const w = s.clone().setX(s.x + side * (ARM + FOREARM));
    const hand = bone(forearm, w, 'YZX');
    const fingers = FINGERS.map(() => bone(hand, w, 'YZX'));
    return { arm, forearm, hand, fingers, side };
  };
  const wingBones = { l: makeWingBones(-1), r: makeWingBones(1) };

  const index = new Map(all.map((b, i) => [b, i]));
  const bodySkin = new Skin(index), wingSkin = new Skin(index), eyeSkin = new Skin(index);

  // --- body: one loft from snout to tail tip ---
  const spineSegs = chainWeights([
    { bone: head, from: -99, to: HEAD_Z, blend: 0.15 },
    { bone: neck[0], from: HEAD_Z, to: NECK_Z[0] },
    { bone: neck[1], from: NECK_Z[0], to: NECK_Z[1] },
    { bone: neck[2], from: NECK_Z[1], to: NECK_Z[2] },
    { bone: chest, from: NECK_Z[2], to: CHEST_Z },
    { bone: hips, from: CHEST_Z, to: TAIL_Z[0], blend: 1.2 },
    ...TAIL_Z.map((z, i) => ({ bone: tail[i], from: z, to: TAIL_Z[i + 1] ?? 99 })),
  ]);
  const SIDES = 10;
  const rings: { pts: Pt[]; c: THREE.Vector3 }[] = [];
  const RINGS = 72;
  const ringAt = (t: number) => {
    const c = centre.getPoint(t), r = radius.getPoint(t);
    const tangent = centre.getTangent(t);
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(tangent, -tangent.y).normalize();
    const isHead = c.z < HEAD_Z + 0.2;
    const w = spineSegs(c.z);
    const pts: Pt[] = [];
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      const x = Math.sin(a), y0 = Math.cos(a);
      // A ridge along the back, a flatter belly, and a flat-bottomed skull for the jaw to fit under.
      let y = y0 * (j === 0 ? 1.12 : 1);
      if (y0 < 0) y *= isHead ? 0.45 : 0.82;
      pts.push({ p: c.clone().addScaledVector(up, y * r.y).add(new THREE.Vector3(x * r.x, 0, 0)), w });
    }
    return { pts, c };
  };
  for (let i = 0; i <= RINGS; i++) rings.push(ringAt(i / RINGS));
  bodySkin.tube(rings, (up, r, j) => {
    // The skull's flat underside is the roof of the mouth, hidden by the jaw until it opens.
    if (rings[r].c.z < HEAD_Z) return j === 4 || j === 5 ? mouthC : jitter(bodyC, r, j);
    return up < -0.45 ? jitter(bellyC, r, j) : jitter(bodyC, r, j);
  });

  const mat = new THREE.Matrix4();
  const place = (pos: THREE.Vector3, dir: THREE.Vector3, scale = new THREE.Vector3(1, 1, 1)) =>
    mat.compose(pos, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()), scale).clone();

  // --- jaw: a wedge under the skull, mouth-red on top ---
  {
    const w: Weights = [[jaw, 1]];
    const jawRings: { pts: Pt[]; c: THREE.Vector3 }[] = [];
    const STEPS = 6;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const z = THREE.MathUtils.lerp(-3.9, -5.85, t);
      const c = spineAt(z), skull = radiusAt(z);
      // Its top edges meet the skull's lower sides, so the closed mouth is flush.
      const half = Math.max(0.03, skull.x * 0.6);
      const depth = THREE.MathUtils.lerp(0.34, 0.1, t);
      const topY = c.y - skull.y * 0.36;
      const pts: Pt[] = [
        { p: new THREE.Vector3(half, topY, z), w },
        { p: new THREE.Vector3(half * 0.85, topY - depth * 0.7, z), w },
        { p: new THREE.Vector3(0, topY - depth, z), w },
        { p: new THREE.Vector3(-half * 0.85, topY - depth * 0.7, z), w },
        { p: new THREE.Vector3(-half, topY, z), w },
        { p: new THREE.Vector3(0, topY - skull.y * 0.06, z), w },
      ];
      jawRings.push({ pts, c: new THREE.Vector3(0, topY - depth * 0.4, z) });
    }
    bodySkin.tube(jawRings, (up, r, j) => (j >= 4 ? mouthC : up < -0.3 ? jitter(bellyC, r, j) : jitter(bodyC, r, j)));
    // Teeth along the top jaw, pointing down.
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const z = -4.6 - i * 0.32;
      const c = spineAt(z), r = 0.3 - i * 0.04;
      bodySkin.shape(new THREE.ConeGeometry(0.05, 0.16, 3), place(new THREE.Vector3(side * r, c.y - 0.12, z), new THREE.Vector3(0, -1, 0)), [[head, 1]], clawC);
    }
  }

  // --- horns, brow and eyes ---
  for (const side of [-1, 1]) {
    const base = spineAt(-3.95).add(new THREE.Vector3(side * 0.28, 0.32, 0));
    bodySkin.shape(new THREE.ConeGeometry(0.15, 1.3, 5).translate(0, 0.65, 0), place(base, new THREE.Vector3(side * 0.25, 0.45, 1)), [[head, 1]], hornC);
    const small = spineAt(-3.75).add(new THREE.Vector3(side * 0.42, 0.05, 0));
    bodySkin.shape(new THREE.ConeGeometry(0.09, 0.6, 4).translate(0, 0.3, 0), place(small, new THREE.Vector3(side * 0.6, 0.2, 1)), [[head, 1]], hornC);
    const eye = spineAt(-4.55).add(new THREE.Vector3(side * 0.36, 0.14, 0));
    eyeSkin.shape(new THREE.IcosahedronGeometry(0.11, 0).scale(0.7, 0.8, 1.3), mat.makeTranslation(eye.x, eye.y, eye.z), [[head, 1]], new THREE.Color('#ffcf3a'));
    // A heavy brow over each eye.
    bodySkin.shape(new THREE.ConeGeometry(0.12, 0.6, 4), place(eye.clone().add(new THREE.Vector3(side * 0.02, 0.13, 0.1)), new THREE.Vector3(0, 0.15, -1), new THREE.Vector3(1, 1, 0.6)), [[head, 1]], bodyC);
    // Nostrils.
    const nose = spineAt(-5.7).add(new THREE.Vector3(side * 0.1, 0.13, 0));
    bodySkin.shape(new THREE.IcosahedronGeometry(0.05, 0), mat.makeTranslation(nose.x, nose.y, nose.z), [[head, 1]], mouthC);
  }

  // --- spikes down the back, from the head to the end of the tail ---
  for (let z = -3.5; z < 10.4; z += 0.55) {
    const c = spineAt(z), r = radiusAt(z);
    const size = THREE.MathUtils.clamp(r.y * 0.55, 0.08, 0.42);
    const top = c.clone().setY(c.y + r.y * 1.08);
    bodySkin.shape(new THREE.ConeGeometry(size * 0.45, size * 1.4, 4).translate(0, size * 0.6, 0), place(top, new THREE.Vector3(0, 1, 0.55), new THREE.Vector3(0.5, 1, 1)), spineSegs(z), bellyC);
  }
  // A small spade at the tail tip.
  {
    const tip = spineAt(10.75);
    bodySkin.shape(new THREE.OctahedronGeometry(0.55, 0).scale(0.75, 0.12, 1.1), mat.makeTranslation(tip.x, tip.y, tip.z + 0.1), [[tail[9], 1]], bellyC);
  }

  // --- legs ---
  const legSkin = (leg: LegBones, side: number) => {
    const chain = [leg.upper, leg.lower, ...(leg.ankle ? [leg.ankle] : []), leg.foot];
    const ys = chain.map((b) => bind.get(b)!.y);
    const top = bind.get(leg.upper)!;
    const parentBone = leg.front ? chest : hips;
    const weights = chainWeights([
      { bone: parentBone, from: ys[0], to: 99, blend: 0.45 },
      ...chain.slice(0, -1).map((b, i) => ({ bone: b, from: ys[i + 1], to: ys[i], blend: 0.22 })),
    ].map((g) => ({ ...g, from: -g.to, to: -g.from })));
    const w = (y: number) => weights(-y);
    // [height, radius] down the leg; thick at the top, slim at the ankle.
    const profile: [number, number][] = leg.front
      ? [[ys[0] + 0.6, 0.25], [ys[0] + 0.25, 0.42], [ys[0], 0.46], [ys[0] - 0.55, 0.36], [ys[1], 0.27], [ys[1] - 0.5, 0.23], [ys[2] + 0.1, 0.19]]
      : [[ys[0] + 0.6, 0.3], [ys[0] + 0.25, 0.55], [ys[0], 0.62], [ys[0] - 0.6, 0.46], [ys[1], 0.3], [ys[1] - 0.6, 0.24], [ys[2], 0.2], [ys[3] + 0.08, 0.17]];
    const S = 7;
    const legRings = profile.map(([y, r]) => {
      const c = new THREE.Vector3(top.x, y, top.z);
      const pts: Pt[] = [];
      for (let j = 0; j < S; j++) {
        const a = (j / S) * Math.PI * 2;
        pts.push({ p: c.clone().add(new THREE.Vector3(Math.sin(a) * r * 0.9, 0, -Math.cos(a) * r)), w: w(y) });
      }
      return { pts, c };
    });
    bodySkin.tube(legRings, (_up, r, j) => jitter(bodyC, r + side * 7, j));
    // The foot: a pad with three forward toes and claws.
    const f = bind.get(leg.foot)!;
    const fw: Weights = [[leg.foot, 1]];
    const pad = leg.front ? 0.28 : 0.32;
    bodySkin.shape(new THREE.IcosahedronGeometry(pad, 0).scale(1.1, 0.55, 1.3), mat.makeTranslation(f.x, f.y - 0.05, f.z - 0.1), fw, bodyC);
    for (const dx of [-0.17, 0, 0.17]) {
      const base = f.clone().add(new THREE.Vector3(dx * (leg.front ? 0.9 : 1.1), -0.08, -0.2));
      const dir = new THREE.Vector3(dx * 0.8, -0.15, -1);
      bodySkin.shape(new THREE.ConeGeometry(0.1, 0.5, 4).translate(0, 0.25, 0), place(base, dir), fw, bodyC);
      const tip = base.clone().addScaledVector(dir.clone().normalize(), 0.45);
      bodySkin.shape(new THREE.ConeGeometry(0.05, 0.25, 3).translate(0, 0.12, 0), place(tip, new THREE.Vector3(dx * 0.8, -0.7, -1)), fw, clawC);
    }
  };
  legSkin(legs.fl, -1); legSkin(legs.fr, 1); legSkin(legs.hl, -1); legSkin(legs.hr, 1);

  // --- wings ---
  const wingSkinFor = (wb: WingBones) => {
    const s = wb.side;
    const S = bind.get(wb.arm)!, E = bind.get(wb.forearm)!, W = bind.get(wb.hand)!;
    const tips = FINGERS.map(([a, len]) => W.clone().add(new THREE.Vector3(s * Math.cos(a) * len, 0, Math.sin(a) * len)));
    const A = FLANK.clone().setX(FLANK.x * s);
    const Pe = new THREE.Vector3(E.x + s * 0.3, 3.4, 2.75);

    // Arm and finger bones: thin tubes.
    const bonesTube = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, w0: Weights, w1: Weights, steps = 3) => {
      const dir = to.clone().sub(from).normalize();
      const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(side, dir).normalize();
      const rs: { pts: Pt[]; c: THREE.Vector3 }[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const c = from.clone().lerp(to, t);
        const r = THREE.MathUtils.lerp(r0, r1, t);
        const w = mix(w0, w1, t);
        const pts: Pt[] = [];
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2;
          pts.push({ p: c.clone().addScaledVector(side, Math.sin(a) * r).addScaledVector(up, Math.cos(a) * r), w });
        }
        rs.push({ pts, c });
      }
      wingSkin.tube(rs, (_u, r, j) => jitter(bodyC, r, j));
    };
    const arm: Weights = [[wb.arm, 1]], fore: Weights = [[wb.forearm, 1]];
    bonesTube(S.clone().setX(S.x - s * 0.3), E, 0.3, 0.2, mix(arm, [[chest, 1]], 0.4), mix(arm, fore, 0.5));
    bonesTube(E, W, 0.2, 0.13, mix(arm, fore, 0.5), mix(fore, [[wb.hand, 1]], 0.5));
    FINGERS.forEach((_, i) => bonesTube(W, tips[i], 0.11, 0.03, mix(fore, [[wb.fingers[i], 1]], 0.5), [[wb.fingers[i], 1]], 2));
    // Thumb claw at the wrist.
    wingSkin.shape(new THREE.ConeGeometry(0.08, 0.45, 4).translate(0, 0.22, 0), place(W, new THREE.Vector3(s * 0.2, 0.2, -1)), [[wb.hand, 1]], hornC);

    // The membrane, in panels between "ribs" running from the leading edge back
    // to the trailing edge. Each rib has weights at its front and back.
    interface Rib { lead: THREE.Vector3; trail: THREE.Vector3; wLead: Weights; wTrail: Weights; finger: boolean }
    const ribs: Rib[] = [
      ...FINGERS.map((_, i) => ({ lead: W, trail: tips[i], wLead: fore, wTrail: [[wb.fingers[i], 1]] as Weights, finger: true })),
      { lead: E, trail: Pe, wLead: fore, wTrail: [[wb.forearm, 0.3], [wb.arm, 0.3], [hips, 0.4]] as Weights, finger: false },
      { lead: S, trail: A, wLead: arm, wTrail: [[hips, 1]] as Weights, finger: false },
    ];
    const NU = 4, NT = 5;
    for (let j = 0; j < ribs.length - 1; j++) {
      const r0 = ribs[j], r1 = ribs[j + 1];
      const chord = r0.trail.distanceTo(r1.trail);
      const leadMid = r0.lead.clone().lerp(r1.lead, 0.5);
      const inward = leadMid.sub(r0.trail.clone().lerp(r1.trail, 0.5)).normalize();
      const grid: Pt[][] = [];
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU;
        const col: Pt[] = [];
        for (let it = 0; it <= NT; it++) {
          const t = it / NT;
          const a = r0.lead.clone().lerp(r0.trail, t), b = r1.lead.clone().lerp(r1.trail, t);
          const p = a.lerp(b, u).addScaledVector(inward, chord * 0.22 * 4 * u * (1 - u) * t * t);
          const wt = (r: Rib) => mix(r.wLead, r.wTrail, r.finger ? Math.min(1, t * 4) : t);
          col.push({ p, w: mix(wt(r0), wt(r1), u) });
        }
        grid.push(col);
      }
      const shade = membraneC.clone().multiplyScalar(0.92 + (j % 2) * 0.12);
      for (let iu = 0; iu < NU; iu++) for (let it = 0; it < NT; it++) {
        wingSkin.quad(grid[iu][it], grid[iu + 1][it], grid[iu + 1][it + 1], grid[iu][it + 1], jitter(shade, iu + j * 9, it));
      }
    }
  };
  wingSkinFor(wingBones.l); wingSkinFor(wingBones.r);

  // --- meshes ---
  hips.updateMatrixWorld(true); // the skeleton takes its bind pose from the bones' world matrices
  const skeleton = new THREE.Skeleton(all);
  const root = new THREE.Group();
  root.add(hips);
  const mesh = (skin: Skin, material: THREE.Material) => {
    const m = new THREE.SkinnedMesh(skin.build(), material);
    m.bind(skeleton, new THREE.Matrix4());
    // Animation moves the wings well past the bind pose, so give culling room.
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 1), 15);
    root.add(m);
    return m;
  };
  const body = mesh(bodySkin, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const wings = mesh(wingSkin, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  const eyes = mesh(eyeSkin, new THREE.MeshBasicMaterial({ vertexColors: true }));

  const bones: DragonBones = { hips, chest, neck, head, jaw, tail, legs, wings: wingBones, all };
  const anim = new DragonAnimator(root, bones, bind, FINGERS.map(([a]) => a));
  return { root, body, wings, eyes, bones, anim, update: (dt, motion) => anim.update(dt, motion) };
}
