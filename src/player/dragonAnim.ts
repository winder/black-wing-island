// Procedural animation for the dragon's skeleton (see dragonModel.ts).
//
// Each frame builds a pose (joint angles) for walking, flying and swimming,
// blends them by how much the dragon is doing each, then plants the feet with
// leg IK. Nothing is keyframed: walking speed sets the stride and gait, climbing
// sets how hard the wings beat, and turning makes the neck lead and the tail lag.

import * as THREE from 'three';
import type { DragonBones, LegBones, WingBones } from './dragonModel';

export interface DragonMotion {
  mode: 'walk' | 'fly' | 'swim';
  /** World velocity, m/s. */
  velocity: THREE.Vector3;
  /** Which way the dragon faces (the root's y rotation). */
  yaw: number;
  /** Where the head looks, up/down. */
  pitch?: number;
  underwater?: boolean;
  /** Mouth open for Fire Breath. */
  breathing?: boolean;
  /** A claw swipe in progress: 0..1 through it, and which paw (-1 left, 1 right). */
  swipe?: { t: number; side: number } | null;
}

const TAU = Math.PI * 2;
const { clamp, lerp, damp, smoothstep } = THREE.MathUtils;

/** Joint angles for every bone, plus an offset for the hips. */
class Pose {
  readonly a: Float32Array;
  readonly hip = new THREE.Vector3();
  constructor(n: number) { this.a = new Float32Array(n * 3); }
  clear() { this.a.fill(0); this.hip.set(0, 0, 0); }
  set(i: number, x: number, y: number, z: number) { this.a[i * 3] = x; this.a[i * 3 + 1] = y; this.a[i * 3 + 2] = z; }
  add(i: number, x: number, y: number, z: number) { this.a[i * 3] += x; this.a[i * 3 + 1] += y; this.a[i * 3 + 2] += z; }
  blend(o: Pose, t: number) {
    if (t <= 0) return;
    for (let i = 0; i < this.a.length; i++) this.a[i] += (o.a[i] - this.a[i]) * t;
    this.hip.lerp(o.hip, t);
  }
}

/** How a wing is held: arm angles, elbow and wrist folds, and how spread the fingers are. */
interface WingPose {
  sweep: number; lift: number; twist: number;
  elbow: number; elbowLift: number;
  wrist: number; wristLift: number;
  /** 1 fingers spread as built, 0 closed together. */
  fan: number;
  droop: number;
}

// Folded: elbow up by the hips, wrist forward at the base of the neck, fingers back along the flank.
const FOLDED: WingPose = { sweep: -1.3, lift: 0.2, twist: 1.51, elbow: -2.99, elbowLift: -0.32, wrist: 2.82, wristLift: 0, fan: 0, droop: 0 };
const GLIDE: WingPose = { sweep: -0.12, lift: 0.1, twist: 0.04, elbow: 0.25, elbowLift: 0.04, wrist: -0.15, wristLift: -0.04, fan: 1, droop: 0.04 };
/** Wings half-tucked for a dive. */
const TUCK: WingPose = { sweep: -0.55, lift: 0.25, twist: 0.1, elbow: -0.9, elbowLift: 0, wrist: 0.9, wristLift: 0, fan: 0.45, droop: 0 };

function mixWing(a: WingPose, b: WingPose, t: number): WingPose {
  const o = { ...a };
  for (const k in o) (o as unknown as Record<string, number>)[k] = lerp((a as unknown as Record<string, number>)[k], (b as unknown as Record<string, number>)[k], t);
  return o;
}

// Gaits: when each leg's step starts, as a fraction of the stride.
const WALK_GAIT = { hl: 0, fl: 0.25, hr: 0.5, fr: 0.75 };
const RUN_GAIT = { hl: 0, hr: 0.12, fl: 0.45, fr: 0.57 };
type LegName = keyof typeof WALK_GAIT;
const LEG_NAMES: LegName[] = ['hl', 'hr', 'fl', 'fr'];
/** Height of the foot bone above the ground when the foot is down. */
const FOOT_Y = 0.24;

