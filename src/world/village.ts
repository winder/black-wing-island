// The Home Village in the meadow: dragon-sized huts round a bonfire, with
// Villagers (dragons of other colours) wandering about. No quests yet.

import * as THREE from 'three';
import { makeDragon, DragonModel } from '../player/dragonModel';
import { Collider } from './collide';
import { Island, VILLAGE_RADIUS } from './island';
import { hash2 } from './noise';

const VILLAGER_COLORS: [string, string][] = [
  ['#c0392b', '#f1c40f'], ['#2e86c1', '#aed6f1'], ['#27ae60', '#f9e79f'],
  ['#d35400', '#784212'], ['#8e44ad', '#f5b7b1'], ['#f4d03f', '#a04000'],
];

/** A villager's scale colours (body, belly/wings), picked by seed. */
export function villagerColors(seed: number): [string, string] {
  return VILLAGER_COLORS[Math.abs(seed) % VILLAGER_COLORS.length];
}

interface Villager { model: DragonModel; target: THREE.Vector2; pause: number; home: { x: number; z: number; r: number }; added?: boolean; velocity: THREE.Vector3 }

const VILLAGER_SPEED = 3;

export class Village {
  readonly group = new THREE.Group();
  private villagers: Villager[] = [];
  /** Things already standing in the Home Village (huts, the bonfire), so nothing gets built on top. */
  readonly obstacles: { x: number; z: number; r: number }[] = [];
  /** What the dragon bumps into: the huts' walls and the bonfire's ring of stones. */
  readonly colliders: Collider[] = [];
  private fire: THREE.PointLight;
  private flames: THREE.Mesh;
  private t = 0;

