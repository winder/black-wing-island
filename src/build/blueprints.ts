// Procedural building designs. Each building is generated from a seed, so no
// two houses or castles are quite alike, and is made of parts listed from the
// ground up so it can assemble itself during Construction.
//
// Models are dragon-sized (the dragon is ~5 m tall), face -z (the door side),
// and have their floor at y = 0.

import * as THREE from 'three';
import { box, Collider } from '../world/collide';
import { Gate } from './gates';
import { BuildingKind } from './inventory';

export interface Part { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }


export interface Blueprint {
  kind: BuildingKind;
  parts: Part[];
  /** Radius of the ground it covers, for checking it fits. */
  footprint: number;
  colliders: Collider[];
  /** Where towers shoot from, in model space. */
  turrets: THREE.Vector3[];
  /** A doorway into an Interior, in model space (Monster Castles and Dungeons). */
  portal?: THREE.Vector3;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mats = new Map<string, THREE.Material>();
function mat(color: string, emissive?: string) {
  const key = color + (emissive ?? '');
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...(emissive ? { emissive, emissiveIntensity: 1 } : {}) }));
  }
  return mats.get(key)!;
}
const STONE = ['#9a958c', '#8e8a83', '#a39d92'];
const ROOFS = ['#8a3b22', '#3b5a8a', '#4f7a3a', '#7a3b6a', '#6b4a2f'];
const PLASTER = ['#d8c49c', '#e3d3b0', '#c9a77c', '#d9b98f'];
const BANNERS = ['#c0392b', '#2e86c1', '#f1c40f', '#8e44ad', '#16a085'];
const WOOD = '#7a4f2c', DARK = '#2a1b12';

export class Builder {
  parts: Part[] = [];
  colliders: Collider[] = [];
  turrets: THREE.Vector3[] = [];
  portal?: THREE.Vector3;
  add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    this.parts.push({ geometry, material, matrix: m });
  }
  /** A ring of battlements round the top of a round tower. */
  merlons(cx: number, cz: number, r: number, y: number, n: number, stone: THREE.Material) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.add(new THREE.BoxGeometry(2.2, 2.4, 1.6), stone, cx + Math.cos(a) * r, y + 1.2, cz + Math.sin(a) * r, -a + Math.PI / 2);
    }
  }
  /** A straight run of wall from (x0,z0) to (x1,z1), built in courses of blocks. */
  wall(x0: number, z0: number, x1: number, z1: number, height: number, thick: number, stone: THREE.Material, crenel = true) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0);
    const courses = Math.max(2, Math.round(height / 4));
    const blocks = Math.max(1, Math.round(len / 7));
    const ch = height / courses, bl = len / blocks;
    for (let c = 0; c < courses; c++) {
      for (let b = 0; b < blocks; b++) {
        const t = (b + 0.5) / blocks;
        this.add(new THREE.BoxGeometry(bl * 1.01, ch * 1.01, thick), stone, x0 + (x1 - x0) * t, ch * (c + 0.5), z0 + (z1 - z0) * t, ang);
      }
    }
    if (crenel) {
      const n = Math.max(2, Math.floor(len / 4));
      for (let i = 0; i < n; i += 1) {
        if (i % 2) continue;
        const t = (i + 0.5) / n;
        this.add(new THREE.BoxGeometry(len / n, 2.2, thick * 1.05), stone, x0 + (x1 - x0) * t, height + 1.1, z0 + (z1 - z0) * t, ang);
      }
    }
    this.colliders.push(box((x0 + x1) / 2, (z0 + z1) / 2, len / 2, thick / 2, height + 2, ang));
  }
  /** A round stone tower. Returns the height of its top. */
  tower(x: number, z: number, r: number, height: number, stone: THREE.Material, roof?: THREE.Material) {
    const rings = Math.max(3, Math.round(height / 5));
    const rh = height / rings;
    for (let i = 0; i < rings; i++) this.add(new THREE.CylinderGeometry(r * (1 - i * 0.01), r * (1 - (i - 1) * 0.01), rh * 1.01, 10), stone, x, rh * (i + 0.5), z);
    this.add(new THREE.CylinderGeometry(r * 1.25, r, 2, 10), stone, x, height + 1, z);
    if (roof) this.add(new THREE.ConeGeometry(r * 1.4, r * 2.2, 10), roof, x, height + 2 + r * 1.1, z);
    else this.merlons(x, z, r * 1.15, height + 2, 10, stone);
    this.colliders.push({ x, z, r: r + 1, height: height + 3 });
    return height + 2;
  }
  flag(x: number, y: number, z: number, color: string) {
    this.add(new THREE.CylinderGeometry(0.25, 0.25, 9, 5), mat(WOOD), x, y + 4.5, z);
    this.add(new THREE.BoxGeometry(5, 3, 0.2), mat(color), x + 2.5, y + 7.3, z);
  }
}