export class DragonAnimator {
  /** Wing-beat phase in radians; one beat per 2π (for sound). */
  flap = 0;
  /** Extra forward sweep of the wings (for the first-person wings, so they're in view). */
  extraSweep = 0;
  private t = 0;
  private gait = 0;
  private paddle = 0;
  private fly = 0;
  private swim = 0;
  private under = 0;
  private speed = 0;
  private fwdSign = 1;
  private yawRate = 0;
  private lastYaw: number | null = null;
  private flapAmp = 0;
  private flapRate = 0;
  private dive = 0;
  private bank = 0;
  private jaw = 0;
  private look = 0;
  /** Level cruising alternates a few beats with a glide. */
  private cruise = 0;
  private tailLag: number[];
  private tailLift: number[];
  private climb = 0;

  private idx: Map<THREE.Bone, number>;
  private pose: Pose;
  private layer: Pose;
  private hipsBind: THREE.Vector3;
  private fingerAngles: number[];
  private m = new THREE.Matrix4();
  private v = new THREE.Vector3();

  constructor(private root: THREE.Object3D, private b: DragonBones, private bind: Map<THREE.Bone, THREE.Vector3>, fingerAngles: number[]) {
    this.idx = new Map(b.all.map((bn, i) => [bn, i]));
    this.pose = new Pose(b.all.length);
    this.layer = new Pose(b.all.length);
    this.hipsBind = b.hips.position.clone();
    this.fingerAngles = fingerAngles;
    this.tailLag = b.tail.map(() => 0);
    this.tailLift = b.tail.map(() => 0);
  }

  private i(bone: THREE.Bone) { return this.idx.get(bone)!; }

  /** 0 on the ground .. 1 fully flying. */
  get flying() { return this.fly; }

  update(dt: number, m: DragonMotion) {
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const flying = m.mode === 'fly', swimming = m.mode === 'swim';
    this.fly = damp(this.fly, flying ? 1 : 0, 4, dt);
    this.swim = damp(this.swim, swimming ? 1 : 0, 4, dt);
    this.under = damp(this.under, m.underwater ? 1 : 0, 3, dt);

    // How the dragon is moving, in its own frame.
    const sy = Math.sin(m.yaw), cy = Math.cos(m.yaw);
    const fwd = -(m.velocity.x * sy + m.velocity.z * cy);
    const hSpeed = Math.hypot(m.velocity.x, m.velocity.z);
    this.speed = damp(this.speed, hSpeed, 8, dt);
    if (hSpeed > 0.5) this.fwdSign = fwd < -0.5 ? -1 : 1;
    if (this.lastYaw !== null && dt > 0) {
      let d = m.yaw - this.lastYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yawRate = damp(this.yawRate, clamp(d / dt, -4, 4), 10, dt);
    }
    this.lastYaw = m.yaw;
    this.climb = damp(this.climb, m.velocity.y, 4, dt);
    this.look = damp(this.look, clamp(m.pitch ?? 0, -1, 1), 6, dt);
    this.jaw = damp(this.jaw, m.breathing ? 0.55 : 0, 12, dt);

    const pose = this.pose, layer = this.layer;
    pose.clear();
    this.groundPose(pose, dt);
    if (this.fly > 0.001) {
      layer.clear();
      this.flyPose(layer, dt, m);
      pose.blend(layer, this.fly);
    } else {
      this.flapAmp = 0;
    }
    if (this.swim > 0.001) {
      layer.clear();
      this.swimPose(layer, dt);
      pose.blend(layer, this.swim);
    }
    this.overlays(pose, dt, flying);

    // Pose the body and wings, then plant the feet on what's under them.
    this.apply(pose);
    this.root.updateMatrixWorld(true);
    const ground = (1 - this.fly) * (1 - this.swim);
    for (const name of LEG_NAMES) this.legIK(name, ground);
    this.swipe(m.swipe ?? null);
  }

