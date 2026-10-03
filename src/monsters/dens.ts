// Where Monsters live. Each den is a fixed spot in its biome (the same every
// game). A den's monsters appear when the player comes near and go away when
// the player leaves. A cleared den fills up again after a while.

import * as THREE from 'three';
import { Biome } from '../world/biomes';
import { Island, VILLAGE_RADIUS } from '../world/island';
import { hash2 } from '../world/noise';
import { Kraken } from './kraken';
import { Monster, MonsterKind, World } from './monster';
import { Snail } from './snail';
import { Wolf } from './wolf';
import { LavaWorm, SandSnake } from './worms';
import { Yeti } from './yeti';

const SPAWN_RANGE = 900;
const DESPAWN_RANGE = 1300;
export const REFILL_SECONDS = 300;

interface Den { kind: MonsterKind; at: THREE.Vector3; monsters: Monster[]; clearedAt: number | null }

const PLAN: { kind: MonsterKind; biome: Biome; count: number; spacing: number }[] = [
  { kind: 'snail', biome: Biome.Meadow, count: 10, spacing: 450 },
  { kind: 'wolf', biome: Biome.Forest, count: 8, spacing: 350 },
  { kind: 'sandSnake', biome: Biome.Desert, count: 7, spacing: 400 },
  { kind: 'yeti', biome: Biome.Mountain, count: 7, spacing: 450 },
  { kind: 'lavaWorm', biome: Biome.Volcano, count: 4, spacing: 300 },
  { kind: 'kraken', biome: Biome.Beach, count: 8, spacing: 250 },
];

export class Dens {
  readonly group = new THREE.Group();
  readonly dens: Den[] = [];
  private time = 0;

  constructor(private island: Island) {
    PLAN.forEach((plan, k) => {
      const found: THREE.Vector3[] = [];
      for (let attempt = 0; attempt < 6000 && found.length < plan.count; attempt++) {
        const x = (hash2(attempt, k, 51) - 0.5) * island.sizeX;
        const z = (hash2(attempt, k, 52) - 0.5) * island.sizeZ;
        const g = island.ground(x, z);
        if (g.coast < 15 || g.biome !== plan.biome || g.water !== -Infinity) continue;
        if (Math.hypot(x - island.home.x, z - island.home.z) < VILLAGE_RADIUS + 500) continue;
        let at = new THREE.Vector3(x, g.height, z);
        if (plan.kind === 'kraken') {
          // Krakens live in the shallow sea just off the little islands.
          const sea = this.seaNear(x, z);
          if (!sea) continue;
          at = sea;
        }
        if (plan.kind === 'yeti' && g.height < 120) continue; // high up the mountains
        if (found.some((f) => f.distanceTo(at) < plan.spacing)) continue;
        found.push(at);
      }
      for (const at of found) this.dens.push({ kind: plan.kind, at, monsters: [], clearedAt: null });
    });
  }

  private seaNear(x: number, z: number): THREE.Vector3 | null {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      for (const r of [50, 70, 90]) {
        const sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
        const g = this.island.ground(sx, sz);
        if (g.coast < -35 && g.height < -6) return new THREE.Vector3(sx, 0, sz);
      }
    }
    return null;
  }

  private spawn(den: Den): Monster[] {
    const at = den.at.clone();
    switch (den.kind) {
      case 'snail': return [new Snail(at)];
      case 'sandSnake': return [new SandSnake(at)];
      case 'yeti': return [new Yeti(at)];
      case 'lavaWorm': return [new LavaWorm(at)];
      case 'kraken': return [new Kraken(at)];
      case 'wolf': {
        const pack: Wolf[] = [];
        for (let i = 0; i < 3; i++) {
          const spot = at.clone().add(new THREE.Vector3(Math.cos(i * 2.1) * 15, 0, Math.sin(i * 2.1) * 15));
          spot.y = this.island.heightAt(spot.x, spot.z);
          pack.push(new Wolf(spot, pack));
        }
        return pack;
      }
    }
  }

  /** Every monster currently out and about. */
  get active(): Monster[] {
    return this.dens.flatMap((d) => d.monsters);
  }

  update(dt: number, world: World) {
    this.time += dt;
    const p = world.player.position;
    for (const den of this.dens) {
      const d = Math.hypot(den.at.x - p.x, den.at.z - p.z);
      if (den.monsters.length === 0) {
        const refilled = den.clearedAt === null || this.time - den.clearedAt > REFILL_SECONDS;
        if (d < SPAWN_RANGE && refilled) {
          den.clearedAt = null;
          den.monsters = this.spawn(den);
          for (const m of den.monsters) this.group.add(m.group);
        }
        continue;
      }
      for (const m of den.monsters) m.update(dt, world);
      // Defeated monsters vanish once their defeat animation is done.
      for (const m of den.monsters.filter((m) => m.finished)) this.remove(m);
      den.monsters = den.monsters.filter((m) => !m.finished);
      if (den.monsters.length === 0) den.clearedAt = this.time;
      else if (d > DESPAWN_RANGE && den.monsters.every((m) => !m.aggro)) {
        // Out of sight: put them away, ready to come back.
        for (const m of den.monsters) this.remove(m);
        den.monsters = [];
      }
    }
  }

  private remove(m: Monster) {
    this.group.remove(m.group);
    m.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  /** For testing: put a monster right in front of the player. */
  spawnNear(kind: MonsterKind, at: THREE.Vector3) {
    const den: Den = { kind, at, monsters: [], clearedAt: null };
    den.monsters = this.spawn(den);
    for (const m of den.monsters) this.group.add(m.group);
    this.dens.push(den);
    return den.monsters;
  }
}