function house(r: () => number): Builder {
  const b = new Builder();
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const wall = mat(pick(PLASTER)), roof = mat(pick(ROOFS)), dark = mat(DARK), wood = mat(WOOD);
  const round = r() < 0.5;
  const w = 15 + r() * 5, h = 9 + r() * 3;
  if (round) {
    b.add(new THREE.CylinderGeometry(w / 2, w / 2 + 0.6, h, 9), wall, 0, h / 2, 0);
    b.add(new THREE.ConeGeometry(w / 2 + 3, 9 + r() * 4, 9), roof, 0, h + 5, 0);
  } else {
    b.add(new THREE.BoxGeometry(w, h, w * 0.85), wall, 0, h / 2, 0);
    for (const s of [-1, 1]) b.add(new THREE.BoxGeometry(1, h, 1), wood, s * w / 2, h / 2, -w * 0.425);
    b.add(new THREE.ConeGeometry(w * 0.78, 9 + r() * 4, 4), roof, 0, h + 5, 0, Math.PI / 4);
  }
  const front = round ? -w / 2 : -w * 0.425;
  b.add(new THREE.BoxGeometry(5, 7, 1), dark, 0, 3.5, front - 0.3);
  for (const s of [-1, 1]) if (r() < 0.8) b.add(new THREE.BoxGeometry(2.4, 2.4, 1), dark, s * w * 0.3, h * 0.62, front - 0.2);
  if (r() < 0.5) b.add(new THREE.BoxGeometry(2, 6, 2), mat(pick(STONE)), w * 0.25, h + 6, w * 0.1);
  b.colliders.push(round ? { x: 0, z: 0, r: w / 2 + 0.6, height: h + 8 } : box(0, 0, w / 2, w * 0.425, h + 8));
  return b;
}

function villageCenter(r: () => number): Builder {
  const b = new Builder();
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const wall = mat(pick(PLASTER)), roof = mat(pick(ROOFS)), stone = mat(pick(STONE)), dark = mat(DARK), wood = mat(WOOD);
  const R = 15 + r() * 3, h = 12 + r() * 2;
  // A ring of standing stones round the hall.
  const stones = 8;
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(2.5, 7 + r() * 3, 2), stone, Math.cos(a) * (R + 12), 4, Math.sin(a) * (R + 12), -a);
    b.colliders.push({ x: Math.cos(a) * (R + 12), z: Math.sin(a) * (R + 12), r: 1.5, height: 10 });
  }
  b.add(new THREE.CylinderGeometry(R, R + 1, h, 8), wall, 0, h / 2, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    b.add(new THREE.BoxGeometry(1.4, h, 1.4), wood, Math.cos(a) * R, h / 2, Math.sin(a) * R);
  }
  b.add(new THREE.BoxGeometry(8, 10, 1.2), dark, 0, 5, -R - 0.2);
  b.add(new THREE.ConeGeometry(R + 4, 14, 8), roof, 0, h + 7, 0, Math.PI / 8);
  b.add(new THREE.CylinderGeometry(1.4, 1.4, 6, 6), wood, 0, h + 16, 0);
  b.flag(0, h + 18, 0, pick(BANNERS));
  b.colliders.push({ x: 0, z: 0, r: R + 1, height: h + 12 });
  return b;
}

function wallPiece(r: () => number): Builder {
  const b = new Builder();
  const stone = mat(STONE[Math.floor(r() * STONE.length)]);
  const len = 34, h = 10 + r() * 2;
  b.wall(-len / 2, 0, len / 2, 0, h, 4, stone);
  for (const s of [-1, 1]) {
    b.add(new THREE.BoxGeometry(5.5, h + 3, 5.5), stone, s * len / 2, (h + 3) / 2, 0);
    b.colliders.push(box(s * len / 2, 0, 2.75, 2.75, h + 5));
  }
  return b;
}

function tower(r: () => number): Builder {
  const b = new Builder();
  const stone = mat(STONE[Math.floor(r() * STONE.length)]);
  const height = 26 + r() * 8;
  const top = b.tower(0, 0, 6, height, stone);
  b.add(new THREE.BoxGeometry(4, 7, 1), mat(DARK), 0, 3.5, -6.2);
  // A fire basket on top: where fire bolts come from.
  b.add(new THREE.CylinderGeometry(2, 1.3, 1.5, 8), mat('#3a2a20'), 0, top + 0.8, 0);
  b.add(new THREE.ConeGeometry(1.5, 3, 6), mat('#ff8a1e', '#ff5a00'), 0, top + 3, 0);
  b.turrets.push(new THREE.Vector3(0, top + 3, 0));
  return b;
}