  // ---------- on the ground: idle, walk, run ----------

  private groundPose(p: Pose, dt: number) {
    const b = this.b, t = this.t;
    const sp = this.speed;
    const move = smoothstep(sp + Math.abs(this.yawRate) * 1.5, 0.3, 2.5);
    const run = smoothstep(sp, 10, 17);
    const stride = this.stride();
    this.gait = (this.gait + (dt * Math.max(sp, Math.abs(this.yawRate) * 1.5)) / stride) % 1;
    const g = this.gait * TAU;

    // Breathing and looking around when standing still.
    const still = 1 - move;
    const breathe = Math.sin(t * 1.7);
    p.hip.y += breathe * 0.03 * still;
    p.add(this.i(b.chest), breathe * 0.015, 0, 0);
    const lookYaw = (Math.sin(t * 0.37) * 0.3 + Math.sin(t * 0.91 + 1) * 0.12) * still;
    const lookUp = Math.sin(t * 0.23 + 2) * 0.08 * still;
    b.neck.forEach((n) => p.add(this.i(n), lookUp * 0.5, lookYaw * 0.25, 0));
    p.add(this.i(b.head), lookUp, lookYaw * 0.4, -lookYaw * 0.2);

    // Walking: the body bobs twice a stride and sways side to side; the neck
    // steadies the head. Running: the back flexes and stretches with the bound.
    const walk = move * (1 - run);
    p.hip.y += (-Math.cos(2 * g) * 0.07 * walk) + (Math.sin(g) * 0.22 - 0.1) * run * move;
    p.add(this.i(b.hips), Math.sin(g) * 0.06 * run * move, Math.sin(g) * 0.05 * walk, Math.sin(g) * 0.035 * walk);
    p.add(this.i(b.chest), -Math.sin(g) * 0.1 * run * move, -Math.sin(g) * 0.07 * walk, -Math.sin(g) * 0.03 * walk);
    p.add(this.i(b.neck[2]), Math.cos(2 * g) * 0.03 * walk - 0.12 * run * move, Math.sin(g) * 0.04 * walk, 0);
    p.add(this.i(b.head), -Math.cos(2 * g) * 0.03 * walk + 0.14 * run * move, 0, 0);

    // Tail: a slow swish standing, a wave that travels down it when walking.
    b.tail.forEach((bn, k) => {
      const swish = Math.sin(t * 0.8 - k * 0.45) * 0.05 * still;
      const wave = Math.sin(g - k * 0.55) * (0.04 + k * 0.006) * move;
      p.add(this.i(bn), (Math.cos(g * 2 - k * 0.5) * 0.015 * move) + (k === 0 ? -0.1 * run * move : 0), swish + wave, 0);
    });

    // Wings folded, with a little shuffle now and then.
    const shuffle = Math.max(0, Math.sin(t * 0.31)) ** 8 * 0.12;
    for (const w of [b.wings.l, b.wings.r]) this.wing(p, w, { ...FOLDED, lift: FOLDED.lift + shuffle + Math.sin(g) * 0.04 * move });
  }

  /** Distance the body travels in one stride at the current speed. */
  private stride() { return 1.1 + 0.33 * this.speed; }

  // ---------- flying ----------

