// Points of Interest on the Island: a Monster Castle in every biome and a few
// Dungeons. Each is at a fixed spot (the same every game), found by searching
// the terrain for room. Both have a Portal: a dark doorway into an Interior.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Blueprint, Builder, CastleLook, Part, buildingMaterial as mat, monsterCastle, rng } from '../build/blueprints';
import { footprintHeights } from '../build/buildings';
import { Gate } from '../build/gates';
import { MonsterKind } from '../monsters/monster';
import { Biome } from '../world/biomes';
import { Collider, box } from '../world/collide';
import { Island, VILLAGE_RADIUS } from '../world/island';
import { hash2 } from '../world/noise';

export type PlaceKind = 'castle' | 'dungeon';

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  biome: Biome;
  /** Whose Boss lives inside. */
  boss: MonsterKind;
  seed: number;
  x: number; z: number;
  /** Floor height (the top of its plinth). */
  y: number;
  /** Which way its door faces (like rotation.y; 0 faces -z). */
  rot: number;
  /** Where to walk in, and where you come back out, in world space. */
  portal: THREE.Vector3;
  colliders: Collider[];
  /** Ground it covers, so nothing gets built on top. */
  radius: number;
}

interface Plan { kind: PlaceKind; biome: Biome; boss: MonsterKind; name: string }

const BIOME_BOSS: Record<number, MonsterKind> = {
  [Biome.Meadow]: 'snail', [Biome.Forest]: 'wolf', [Biome.Desert]: 'sandSnake',
  [Biome.Mountain]: 'yeti', [Biome.Volcano]: 'lavaWorm', [Biome.Beach]: 'kraken',
};

const PLANS: Plan[] = [
  { kind: 'castle', biome: Biome.Meadow, boss: 'snail', name: 'Shellstone Castle' },
  { kind: 'castle', biome: Biome.Forest, boss: 'wolf', name: 'Howlwood Castle' },
  { kind: 'castle', biome: Biome.Desert, boss: 'sandSnake', name: 'Dune Fang Castle' },
  { kind: 'castle', biome: Biome.Mountain, boss: 'yeti', name: 'Frostpeak Castle' },
  { kind: 'castle', biome: Biome.Volcano, boss: 'lavaWorm', name: 'Cinder Castle' },
  { kind: 'castle', biome: Biome.Beach, boss: 'kraken', name: 'Tidecrown Castle' },
  { kind: 'dungeon', biome: Biome.Forest, boss: 'wolf', name: 'the Deepwood Dungeon' },
  { kind: 'dungeon', biome: Biome.Mountain, boss: 'yeti', name: 'the Old King’s Dungeon' },
  { kind: 'dungeon', biome: Biome.Desert, boss: 'sandSnake', name: 'the Sunken Dungeon' },
];

/** Stone for each biome's buildings. */
export const BIOME_STONE: Record<number, string> = {
  [Biome.Meadow]: '#6f6c66', [Biome.Forest]: '#4f5a4a', [Biome.Desert]: '#a8885a',
  [Biome.Mountain]: '#6a7482', [Biome.Volcano]: '#3a3030', [Biome.Beach]: '#8f8a7e',
};
const MONSTER_BANNER = '#1a1416';
export const PLAYER_BANNER = '#5b3a8a';

export class Places {
  readonly group = new THREE.Group();
  readonly list: Place[] = [];
  /** Castles that are yours now: they fly your banner. */
  private owned = new Set<string>();
  /** Places whose Boss has been beaten. */
  readonly beaten = new Set<string>();
  /** Dungeons whose Gold Hoard has been taken. */
  readonly hoards = new Set<string>();
  private models = new Map<string, THREE.Group>();
  /** Each Portal's gates, which swing open as you come near. */
  private gates = new Map<string, Gate>();

  constructor(private island: Island, avoid: { x: number; z: number }[]) {
    const taken: { x: number; z: number }[] = [];
    PLANS.forEach((plan, k) => {
      const spot = this.find(plan, k, avoid, taken);
      if (!spot) { console.warn(`No room for ${plan.name}`); return; }
      taken.push(spot);
      const place = this.make(plan, spot.x, spot.z, spot.y, spot.rot, 1000 + k);
      this.list.push(place);
      this.rebuild(place);
    });
  }

