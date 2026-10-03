// Harmless Sheep grazing in flocks in the meadow. They scatter when a dragon gets close.

import * as THREE from 'three';
import { Biome } from './biomes';
import { Island, VILLAGE_RADIUS } from './island';
import { hash2 } from './noise';

const FLOCKS = 24;
const ACTIVE_RANGE = 700;

interface Sheep { mesh: THREE.Group; heading: number; speed: number; timer: number }
interface Flock { x: number; z: number; sheep: Sheep[] }

const wool = new THREE.MeshLambertMaterial({ color: '#f3f1ea', flatShading: true });
const face = new THREE.MeshLambertMaterial({ color: '#2b2622', flatShading: true });

function makeSheep(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0).scale(0.9, 0.75, 1.25), wool);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.7), face);
  head.position.set(0, 1.45, -1.25);
  g.add(body, head);
  for (const [x, z] of [[0.45, -0.6], [-0.45, -0.6], [0.45, 0.7], [-0.45, 0.7]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), face);
    leg.position.set(x, 0.35, z);
    g.add(leg);
  }
  return g;
}

export class SheepFlocks {
  readonly group = new THREE.Group();
  private flocks: Flock[] = [];

  constructor(private island: Island) {
    // Find meadow spots by trying seeded random points across the Island.
    for (let attempt = 0; attempt < 4000 && this.flocks.length < FLOCKS; attempt++) {
      const x = (hash2(attempt, 0, 31) - 0.5) * island.sizeX;
      const z = (hash2(attempt, 1, 31) - 0.5) * island.sizeZ;
      const g = island.ground(x, z);
      if (g.biome !== Biome.Meadow || g.water !== -Infinity || g.coast < 60) continue;
      if (Math.hypot(x - island.home.x, z - island.home.z) < VILLAGE_RADIUS * 1.5) continue;
      if (this.flocks.some((f) => Math.hypot(f.x - x, f.z - z) < 300)) continue;
      const flock: Flock = { x, z, sheep: [] };
      const n = 5 + Math.floor(hash2(attempt, 2, 31) * 5);
      for (let i = 0; i < n; i++) {
        const mesh = makeSheep();
        mesh.position.set(x + (hash2(attempt, i, 32) - 0.5) * 30, 0, z + (hash2(attempt, i, 33) - 0.5) * 30);
        mesh.position.y = island.heightAt(mesh.position.x, mesh.position.z);
        mesh.visible = false;
        this.group.add(mesh);
        flock.sheep.push({ mesh, heading: hash2(attempt, i, 34) * 6.28, speed: 0, timer: 0 });
      }
      this.flocks.push(flock);
    }
  }

  update(dt: number, player: THREE.Vector3) {
    for (const f of this.flocks) {
      const active = Math.hypot(f.x - player.x, f.z - player.z) < ACTIVE_RANGE;
      for (const s of f.sheep) {
        s.mesh.visible = active;
        if (!active) continue;
        const p = s.mesh.position;
        const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
        if (d < 30 && player.y - p.y < 25) {
          // Run away from the dragon!
          s.heading = Math.atan2(dx, dz);
          s.speed = 7;
          s.timer = 2;
        } else if ((s.timer -= dt) <= 0) {
          // Graze, then amble somewhere nearby, staying close to the flock.
          const home = Math.atan2(f.x - p.x, f.z - p.z);
          const far = Math.hypot(f.x - p.x, f.z - p.z) > 40;
          s.heading = far ? home : s.heading + (Math.random() - 0.5) * 2;
          s.speed = Math.random() < 0.5 ? 0 : 1.2;
          s.timer = 2 + Math.random() * 5;
        }
        if (s.speed > 0) {
          const nx = p.x + Math.sin(s.heading) * s.speed * dt, nz = p.z + Math.cos(s.heading) * s.speed * dt;
          const g = this.island.ground(nx, nz);
          if (g.water === -Infinity && g.coast > 10) { p.x = nx; p.z = nz; p.y = g.height; }
          else s.timer = 0;
          s.mesh.rotation.y = s.heading + Math.PI;
        }
      }
    }
  }
}