  private flyPose(p: Pose, dt: number, m: DragonMotion) {
    const b = this.b;
    const sp = m.velocity.length();
    const climb = this.climb;

    // Climbing or slow flight takes steady hard beats; level cruising a few
    // beats then a glide; diving folds the wings back.
    const effort = clamp((climb > 1 ? 0.35 + climb / 14 : 0) + (sp < 13 ? (13 - sp) / 10 : 0), 0, 1.3);
    let amp: number, rate: number;
    this.dive = damp(this.dive, smoothstep(-climb, 6, 14), 3, dt);
    if (effort > 0.3) {
      amp = 0.7 + 0.3 * Math.min(1, effort);
      rate = 1.5 + 0.9 * effort;
      this.cruise = 0;
    } else {
      this.cruise = (this.cruise + dt) % 4.2;
      const beating = this.cruise < 1.9;
      amp = beating ? 0.6 : 0;
      rate = 1.4;
    }
    amp *= 1 - this.dive;
    this.flapAmp = damp(this.flapAmp, amp, 3, dt);
    this.flapRate = damp(this.flapRate, rate, 3, dt);
    // Gliding: let the beat finish and hold the wings level instead of freezing mid-stroke.
    const level = Math.cos(this.stroke(this.flap)) < 0.15 && Math.cos(this.stroke(this.flap)) > -0.2;
    if (this.flapAmp > 0.06 || !level) this.flap += dt * this.flapRate * TAU;

    const th = this.stroke(this.flap), a = this.flapAmp;
    const up = Math.max(0, -Math.sin(th));
    const glide = mixWing(GLIDE, TUCK, this.dive);
    const wp: WingPose = {
      sweep: glide.sweep + a * (0.18 * Math.sin(th) - 0.22 * up),
      lift: glide.lift + a * (0.2 + 0.65 * Math.cos(th)),
      twist: glide.twist - a * 0.28 * Math.sin(th),
      elbow: glide.elbow - a * 0.95 * up,
      elbowLift: glide.elbowLift + a * 0.32 * Math.cos(th - 0.8),
      wrist: glide.wrist + a * 1.15 * up,
      wristLift: glide.wristLift + a * 0.38 * Math.cos(th - 1.4),
      fan: glide.fan - a * 0.45 * up,
      droop: glide.droop,
    };
    for (const w of [b.wings.l, b.wings.r]) this.wing(p, w, wp);

    // The body rises on each downstroke.
    p.hip.y += -Math.cos(th) * 0.16 * a;
    p.add(this.i(b.chest), Math.sin(th) * 0.04 * a, 0, 0);
    // Neck stretched out ahead, tail straight behind, legs tucked.
    [-0.08, -0.12, -0.15].forEach((x, k) => p.add(this.i(b.neck[k]), x, 0, 0));
    p.add(this.i(b.head), 0.3, 0, 0);
    b.tail.forEach((bn, k) => p.add(this.i(bn), k === 0 ? -0.2 : -0.015 + Math.sin(th - k * 0.5) * 0.02 * a, Math.sin(this.t * 1.3 - k * 0.5) * 0.02, 0));
    for (const name of LEG_NAMES) {
      const leg = b.legs[name];
      const kick = Math.sin(th - 0.5) * 0.06 * a;
      if (leg.front) this.legAngles(p, leg, [0.7 + kick, -2.0, -0.6]);
      else this.legAngles(p, leg, [-0.55 + kick, -0.75, -0.25, -0.9]);
    }
  }

  /** Wing-beat phase → stroke angle: 0 top, π bottom. The downstroke takes 55% of the beat. */
  private stroke(phase: number) {
    const D = 0.55;
    const f = ((phase / TAU) % 1 + 1) % 1;
    return f < D ? (f / D) * Math.PI : Math.PI + ((f - D) / (1 - D)) * Math.PI;
  }

  // ---------- swimming ----------

  private swimPose(p: Pose, dt: number) {
    const b = this.b;
    const under = this.under;
    this.paddle = (this.paddle + dt * (0.6 + this.speed * 0.1)) % 1;
    const ph = this.paddle * TAU;
    for (const w of [b.wings.l, b.wings.r]) this.wing(p, w, { ...FOLDED, lift: FOLDED.lift + 0.1, sweep: FOLDED.sweep - 0.1 });
    // At the surface the neck holds the head up out of the water; under it, the neck stretches ahead.
    [0.06, 0.08, 0.12].forEach((x, k) => p.add(this.i(b.neck[k]), lerp(x, -0.12, under), 0, 0));
    p.add(this.i(b.head), lerp(-0.2, 0.3, under), 0, 0);
    // The tail does the swimming.
    b.tail.forEach((bn, k) => p.add(this.i(bn), k === 0 ? -0.15 : 0, Math.sin(ph * 1.5 - k * 0.6) * (0.06 + k * 0.012) * (1 + under), 0));
    p.add(this.i(b.hips), 0, Math.sin(ph * 1.5) * 0.05, 0);
    // Legs paddle at the surface, trail underwater.
    for (const name of LEG_NAMES) {
      const leg = b.legs[name];
      const o = WALK_GAIT[name] * TAU;
      const s = Math.sin(ph + o) * (1 - under), c = Math.cos(ph + o) * (1 - under);
      if (leg.front) this.legAngles(p, leg, [0.3 + s * 0.6, -0.9 + c * 0.5 - under * 0.9, -0.3]);
      else this.legAngles(p, leg, [-0.2 + s * 0.6 - under * 0.4, -0.5 + c * 0.4, 0, -0.6 - under * 0.4]);
    }
  }

