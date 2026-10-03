// Shared behaviour for Monsters: health, getting hurt, being defeated, moving
// over the ground, and staying out of villages.

import * as THREE from 'three';
import { DamageKind, Target } from '../combat/attacks';
import { HitSphere } from '../combat/hits';
import { Player } from '../player/player';
import { Island, VILLAGE_RADIUS } from '../world/island';
import { Projectiles } from './projectiles';

export type MonsterKind = 'snail' | 'wolf' | 'sandSnake' | 'yeti' | 'lavaWorm' | 'kraken';

export const MONSTER_NAMES: Record<MonsterKind, string> = {
  snail: 'Giant Snail', wolf: 'Giant Wolf', sandSnake: 'Giant Sand Snake',
  yeti: 'Giant Yeti', lavaWorm: 'Giant Lava Worm', kraken: 'Giant Kraken',
};

export interface World {
  island: Island;
  player: Player;
  projectiles: Projectiles;
  /** Hurt the player, shoving them away from `from`. */
  hurtPlayer(amount: number, from: THREE.Vector3, shove: number): void;
  sound(name: 'roar' | 'hit' | 'bite' | 'splash', at: THREE.Vector3): void;
}

/** A material for a monster body part. Each monster has its own, so it can flash when hit. */
export function skin(color: string, emissive = '#000000', emissiveIntensity = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity, flatShading: true });
}

export abstract class Monster implements Target {
  abstract readonly kind: MonsterKind;
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  heading = 0;
  health: number;
  /** How much each kind of attack hurts this monster (1 = normal). */
  protected resist: Record<DamageKind, number> = { fire: 1, claw: 1 };
  /** Set while angry at the player. */
  aggro = false;
  /** Seconds since it last hurt or was hurt by the player; used to show its health bar. */
  sinceFight = Infinity;
  /** Seconds since being defeated (Infinity while alive). */
  sinceDefeat = Infinity;
  private flash = 0;
  private materials: THREE.MeshLambertMaterial[] = [];
  private baseEmissive: { color: THREE.Color; intensity: number }[] = [];

  constructor(readonly maxHealth: number, readonly home: THREE.Vector3, protected leash: number) {
    this.health = maxHealth;
    this.position.copy(home);
  }

  get alive() { return this.health > 0; }
  get name() { return MONSTER_NAMES[this.kind]; }
  /** Fully gone and can be removed from the scene. */
  get finished() { return !this.alive && this.sinceDefeat > 4; }

  /** Call after building the model so hits can make every part flash. */
  protected collectMaterials() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshLambertMaterial && !this.materials.includes(o.material)) {
        this.materials.push(o.material);
        this.baseEmissive.push({ color: o.material.emissive.clone(), intensity: o.material.emissiveIntensity });
      }
    });
  }

  abstract hitSpheres(): HitSphere[];

  takeHit(amount: number, kind: DamageKind, _from: THREE.Vector3, _sphere = 0) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount * this.resist[kind]);
    this.flash = 1;
    this.aggro = true;
    this.sinceFight = 0;
    if (!this.alive) this.sinceDefeat = 0;
  }

  update(dt: number, world: World) {
    this.sinceFight += dt;
    if (this.alive) this.think(dt, world);
    else {
      this.sinceDefeat += dt;
      this.defeated(dt, world);
    }
    this.flash = Math.max(0, this.flash - dt * 4);
    this.materials.forEach((m, i) => {
      const base = this.baseEmissive[i];
      m.emissive.copy(base.color).lerp(new THREE.Color('#ff2a10'), this.flash);
      m.emissiveIntensity = base.intensity + this.flash * 0.9;
    });
  }

  protected abstract think(dt: number, world: World): void;

  /** Default defeat: topple over and sink into the ground. */
  protected defeated(dt: number, world: World) {
    const t = this.sinceDefeat;
    this.group.rotation.z = Math.min(1.4, t * 1.8);
    if (t > 1.2) this.group.position.y -= dt * 6;
    void world;
  }

  // ---------- helpers for subclasses ----------

  protected distanceToPlayer(world: World) {
    return this.position.distanceTo(world.player.center());
  }

  /** Is the player somewhere this monster is allowed to chase them? */
  protected canChase(world: World, maxAltitude = Infinity) {
    const p = world.player.position;
    const home = world.island.home;
    if (Math.hypot(p.x - home.x, p.z - home.z) < VILLAGE_RADIUS * 1.2) return false;
    if (Math.hypot(p.x - this.home.x, p.z - this.home.z) > this.leash) return false;
    const ground = world.island.heightAt(p.x, p.z);
    return p.y - ground < maxAltitude && !world.player.vitals.knockedOut;
  }

  /** Walk over the ground towards a point. Returns the distance left. */
  protected moveToward(target: THREE.Vector3, speed: number, dt: number, world: World, turnRate = 3) {
    const dx = target.x - this.position.x, dz = target.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) return d;
    const want = Math.atan2(-dx, -dz);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += THREE.MathUtils.clamp(diff, -turnRate * dt, turnRate * dt);
    const step = Math.min(d, speed * dt);
    const nx = this.position.x - Math.sin(this.heading) * step;
    const nz = this.position.z - Math.cos(this.heading) * step;
    // Never walk into the Home Village.
    const home = world.island.home;
    if (Math.hypot(nx - home.x, nz - home.z) > VILLAGE_RADIUS * 1.15) {
      this.position.x = nx;
      this.position.z = nz;
    }
    this.position.y = world.island.heightAt(this.position.x, this.position.z);
    return d;
  }

  /** Somewhere random near home to amble to. */
  protected wanderSpot(radius: number) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
    return new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
  }

  /** Point a model (which faces -z) along `heading`. */
  protected placeModel() {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
  }
}
