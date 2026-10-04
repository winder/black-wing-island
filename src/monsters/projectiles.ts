// Things monsters throw or spit: Yeti snowballs and Lava Worm lava blobs.

import * as THREE from 'three';
import type { Floor } from './monster';

export type ProjectileKind = 'snowball' | 'lava';

interface Projectile { kind: ProjectileKind; mesh: THREE.Mesh; vel: THREE.Vector3; damage: number; radius: number; age: number }

const GRAVITY = 20;
const MODELS: Record<ProjectileKind, () => THREE.Mesh> = {
  snowball: () => new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshLambertMaterial({ color: '#f4f8ff', flatShading: true })),
  lava: () => new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.8, 0),
    new THREE.MeshLambertMaterial({ color: '#ff5a10', emissive: '#ff3000', emissiveIntensity: 1.2, flatShading: true }),
  ),
};

export class Projectiles {
  readonly group = new THREE.Group();
  private list: Projectile[] = [];

  /** What thrown things land on: the Island, or an Interior's floor. */
  constructor(public island: Floor) {}

  /** Throw something from `from` so that it lands on `target`, flying for about `time` seconds. */
  launch(kind: ProjectileKind, from: THREE.Vector3, target: THREE.Vector3, time: number, damage: number) {
    const vel = target.clone().sub(from).divideScalar(time);
    vel.y += 0.5 * GRAVITY * time;
    const mesh = MODELS[kind]();
    mesh.position.copy(from);
    this.group.add(mesh);
    this.list.push({ kind, mesh, vel, damage, radius: kind === 'snowball' ? 2.2 : 1.8, age: 0 });
  }

  /** Move everything; call `onHit` for whatever hits the target sphere. */
  update(dt: number, target: THREE.Vector3, targetRadius: number, onHit: (p: { kind: ProjectileKind; damage: number; position: THREE.Vector3 }) => void) {
    this.list = this.list.filter((p) => {
      p.age += dt;
      p.vel.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 4;
      const pos = p.mesh.position;
      let gone = p.age > 8;
      if (pos.distanceTo(target) < p.radius + targetRadius) {
        onHit({ kind: p.kind, damage: p.damage, position: pos.clone() });
        gone = true;
      } else if (pos.y < this.island.heightAt(pos.x, pos.z) || pos.y < -1) {
        gone = true;
      }
      if (gone) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
      }
      return !gone;
    });
  }
}
