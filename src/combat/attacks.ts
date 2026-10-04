// The Player Dragon's attacks: Fire Breath (hold left mouse) and Claw Swipe
// (right mouse or F).

import * as THREE from 'three';
import { Input } from '../input';
import { Player } from '../player/player';
import type { Floor } from '../monsters/monster';
import { HitSphere, coneHitsSphere, spheresTouch } from './hits';

export type DamageKind = 'fire' | 'claw';

/** Anything the dragon can hurt. */
export interface Target {
  readonly alive: boolean;
  hitSpheres(): HitSphere[];
  /** `sphere` is which of `hitSpheres()` was hit. */
  takeHit(amount: number, kind: DamageKind, from: THREE.Vector3, sphere: number): void;
}

const FIRE_RANGE = 44;
const FIRE_HALF_ANGLE = 0.2;
const FIRE_DPS = 40;
const FIRE_SPEED = 60;
const CLAW_DAMAGE = 30;
const CLAW_REACH = 7;
const CLAW_RADIUS = 8;
const CLAW_COOLDOWN = 0.55;
const CLAW_SWING = 0.28;

// ---------- Fire Breath ----------

const MAX_PARTICLES = 700;

export class FireBreath {
  readonly object: THREE.Points;
  readonly light = new THREE.PointLight("#ff8a2a", 0, 60, 1.6);
  breathing = false;
  /** Hotter Fire raises these: damage, and how far the flames reach. */
  power = 1;
  reach = 1;
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private age = new Float32Array(MAX_PARTICLES).fill(Infinity);
  private life = new Float32Array(MAX_PARTICLES);
  private ageAttr: THREE.BufferAttribute;
  private next = 0;
  private emitCarry = 0;

  /** What the flames splash along: the Island, or an Interior's floor. */
  constructor(public island: Floor) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.ageAttr = new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES).fill(1), 1);
    geo.setAttribute('age', this.ageAttr);
    this.object = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 260 } },
      vertexShader: `
        attribute float age; uniform float scale; varying float vAge;
        void main() {
          vAge = age;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.0 + age * 7.0) * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAge;
        void main() {
          if (vAge >= 1.0) discard;
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          vec3 hot = vec3(1.0, 0.95, 0.6), mid = vec3(1.0, 0.45, 0.08), cool = vec3(0.35, 0.08, 0.02);
          vec3 c = vAge < 0.3 ? mix(hot, mid, vAge / 0.3) : mix(mid, cool, (vAge - 0.3) / 0.7);
          float a = (1.0 - vAge) * (1.0 - d * 2.0) * 0.8;
          gl_FragColor = vec4(c * a, a);
        }`,
    }));
    this.object.frustumCulled = false;
  }

  update(dt: number, wantBreath: boolean, player: Player, targets: Target[]) {
    this.breathing = wantBreath && player.vitals.breathe(dt) && !player.underwater;
    const mouth = player.mouth();
    const dir = player.lookDir();

    if (this.breathing) {
      this.emitCarry += dt * 200;
      for (; this.emitCarry >= 1; this.emitCarry--) {
        const i = this.next;
        this.next = (this.next + 1) % MAX_PARTICLES;
        const spread = new THREE.Vector3().randomDirection().multiplyScalar(0.12 + Math.random() * 0.08);
        const v = dir.clone().add(spread).normalize().multiplyScalar(FIRE_SPEED * this.reach * (0.8 + Math.random() * 0.4)).add(player.velocity);
        const start = mouth.clone().addScaledVector(dir, 2 + Math.random() * 2);
        this.pos.set([start.x, start.y, start.z], i * 3);
        this.vel.set([v.x, v.y, v.z], i * 3);
        this.age[i] = 0;
        this.life[i] = 0.55 + Math.random() * 0.25;
      }
      // Burn whatever is in the cone of fire.
      for (const t of targets) {
        if (!t.alive) continue;
        const hit = t.hitSpheres().findIndex((s) => coneHitsSphere(mouth, dir, FIRE_RANGE * this.reach, FIRE_HALF_ANGLE, s));
        if (hit >= 0) t.takeHit(FIRE_DPS * this.power * dt, 'fire', mouth, hit);
      }
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.age[i] === Infinity) continue;
      this.age[i] += dt;
      const k = i * 3;
      this.vel[k] *= 1 - dt * 1.2; this.vel[k + 2] *= 1 - dt * 1.2;
      this.vel[k + 1] = this.vel[k + 1] * (1 - dt * 1.2) + dt * 6; // flames rise
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.age[i] = Infinity; this.ageAttr.setX(i, 1); continue; }
      // Splash along the ground instead of going through it.
      const g = this.island.heightAt(this.pos[k], this.pos[k + 2]);
      if (this.pos[k + 1] < g + 0.5) { this.pos[k + 1] = g + 0.5; this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.2; }
      this.ageAttr.setX(i, t);
    }
    this.object.geometry.attributes.position.needsUpdate = true;
    this.ageAttr.needsUpdate = true;

    this.light.position.copy(mouth).addScaledVector(dir, 12);
    const flicker = 0.8 + Math.random() * 0.4;
    this.light.intensity = THREE.MathUtils.damp(this.light.intensity, this.breathing ? 350 * flicker : 0, 12, dt);
  }
}

