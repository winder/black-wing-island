// Everything the Player Dragon has built: placing buildings, watching them
// assemble themselves (Construction), the villages they make, towers shooting
// fire bolts, and keeping the dragon from walking through walls.

import * as THREE from 'three';
import { Monster } from '../monsters/monster';
import { Island, VILLAGE_RADIUS } from '../world/island';
import { Collider, pushDragonOut } from '../world/collide';
import { Village } from '../world/village';
import { Blueprint, blueprint, plinth } from './blueprints';
import { BuildingKind } from './inventory';

export const CONSTRUCT_SECONDS = 15;
/** How far from a Village Center its village reaches. */
export const VILLAGE_REACH = 170;
const TOWER_RANGE = 220; // reaches monsters waiting at the village edge
const TOWER_RELOAD = 1.6;
const BOLT_SPEED = 90;
const BOLT_DAMAGE = 12;
/** How much a building's footprint can slope before it's too steep to build on. */
const MAX_SLOPE: Record<BuildingKind, number> = { house: 10, villageCenter: 16, wall: 12, tower: 10, castle: 26 };

export interface PlacedBuilding { kind: BuildingKind; seed: number; x: number; z: number; rot: number }

export interface VillageSpot { x: number; z: number; r: number; name: string }

interface Built extends PlacedBuilding {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  baseY: number;
  t: number;
  colliders: Collider[];
  turrets: THREE.Vector3[];
  reload: number;
}

interface Bolt { mesh: THREE.Mesh; target: Monster; sphere: number; from: THREE.Vector3 }

const boltGeo = new THREE.IcosahedronGeometry(0.9, 0);
const boltMat = new THREE.MeshBasicMaterial({ color: '#ffb040' });

/** Ground heights round a footprint: the lowest and highest. */
export function footprintHeights(island: Island, x: number, z: number, r: number) {
  let lo = Infinity, hi = -Infinity, wet = false;
  for (const f of [0, 0.5, 1]) {
    const n = f === 0 ? 1 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const g = island.ground(x + Math.cos(a) * r * f, z + Math.sin(a) * r * f);
      lo = Math.min(lo, g.height);
      hi = Math.max(hi, g.height);
      if (g.water !== -Infinity || g.coast < 12 || g.height < 1) wet = true;
    }
  }
  return { lo, hi, wet };
}

export class Buildings {
  readonly group = new THREE.Group();
  private list: Built[] = [];
  private bolts: Bolt[] = [];
  /** Other solid things on the Island that buildings mustn't overlap (Monster Castles, Dungeons). */
  private others: { colliders: Collider[]; obstacles: { x: number; z: number; r: number }[] }[] = [];

  constructor(private island: Island, private village: Village, private onPiece: () => void) {}

  addSolid(source: { colliders: Collider[]; obstacles: { x: number; z: number; r: number }[] }) { this.others.push(source); }
  /** Other villages (won Monster Castles). */
  moreVillages: () => VillageSpot[] = () => [];

  get placed(): PlacedBuilding[] {
    return this.list.map(({ kind, seed, x, z, rot }) => ({ kind, seed, x, z, rot }));
  }

  /** Every village: the Home Village and one round each Village Center. */
  villages(): VillageSpot[] {
    return [
      { x: this.island.home.x, z: this.island.home.z, r: VILLAGE_RADIUS, name: 'the Home Village' },
      ...this.list.filter((b) => b.kind === 'villageCenter').map((b) => ({ x: b.x, z: b.z, r: VILLAGE_REACH, name: 'your village' })),
      ...this.moreVillages(),
    ];
  }

  villageAt(x: number, z: number): VillageSpot | null {
    return this.villages().find((v) => Math.hypot(v.x - x, v.z - z) < v.r) ?? null;
  }

  /** Why a building can't go here, or null if it can. */
  problem(kind: BuildingKind, x: number, z: number, needsVillage: boolean): string | null {
    const bp = blueprint(kind, 1);
    const { lo, hi, wet } = footprintHeights(this.island, x, z, bp.footprint);
    if (wet) return 'Too close to water';
    if (hi - lo > MAX_SLOPE[kind]) return 'Too steep here';
    if (needsVillage && !this.villageAt(x, z)) return 'Must be built inside a village';
    if (kind === 'villageCenter' && this.villages().some((v) => Math.hypot(v.x - x, v.z - z) < v.r + 40)) return 'Too close to another village';
    const walled = kind === 'wall' || kind === 'tower';
    for (const b of this.list) {
      const other = blueprint(b.kind, 1).footprint;
      const both = walled && (b.kind === 'wall' || b.kind === 'tower');
      const gap = both ? 4 : (bp.footprint + other) * 0.85;
      if (Math.hypot(b.x - x, b.z - z) < gap) return 'Something is already here';
    }
    for (const o of [...this.village.obstacles, ...this.others.flatMap((s) => s.obstacles)]) {
      if (Math.hypot(o.x - x, o.z - z) < o.r + bp.footprint * 0.8) return 'Something is already here';
    }
    return null;
  }