  /** Somewhere in the plan's biome with room, away from villages, dens and other places. */
  private find(plan: Plan, k: number, avoid: { x: number; z: number }[], taken: { x: number; z: number }[]) {
    const island = this.island;
    const r = plan.kind === 'castle' ? 46 : 22;
    let best: { x: number; z: number; y: number; rot: number; score: number } | null = null;
    for (let attempt = 0; attempt < 5000; attempt++) {
      const x = (hash2(attempt, k, 71) - 0.5) * island.sizeX;
      const z = (hash2(attempt, k, 72) - 0.5) * island.sizeZ;
      const g = island.ground(x, z);
      if (g.biome !== plan.biome || g.water !== -Infinity) continue;
      if (Math.hypot(x - island.home.x, z - island.home.z) < VILLAGE_RADIUS + 700) continue;
      if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < 240)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.z - z) < 900)) continue;
      // Beach castles stand on little islands, so allow some sea round the edge.
      const { lo, hi, wet } = footprintHeights(island, x, z, plan.biome === Biome.Beach ? r * 0.5 : r);
      if (wet) continue;
      const score = hi - lo;
      if (score > 30) continue;
      if (!best || score < best.score) {
        // Face the door downhill-ish: towards the nearest lower ground, or the Home Village.
        const rot = Math.atan2(x - island.home.x, z - island.home.z);
        best = { x, z, y: hi, rot, score };
        if (score < 6) break;
      }
    }
    return best;
  }

  private make(plan: Plan, x: number, z: number, y: number, rot: number, seed: number): Place {
    const id = `${plan.kind}-${plan.biome}`;
    const bp = this.blueprint(plan.kind, plan.biome, seed, false);
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, y, z);
    const portal = (bp.portal ?? new THREE.Vector3()).clone().applyMatrix4(m);
    const colliders = bp.colliders.map((c) => {
      const w = new THREE.Vector3(c.x, 0, c.z).applyMatrix4(m);
      return { ...c, x: w.x, z: w.z, rot: (c.rot ?? 0) + rot, height: y + c.height };
    });
    return { id, kind: plan.kind, name: plan.name, biome: plan.biome, boss: plan.boss, seed, x, z, y, rot, portal, colliders, radius: bp.footprint };
  }

  private blueprint(kind: PlaceKind, biome: Biome, seed: number, owned: boolean): Blueprint {
    const stone = BIOME_STONE[biome];
    if (kind === 'castle') {
      const look: CastleLook = { stone, roof: '#2a2226', banner: owned ? PLAYER_BANNER : MONSTER_BANNER, portal: true };
      return monsterCastle(seed, look);
    }
    return dungeonEntrance(seed, stone);
  }

  /** (Re)build a place's model, e.g. when a castle changes hands. */
  private rebuild(p: Place) {
    this.models.get(p.id)?.removeFromParent();
    const bp = this.blueprint(p.kind, p.biome, p.seed, this.owned.has(p.id));
    const g = mergeParts([...bp.parts, plinthFor(p, this.island)]);
    // The doorway: wooden gates in front of deep black darkness.
    if (bp.portal) {
      const [w, h] = p.kind === 'castle' ? [12, 16] : [12.4, 18];
      const dark = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), new THREE.MeshBasicMaterial({ color: '#050304' }));
      dark.position.copy(bp.portal).add(new THREE.Vector3(0, h / 2, 1.2));
      const gate = new Gate(w, h, p.kind === 'castle');
      gate.group.position.copy(bp.portal);
      const old = this.gates.get(p.id);
      if (old) gate.setOpen(old.open);
      this.gates.set(p.id, gate);
      g.add(dark, gate.group);
    }
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = p.rot;
    this.models.set(p.id, g);
    this.group.add(g);
  }

  /** Swing gates open when the dragon comes near, shut when it leaves. */
  update(dt: number, at: THREE.Vector3) {
    for (const p of this.list) {
      const near = Math.hypot(p.portal.x - at.x, p.portal.z - at.z) < 70 && Math.abs(at.y - p.y) < 60;
      this.gates.get(p.id)?.update(dt, near);
    }
  }

  isOwned(id: string) { return this.owned.has(id); }

  setOwned(id: string, owned = true) {
    if (owned === this.owned.has(id)) return;
    if (owned) this.owned.add(id); else this.owned.delete(id);
    const p = this.list.find((q) => q.id === id);
    if (p) this.rebuild(p);
  }

  get ownedIds() { return [...this.owned]; }

  /** Won Monster Castles are villages: respawn points that monsters keep away from. */
  villages() {
    return this.list.filter((p) => this.owned.has(p.id)).map((p) => ({ x: p.x, z: p.z, r: 150, name: p.name }));
  }

  /** Forget all progress (a new game, or another save slot). */
  reset() {
    for (const id of [...this.owned]) this.setOwned(id, false);
    this.beaten.clear();
    this.hoards.clear();
  }

  /** Everything solid about all places (for the dragon to bump into). */
  get colliders(): Collider[] { return this.list.flatMap((p) => p.colliders); }

  get obstacles() { return this.list.map((p) => ({ x: p.x, z: p.z, r: p.radius + 10 })); }

  /** The place whose doorway is within `r` of a point. */
  portalNear(pos: THREE.Vector3, r = 9): Place | null {
    return this.list.find((p) => Math.hypot(p.portal.x - pos.x, p.portal.z - pos.z) < r && Math.abs(pos.y - p.y) < 12) ?? null;
  }
}

