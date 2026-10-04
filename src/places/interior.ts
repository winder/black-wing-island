// An Interior: the dark halls behind a Portal (a Monster Castle's inside, or a
// Dungeon). Generated from a seed on a grid of cells: an entrance room, a chain
// of rooms joined by corridors, a few side rooms, and a great hall at the end
// where the Boss waits. Halls are tall enough to fly in; torches light them.
//
// Interiors are built far out past the Island's ocean (at ORIGIN), one at a
// time, while the outside world is hidden.

import * as THREE from 'three';
import { rng } from '../build/blueprints';
import { Collider, box } from '../world/collide';

export const CELL = 26;
const G = 20; // grid cells across
export const ORIGIN = new THREE.Vector3(40000, 0, 0);

export type Theme = 'castle' | 'dungeon';

export interface Room { x: number; z: number; w: number; d: number; kind: 'start' | 'room' | 'side' | 'boss' }

/** What the player needs from wherever they are when it isn't the open Island. */
export interface Indoors {
  floorAt(x: number, z: number): number;
  ceilingAt(x: number, z: number): number;
  readonly colliders: Collider[];
  /** Pull a third-person camera in so it doesn't go through walls. */
  limitCamera(eye: THREE.Vector3, cam: THREE.Vector3): void;
}

/** The layout: which cells are open, how tall each is, and the rooms. */
export class Layout {
  readonly open = new Uint8Array(G * G);
  readonly height = new Float32Array(G * G);
  readonly rooms: Room[] = [];

  constructor(seed: number, roomCount: number) {
    const r = rng(seed);
    const start: Room = { x: G / 2 - 1, z: G - 4, w: 2, d: 2, kind: 'start' };
    this.carve(start, 30);
    let current = start;
    const DIRS: [number, number][] = [[0, -1], [1, 0], [-1, 0], [0, 1]];
    for (let n = 1; n < roomCount; n++) {
      const boss = n === roomCount - 1;
      let placed: Room | null = null;
      for (let attempt = 0; attempt < 60 && !placed; attempt++) {
        // Mostly onwards (north), sometimes sideways; never straight back at the door.
        const dir = DIRS[r() < 0.5 ? 0 : 1 + Math.floor(r() * (attempt > 30 ? 3 : 2))];
        const w = boss ? 4 : 2 + Math.floor(r() * 2), d = boss ? 4 : 2 + Math.floor(r() * 2);
        placed = this.tryAttach(current, dir, 2 + Math.floor(r() * 3), w, d, boss ? 'boss' : 'room');
        if (attempt === 40 && this.rooms.length > 1) current = this.rooms[1 + Math.floor(r() * (this.rooms.length - 1))];
      }
      if (placed) current = placed;
    }
    // A couple of little side rooms off the way.
    for (let n = 0, tries = 0; n < 2 && tries < 40; tries++) {
      const from = this.rooms[Math.floor(r() * this.rooms.length)];
      if (from.kind === 'boss') continue;
      if (this.tryAttach(from, DIRS[Math.floor(r() * 3)], 1 + Math.floor(r() * 2), 2, 2, 'side')) n++;
    }
  }

  get boss() { return this.rooms.find((m) => m.kind === 'boss') ?? this.rooms[this.rooms.length - 1]; }
  get start() { return this.rooms[0]; }

  at(i: number, j: number) { return i < 0 || j < 0 || i >= G || j >= G ? 0 : this.open[j * G + i]; }

  private carve(room: Room, h: number) {
    for (let j = room.z; j < room.z + room.d; j++) for (let i = room.x; i < room.x + room.w; i++) {
      this.open[j * G + i] = 2;
      this.height[j * G + i] = h;
    }
    this.rooms.push(room);
  }

