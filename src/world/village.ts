// The Home Village in the meadow: dragon-sized huts round a bonfire, with
// Villagers (dragons of other colours) wandering about. No quests yet.

import * as THREE from 'three';
import { makeDragon, DragonModel } from '../player/dragonModel';
import { Island, VILLAGE_RADIUS } from './island';
import { hash2 } from './noise';

const VILLAGER_COLORS: [string, string][] = [
  ['#c0392b', '#f1c40f'], ['#2e86c1', '#aed6f1'], ['#27ae60', '#f9e79f'],
  ['#d35400', '#784212'], ['#8e44ad', '#f5b7b1'], ['#f4d03f', '#a04000'],
];

interface Villager { model: DragonModel; target: THREE.Vector2; pause: number }

export class Village {
  readonly group = new THREE.Group();
  private villagers: Villager[] = [];
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
      hut.scale.setScalar(size);
      hut.lookAt(cx, y, cz);
      hut.rotateY(Math.PI);
      this.group.add(hut);
    }

    // Bonfire in a ring of stones.
    const y0 = island.heightAt(cx, cz);
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
      model.pose(0, 0);
      this.group.add(model.root);
      this.villagers.push({ model, target: this.pickSpot(), pause: hash2(i, 4, 9) * 5 });
    }
  }

  private pickSpot() {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * (VILLAGE_RADIUS - 50);
    return new THREE.Vector2(this.island.home.x + Math.cos(a) * r, this.island.home.z + Math.sin(a) * r);
  }

  update(dt: number, nightness: number) {
    this.t += dt;
    this.flames.scale.set(1 + Math.sin(this.t * 9) * 0.08, 1 + Math.sin(this.t * 13) * 0.15, 1 + Math.cos(this.t * 7) * 0.08);
    this.fire.intensity = (800 + 3500 * nightness) * (1 + Math.sin(this.t * 17) * 0.1);
    this.villagers.forEach((v) => {
      const root = v.model.root;
      if (v.pause > 0) {
        v.pause -= dt;
        v.model.pose(0, 0);
        return;
      }
      const to = new THREE.Vector2(v.target.x - root.position.x, v.target.y - root.position.z);
      const d = to.length();
      if (d < 2) { v.pause = 3 + Math.random() * 8; v.target = this.pickSpot(); return; }
      to.divideScalar(d);
      root.position.x += to.x * 3 * dt;
      root.position.z += to.y * 3 * dt;
      root.position.y = this.island.heightAt(root.position.x, root.position.z);
      root.rotation.y = Math.atan2(-to.x, -to.y);
    });
  }
}