  // ---------- on top of everything ----------

  private overlays(p: Pose, dt: number, flying: boolean) {
    const b = this.b;
    // Look up and down with the neck.
    b.neck.forEach((n) => p.add(this.i(n), this.look * 0.12, 0, 0));
    p.add(this.i(b.head), this.look * 0.4, 0, 0);
    p.add(this.i(b.jaw), -this.jaw - Math.max(0, Math.sin(this.t * 0.4)) ** 20 * 0.25, 0, 0); // fire, and the odd yawn

    // Turning: the head leads into the turn and the tail swings out behind,
    // each tail bone a little later than the one before.
    const turn = this.yawRate;
    b.neck.forEach((n) => p.add(this.i(n), 0, turn * 0.05, 0));
    p.add(this.i(b.head), 0, turn * 0.08, 0);
    b.tail.forEach((bn, k) => {
      this.tailLag[k] = damp(this.tailLag[k], turn, 7 / (1 + k * 0.35), dt);
      this.tailLift[k] = damp(this.tailLift[k], this.climb, 5 / (1 + k * 0.35), dt);
      p.add(this.i(bn), clamp(this.tailLift[k] * 0.004, -0.06, 0.06) * this.fly, -this.tailLag[k] * 0.045, 0);
    });
    // Lean into turns when flying.
    this.bank = damp(this.bank, flying ? clamp(turn * this.speed * 0.025, -0.7, 0.7) : 0, 4, dt);
    p.add(this.i(b.hips), 0, 0, this.bank);
  }

  // ---------- helpers ----------

  private wing(p: Pose, w: WingBones, wp: WingPose) {
    const s = w.side;
    p.set(this.i(w.arm), wp.twist, s * (wp.sweep + this.extraSweep * this.fly), s * wp.lift);
    p.set(this.i(w.forearm), 0, s * wp.elbow, s * wp.elbowLift);
    p.set(this.i(w.hand), 0, s * wp.wrist, s * wp.wristLift);
    w.fingers.forEach((f, k) => {
      const a = this.fingerAngles[k];
      p.set(this.i(f), 0, s * (1 - wp.fan) * (a - k * 0.06), -s * wp.droop * (k + 1));
    });
  }

  /** Set a leg's joint angles (radians, + swings forward) top to bottom. */
  private legAngles(p: Pose, leg: LegBones, xs: number[]) {
    const chain = [leg.upper, leg.lower, ...(leg.ankle ? [leg.ankle] : []), leg.foot];
    chain.forEach((bn, k) => p.add(this.i(bn), xs[k] ?? 0, 0, 0));
  }

  private apply(p: Pose) {
    this.b.all.forEach((bn, i) => bn.rotation.set(p.a[i * 3], p.a[i * 3 + 1], p.a[i * 3 + 2]));
    this.b.hips.position.copy(this.hipsBind).add(p.hip);
  }