  /** A corridor `len` long out of `from` towards `dir`, then a room. Null if there isn't space. */
  private tryAttach(from: Room, [dx, dz]: [number, number], len: number, w: number, d: number, kind: Room['kind']): Room | null {
    // Leave from the middle of the side facing `dir`.
    const ex = dx > 0 ? from.x + from.w : dx < 0 ? from.x - 1 : from.x + Math.floor(from.w / 2);
    const ez = dz > 0 ? from.z + from.d : dz < 0 ? from.z - 1 : from.z + Math.floor(from.d / 2);
    const corridor: [number, number][] = [];
    for (let k = 0; k < len; k++) corridor.push([ex + dx * k, ez + dz * k]);
    const [lx, lz] = corridor[corridor.length - 1];
    const room: Room = {
      x: dx > 0 ? lx + 1 : dx < 0 ? lx - w : lx - Math.floor(w / 2),
      z: dz > 0 ? lz + 1 : dz < 0 ? lz - d : lz - Math.floor(d / 2),
      w, d, kind,
    };
    // Everything new (with a wall's width round the room) must be solid rock now.
    if (room.x < 1 || room.z < 1 || room.x + w > G - 1 || room.z + d > G - 1) return null;
    for (const [i, j] of corridor) if (i < 1 || j < 1 || i >= G - 1 || j >= G - 1 || this.at(i, j)) return null;
    for (let j = room.z - 1; j <= room.z + d; j++) for (let i = room.x - 1; i <= room.x + w; i++) {
      if (this.at(i, j) && !corridor.some(([ci, cj]) => ci === i && cj === j)) return null;
    }
    for (const [i, j] of corridor) { this.open[j * G + i] = 1; this.height[j * G + i] = 20; }
    this.carve(room, kind === 'boss' ? 56 : kind === 'side' ? 24 : 34);
    return room;
  }
}

/** Centre of a cell (or of a room) in world space. */
export function cellCenter(i: number, j: number, out = new THREE.Vector3()) {
  return out.set(ORIGIN.x + (i - G / 2 + 0.5) * CELL, ORIGIN.y, ORIGIN.z + (j - G / 2 + 0.5) * CELL);
}
export function roomCenter(room: Room, out = new THREE.Vector3()) {
  return cellCenter(room.x + (room.w - 1) / 2, room.z + (room.d - 1) / 2, out);
}

const THEME = {
  castle: { floor: '#5a534c', wall: '#6d675f', ceiling: '#3b3631', trim: '#2a2522' },
  dungeon: { floor: '#3e3833', wall: '#4d4640', ceiling: '#2a2521', trim: '#1d1916' },
};

export class Interior implements Indoors {
  readonly group = new THREE.Group();
  readonly layout: Layout;
  readonly colliders: Collider[] = [];
  /** Where flames are, for the torch lights. */
  readonly torches: THREE.Vector3[] = [];
  /** Where you arrive, facing in. */
  readonly arrive = new THREE.Vector3();
  readonly arriveYaw = 0;
  /** Stand here (by the doorway you came in through) to go back out. */
  readonly exit = new THREE.Vector3();

  private pos: number[] = [];
  private col: number[] = [];

