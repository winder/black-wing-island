// Trees, rocks and cacti dotted over the Island. Placement is a jittered grid
// seeded by position, so the same things grow in the same places every game.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Biome } from './biomes';
import { Island, VILLAGE_RADIUS } from './island';
import { hash2 } from './noise';

const CELL = 16;

function painted(geo: THREE.BufferGeometry, color: string, dy = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.translate(0, dy, 0);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

// All models are 1 unit ≈ 1 metre, standing on y = 0.
const MODELS = {
  pine: mergeGeometries([
    painted(new THREE.CylinderGeometry(0.5, 0.8, 5, 6), '#6b4a2f', 2.5),
    painted(new THREE.ConeGeometry(5, 8, 7), '#2d6b3a', 7),
    painted(new THREE.ConeGeometry(4, 7, 7), '#33793f', 11),
    painted(new THREE.ConeGeometry(2.6, 6, 7), '#3a8546', 15),
  ])!,
  oak: mergeGeometries([
    painted(new THREE.CylinderGeometry(0.7, 1, 6, 6), '#73502f', 3),
    painted(new THREE.IcosahedronGeometry(5.5, 0), '#4f9a3c', 9),
    painted(new THREE.IcosahedronGeometry(3.5, 0), '#5aa844', 12.5),
  ])!,
  cactus: mergeGeometries([
    painted(new THREE.CylinderGeometry(0.9, 1, 9, 7), '#4f8f3c', 4.5),
    painted(new THREE.CylinderGeometry(0.6, 0.6, 3, 6).rotateZ(Math.PI / 2), '#4f8f3c', 4).translate(1.5, 0, 0),
    painted(new THREE.CylinderGeometry(0.55, 0.6, 3.5, 6), '#4f8f3c', 5.5).translate(3, 0, 0),
  ])!,
  palm: mergeGeometries([
    painted(new THREE.CylinderGeometry(0.4, 0.7, 10, 5).translate(0, 5, 0).rotateZ(0.2), '#8a6a45'),
    painted(new THREE.ConeGeometry(5, 2, 6), '#3f9a4a', 10).translate(-2, 0, 0),
  ])!,
  rock: painted(new THREE.DodecahedronGeometry(3, 0).scale(1, 0.7, 1), '#8f8780', 1),
  lavaRock: painted(new THREE.DodecahedronGeometry(3, 0).scale(1, 0.8, 1), '#2b2422', 1),
};
type Model = keyof typeof MODELS;
const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** What might grow on a patch of ground, and how likely, per 16 m cell. */
function choose(biome: Biome, h: number, r: number): Model | null {
  switch (biome) {
    case Biome.Forest: return r < 0.42 ? 'pine' : r < 0.47 ? 'oak' : r < 0.49 ? 'rock' : null;
    case Biome.Meadow: return r < 0.025 ? 'oak' : r < 0.033 ? 'rock' : null;
    case Biome.Desert: return r < 0.018 ? 'cactus' : r < 0.026 ? 'rock' : null;
    case Biome.Mountain: return h < 260 && r < 0.09 ? 'pine' : r < 0.14 ? 'rock' : null;
    case Biome.Volcano: return r < 0.05 ? 'lavaRock' : null;
    case Biome.Beach: return r < 0.06 ? 'palm' : r < 0.07 ? 'rock' : null;
    default: return null;
  }
}

export function buildScatter(island: Island, x0: number, z0: number, size: number, density: number): THREE.Group {
  const placed: Partial<Record<Model, THREE.Matrix4[]>> = {};
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const cells = size / CELL;
  const gx0 = Math.round(x0 / CELL), gz0 = Math.round(z0 / CELL);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const gx = gx0 + i, gz = gz0 + j;
      if (density < 1 && hash2(gx, gz, 7) > density) continue;
      const x = (gx + hash2(gx, gz, 1)) * CELL, z = (gz + hash2(gx, gz, 2)) * CELL;
      if (Math.hypot(x - island.home.x, z - island.home.z) < VILLAGE_RADIUS * 1.1) continue;
      const g = island.ground(x, z);
      if (g.coast < 8 || g.water !== -Infinity || g.height < 1.5) continue;
      const kind = choose(g.biome, g.height, hash2(gx, gz, 3));
      if (!kind) continue;
      // Skip steep cliffs (except rocks, which like them).
      if (kind !== 'rock' && Math.abs(island.heightAt(x + 3, z) - g.height) > 3.5) continue;
      const scale = 0.7 + hash2(gx, gz, 4) * 0.8;
      q.setFromAxisAngle(up, hash2(gx, gz, 5) * Math.PI * 2);
      s.setScalar(kind === 'rock' || kind === 'lavaRock' ? scale * 1.6 : scale);
      p.set(x, g.height - 0.3, z);
      (placed[kind] ??= []).push(m.compose(p, q, s).clone());
    }
  }
  const group = new THREE.Group();
  for (const [kind, mats] of Object.entries(placed) as [Model, THREE.Matrix4[]][]) {
    const mesh = new THREE.InstancedMesh(MODELS[kind], material, mats.length);
    mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}
