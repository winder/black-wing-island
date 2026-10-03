// Gathering Materials: claw trees down for wood, smash rocks for stone, and
// smash Gold Rocks in the mountains for gold. Everything grows back.

import * as THREE from 'three';
import { DamageKind, Target } from '../combat/attacks';
import { HitSphere } from '../combat/hits';
import { Terrain } from '../world/terrain';
import { regrowth } from '../world/regrowth';
import { Model, SCATTER_MODELS, ScatterItem, hideItem, scatterMaterial, showItem } from '../world/scatter';
import { Inventory, Material } from './inventory';

/** Claw hits needed, and what you get. */
const YIELD: Record<Model, { hits: number; gives: Partial<Record<Material, number>> }> = {
  pine: { hits: 3, gives: { wood: 5 } },
  oak: { hits: 3, gives: { wood: 6 } },
  palm: { hits: 2, gives: { wood: 4 } },
  cactus: { hits: 2, gives: { wood: 3 } },
  rock: { hits: 3, gives: { stone: 4 } },
  lavaRock: { hits: 3, gives: { stone: 4 } },
  goldRock: { hits: 4, gives: { gold: 3, stone: 2 } },
};
const TREES: Model[] = ['pine', 'oak', 'palm', 'cactus'];
const REACH = 30;

interface Falling { mesh: THREE.Mesh; t: number; tree: boolean; axis: THREE.Vector3; base: THREE.Matrix4 }

export class Gathering {
  readonly group = new THREE.Group();
  private falling: Falling[] = [];
  private shaking = new Map<ScatterItem, number>();
  private regrowCheck = 0;

  constructor(private terrain: Terrain, private inventory: Inventory, private onHit: (harvested: boolean, tree: boolean) => void) {}

  /** Trees and rocks near the player, as things the claws can hit. Fire doesn't gather. */
  targetsNear(at: THREE.Vector3): Target[] {
    return this.terrain.itemsNear(at.x, at.z, REACH)
      .filter((it) => !regrowth.isGone(it.key))
      .map((item) => ({
        alive: true,
        hitSpheres: (): HitSphere[] => [{ center: item.center, radius: item.radius }],
        takeHit: (_amount: number, kind: DamageKind) => { if (kind === 'claw') this.hit(item); },
      }));
  }

  private hit(item: ScatterItem) {
    if (regrowth.isGone(item.key)) return;
    item.hits++;
    const tree = TREES.includes(item.kind);
    if (item.hits < YIELD[item.kind].hits) {
      this.shaking.set(item, 0.25);
      this.onHit(false, tree);
      return;
    }
    item.hits = 0;
    regrowth.cut(item.key);
    hideItem(item);
    this.shaking.delete(item);
    for (const [m, n] of Object.entries(YIELD[item.kind].gives) as [Material, number][]) this.inventory.add(m, n);
    this.onHit(true, tree);
    // A copy of it topples over (trees) or crumbles away (rocks).
    const mesh = new THREE.Mesh(SCATTER_MODELS[item.kind], scatterMaterial);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(item.matrix);
    const axis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    this.group.add(mesh);
    this.falling.push({ mesh, t: 0, tree, axis, base: item.matrix.clone() });
  }

  update(dt: number) {
    regrowth.now += dt;

    // Wobble things that were hit but not yet down.
    for (const [item, left] of this.shaking) {
      const t = left - dt;
      if (t <= 0 || regrowth.isGone(item.key)) {
        this.shaking.delete(item);
        if (!regrowth.isGone(item.key)) showItem(item);
        continue;
      }
      this.shaking.set(item, t);
      const wobble = new THREE.Matrix4().makeRotationZ(Math.sin(t * 60) * 0.06 * (t / 0.25));
      item.mesh.setMatrixAt(item.index, item.matrix.clone().multiply(wobble));
      item.mesh.instanceMatrix.needsUpdate = true;
    }

    this.falling = this.falling.filter((f) => {
      f.t += dt;
      const m = f.base.clone();
      if (f.tree) {
        const tip = Math.min(Math.PI / 2, f.t * f.t * 2.5);
        m.multiply(new THREE.Matrix4().makeRotationAxis(f.axis, tip));
        if (f.t > 1.4) m.premultiply(new THREE.Matrix4().makeTranslation(0, -(f.t - 1.4) * 6, 0));
      } else {
        const s = Math.max(0.01, 1 - f.t * 1.5);
        m.multiply(new THREE.Matrix4().makeScale(s, s * 0.6, s));
      }
      f.mesh.matrix.copy(m);
      const done = f.t > (f.tree ? 2.4 : 0.7);
      if (done) this.group.remove(f.mesh);
      return !done;
    });

    // Every few seconds, bring back anything that has grown back.
    this.regrowCheck -= dt;
    if (this.regrowCheck <= 0) {
      this.regrowCheck = 3;
      for (const item of this.terrain.allItems()) {
        const hidden = item.mesh.instanceMatrix.array[item.index * 16 + 5] === 0; // y-scale 0
        if (hidden && !regrowth.isGone(item.key) && !this.shaking.has(item)) showItem(item);
      }
    }
  }
}