  /** Put up a building. `instant` skips Construction (for loading a save). */
  add(p: PlacedBuilding, instant = false) {
    const bp: Blueprint = blueprint(p.kind, p.seed);
    const { lo, hi } = footprintHeights(this.island, p.x, p.z, bp.footprint);
    const baseY = hi;
    const group = new THREE.Group();
    group.position.set(p.x, baseY, p.z);
    group.rotation.y = p.rot;
    const meshes: THREE.Mesh[] = [];
    for (const part of [plinth(p.kind, hi - lo + 4), ...bp.parts]) {
      const m = new THREE.Mesh(part.geometry, part.material);
      m.matrixAutoUpdate = false;
      m.matrix.copy(part.matrix);
      m.userData.base = part.matrix.clone();
      m.visible = instant;
      group.add(m);
      meshes.push(m);
    }
    this.group.add(group);
    // Colliders and turrets in world space.
    const rot = new THREE.Matrix4().makeRotationY(p.rot);
    const toWorld = (v: THREE.Vector3) => v.applyMatrix4(rot).add(new THREE.Vector3(p.x, baseY, p.z));
    const colliders = bp.colliders.map((c) => {
      const w = toWorld(new THREE.Vector3(c.x, 0, c.z));
      return { ...c, x: w.x, z: w.z, rot: (c.rot ?? 0) + p.rot, height: baseY + c.height };
    });
    const turrets = bp.turrets.map((t) => toWorld(t.clone()));
    const b: Built = { ...p, group, meshes, baseY, t: instant ? CONSTRUCT_SECONDS : 0, colliders, turrets, reload: 0 };
    this.list.push(b);
    if (p.kind === 'house') {
      const v = this.villageAt(p.x, p.z) ?? { x: p.x, z: p.z, r: 60, name: '' };
      const door = toWorld(new THREE.Vector3(0, 0, -16));
      this.village.addVillager(door, v, p.seed);
    }
    return b;
  }

  /** Take everything down (when switching save slots). */
  clear() {
    for (const b of this.list) this.group.remove(b.group);
    for (const bolt of this.bolts) this.group.remove(bolt.mesh);
    this.list = [];
    this.bolts = [];
    this.village.clearAdded();
  }

  get constructing() { return this.list.some((b) => b.t < CONSTRUCT_SECONDS); }

  update(dt: number, monsters: Monster[]) {
    for (const b of this.list) {
      if (b.t < CONSTRUCT_SECONDS) this.construct(b, dt);
      else if (b.turrets.length) this.shoot(b, dt, monsters);
    }
    this.bolts = this.bolts.filter((bolt) => {
      const spheres = bolt.target.hitSpheres();
      const aim = spheres[bolt.sphere]?.center ?? bolt.target.position;
      const to = aim.clone().sub(bolt.mesh.position);
      const d = to.length();
      if (!bolt.target.alive || d > 400) { this.group.remove(bolt.mesh); return false; }
      if (d < 3) {
        bolt.target.takeHit(BOLT_DAMAGE, 'fire', bolt.from, bolt.sphere);
        this.group.remove(bolt.mesh);
        return false;
      }
      bolt.mesh.position.addScaledVector(to.normalize(), Math.min(d, BOLT_SPEED * dt));
      return true;
    });
  }

  /** Parts appear from the ground up, each dropping into place. */
  private construct(b: Built, dt: number) {
    const before = b.t;
    b.t = Math.min(CONSTRUCT_SECONDS, b.t + dt);
    const n = b.meshes.length;
    const at = (i: number) => (i / n) * (CONSTRUCT_SECONDS - 0.6);
    b.meshes.forEach((m, i) => {
      const since = b.t - at(i);
      if (since < 0) return;
      if (before < at(i)) {
        m.visible = true;
        if (i % 3 === 0) this.onPiece();
      }
      const k = Math.min(1, since / 0.5);
      const ease = 1 - (1 - k) ** 3;
      const s = 0.6 + 0.4 * ease;
      m.matrix.copy(m.userData.base as THREE.Matrix4)
        .premultiply(new THREE.Matrix4().makeTranslation(0, (1 - ease) * 4, 0))
        .multiply(new THREE.Matrix4().makeScale(s, s, s));
    });
  }

  private shoot(b: Built, dt: number, monsters: Monster[]) {
    b.reload -= dt;
    if (b.reload > 0) return;
    for (const turret of b.turrets) {
      let best: { m: Monster; sphere: number; d: number } | null = null;
      for (const m of monsters) {
        if (!m.alive) continue;
        m.hitSpheres().forEach((s, i) => {
          const d = s.center.distanceTo(turret);
          if (d < TOWER_RANGE && s.center.y > -2 && (!best || d < best.d)) best = { m, sphere: i, d };
        });
      }
      if (!best) continue;
      const { m, sphere } = best as { m: Monster; sphere: number };
      const mesh = new THREE.Mesh(boltGeo, boltMat);
      mesh.position.copy(turret);
      this.group.add(mesh);
      this.bolts.push({ mesh, target: m, sphere, from: turret.clone() });
      b.reload = TOWER_RELOAD;
    }
  }

  /** Keep the dragon (body and head) out of buildings and the Home Village huts. It can still fly over them. */
  pushOut(pos: THREE.Vector3, yaw: number) {
    pushDragonOut(pos, yaw, this.solid(pos));
  }

  /** Colliders near `pos`: finished buildings and the Home Village. */
  private *solid(pos: THREE.Vector3): Generator<Collider> {
    for (const b of this.list) {
      if (b.t < 1 || Math.abs(b.x - pos.x) > 120 || Math.abs(b.z - pos.z) > 120) continue;
      yield* b.colliders;
    }
    yield* this.village.colliders;
    for (const s of this.others) for (const c of s.colliders) {
      if (Math.abs(c.x - pos.x) < 150 && Math.abs(c.z - pos.z) < 150) yield c;
    }
  }
}
