// Streams the Island's terrain in square chunks around the player. Nearby
// chunks have more detail; skirts hide the cracks between levels of detail.

import * as THREE from 'three';
import { Biome } from './biomes';
import { Island } from './island';
import { noise2 } from './noise';
import { ScatterItem, buildScatter } from './scatter';

export const CHUNK_SIZE = 256;
const SKIRT = 25;

const BIOME_COLOR: Record<Biome, THREE.Color> = {
  [Biome.Ocean]: new THREE.Color('#c9b98a'),
  [Biome.Meadow]: new THREE.Color('#79c25a'),
  [Biome.Forest]: new THREE.Color('#3f8a45'),
  [Biome.Desert]: new THREE.Color('#e6c477'),
  [Biome.Mountain]: new THREE.Color('#8c7d6c'),
  [Biome.Volcano]: new THREE.Color('#463634'),
  [Biome.Beach]: new THREE.Color('#efd9a0'),
};
const SAND = new THREE.Color('#ecd59b');
const ROCK = new THREE.Color('#7d756d');
const SNOW = new THREE.Color('#f4f6fa');
const SCORCH = new THREE.Color('#6b2a1c');
const RIVERBED = new THREE.Color('#7a7055');

export function lodFor(distance: number): number {
  if (distance < 450) return 64;
  if (distance < 1000) return 32;
  if (distance < 2200) return 16;
  return 8;
}

interface Chunk {
  cx: number;
  cz: number;
  lod: number;
  group: THREE.Group;
  items: ScatterItem[];
}

export class Terrain {
  readonly group = new THREE.Group();
  private chunks = new Map<string, Chunk>();
  /** Round spots kept free of trees and rocks. Add them before chunks are built. */
  readonly clearings: { x: number; z: number; r: number }[] = [];
  private land: { cx: number; cz: number }[] = [];
  private groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  private waterMat = new THREE.MeshPhongMaterial({
    color: '#3f86c9', transparent: true, opacity: 0.82, shininess: 80, flatShading: true, side: THREE.DoubleSide,
  });

  constructor(private island: Island) {
    // Only chunks that touch land (or shallow sea next to it) are ever built.
    const nx = Math.ceil(island.sizeX / CHUNK_SIZE / 2) + 2;
    const nz = Math.ceil(island.sizeZ / CHUNK_SIZE / 2) + 2;
    for (let cz = -nz; cz <= nz; cz++) {
      for (let cx = -nx; cx <= nx; cx++) {
        let near = false;
        for (let i = 0; i <= 4 && !near; i++) for (let j = 0; j <= 4 && !near; j++) {
          if (island.coastAt((cx + i / 4) * CHUNK_SIZE, (cz + j / 4) * CHUNK_SIZE) > -260) near = true;
        }
        if (near) this.land.push({ cx, cz });
      }
    }
  }

  /** Rebuild chunks whose detail level is wrong for where the player is. Spends at most `budgetMs`. */
  update(px: number, pz: number, budgetMs = 6) {
    const start = performance.now();
    const wanted = this.land
      .map((c) => {
        const d = Math.hypot((c.cx + 0.5) * CHUNK_SIZE - px, (c.cz + 0.5) * CHUNK_SIZE - pz);
        return { ...c, d, lod: lodFor(d) };
      })
      .filter((c) => this.chunks.get(`${c.cx},${c.cz}`)?.lod !== c.lod)
      .sort((a, b) => a.d - b.d);
    for (const c of wanted) {
      if (performance.now() - start > budgetMs) break;
      const key = `${c.cx},${c.cz}`;
      const old = this.chunks.get(key);
      const chunk = this.build(c.cx, c.cz, c.lod);
      if (old) this.dispose(old);
      this.chunks.set(key, chunk);
      this.group.add(chunk.group);
    }
    return wanted.length;
  }

