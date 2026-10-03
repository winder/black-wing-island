// Giant Yeti (mountains): stomps after you on the ground and punches; throws
// giant snowballs at dragons flying out of reach.

import * as THREE from 'three';
import { HitSphere } from '../combat/hits';
import { Monster, World, skin } from './monster';

export class Yeti extends Monster {
  readonly kind = 'yeti';
  private target: THREE.Vector3;
  private stride = 0;
  private speed = 0;
  private punch = Infinity;  // seconds since a punch started
  private throwT = Infinity; // seconds since a throw started
  private cooldown = 0;
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];

  constructor(home: THREE.Vector3) {
    super(240, home, 600);
    this.target = home.clone();
    const fur = skin('#eef2f7'), shade = skin('#c9d3e0'), face = skin('#6f8fb8'), eye = skin('#11151c'), horn = skin('#d9cfb8');
    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(6, 7.5, 4.5), fur);
    torso.position.y = 16;
    const belly = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(4.5, 5, 2), shade);
    belly.position.set(0, 15, -2.6);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 1), fur);
    head.position.y = 25;
    const mask = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(2.6, 2.2, 1), face);
    mask.position.set(0, 24.6, -2.9);
    this.group.add(torso, belly, head, mask);
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.45, 5, 4), eye);
      e.position.set(side * 1, 25.3, -3.8);
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.5, 5), horn);
      h.position.set(side * 2.6, 28.2, -0.4);
      h.rotation.z = -side * 0.5;
      this.group.add(e, h);
      // Legs and arms hinge at the top so they can swing.
      const leg = new THREE.Group();
      leg.position.set(side * 3, 10, 0);
      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(2, 1.6, 10, 6), fur);
      legMesh.position.y = -5;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 4.5), shade);
      foot.position.set(0, -9.6, -0.8);
      leg.add(legMesh, foot);
      const arm = new THREE.Group();
      arm.position.set(side * 7, 20, 0);
      const armMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 12, 6), fur);
      armMesh.position.y = -6;
      const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 0), shade);
      fist.position.y = -12.5;
      arm.add(armMesh, fist);
      this.legs.push(leg);
      this.arms.push(arm);
      this.group.add(leg, arm);
    }
    this.collectMaterials();
  }

  hitSpheres(): HitSphere[] {
    const b = this.position;
    return [
      { center: b.clone().setY(b.y + 16), radius: 7.5 },
      { center: b.clone().setY(b.y + 25), radius: 4 },
      { center: b.clone().setY(b.y + 6), radius: 5 },
    ];
  }

  protected think(dt: number, world: World) {
    this.cooldown -= dt;
    this.punch += dt;
    this.throwT += dt;
    const p = world.player.center();
    const altitude = world.player.position.y - world.island.heightAt(p.x, p.z);
    const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
    if (!this.aggro && d < 180 && this.canChase(world, 400)) {
      this.aggro = true;
      world.sound('roar', this.position);
    }
    if (this.aggro && (!this.canChase(world, 400) || d > 320)) this.aggro = false;

    this.speed = 0;
    if (this.aggro) {
      const flyingHigh = altitude > 14;
      if (!flyingHigh && d < 20) {
        this.face(p, dt);
        if (this.cooldown <= 0) { this.cooldown = 2; this.punch = 0; }
      } else if (flyingHigh && d < 230) {
        this.face(p, dt);
        if (this.cooldown <= 0) { this.cooldown = 3; this.throwT = 0; }
      } else {
        this.moveToward(world.player.position, 8, dt, world, 1.5);
        this.speed = 8;
      }
      // The blow lands partway through the swing.
      if (this.punch > 0.35 && this.punch - dt <= 0.35 && d < 22 && altitude < 18) {
        world.hurtPlayer(20, this.position, 30);
        this.sinceFight = 0;
      }
      if (this.throwT > 0.5 && this.throwT - dt <= 0.5) {
        const hand = this.position.clone().setY(this.position.y + 30);
        const flight = THREE.MathUtils.clamp(d / 60, 1, 3);
        // Aim a bit ahead of where the dragon is going.
        const lead = p.clone().addScaledVector(world.player.velocity, flight * 0.6);
        world.projectiles.launch('snowball', hand, lead, flight, 15);
      }
    } else if (this.moveToward(this.target, 3, dt, world, 1) < 2) {
      this.target = this.wanderSpot(150);
    } else this.speed = 3;

    this.placeModel();
    this.stride += dt * this.speed * 0.25;
    const swing = Math.sin(this.stride) * 0.5;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.6;
    this.arms[1].rotation.x = swing * 0.6;
    if (this.punch < 0.7) this.arms[1].rotation.x = -Math.sin((this.punch / 0.7) * Math.PI) * 1.8;
    if (this.throwT < 0.9) this.arms[0].rotation.x = -Math.PI + Math.sin((this.throwT / 0.9) * Math.PI) * -1 + 0.3;
  }

  private face(p: THREE.Vector3, dt: number) {
    const want = Math.atan2(-(p.x - this.position.x), -(p.z - this.position.z));
    const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
    this.heading += THREE.MathUtils.clamp(diff, -2 * dt, 2 * dt);
  }
}