  constructor(seed: number, readonly theme: Theme, stone: string) {
    // Some seeds can't fit the great hall; try the next until one does.
    let layout = new Layout(seed, theme === 'castle' ? 7 : 8);
    for (let k = 1; !layout.rooms.some((m) => m.kind === 'boss') && k < 50; k++) layout = new Layout(seed + k * 7919, theme === 'castle' ? 7 : 8);
    this.layout = layout;
    const r = rng(seed + 99);
    const t = THEME[theme];
    const tint = new THREE.Color(stone);
    const floorC = new THREE.Color(t.floor).lerp(tint, 0.35), wallC = new THREE.Color(t.wall).lerp(tint, 0.5);
    const ceilC = new THREE.Color(t.ceiling).lerp(tint, 0.25);
    const L = this.layout;

    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      if (!L.at(i, j)) continue;
      const h = L.height[j * G + i];
      const c = cellCenter(i, j);
      const x0 = c.x - CELL / 2, x1 = c.x + CELL / 2, z0 = c.z - CELL / 2, z1 = c.z + CELL / 2;
      // Floor tiles and ceiling.
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
        const tx = x0 + a * CELL / 2, tz = z0 + b * CELL / 2;
        this.quad([tx, 0, tz], [tx + CELL / 2, 0, tz], [tx + CELL / 2, 0, tz + CELL / 2], [tx, 0, tz + CELL / 2], [0, 1, 0], vary(floorC, r));
        this.quad([tx, h, tz], [tx + CELL / 2, h, tz], [tx + CELL / 2, h, tz + CELL / 2], [tx, h, tz + CELL / 2], [0, -1, 0], vary(ceilC, r));
      }
      // Walls where the next cell is rock, and steps up where it's lower.
      const sides: [number, number, number[], number[], number[]][] = [
        [0, -1, [x0, z0], [x1, z0], [0, 0, 1]], [0, 1, [x1, z1], [x0, z1], [0, 0, -1]],
        [-1, 0, [x0, z1], [x0, z0], [1, 0, 0]], [1, 0, [x1, z0], [x1, z1], [-1, 0, 0]],
      ];
      for (const [di, dj, a, b, n] of sides) {
        const next = L.at(i + di, j + dj);
        const from = next ? L.height[(j + dj) * G + i + di] : 0;
        if (from >= h) continue;
        // In blocks, so the wall isn't one flat sheet.
        const rows = Math.ceil((h - from) / 9);
        for (let row = 0; row < rows; row++) for (let k = 0; k < 2; k++) {
          const y0 = from + ((h - from) * row) / rows, y1 = from + ((h - from) * (row + 1)) / rows;
          const ax = a[0] + ((b[0] - a[0]) * k) / 2, az = a[1] + ((b[1] - a[1]) * k) / 2;
          const bx = a[0] + ((b[0] - a[0]) * (k + 1)) / 2, bz = a[1] + ((b[1] - a[1]) * (k + 1)) / 2;
          this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], n, vary(wallC, r));
        }
        // A torch on solid walls of rooms, now and then.
        if (!next && L.at(i, j) === 2 && r() < 0.45) this.torch((a[0] + b[0]) / 2 + n[0] * 0.8, Math.min(12, h * 0.4), (a[1] + b[1]) / 2 + n[2] * 0.8, n, r);
      }
    }

    // Rock round the open cells is solid.
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      if (L.at(i, j)) continue;
      let edge = false;
      for (let dj = -1; dj <= 1 && !edge; dj++) for (let di = -1; di <= 1 && !edge; di++) if (L.at(i + di, j + dj)) edge = true;
      if (edge) {
        const c = cellCenter(i, j);
        this.colliders.push(box(c.x, c.z, CELL / 2, CELL / 2, Infinity));
      }
    }

    for (const room of L.rooms) this.decorate(room, r, wallC, tint);

    // The doorway you came in by: daylight through it.
    const s = L.start;
    const door = cellCenter(s.x + (s.w - 1) / 2, s.z + s.d - 1).add(new THREE.Vector3(0, 0, CELL / 2 - 0.4));
    const light = new THREE.Mesh(new THREE.PlaneGeometry(12, 16), new THREE.MeshBasicMaterial({ color: '#f6efd8' }));
    light.position.set(door.x, 8, door.z);
    light.rotation.y = Math.PI;
    this.group.add(light);
    this.exit.set(door.x, 0, door.z - 3);
    this.arrive.set(door.x, 0, door.z - 18);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.computeVertexNormals();
    this.group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  }

  /** Pillars, banners, stalactites. */
  private decorate(room: Room, r: () => number, wallC: THREE.Color, tint: THREE.Color) {
    const c = roomCenter(room);
    const h = this.layout.height[room.z * G + room.x];
    const W = room.w * CELL, D = room.d * CELL;
    const stone = new THREE.MeshLambertMaterial({ color: wallC.clone().multiplyScalar(0.9), flatShading: true });
    if (room.w >= 3 && room.d >= 3 || room.kind === 'boss') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const px = c.x + sx * W * 0.3, pz = c.z + sz * D * 0.3;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, h, 8), stone);
        pillar.position.set(px, h / 2, pz);
        this.group.add(pillar);
        this.colliders.push({ x: px, z: pz, r: 3.2, height: Infinity });
      }
    }
    if (this.theme === 'castle') {
      // Ragged dark banners and, in the great hall, a long carpet.
      const cloth = new THREE.MeshLambertMaterial({ color: '#3a1418', flatShading: true, side: THREE.DoubleSide });
      for (const sx of [-1, 1]) {
        const ban = new THREE.Mesh(new THREE.PlaneGeometry(5, 14), cloth);
        ban.position.set(c.x + sx * (W / 2 - 0.6), h * 0.55, c.z);
        ban.rotation.y = Math.PI / 2;
        this.group.add(ban);
      }
      if (room.kind === 'boss') {
        const carpet = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, D * 0.85), new THREE.MeshLambertMaterial({ color: '#5a1a20', flatShading: true }));
        carpet.position.set(c.x, 0.1, c.z);
        this.group.add(carpet);
      }
    } else {
      // Stalactites hanging from the roof, and a few stalagmites to fly round.
      const rock = new THREE.MeshLambertMaterial({ color: tint.clone().lerp(new THREE.Color('#2a2521'), 0.5), flatShading: true });
      const n = room.w * room.d;
      for (let k = 0; k < n * 2; k++) {
        const len = 4 + r() * 9;
        const s = new THREE.Mesh(new THREE.ConeGeometry(1 + r() * 1.5, len, 5), rock);
        s.rotation.x = Math.PI;
        s.position.set(c.x + (r() - 0.5) * (W - 6), h - len / 2, c.z + (r() - 0.5) * (D - 6));
        this.group.add(s);
      }
      for (let k = 0; k < n / 2; k++) {
        const len = 3 + r() * 6, rad = 1.2 + r() * 1.5;
        const x = c.x + (r() - 0.5) * (W - 10), z = c.z + (r() - 0.5) * (D - 10);
        if (room.kind === 'start' || Math.hypot(x - c.x, z - c.z) < 8) continue;
        const s = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 5), rock);
        s.position.set(x, len / 2, z);
        this.group.add(s);
        this.colliders.push({ x, z, r: rad, height: len });
      }
    }
  }

  private torch(x: number, y: number, z: number, n: number[], r: () => number) {
    const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5), new THREE.MeshLambertMaterial({ color: '#3a2a1c', flatShading: true }));
    wood.position.set(x, y, z);
    wood.rotation.set(n[2] * 0.5, 0, -n[0] * 0.5);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6 + r() * 0.4, 6), new THREE.MeshBasicMaterial({ color: '#ffae3a' }));
    flame.position.set(x + n[0] * 0.5, y + 1.6, z + n[2] * 0.5);
    this.group.add(wood, flame);
    this.torches.push(flame.position.clone());
  }

  /** One flat quad facing `n`. */
  private quad(a: number[], b: number[], c: number[], d: number[], n: number[], color: THREE.Color) {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const tris = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const v of tris) { this.pos.push(...v); this.col.push(color.r, color.g, color.b); }
  }

  // ---------- Indoors ----------

  private cellOf(x: number, z: number) {
    const i = Math.floor((x - ORIGIN.x) / CELL + G / 2), j = Math.floor((z - ORIGIN.z) / CELL + G / 2);
    return { i, j, open: this.layout.at(i, j) };
  }

  floorAt() { return ORIGIN.y; }
  /** For monsters standing in here (a `Floor`). */
  heightAt() { return ORIGIN.y; }

  ceilingAt(x: number, z: number) {
    const { i, j, open } = this.cellOf(x, z);
    return open ? ORIGIN.y + this.layout.height[j * G + i] : ORIGIN.y + 20;
  }

  /** Standing at the near end of the great hall, looking at the Boss (for testing). */
  hallView() {
    const centre = roomCenter(this.layout.boss), start = roomCenter(this.layout.start);
    const toward = centre.clone().sub(start).setY(0).normalize();
    const reach = (Math.min(this.layout.boss.w, this.layout.boss.d) * CELL) / 2 - 8;
    return { pos: centre.clone().addScaledVector(toward, -reach), yaw: Math.atan2(-toward.x, -toward.z) };
  }

  limitCamera(eye: THREE.Vector3, cam: THREE.Vector3) {
    const dir = cam.clone().sub(eye);
    const len = dir.length();
    dir.divideScalar(len);
    const p = new THREE.Vector3();
    let ok = 0;
    for (let d = 1; d <= len; d += 0.5) {
      p.copy(eye).addScaledVector(dir, d);
      const { open } = this.cellOf(p.x, p.z);
      if (!open || p.y > this.ceilingAt(p.x, p.z) - 1 || p.y < ORIGIN.y + 1) break;
      ok = d;
    }
    cam.copy(eye).addScaledVector(dir, Math.max(0, ok - 2));
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

function vary(c: THREE.Color, r: () => number) {
  return c.clone().multiplyScalar(0.88 + r() * 0.24);
}