  /** Trees and rocks within `r` metres of a point (only near the player, where they are built). */
  itemsNear(x: number, z: number, r: number): ScatterItem[] {
    const out: ScatterItem[] = [];
    const c0x = Math.floor((x - r) / CHUNK_SIZE), c1x = Math.floor((x + r) / CHUNK_SIZE);
    const c0z = Math.floor((z - r) / CHUNK_SIZE), c1z = Math.floor((z + r) / CHUNK_SIZE);
    for (let cz = c0z; cz <= c1z; cz++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const chunk = this.chunks.get(`${cx},${cz}`);
        if (!chunk) continue;
        for (const it of chunk.items) {
          if ((it.center.x - x) ** 2 + (it.center.z - z) ** 2 < r * r) out.push(it);
        }
      }
    }
    return out;
  }

  /** Every tree and rock in built chunks (for regrowing). */
  allItems(): ScatterItem[] {
    return [...this.chunks.values()].flatMap((c) => c.items);
  }

  private dispose(c: Chunk) {
    this.group.remove(c.group);
    c.group.traverse((o) => {
      // Instanced scatter shares its model geometry between chunks; only free the instances.
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }

  private build(cx: number, cz: number, n: number): Chunk {
    const island = this.island;
    const step = CHUNK_SIZE / n;
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    // Heights with a one-sample border, for slopes.
    const m = n + 3;
    const hs = new Float32Array(m * m);
    const ws = new Float32Array((n + 1) * (n + 1));
    const biomes = new Uint8Array((n + 1) * (n + 1));
    const coasts = new Float32Array((n + 1) * (n + 1));
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const x = x0 + (i - 1) * step, z = z0 + (j - 1) * step;
        const inside = i >= 1 && j >= 1 && i <= n + 1 && j <= n + 1;
        if (inside) {
          const g = island.ground(x, z);
          hs[j * m + i] = g.height;
          const k = (j - 1) * (n + 1) + (i - 1);
          ws[k] = g.water;
          biomes[k] = g.biome;
          coasts[k] = g.coast;
        } else {
          hs[j * m + i] = island.heightAt(x, z);
        }
      }
    }

    const verts = (n + 1) * (n + 1);
    const skirtVerts = 4 * (n + 1);
    const pos = new Float32Array((verts + skirtVerts) * 3);
    const col = new Float32Array((verts + skirtVerts) * 3);
    const c = new THREE.Color();
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const k = j * (n + 1) + i;
        const x = x0 + i * step, z = z0 + j * step;
        const h = hs[(j + 1) * m + (i + 1)];
        const dx = hs[(j + 1) * m + i + 2] - hs[(j + 1) * m + i];
        const dz = hs[(j + 2) * m + i + 1] - hs[j * m + i + 1];
        const slope = Math.hypot(dx, dz) / (2 * step);
        pos.set([x, h, z], k * 3);
        groundColor(c, biomes[k], h, slope, coasts[k], ws[k], x, z, island);
        col.set([c.r, c.g, c.b], k * 3);
      }
    }
    // Skirts: a copy of each edge vertex pushed down.
    const edge: number[] = [];
    for (let i = 0; i <= n; i++) edge.push(i);                    // north
    for (let j = 0; j <= n; j++) edge.push(j * (n + 1) + n);      // east
    for (let i = n; i >= 0; i--) edge.push(n * (n + 1) + i);      // south
    for (let j = n; j >= 0; j--) edge.push(j * (n + 1));          // west
    edge.forEach((k, e) => {
      const s = verts + e;
      pos.set([pos[k * 3], pos[k * 3 + 1] - SKIRT, pos[k * 3 + 2]], s * 3);
      col.set([col[k * 3], col[k * 3 + 1], col[k * 3 + 2]], s * 3);
    });

    const idx: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    for (let e = 0; e < edge.length - 1; e++) {
      const top0 = edge[e], top1 = edge[e + 1];
      if (top0 === top1) continue;
      const s0 = verts + e, s1 = verts + e + 1;
      idx.push(top0, top1, s0, top1, s1, s0);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const ground = new THREE.Mesh(geo, this.groundMat);
    const group = new THREE.Group();
    group.add(ground);

    // Inland water: only triangles where all three corners are wet.
    const wpos: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
        for (const tri of [[a, d, b], [b, d, e]]) {
          if (tri.some((k) => ws[k] === -Infinity)) continue;
          for (const k of tri) wpos.push(pos[k * 3], ws[k] + 0.2, pos[k * 3 + 2]);
        }
      }
    }
    if (wpos.length) {
      const wgeo = new THREE.BufferGeometry();
      wgeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
      wgeo.computeVertexNormals();
      const water = new THREE.Mesh(wgeo, this.waterMat);
      water.renderOrder = 1;
      group.add(water);
    }

    let items: ScatterItem[] = [];
    if (n >= 32) {
      const scatter = buildScatter(island, x0, z0, CHUNK_SIZE, n >= 64 ? 1 : 0.5, this.clearings);
      group.add(scatter.group);
      items = scatter.items;
    }
    return { cx, cz, lod: n, group, items };
  }
}

function groundColor(
  out: THREE.Color, biome: Biome, h: number, slope: number, coast: number, water: number,
  x: number, z: number, island: Island,
) {
  out.copy(BIOME_COLOR[biome]);
  const jitter = noise2(x / 40, z / 40) * 0.05;
  out.offsetHSL(0, 0, jitter);
  if (biome === Biome.Volcano) {
    const dv = Math.hypot(x - island.volcano.x, z - island.volcano.z) / island.volcano.radius;
    out.lerp(SCORCH, Math.max(0, 1 - dv / 0.35));
  }
  if (slope > 0.75 && biome !== Biome.Volcano) out.lerp(ROCK, Math.min(1, (slope - 0.75) * 2));
  if (h > 330 && biome !== Biome.Volcano) out.lerp(SNOW, Math.max(0, Math.min(1, (h - 330) / 50 + noise2(x / 60, z / 60) * 0.3)) * (slope > 1.4 ? 0.4 : 1));
  if (coast < 45 && h < 6) out.lerp(SAND, 0.85);
  if (water !== -Infinity && h < water) out.lerp(RIVERBED, 0.7);
}