export { BIOME_BOSS };

/** A foundation under a place, reaching down to the lowest ground round it. */
function plinthFor(p: Place, island: Island): Part {
  const { lo } = footprintHeights(island, p.x, p.z, p.radius);
  const depth = p.y - lo + 6;
  const r = p.kind === 'castle' ? p.radius * 1.05 : p.radius;
  const geometry = new THREE.CylinderGeometry(r * 0.92, r, depth, 14);
  return { geometry, material: mat('#5d5953'), matrix: new THREE.Matrix4().makeTranslation(0, -depth / 2 + 0.3, 0) };
}

/** A Dungeon's entrance: a stepped stone mound with a great dark doorway, and a fire either side. */
function dungeonEntrance(seed: number, stoneColor: string): Blueprint {
  const r = rng(seed);
  const b = new Builder();
  const stone = mat(stoneColor), dark = mat('#2a2622');
  // A mound of stepped stone behind the door.
  for (let i = 0; i < 4; i++) {
    const w = 34 - i * 7, h = 6;
    b.add(new THREE.BoxGeometry(w, h, w * 0.8), stone, 0, h * (i + 0.5), 6 + i * 1.5);
  }
  // Pillars and a heavy lintel round the doorway.
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(3.5, 20, 3.5), stone, s * 8, 10, -7);
    b.add(new THREE.ConeGeometry(2.4, 4 + r() * 2, 4), dark, s * 8, 22, -7);
    // Fire baskets.
    b.add(new THREE.CylinderGeometry(1.6, 1, 1.4, 6), dark, s * 13, 5, -10);
    b.add(new THREE.CylinderGeometry(0.4, 0.4, 5, 5), dark, s * 13, 2.5, -10);
    b.add(new THREE.ConeGeometry(1.3, 3, 6), mat('#ff8a1e', '#ff5a00'), s * 13, 7, -10);
  }
  b.add(new THREE.BoxGeometry(22, 4, 5), stone, 0, 21, -7);
  b.add(new THREE.BoxGeometry(14, 2, 6), dark, 0, 1, -9); // a worn step
  b.portal = new THREE.Vector3(0, 0, -6);
  b.colliders.push(box(0, 8, 17, 14, 26));
  for (const s of [-1, 1]) b.colliders.push({ x: s * 8, z: -7, r: 2.5, height: 21 });
  return { kind: 'castle', parts: b.parts, footprint: 22, colliders: b.colliders, turrets: [], portal: b.portal };
}

/** One mesh per material, so a castle of hundreds of blocks is only a few draws. */
function mergeParts(parts: Part[]): THREE.Group {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) {
    const g = p.geometry.clone().applyMatrix4(p.matrix);
    if (!byMat.has(p.material)) byMat.set(p.material, []);
    byMat.get(p.material)!.push(g);
  }
  const group = new THREE.Group();
  for (const [material, geos] of byMat) {
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    if (merged) group.add(new THREE.Mesh(merged, material));
    geos.forEach((g) => g.dispose());
  }
  return group;
}
