// Caves: real tunnels dug into hillsides, flown or walked into with no fade.
// Each winds into the hill and opens into a chamber, where gold veins glow in
// the walls and a monster or two lives. The terrain gets a hole where the
// tunnel breaks the surface, ringed with boulders.

import * as THREE from 'three';
import { DamageKind, Target } from '../combat/attacks';
import { HitSphere } from '../combat/hits';
import { Inventory } from '../build/inventory';
import { Monster, MonsterKind, World } from '../monsters/monster';
import { Snail } from '../monsters/snail';
import { Wolf } from '../monsters/wolf';
import { LavaWorm, SandSnake } from '../monsters/worms';
import { Yeti } from '../monsters/yeti';
import { Biome } from '../world/biomes';
import { Island, VILLAGE_RADIUS } from '../world/island';
import { hash2 } from '../world/noise';
import { regrowth } from '../world/regrowth';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIOME_STONE } from './places';

const CAVE_COUNT = 12;
const TUNNEL_R = 11, CHAMBER_R = 24;
/** The floor is flat, this far below the middle of the tunnel (as a share of its radius). */
const FLOOR = 0.7;
const STEP = 2; // metres between samples along a tunnel
const MONSTER_RANGE = 260;
const GOLD_PER_VEIN = 3;

const CAVE_MONSTER: Partial<Record<Biome, MonsterKind>> = {
  [Biome.Meadow]: 'snail', [Biome.Forest]: 'wolf', [Biome.Desert]: 'sandSnake',
  [Biome.Mountain]: 'yeti', [Biome.Volcano]: 'lavaWorm',
};

interface Vein { at: THREE.Vector3; key: string; mesh: THREE.Mesh; shake: number }

export interface Cave {
  id: string;
  biome: Biome;
  /** Where the tunnel opens out of the hillside, on the floor. */
  mouth: THREE.Vector3;
  /** The middle of the tunnel, every STEP metres from the mouth inwards, and its radius there. */
  axis: THREE.Vector3[];
  radius: number[];
  chamber: THREE.Vector3;
  /** Everything drawn for this cave (hidden when far away: only its mouth would show anyway). */
  look: THREE.Group;
  veins: Vein[];
  monsters: Monster[];
  box: THREE.Box3;
}

/** Where you are in a cave: the tunnel's middle nearest you, its size, and how deep in. */
export interface InCave { cave: Cave; i: number; centre: THREE.Vector3; r: number; floor: number; ceiling: number; depth: number }

export class Caves {
  readonly group = new THREE.Group();
  readonly list: Cave[] = [];
  /** Called when a cave monster is beaten. */
  onDefeated?: (m: Monster) => void;
  private rewarded = new WeakSet<Monster>();
  private t = 0;

  constructor(private island: Island, avoid: { x: number; z: number; r: number }[]) {
    for (let attempt = 0; attempt < 20000 && this.list.length < CAVE_COUNT; attempt++) {
      const cave = this.tryCave(attempt, avoid);
      if (cave) this.list.push(cave);
    }
    for (const cave of this.list) this.build(cave);
  }