  /**
   * Where a foot goes during the stride, and the IK that puts it there. The
   * result is blended (by `weight`) over the leg angles the pose already set.
   */
  private legIK(name: LegName, weight: number) {
    if (weight < 0.001) return;
    const leg = this.b.legs[name];
    const run = smoothstep(this.speed, 10, 17);
    const move = smoothstep(this.speed + Math.abs(this.yawRate) * 1.5, 0.3, 2.5);
    const duty = lerp(0.62, 0.38, run);
    const step = this.stride() * duty * move;
    const phase = (this.gait + lerp(WALK_GAIT[name], RUN_GAIT[name], run) + 1) % 1;
    let dz: number, lift = 0, toe = 0, heel = 0;
    if (phase < duty) {
      dz = (phase / duty - 0.5) * step;
    } else {
      const q = (phase - duty) / (1 - duty);
      dz = (0.5 - smoothstep(q, 0, 1)) * step;
      const arc = Math.sin(Math.PI * q);
      lift = arc * (0.3 + this.speed * 0.025) * move;
      toe = -0.6 * arc * move;
      heel = 0.5 * arc * move;
    }
    dz *= this.fwdSign;

    const top = this.bind.get(leg.upper)!;
    const target = this.v.set(top.x, FOOT_Y + lift, top.z + (leg.front ? -0.1 : 0.2) + dz);
    // Into the frame of the bone the leg hangs from (the body may be leaning).
    const parent = leg.upper.parent!;
    this.m.copy(parent.matrixWorld).invert().multiply(this.root.matrixWorld);
    target.applyMatrix4(this.m);
    const e = this.m.elements;
    const down = Math.atan2(e[6], e[5]); // the root's down direction, as an angle in the parent's frame
    const toLocal = (worldAngle: number) => worldAngle + down;
    const L = leg.lengths;

    // The bone above the foot: a hind leg's long foot bone stands angled back; a front paw's wrist sits just above it.
    const footBone = leg.front ? 0.3 : L[2];
    const footAngle = toLocal(leg.front ? 0 : 0.3 + heel);
    const ay = target.y + Math.cos(footAngle) * footBone, az = target.z + Math.sin(footAngle) * footBone;
    const hy = leg.upper.position.y, hz = leg.upper.position.z;
    const dy = ay - hy, dzz = az - hz;
    const d = clamp(Math.hypot(dy, dzz), Math.abs(L[0] - L[1]) + 0.05, L[0] + L[1] - 0.001);
    const aim = Math.atan2(-dzz, -dy);
    const bend = Math.acos(clamp((L[0] * L[0] + d * d - L[1] * L[1]) / (2 * L[0] * d), -1, 1));
    const a1 = leg.front ? aim - bend : aim + bend; // knees bend forward, elbows back
    const ky = hy - Math.cos(a1) * L[0], kz = hz - Math.sin(a1) * L[0];
    const a2 = Math.atan2(-(az - kz), -(ay - ky));

    const blendX = (bn: THREE.Bone, x: number) => { bn.rotation.x = lerp(bn.rotation.x, x, weight); };
    blendX(leg.upper, a1);
    blendX(leg.lower, a2 - a1);
    if (leg.ankle) {
      blendX(leg.ankle, footAngle - a2);
      blendX(leg.foot, toLocal(toe) - footAngle);
    } else {
      blendX(leg.foot, toLocal(toe) - a2);
    }
  }

  /** Claw swipe: a front paw rears up and slashes across. */
  private swipe(s: { t: number; side: number } | null) {
    if (!s || s.t >= 1) return;
    const leg = s.side < 0 ? this.b.legs.fl : this.b.legs.fr;
    const k = Math.sin(Math.PI * clamp(s.t, 0, 1));
    const across = (0.5 - s.t) * 1.6 * s.side;
    leg.upper.rotation.x = lerp(leg.upper.rotation.x, 1.9, k);
    leg.upper.rotation.z = lerp(leg.upper.rotation.z, across, k);
    leg.lower.rotation.x = lerp(leg.lower.rotation.x, -0.5, k);
    leg.foot.rotation.x = lerp(leg.foot.rotation.x, -0.7, k);
    this.b.chest.rotation.x += k * 0.12;
  }
}