// ---------- Claw Swipe ----------

function makeClaw(): THREE.Group {
  const dark = new THREE.MeshLambertMaterial({ color: '#16131c', flatShading: true });
  const talon = new THREE.MeshLambertMaterial({ color: '#d8d0c0', flatShading: true });
  const g = new THREE.Group();
  const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0).scale(1.2, 0.6, 1.4), dark);
  g.add(hand);
  for (let f = -1; f <= 1; f++) {
    const finger = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.1, 4).rotateX(-Math.PI / 2 - 0.5), talon);
    finger.position.set(f * 0.32, 0.15, -0.85);
    g.add(finger);
  }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 2.4, 5).rotateX(Math.PI / 2 - 0.4), dark);
  arm.position.set(0, -0.5, 1.2);
  g.add(arm);
  return g;
}

export class ClawSwipe {
  /** Seconds since the last swipe started. */
  private t = Infinity;
  private side = 1;
  private hitDone = true;
  private claws: THREE.Group[];

  constructor(camera: THREE.Camera) {
    this.claws = [makeClaw(), makeClaw()];
    this.claws.forEach((c) => { c.visible = false; c.scale.setScalar(1.3); camera.add(c); });
  }

  get swinging() { return this.t < CLAW_SWING; }

  /** How far through the swipe (0..1) and with which paw, for the dragon model; null when not swiping. */
  get pose() { return this.t < CLAW_SWING * 1.6 ? { t: this.t / (CLAW_SWING * 1.6), side: this.side } : null; }

  update(dt: number, input: Input, player: Player, targets: Target[], onSwipe: () => void, allowed = true) {
    this.t += dt;
    const ready = allowed && this.t > CLAW_COOLDOWN && !player.vitals.knockedOut;
    if (ready && (input.wasClicked(2) || input.wasPressed('KeyF'))) {
      this.t = 0;
      this.side = -this.side;
      this.hitDone = false;
      onSwipe();
    }
    if (!this.hitDone && this.t > CLAW_SWING * 0.4) {
      this.hitDone = true;
      const reach: HitSphere = {
        center: player.mouth().addScaledVector(player.lookDir(), CLAW_REACH - 4).setY(player.position.y + 3),
        radius: CLAW_RADIUS,
      };
      for (const t of targets) {
        if (!t.alive) continue;
        const hit = t.hitSpheres().findIndex((s) => spheresTouch(reach, s));
        if (hit >= 0) t.takeHit(CLAW_DAMAGE, 'claw', player.center(), hit);
      }
    }

    // First-person claws sweep across the bottom of the screen.
    const showing = !player.thirdPerson && this.t < CLAW_SWING + 0.15;
    this.claws.forEach((c, i) => {
      const side = i === 0 ? -1 : 1;
      const active = side === this.side;
      c.visible = showing && active;
      if (!c.visible) return;
      const k = Math.min(1, this.t / CLAW_SWING);
      const swing = Math.sin(k * Math.PI);
      c.position.set(side * (1.6 - k * 2.6), -1.15 + swing * 0.9, -2.4);
      c.rotation.set(0.3, side * (0.6 - k * 1.2), side * -0.5 * swing);
    });
  }
}