  /** A hillside steep enough to tunnel into here? Then lay out the tunnel. */
  private tryCave(n: number, avoid: { x: number; z: number; r: number }[]): Cave | null {
    const island = this.island;
    const x = (hash2(n, 3, 91) - 0.5) * island.sizeX, z = (hash2(n, 4, 91) - 0.5) * island.sizeZ;
    const g = island.ground(x, z);
    if (g.coast < 40 || g.water !== -Infinity || g.height < 4 || g.biome === Biome.Beach) return null;
    if (Math.hypot(x - island.home.x, z - island.home.z) < VILLAGE_RADIUS + 400) return null;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r + 150)) return null;
    if (this.list.some((c) => Math.hypot(c.mouth.x - x, c.mouth.z - z) < 700)) return null;
    // Uphill, steeply, and staying high for a good way in.
    const a = hash2(n, 5, 91) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const rise = (d: number) => island.heightAt(x + dir.x * d, z + dir.z * d) - g.height;
    if (rise(-15) > 3 || rise(30) < 18 || rise(80) < 45 || rise(160) < 60) return null;

    // Wind the tunnel in, sloping gently down, keeping plenty of rock overhead.
    const nodes: { p: THREE.Vector3; r: number }[] = [];
    const p = new THREE.Vector3(x, g.height + TUNNEL_R * FLOOR, z).addScaledVector(dir, -6);
    let heading = a;
    const legs = 5 + Math.floor(hash2(n, 6, 91) * 3);
    for (let k = 0; k <= legs + 3; k++) {
      const chamber = k > legs;
      const r = k === legs + 3 ? 6 : chamber ? (k === legs + 2 ? CHAMBER_R * 0.8 : CHAMBER_R) : TUNNEL_R;
      nodes.push({ p: p.clone(), r });
      heading += (hash2(n, 10 + k, 91) - 0.5) * 0.7;
      const step = k === 0 ? 6 : chamber ? 18 : 26;
      p.x += Math.cos(heading) * step;
      p.z += Math.sin(heading) * step;
      if (k > 0) p.y -= 2 + hash2(n, 30 + k, 91) * 3;
      if (k > 1 && island.heightAt(p.x, p.z) < p.y + r + 14) return null;
    }
    // Sample a smooth curve through the nodes.
    const curve = new THREE.CatmullRomCurve3(nodes.map((nd) => nd.p), false, 'centripetal');
    const sizes = new THREE.CatmullRomCurve3(nodes.map((nd, i) => new THREE.Vector3(nd.r, i, 0)), false, 'centripetal');
    const count = Math.ceil(curve.getLength() / STEP);
    const axis: THREE.Vector3[] = [], radius: number[] = [];
    for (let i = 0; i <= count; i++) {
      axis.push(curve.getPointAt(i / count));
      radius.push(sizes.getPoint(curve.getUtoTmapping(i / count, 0)).x);
    }
    const box = new THREE.Box3().setFromPoints(axis).expandByScalar(CHAMBER_R + 4);
    const big = radius.indexOf(Math.max(...radius));
    return {
      id: `cave-${this.list.length}`, biome: g.biome, mouth: new THREE.Vector3(x, g.height, z), axis, radius,
      chamber: axis[big].clone().setY(axis[big].y - radius[big] * FLOOR), look: new THREE.Group(), veins: [], monsters: [], box,
    };
  }

  // ---------- looks ----------

  private build(cave: Cave) {
    this.group.add(cave.look);
    const rock = new THREE.Color(BIOME_STONE[cave.biome]).multiplyScalar(0.75);
    const floorC = rock.clone().lerp(new THREE.Color('#3a3026'), 0.5);
    const SIDES = 14;
    const pos: number[] = [], col: number[] = [];
    const rings: THREE.Vector3[][] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < cave.axis.length; i += 2) {
      const c = cave.axis[i], r = cave.radius[i];
      const next = cave.axis[Math.min(i + 1, cave.axis.length - 1)], prev = cave.axis[Math.max(i - 1, 0)];
      const side = new THREE.Vector3().subVectors(next, prev).setY(0).normalize().cross(up).normalize();
      const floorY = c.y - r * FLOOR;
      const ring: THREE.Vector3[] = [];
      for (let j = 0; j < SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2;
        // A little lumpiness so it looks dug, not machined.
        const wob = 1 + (hash2(i, j, 17) - 0.5) * 0.18;
        const v = c.clone().addScaledVector(side, Math.cos(a) * r * wob).addScaledVector(up, Math.sin(a) * r * wob);
        v.y = Math.max(v.y, floorY);
        ring.push(v);
      }
      rings.push(ring);
    }
    for (let k = 0; k < rings.length - 1; k++) {
      for (let j = 0; j < SIDES; j++) {
        const a = rings[k][j], b = rings[k][(j + 1) % SIDES], c = rings[k + 1][(j + 1) % SIDES], d = rings[k + 1][j];
        const isFloor = a.y === b.y && Math.abs(a.y - (cave.axis[k * 2].y - cave.radius[k * 2] * FLOOR)) < 0.01;
        const shade = (isFloor ? floorC : rock).clone().multiplyScalar(0.85 + hash2(k, j, 23) * 0.3);
        for (const v of [a, c, b, a, d, c]) { pos.push(v.x, v.y, v.z); col.push(shade.r, shade.g, shade.b); }
      }
    }
    // Close off the far end of the tunnel.
    const endRing = rings[rings.length - 1], end = cave.axis[cave.axis.length - 1];
    const endShade = rock.clone().multiplyScalar(0.8);
    for (let j = 0; j < SIDES; j++) {
      const a = endRing[j], b = endRing[(j + 1) % SIDES];
      for (const v of [end, b, a]) { pos.push(v.x, v.y, v.z); col.push(endShade.r, endShade.g, endShade.b); }
    }
    // An apron of rock reaching out and down from the floor's edges near the
    // mouth, so no sky shows where the flat floor meets the slope outside.
    const edges = rings.map((ring, k) => {
      const floorY = cave.axis[k * 2].y - cave.radius[k * 2] * FLOOR;
      const low = ring.filter((v) => Math.abs(v.y - floorY) < 0.01);
      if (low.length < 2) return null;
      const c = cave.axis[k * 2];
      // The two ends of the floor: furthest apart.
      let a = low[0], b = low[1], far = 0;
      for (const p of low) for (const q of low) if (p.distanceToSquared(q) > far) { far = p.distanceToSquared(q); a = p; b = q; }
      return [a, b].map((v) => ({ v, out: v.clone().sub(c).setY(0).normalize() }));
    });
    for (let k = 0; k < Math.min(10, edges.length - 1); k++) {
      const e0 = edges[k], e1 = edges[k + 1];
      if (!e0 || !e1) continue;
      for (let side = 0; side < 2; side++) {
        // Pair each end of the floor with the nearer end on the next ring.
        const p = e0[side], q = e1[0].v.distanceToSquared(p.v) < e1[1].v.distanceToSquared(p.v) ? e1[0] : e1[1];
        const pd = p.v.clone().addScaledVector(p.out, 6).setY(p.v.y - 8), qd = q.v.clone().addScaledVector(q.out, 6).setY(q.v.y - 8);
        for (const v of [p.v, q.v, qd, p.v, qd, pd]) { pos.push(v.x, v.y, v.z); col.push(floorC.r, floorC.g, floorC.b); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    cave.look.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));

    // Boulders along where the tunnel breaks out of the hillside hide the ragged edge of the hole.
    const stone = new THREE.MeshLambertMaterial({ color: rock.clone().multiplyScalar(1.2), flatShading: true });
    const rocks: THREE.BufferGeometry[] = [];
    const addRock = (g: THREE.BufferGeometry, m: THREE.Object3D) => { m.updateMatrix(); rocks.push((g.index ? g.toNonIndexed() : g).applyMatrix4(m.matrix)); };
    let last = new THREE.Vector3(Infinity, 0, 0);
    for (let k = 0; k < Math.min(rings.length, 20); k++) {
      rings[k].forEach((v, j) => {
        const ground = this.island.heightAt(v.x, v.z);
        // Only round the top of the arch: lower down they'd block the way in.
        if (v.y < cave.axis[k * 2].y + 2 || Math.abs(ground - v.y) > 2.5 || v.distanceTo(last) < 5) return;
        last = v.clone();
        const b = new THREE.Object3D();
        b.position.copy(v);
        b.rotation.set(j, k * 2, j * 3);
        addRock(new THREE.IcosahedronGeometry(2.6 + hash2(k, j, 41) * 2.4, 0), b);
      });
    }
    // Stalactites.
    for (let i = 10; i < cave.axis.length; i += 5) {
      const c = cave.axis[i], r = cave.radius[i];
      const len = 2 + hash2(i, 2, 41) * (r > 15 ? 8 : 4);
      const s = new THREE.Object3D();
      s.rotation.x = Math.PI;
      s.position.set(c.x + (hash2(i, 4, 41) - 0.5) * r, c.y + r * 0.92 - len / 2, c.z + (hash2(i, 5, 41) - 0.5) * r);
      addRock(new THREE.ConeGeometry(0.8 + hash2(i, 3, 41), len, 5), s);
    }
    // All the rocks in one mesh: a few draws per cave instead of dozens.
    const merged = mergeGeometries(rocks);
    if (merged) cave.look.add(new THREE.Mesh(merged, stone));
    // Gold veins glowing in the chamber walls.
    const gold = new THREE.MeshLambertMaterial({ color: '#f2c230', emissive: '#b07a00', emissiveIntensity: 1, flatShading: true });
    const big = cave.radius.indexOf(Math.max(...cave.radius));
    for (let v = 0; v < 5; v++) {
      const i = Math.min(cave.axis.length - 1, big - 8 + v * 4);
      const c = cave.axis[i], r = cave.radius[i];
      const a = (v % 2 ? 1 : -1) * (0.4 + hash2(v, 7, 41) * 0.8);
      const next = cave.axis[Math.min(i + 1, cave.axis.length - 1)];
      const side = next.clone().sub(c).setY(0).normalize().cross(up);
      const at = c.clone().addScaledVector(side, Math.cos(a) * r * 0.9).setY(c.y - r * FLOOR + 3 + hash2(v, 8, 41) * 4);
      const crystals: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 5; k++) {
        const crystal = new THREE.Object3D();
        crystal.position.set((hash2(v, k, 44) - 0.5) * 3, (hash2(v, k, 45) - 0.5) * 2, (hash2(v, k, 46) - 0.5) * 3);
        crystal.rotation.set(hash2(v, k, 47) * 2 - 1, 0, hash2(v, k, 48) * 2 - 1);
        crystal.updateMatrix();
        crystals.push(new THREE.ConeGeometry(0.5 + hash2(v, k, 43) * 0.5, 2 + hash2(k, v, 43) * 2, 5).toNonIndexed().applyMatrix4(crystal.matrix));
      }
      const mesh = new THREE.Mesh(mergeGeometries(crystals)!, gold);
      mesh.position.copy(at);
      cave.look.add(mesh);
      cave.veins.push({ at, key: `${cave.id}-gold-${v}`, mesh, shake: 0 });
    }
  }

  // ---------- where am I ----------

  /** The cave you're in at `pos` (feet), if any. */
  at(pos: THREE.Vector3): InCave | null {
    for (const cave of this.list) {
      if (!cave.box.containsPoint(pos)) continue;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < cave.axis.length; i++) {
        const a = cave.axis[i];
        const d = (a.x - pos.x) ** 2 + (a.z - pos.z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      const centre = cave.axis[best], r = cave.radius[best];
      const floor = centre.y - r * FLOOR, ceiling = centre.y + r;
      // Inside the tunnel (not the hillside above it), and past the mouth.
      if (best < 3 || Math.sqrt(bestD) > r || pos.y < floor - 3 || pos.y > ceiling) continue;
      return { cave, i: best, centre, r, floor, ceiling, depth: Math.min(1, (best * STEP) / 50) };
    }
    return null;
  }

  /**
   * For the terrain: if this point of the ground is inside a tunnel, where on
   * the tunnel's wall to move it to (so the hillside meets the tunnel with no
   * gap). Null if it isn't inside one.
   */
  carve(x: number, y: number, z: number): THREE.Vector3 | null {
    for (const cave of this.list) {
      if (x < cave.box.min.x || x > cave.box.max.x || z < cave.box.min.z || z > cave.box.max.z) continue;
      // Only the first stretch of tunnel comes near the surface.
      let best = -1, bestD = Infinity;
      const n = Math.min(cave.axis.length - 1, 40);
      for (let i = 0; i <= n; i++) {
        const a = cave.axis[i];
        const d = (a.x - x) ** 2 + (a.y - y) ** 2 + (a.z - z) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      }
      const c = cave.axis[best], r = cave.radius[best];
      const floor = c.y - r * FLOOR;
      const ahead = cave.axis[Math.min(best + 1, cave.axis.length - 1)], behind = cave.axis[Math.max(best - 1, 0)];
      const along = ahead.clone().sub(behind).normalize();
      // How far out from the middle of the tunnel, across it (not along it).
      const out = new THREE.Vector3(x - c.x, y - c.y, z - c.z);
      const t = out.dot(along);
      // Past either end of the tunnel isn't inside it (in front of the mouth is open air).
      if ((best === 0 && t < 0) || Math.abs(t) > STEP * 1.5) continue;
      out.addScaledVector(along, -t);
      if (out.length() >= r || y < floor) continue;
      if (out.lengthSq() < 1e-6) out.set(0, 1, 0);
      const wall = c.clone().addScaledVector(out.normalize(), r * 1.01);
      // Keep the along-the-tunnel position, so neighbouring points stay in order.
      wall.addScaledVector(along, new THREE.Vector3(x - c.x, y - c.y, z - c.z).dot(along));
      if (wall.y < floor) wall.y = floor - 0.4; // tucked just under the tunnel's floor
      return wall;
    }
    return null;
  }

  /** Caves that reach into a square of the map (for the terrain). */
  touching(x0: number, z0: number, size: number) {
    return this.list.some((c) => c.box.max.x > x0 && c.box.min.x < x0 + size && c.box.max.z > z0 && c.box.min.z < z0 + size);
  }

  /** Keep the dragon inside the tunnel: off the walls and under the roof. Returns true if moved. */
  pushOut(pos: THREE.Vector3, yaw: number): boolean {
    const here = this.at(pos);
    if (!here) return false;
    let moved = false;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const [ahead, radius] of [[4.6, 1.6], [0, 2.5], [-2.6, 2.0]]) {
      const px = pos.x + fx * ahead, pz = pos.z + fz * ahead;
      const near = this.nearest(here.cave, px, pz);
      // The tunnel is narrower at the floor than across the middle.
      const room = near.r * 0.72 - radius;
      const dx = px - near.c.x, dz = pz - near.c.z, d = Math.hypot(dx, dz);
      if (d > room && d > 0.01) {
        pos.x -= (dx / d) * (d - room);
        pos.z -= (dz / d) * (d - room);
        moved = true;
      }
    }
    return moved;
  }

  private nearest(cave: Cave, x: number, z: number) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < cave.axis.length; i++) {
      const d = (cave.axis[i].x - x) ** 2 + (cave.axis[i].z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return { c: cave.axis[best], r: cave.radius[best] };
  }

  /** Pull a third-person camera in so it stays inside the tunnel. */
  limitCamera(eye: THREE.Vector3, cam: THREE.Vector3) {
    const here = this.at(eye);
    if (!here) return;
    const dir = cam.clone().sub(eye);
    const len = dir.length();
    dir.divideScalar(len);
    const p = new THREE.Vector3();
    let ok = 0;
    for (let d = 1; d <= len; d += 0.5) {
      p.copy(eye).addScaledVector(dir, d);
      const near = this.nearest(here.cave, p.x, p.z);
      if (Math.hypot(p.x - near.c.x, p.z - near.c.z) > near.r * 0.8 || p.y > near.c.y + near.r * 0.85 || p.y < near.c.y - near.r * FLOOR + 1) break;
      ok = d;
    }
    cam.copy(eye).addScaledVector(dir, Math.max(0, ok - 1.5));
  }

  // ---------- gold ----------

  /** Gold veins near the player, as things the claws can hit. */
  targetsNear(at: THREE.Vector3, inventory: Inventory, onHit: () => void): Target[] {
    const out: Target[] = [];
    for (const cave of this.list) for (const v of cave.veins) {
      if (regrowth.isGone(v.key) || v.at.distanceToSquared(at) > 30 * 30) continue;
      out.push({
        alive: true,
        hitSpheres: (): HitSphere[] => [{ center: v.at, radius: 3.5 }],
        takeHit: (_amount: number, kind: DamageKind) => {
          if (kind !== 'claw' || regrowth.isGone(v.key)) return;
          regrowth.cut(v.key);
          inventory.add('gold', GOLD_PER_VEIN);
          onHit();
        },
      });
    }
    return out;
  }

  // ---------- monsters ----------

  /** Every cave monster out and about. */
  get active(): Monster[] { return this.list.flatMap((c) => c.monsters); }

  update(dt: number, world: World) {
    this.t += dt;
    const p = world.player.position;
    for (const cave of this.list) {
      cave.look.visible = Math.hypot(cave.mouth.x - p.x, cave.mouth.z - p.z) < 1500;
      for (const v of cave.veins) {
        v.mesh.visible = !regrowth.isGone(v.key);
        v.mesh.rotation.y = Math.sin(this.t * 0.8 + v.at.x) * 0.05;
      }
      const kind = CAVE_MONSTER[cave.biome];
      if (!kind) continue;
      const d = Math.hypot(cave.chamber.x - p.x, cave.chamber.z - p.z);
      if (cave.monsters.length === 0 && d < MONSTER_RANGE && !regrowth.isGone(`${cave.id}-monster`)) {
        const m = this.spawn(kind, cave.chamber.clone());
        cave.monsters.push(m);
        this.group.add(m.group);
      }
      // Cave monsters stand on the tunnel floor while they're over the tunnel.
      const caveWorld: World = { ...world, island: { heightAt: (x, z) => this.floorUnder(cave, x, z) } };
      for (const m of cave.monsters) {
        m.update(dt, caveWorld);
        if (!m.alive && !this.rewarded.has(m)) {
          this.rewarded.add(m);
          regrowth.cut(`${cave.id}-monster`); // comes back later, like trees
          this.onDefeated?.(m);
        }
      }
      for (const m of cave.monsters.filter((m) => m.finished || (d > MONSTER_RANGE * 1.6 && !m.aggro))) this.group.remove(m.group);
      cave.monsters = cave.monsters.filter((m) => !m.finished && !(d > MONSTER_RANGE * 1.6 && !m.aggro));
    }
  }

  private floorUnder(cave: Cave, x: number, z: number) {
    const near = this.nearest(cave, x, z);
    const inside = Math.hypot(x - near.c.x, z - near.c.z) < near.r && cave.axis.indexOf(near.c) > 3;
    return inside ? near.c.y - near.r * FLOOR : this.island.heightAt(x, z);
  }

  private spawn(kind: MonsterKind, at: THREE.Vector3): Monster {
    switch (kind) {
      case 'snail': return new Snail(at);
      case 'sandSnake': return new SandSnake(at);
      case 'yeti': return new Yeti(at);
      case 'lavaWorm': return new LavaWorm(at);
      default: {
        const pack: Wolf[] = [];
        const w = new Wolf(at, pack);
        pack.push(w);
        return w;
      }
    }
  }
}
