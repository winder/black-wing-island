// Giant Wolves (forest): hunt in packs, run fast and bite. They can leap at a
// dragon flying low, but can't reach one flying high.

import * as THREE from 'three';
import { HitSphere } from '../combat/hits';
import { Monster, World, skin } from './monster';

const RUN = 19, TROT = 5;

export class Wolf extends Monster {
  readonly kind = 'wolf';
  private target: THREE.Vector3;
  private cooldown = Math.random();
  private stride = Math.random() * 10;
  private legs: THREE.Mesh[] = [];
  private leap = 0;
  private speed = 0;

  constructor(home: THREE.Vector3, private pack: Wolf[]) {
    super(70, home, 700);
    this.target = home.clone();
    const fur = skin('#6d6a72'), dark = skin('#3c3a40'), belly = skin('#a9a5ad'), eye = skin('#ffd23a', '#ffb000', 0.6);
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(2.6, 2.6, 5.5), fur);
    body.position.set(0, 6.5, 0);
    const chest = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(2.4, 2.8, 2.6), belly);
    chest.position.set(0, 6.2, -3.5);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 0).scale(1, 1, 1.2), fur);
    head.position.set(0, 9, -7);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.5, 5).rotateX(-Math.PI / 2), dark);
    snout.position.set(0, 8.4, -9.6);
    this.group.add(body, chest, head, snout);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 4), dark);
      ear.position.set(side * 1.1, 11.2, -6.6);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.4, 5, 4), eye);
      e.position.set(side * 1, 9.6, -8.6);
      this.group.add(ear, e);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1, 6, 5).rotateX(-Math.PI / 2 - 0.6), fur);
    tail.position.set(0, 8, 7);
    this.group.add(tail);
    for (const [x, z] of [[1.4, -3.6], [-1.4, -3.6], [1.4, 3.6], [-1.4, 3.6]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.45, 5.5, 5).translate(0, -2.75, 0), dark);
      leg.position.set(x, 5.5, z);
      this.legs.push(leg);
      this.group.add(leg);
    }
    this.collectMaterials();
  }

  hitSpheres(): HitSphere[] {
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const base = this.group.position;
    return [
      { center: base.clone().setY(base.y + 6.5), radius: 5 },
      { center: base.clone().setY(base.y + 8.5).addScaledVector(fwd, -7.5), radius: 3 },
    ];
  }

  takeHit(amount: number, kind: 'fire' | 'claw', from: THREE.Vector3, sphere = 0) {
    super.takeHit(amount, kind, from, sphere);
    for (const w of this.pack) if (w.alive) { w.aggro = true; w.sinceFight = 0; } // hurt one, the pack comes
  }

  protected think(dt: number, world: World) {
    this.cooldown -= dt;
    const d = this.distanceToPlayer(world);
    const sees = d < 150 && this.canChase(world, 45);
    if (sees && !this.aggro) {
      for (const w of this.pack) w.aggro = true;
      world.sound('roar', this.position);
    }
    if (this.aggro && !this.canChase(world, 60)) this.aggro = false;

    if (this.aggro) {
      // Circle in from slightly different angles so the pack surrounds you.
      const i = this.pack.indexOf(this);
      const p = world.player.position;
      const offset = new THREE.Vector3(Math.cos(i * 2.1), 0, Math.sin(i * 2.1)).multiplyScalar(d > 30 ? 12 : 0);
      // Close in, but stop just short so they don't run right through the dragon.
      this.moveToward(p.clone().add(offset), d > 10 ? RUN : 0, dt, world, 4);
      this.speed = RUN;
      const altitude = p.y - world.island.heightAt(p.x, p.z);
      if (d < 12 && this.cooldown <= 0) {
        this.cooldown = 1.3;
        if (altitude < 14) {
          this.leap = 0.5;
          world.hurtPlayer(10, this.position, 10);
          world.sound('bite', this.position);
          this.sinceFight = 0;
        }
      }
    } else {
      if (this.moveToward(this.target, TROT, dt, world, 1.5) < 2) this.target = this.wanderSpot(150);
      this.speed = TROT;
    }
    // Don't stand on top of the rest of the pack.
    for (const w of this.pack) {
      if (w === this || !w.alive) continue;
      const away = this.position.clone().sub(w.position).setY(0);
      const d2 = away.length();
      if (d2 < 11 && d2 > 0.01) this.position.addScaledVector(away.normalize(), (11 - d2) * 0.5);
    }
    this.position.y = world.island.heightAt(this.position.x, this.position.z);
    this.leap = Math.max(0, this.leap - dt);
    this.placeModel();
    this.group.position.y += Math.sin((this.leap / 0.5) * Math.PI) * 6;
    this.stride += dt * this.speed * 0.35;
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.stride + (i % 2 === 0 ? 0 : Math.PI) + (i > 1 ? Math.PI / 2 : 0)) * 0.6; });
  }
}