/** Colours for a castle; Monster Castles use their own. */
export interface CastleLook { stone: string; roof: string; banner: string; /** Leave the keep door open for a Portal's gates. */ portal?: boolean }

function castle(r: () => number, look?: CastleLook): Builder {
  const b = new Builder();
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const stone = mat(look?.stone ?? pick(STONE)), roof = mat(look?.roof ?? pick(ROOFS)), dark = mat(DARK);
  const half = 36 + r() * 8, wallH = 16 + r() * 3, towerH = wallH + 12 + r() * 6;
  const banner = look?.banner ?? pick(BANNERS);
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]];
  // Curtain walls first (with a gate gap on the front), then corner towers, then the keep.
  const gate = 9;
  b.wall(-half, -half, -gate, -half, wallH, 5, stone);
  b.wall(gate, -half, half, -half, wallH, 5, stone);
  b.wall(half, -half, half, half, wallH, 5, stone);
  b.wall(half, half, -half, half, wallH, 5, stone);
  b.wall(-half, half, -half, -half, wallH, 5, stone);
  b.add(new THREE.BoxGeometry(gate * 2 + 4, 6, 6), stone, 0, wallH - 3, -half);
  // Heavy wooden gates in the gateway, standing open.
  const wallGate = new Gate(gate * 2 - 1, wallH - 6.2, false);
  wallGate.setOpen(0.9);
  b.parts.push(...wallGate.parts(new THREE.Matrix4().makeTranslation(0, 0, -half - 2.6)));
  for (const s of [-1, 1]) b.tower(s * (gate + 2), -half, 4.5, wallH + 6, stone);
  const roofed = r() < 0.5;
  for (const [x, z] of corners) {
    const top = b.tower(x, z, 8, towerH, stone, roofed ? roof : undefined);
    b.flag(x, roofed ? top + 18 : top, z, banner);
  }
  const kw = 24 + r() * 6, kh = 30 + r() * 10;
  for (let i = 0; i < 4; i++) b.add(new THREE.BoxGeometry(kw, kh / 4, kw), stone, 0, kh / 8 + (i * kh) / 4, half * 0.25);
  b.portal = new THREE.Vector3(0, 0, half * 0.25 - kw / 2 - 0.5);
  if (!look?.portal) {
    // Your own castle's keep: a shut wooden door.
    b.add(new THREE.BoxGeometry(6.5, 10.5, 0.6), dark, 0, 5.25, half * 0.25 - kw / 2 - 0.1);
    b.parts.push(...new Gate(6.5, 10.5).parts(new THREE.Matrix4().makeTranslation(0, 0, half * 0.25 - kw / 2 - 0.7)));
  }
  if (r() < 0.6) b.add(new THREE.ConeGeometry(kw * 0.75, 16, 4), roof, 0, kh + 8, half * 0.25, Math.PI / 4);
  else b.merlons(0, half * 0.25, kw * 0.6, kh, 14, stone);
  b.flag(0, kh + (r() < 0.6 ? 16 : 2), half * 0.25, banner);
  b.colliders.push(box(0, half * 0.25, kw / 2, kw / 2, kh + 4));
  return b;
}

const GENERATORS: Record<BuildingKind, (r: () => number) => Builder> = { house, villageCenter, wall: wallPiece, tower, castle };
const FOOTPRINT: Record<BuildingKind, number> = { house: 11, villageCenter: 30, wall: 18, tower: 8, castle: 50 };

/** A Monster Castle: a castle in its biome's stone, flying the banner of whoever holds it. */
export function monsterCastle(seed: number, look: CastleLook): Blueprint {
  const b = castle(rng(seed), look);
  return { kind: 'castle', parts: b.parts, footprint: FOOTPRINT.castle, colliders: b.colliders, turrets: [], portal: b.portal };
}

export { mat as buildingMaterial, rng };

export function blueprint(kind: BuildingKind, seed: number): Blueprint {
  const b = GENERATORS[kind](rng(seed));
  return { kind, parts: b.parts, footprint: FOOTPRINT[kind], colliders: b.colliders, turrets: b.turrets };
}

/** A foundation reaching down into the ground, for buildings on slopes. */
export function plinth(kind: BuildingKind, depth: number): Part {
  const r = FOOTPRINT[kind];
  const geometry = kind === 'wall'
    ? new THREE.BoxGeometry(38, depth, 7)
    : new THREE.CylinderGeometry(r * 0.85, r * 0.95, depth, 12);
  return { geometry, material: mat('#857f75'), matrix: new THREE.Matrix4().makeTranslation(0, -depth / 2 + 0.5, 0) };
}
