// Giant Snail (meadow): slow and chill. It minds its own business unless you
// attack it, then it slowly comes after you and headbutts.

import * as THREE from 'three';
import { HitSphere } from '../combat/hits';
import { Monster, World, skin } from './monster';

export class Snail extends Monster {
  readonly kind = 'snail';
  private target: THREE.Vector3;
  private cooldown = 0;
  private bob = Math.random() * 10;
  private shell: THREE.Mesh;

  constructor(home: THREE.Vector3) {
    super(150, home, 400);
    this.target = home.clone();
    const body = skin('#b7a27a'), shell = skin('#c46a3a'), stripe = skin('#7e3b1c'), eye = skin('#1d1a18');
    const foot = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1).scale(4, 2.4, 9), body);
    foot.position.set(0, 2, 0);
    this.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(6.5, 1), shell);
    this.shell.position.set(0, 8.5, 2.5);
    const swirl = new THREE.Mesh(new THREE.TorusGeometry(4.3, 1.2, 6, 12), stripe);
    swirl.position.set(0, 8.5, 2.5);
    swirl.rotation.y = Math.PI / 2;
    const swirl2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.9, 6, 10), stripe);
    swirl2.position.set(0, 8.5, 2.5);
    swirl2.rotation.y = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), body);
    head.position.set(0, 4.5, -8);
    this.group.add(foot, this.shell, swirl, swirl2, head);
    for (const side of [-1, 1]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.5, 5), body);
      stalk.position.set(side * 1.1, 7.5, -8.8);
      stalk.rotation.set(-0.3, 0, side * 0.3);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), eye);
      ball.position.set(side * 1.8, 9.7, -9.5);
      this.group.add(stalk, ball);
    }
    this.collectMaterials();
  }

  hitSpheres(): HitSphere[] {
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    return [
      { center: this.position.clone().setY(this.position.y + 8).addScaledVector(fwd, -2.5), radius: 7 },
      { center: this.position.clone().setY(this.position.y + 4).addScaledVector(fwd, -8), radius: 4 },
    ];
  }

  protected think(dt: number, world: World) {
    this.cooldown -= dt;
    this.bob += dt;
    if (this.aggro && this.sinceFight > 25) this.aggro = false; // calms down again
    if (this.aggro && this.canChase(world, 15)) {
      const d = this.moveToward(world.player.position, 3.5, dt, world, 0.8);
      if (d < 13 && this.cooldown <= 0) {
        this.cooldown = 2.2;
        world.hurtPlayer(10, this.position, 18);
        this.sinceFight = 0;
      }
    } else {
      if (this.moveToward(this.target, 1.2, dt, world, 0.5) < 2) this.target = this.wanderSpot(120);
    }
    this.placeModel();
    this.shell.position.y = 8.5 + Math.sin(this.bob * 1.5) * 0.15;
  }
}