  constructor(private island: Island) {
    const { x: cx, z: cz } = island.home;
    const wall = new THREE.MeshLambertMaterial({ color: '#c9a77c', flatShading: true });
    const roof = new THREE.MeshLambertMaterial({ color: '#8a3b22', flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: '#2a1b12', flatShading: true });
    const stone = new THREE.MeshLambertMaterial({ color: '#8d8d8d', flatShading: true });

    // Huts in a ring, doors facing the fire.
    const huts = 7;
    for (let i = 0; i < huts; i++) {
      const a = (i / huts) * Math.PI * 2 + 0.3;
      const r = 70 + hash2(i, 1, 9) * 25;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const y = island.heightAt(x, z);
      const hut = new THREE.Group();
      const size = 0.85 + hash2(i, 2, 9) * 0.4;
      const walls = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 9, 8), wall);
      walls.position.y = 4.5;
      const top = new THREE.Mesh(new THREE.ConeGeometry(12.5, 10, 8), roof);
      top.position.y = 14;
      hut.add(walls, top);
      const door = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 1), dark);
      door.position.set(0, 3.5, -9.6);
      hut.add(door);
      hut.position.set(x, y - 0.5, z);
      this.obstacles.push({ x, z, r: 13 * size });
      this.colliders.push({ x, z, r: 10 * size, height: y + 19 * size });
      hut.scale.setScalar(size);
      hut.lookAt(cx, y, cz);
      hut.rotateY(Math.PI);
      this.group.add(hut);
    }

    // Bonfire in a ring of stones.
    const y0 = island.heightAt(cx, cz);
    this.obstacles.push({ x: cx, z: cz, r: 12 });
    this.colliders.push({ x: cx, z: cz, r: 7.4, height: y0 + 7 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), stone);
      s.position.set(cx + Math.cos(a) * 6, y0 + 0.5, cz + Math.sin(a) * 6);
      this.group.add(s);
    }
    this.flames = new THREE.Mesh(
      new THREE.ConeGeometry(3, 7, 7),
      new THREE.MeshBasicMaterial({ color: '#ff8a1e' }),
    );
    this.flames.position.set(cx, y0 + 3.5, cz);
    this.fire = new THREE.PointLight('#ff9a40', 3000, 140, 2);
    this.fire.position.set(cx, y0 + 8, cz);
    this.group.add(this.flames, this.fire);

    for (let i = 0; i < VILLAGER_COLORS.length; i++) {
      const [body, accent] = VILLAGER_COLORS[i];
      const model = makeDragon(body, accent);
      model.root.scale.setScalar(0.8 + hash2(i, 3, 9) * 0.3);
      const a = (i / VILLAGER_COLORS.length) * Math.PI * 2;
      model.root.position.set(cx + Math.cos(a) * 30, y0, cz + Math.sin(a) * 30);
      model.update(0, { mode: 'walk', velocity: new THREE.Vector3(), yaw: 0 }); // fold the wings
      this.group.add(model.root);
      const home = { x: cx, z: cz, r: VILLAGE_RADIUS - 50 };
      this.villagers.push({ model, target: this.pickSpot(home), pause: hash2(i, 4, 9) * 5, home, velocity: new THREE.Vector3() });
    }
  }

  private pickSpot(home: Villager['home']) {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * home.r;
    return new THREE.Vector2(home.x + Math.cos(a) * r, home.z + Math.sin(a) * r);
  }

  /** A new villager dragon moves in (when a House is built, or a dragon is rescued), wandering round its village. */
  addVillager(at: { x: number; z: number }, village: { x: number; z: number; r: number }, seed: number) {
    const [body, accent] = villagerColors(seed);
    const model = makeDragon(body, accent);
    model.root.scale.setScalar(0.8 + hash2(seed, 3, 9) * 0.3);
    model.root.position.set(at.x, this.island.heightAt(at.x, at.z), at.z);
    model.update(0, { mode: 'walk', velocity: new THREE.Vector3(), yaw: 0 });
    this.group.add(model.root);
    this.villagers.push({ model, target: this.pickSpot(village), pause: 2, home: village, added: true, velocity: new THREE.Vector3() });
    return model;
  }

  /** Send away villagers who came with built Houses (when switching save slots). */
  clearAdded() {
    for (const v of this.villagers.filter((v) => v.added)) this.group.remove(v.model.root);
    this.villagers = this.villagers.filter((v) => !v.added);
  }

  /** Where the player is, so far-off villagers can skip animating, and near ones stop to look. */
  readonly viewer = new THREE.Vector3();

  /** A Home Village villager's model (the first few are Quest Givers). */
  villagerModel(i: number) { return this.villagers[i]?.model ?? null; }

  update(dt: number, nightness: number) {
    this.t += dt;
    this.flames.scale.set(1 + Math.sin(this.t * 9) * 0.08, 1 + Math.sin(this.t * 13) * 0.15, 1 + Math.cos(this.t * 7) * 0.08);
    this.fire.intensity = (800 + 3500 * nightness) * (1 + Math.sin(this.t * 17) * 0.1);
    this.villagers.forEach((v) => {
      const root = v.model.root;
      const vel = v.velocity;
      // Stop and look at the player when they come close (to talk).
      const toPlayer = Math.hypot(this.viewer.x - root.position.x, this.viewer.z - root.position.z);
      if (toPlayer < 28) {
        v.pause = Math.max(v.pause, 1);
        const want = Math.atan2(root.position.x - this.viewer.x, root.position.z - this.viewer.z);
        const turn = Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y));
        root.rotation.y += THREE.MathUtils.clamp(turn, -2 * dt, 2 * dt);
      }
      if (v.pause > 0) {
        v.pause -= dt;
        vel.multiplyScalar(Math.exp(-6 * dt));
      } else {
        const to = new THREE.Vector2(v.target.x - root.position.x, v.target.y - root.position.z);
        const d = to.length();
        if (d < 2) { v.pause = 3 + Math.random() * 8; v.target = this.pickSpot(v.home); }
        // Turn towards the target, then walk the way it's facing.
        const want = Math.atan2(-to.x, -to.y);
        const turn = Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y));
        root.rotation.y += THREE.MathUtils.clamp(turn, -1.5 * dt, 1.5 * dt);
        const speed = VILLAGER_SPEED * Math.max(0, Math.cos(turn));
        vel.set(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y)).multiplyScalar(speed);
      }
      root.position.addScaledVector(vel, dt);
      root.position.y = this.island.heightAt(root.position.x, root.position.z);
      // Only animate villagers near enough to see.
      if (root.position.distanceToSquared(this.viewer) < 600 * 600) v.model.update(dt, { mode: 'walk', velocity: vel, yaw: root.rotation.y });
    });
  }
}
