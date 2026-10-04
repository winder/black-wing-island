// Giant Kraken (beach and islands): hides in the shallow sea. Its tentacles
// burst out to grab dragons flying or swimming low. Fire makes a tentacle let
// go. Beat every tentacle to beat the Kraken.

import * as THREE from 'three';
import { DamageKind } from '../combat/attacks';
import { HitSphere } from '../combat/hits';
import { Monster, World, skin } from './monster';

const TENTACLES = 5;
const SEGMENTS = 9;
const LENGTH = 38;
const TENTACLE_HEALTH = 60;
const NOTICE_RANGE = 75;
const NOTICE_ALTITUDE = 40;

interface Tentacle {
  base: THREE.Vector3;
  health: number;
  /** 0 = under water, 1 = fully up. */
  rise: number;
  tip: THREE.Vector3;
  points: THREE.Vector3[];
  meshes: THREE.Mesh[];
  holding: boolean;
  holdTime: number;
  hurtWhileHolding: number;
  retreat: number;
  phase: number;
}

export class Kraken extends Monster {
  readonly kind = 'kraken';
  private tentacles: Tentacle[] = [];
  private headMesh: THREE.Group;
  private grabCooldown = 0;
  private t = 0;
  private held = new THREE.Vector3();

  constructor(home: THREE.Vector3) {
    super(TENTACLES * TENTACLE_HEALTH, home.clone().setY(0), 250);
    const flesh = skin('#7b3f8c'), sucker = skin('#e3a6c9'), eye = skin('#ffe45a', '#ffb000', 0.8), pupil = skin('#111');

    this.headMesh = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(11, 9, 13), flesh);
    this.headMesh.add(dome);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(2.4, 7, 5), eye);
      e.position.set(side * 6, 3, -9.5);
      const pu = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.2, 0.6), pupil);
      pu.position.set(side * 6, 3, -11.8);
      this.headMesh.add(e, pu);
    }
    this.headMesh.position.copy(this.home).setY(-9);
    this.group.add(this.headMesh);

    for (let i = 0; i < TENTACLES; i++) {
      const a = (i / TENTACLES) * Math.PI * 2;
      const base = this.home.clone().add(new THREE.Vector3(Math.cos(a) * 20, -3, Math.sin(a) * 20));
      const meshes: THREE.Mesh[] = [];
      for (let s = 0; s < SEGMENTS; s++) {
        const r = 3.2 * (1 - (s / SEGMENTS) * 0.75);
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0).scale(1, 1.6, 1), s % 2 ? sucker : flesh);
        meshes.push(m);
        this.group.add(m);
      }
      this.tentacles.push({
        base, health: TENTACLE_HEALTH, rise: 0, tip: base.clone(), meshes,
        points: Array.from({ length: SEGMENTS }, () => base.clone()),
        holding: false, holdTime: 0, hurtWhileHolding: 0, retreat: 0, phase: Math.random() * 10,
      });
    }
    this.collectMaterials();
  }

  /** A Kraken Boss doesn't grow; its tentacles get tougher instead. */
  makeBoss(title: string, _size: number, toughness: number) {
    super.makeBoss(title, 1, toughness);
    for (const t of this.tentacles) t.health *= toughness;
  }

  protected body(): HitSphere[] {
    const out: HitSphere[] = [];
    for (const t of this.tentacles) {
      t.points.forEach((p, s) => out.push({ center: p, radius: 4 * (1 - (s / SEGMENTS) * 0.6) }));
    }
    return out;
  }

  takeHit(amount: number, kind: DamageKind, from: THREE.Vector3, sphere = 0) {
    const t = this.tentacles[Math.floor(sphere / SEGMENTS)];
    if (!t || t.health <= 0 || t.rise < 0.3) return;
    t.health = Math.max(0, t.health - amount);
    if (t.holding) {
      t.hurtWhileHolding += amount;
      // Fire makes it let go straight away; claws take a few hits.
      if (kind === 'fire' || t.hurtWhileHolding >= 25 || t.health === 0) this.letGo(t);
    }
    const before = this.health;
    super.takeHit(0, kind, from, sphere);
    this.health = this.tentacles.reduce((sum, x) => sum + x.health, 0);
    if (this.health === 0 && before > 0) this.sinceDefeat = 0;
  }

  private letGo(t: Tentacle) {
    t.holding = false;
    t.retreat = 5;
    this.grabCooldown = 3;
    if (this.heldBy === t) {
      this.heldBy = null;
      this.releasePlayer = true;
    }
  }

  /** Set by letGo; the next think() frees the player (it needs the World to do so). */
  private releasePlayer = false;

  /** The tentacle holding the player, if any (shared with the World so only one grabs). */
  private heldBy: Tentacle | null = null;

  protected think(dt: number, world: World) {
    this.t += dt;
    this.grabCooldown -= dt;
    const player = world.player;
    if (this.releasePlayer) { player.heldAt = null; this.releasePlayer = false; }
    const p = player.center();
    const altitude = p.y - Math.max(0, world.island.heightAt(p.x, p.z));
    const flatD = Math.hypot(p.x - this.home.x, p.z - this.home.z);
    const awake = flatD < NOTICE_RANGE && altitude < NOTICE_ALTITUDE && !player.vitals.knockedOut;
    if (awake && !this.aggro) world.sound('splash', this.home);
    this.aggro = awake || this.heldBy !== null;

    this.headMesh.position.y = THREE.MathUtils.damp(this.headMesh.position.y, this.aggro ? -4 : -12, 2, dt);
    this.headMesh.lookAt(p.x, this.headMesh.position.y, p.z);
    this.headMesh.rotateY(Math.PI);

    for (const t of this.tentacles) {
      const alive = t.health > 0;
      t.retreat -= dt;
      const up = alive && this.aggro && t.retreat <= 0;
      t.rise = THREE.MathUtils.damp(t.rise, up ? 1 : 0, alive ? 2.5 : 1, dt);

      // Where the tip wants to be.
      const sway = new THREE.Vector3(Math.sin(this.t * 1.3 + t.phase) * 8, 0, Math.cos(this.t * 1.1 + t.phase) * 8);
      let want = t.base.clone().add(sway).setY(LENGTH * 0.8);
      if (t.holding) {
        t.holdTime += dt;
        // Squeeze and pull the dragon down towards the water.
        this.held.copy(t.base).add(new THREE.Vector3(0, 14, 0)).add(t.base.clone().sub(this.home).setLength(8));
        want = this.held.clone().add(new THREE.Vector3(0, 3, 0));
        player.heldAt = this.held.clone().setY(this.held.y - 2.6);
        world.hurtPlayer(7 * dt, t.tip, 0);
        this.sinceFight = 0;
        if (t.holdTime > 7) this.letGo(t);
      } else if (up && p.distanceTo(t.base) < LENGTH * 1.25) {
        want = p.clone();
        // Grab!
        if (!this.heldBy && this.grabCooldown <= 0 && t.tip.distanceTo(p) < 7) {
          t.holding = true;
          t.holdTime = 0;
          t.hurtWhileHolding = 0;
          this.heldBy = t;
          world.sound('splash', t.tip);
        }
      }
      if (!up && t.holding) this.letGo(t);
      // Keep the tip within reach of the base.
      const reach = want.clone().sub(t.base);
      if (reach.length() > LENGTH) reach.setLength(LENGTH);
      t.tip.lerp(t.base.clone().add(reach), 1 - Math.exp(-(t.holding ? 8 : 3) * dt));

      // Lay the segments along a curve from the base up and over to the tip.
      const sunk = (1 - t.rise) * (LENGTH + 10);
      const ctrl = t.base.clone().setY(t.base.y + LENGTH * 0.55);
      const tipNow = t.tip.clone().setY(t.tip.y - sunk);
      const curve = new THREE.QuadraticBezierCurve3(t.base.clone().setY(t.base.y - sunk * 0.3), ctrl.setY(ctrl.y - sunk), tipNow);
      for (let s = 0; s < SEGMENTS; s++) {
        curve.getPoint(s / (SEGMENTS - 1), t.points[s]);
        t.meshes[s].position.copy(t.points[s]);
        const next = curve.getPoint(Math.min(1, (s + 1) / (SEGMENTS - 1)));
        t.meshes[s].lookAt(next);
        t.meshes[s].rotateX(Math.PI / 2);
        t.meshes[s].visible = t.points[s].y > -8;
      }
    }
    if (this.releasePlayer) { player.heldAt = null; this.releasePlayer = false; }
  }

  protected defeated(dt: number, world: World) {
    if (this.heldBy || this.releasePlayer) { world.player.heldAt = null; this.heldBy = null; this.releasePlayer = false; }
    for (const t of this.tentacles) {
      t.rise = Math.max(0, t.rise - dt * 0.6);
      t.points.forEach((pt, s) => { pt.y -= dt * 10; t.meshes[s].position.copy(pt); });
    }
    this.headMesh.position.y -= dt * 4;
  }
}
