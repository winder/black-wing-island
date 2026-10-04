// Heavy wooden gates: two doors of rough-grained planks, bound with iron, in
// a stone arch. Used on Monster Castle keeps and Dungeon doorways (where they
// swing open as you come near), and on castle gateways.

import * as THREE from 'three';
import type { Part } from './blueprints';

let woodMat: THREE.MeshLambertMaterial | null = null;
let ironMat: THREE.MeshLambertMaterial | null = null;
let stoneMat: THREE.MeshLambertMaterial | null = null;

/** Planks with a rough grain, knots and seams, drawn once (the same every game). */
function woodTexture(): THREE.CanvasTexture {
  const W = 256, H = 512, PLANKS = 5;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = 1234567;
  const r = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0) >>> 0) / 4294967296;
  const pw = W / PLANKS;
  for (let p = 0; p < PLANKS; p++) {
    const x0 = p * pw;
    // Each plank a slightly different brown.
    const l = 24 + r() * 10, s = 38 + r() * 14, h = 24 + r() * 8;
    ctx.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
    ctx.fillRect(x0, 0, pw, H);
    // Grain: wavy streaks running down the plank.
    for (let k = 0; k < 34; k++) {
      const gx = x0 + r() * pw, amp = 1 + r() * 3, freq = 0.01 + r() * 0.03, phase = r() * 6;
      ctx.strokeStyle = r() < 0.5 ? `rgba(30, 16, 8, ${0.2 + r() * 0.35})` : `rgba(140, 96, 60, ${0.12 + r() * 0.2})`;
      ctx.lineWidth = 0.6 + r() * 1.8;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 6) {
        const x = gx + Math.sin(y * freq + phase) * amp + (r() - 0.5) * 0.8;
        if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // A knot or two, with the grain rings round them.
    for (let k = 0; k < 1 + Math.floor(r() * 2); k++) {
      const kx = x0 + pw * (0.25 + r() * 0.5), ky = r() * H, kr = 3 + r() * 5;
      for (let ring = 3; ring >= 0; ring--) {
        ctx.strokeStyle = `rgba(28, 14, 6, ${0.25 + ring * 0.1})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr + ring * 2.5, (kr + ring * 2.5) * 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(25, 12, 5, 0.85)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr, kr * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dark seam between planks.
    ctx.fillStyle = 'rgba(15, 8, 4, 0.9)';
    ctx.fillRect(x0, 0, 3, H);
  }
  // Rough speckle over everything.
  for (let k = 0; k < 2600; k++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(0, 0, 0, ${r() * 0.18})` : `rgba(255, 220, 180, ${r() * 0.07})`;
    ctx.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function materials() {
  woodMat ??= new THREE.MeshLambertMaterial({ map: woodTexture() });
  ironMat ??= new THREE.MeshLambertMaterial({ color: '#2b2a2e', flatShading: true });
  stoneMat ??= new THREE.MeshLambertMaterial({ color: '#6a655d', flatShading: true });
  return { wood: woodMat, iron: ironMat, stone: stoneMat };
}

/** One door: planks, three iron bands with studs, and a ring handle by the free edge. */
function leaf(w: number, h: number, side: 1 | -1): THREE.Group {
  const { wood, iron } = materials();
  const g = new THREE.Group();
  // Each door shows a different half of the planks, so the two don't match knot for knot.
  const geo = new THREE.BoxGeometry(w, h, 0.7);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (side > 0 ? 0.5 : 0));
  const boards = new THREE.Mesh(geo, wood);
  // The free edge is towards the middle of the doorway; the hinge is at x = 0.
  boards.position.set(-side * w / 2, h / 2, 0);
  g.add(boards);
  for (const y of [0.16, 0.5, 0.84]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.045, 0.85), iron);
    band.position.set(-side * w / 2, h * y, 0);
    g.add(band);
    for (let k = 0; k < 5; k++) {
      for (const face of [-1, 1]) {
        const stud = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.2), iron);
        stud.position.set(-side * w * (0.1 + k * 0.2), h * y, face * 0.5);
        g.add(stud);
      }
    }
  }
  for (const face of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 5, 10), iron);
    ring.position.set(-side * w * 0.85, h * 0.42, face * 0.55);
    g.add(ring);
  }
  return g;
}

/** A pair of gates in a stone arch, facing -z, standing on y = 0. `open` 0..1 swings them out (towards -z). */
export class Gate {
  readonly group = new THREE.Group();
  private leaves: [THREE.Group, THREE.Group];
  open = 0;

  constructor(readonly width: number, readonly height: number, frame = true) {
    const half = width / 2;
    const left = leaf(half, height, -1), right = leaf(half, height, 1);
    left.position.x = -half;
    right.position.x = half;
    this.leaves = [left, right];
    this.group.add(left, right);
    if (frame) {
      const { stone } = materials();
      for (const s of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.8, height + 1, 2.4), stone);
        jamb.position.set(s * (half + 0.9), (height + 1) / 2, 0);
        this.group.add(jamb);
      }
      // An arch of wedge stones over the top.
      const stones = 9;
      for (let k = 0; k < stones; k++) {
        const a = Math.PI * (k + 0.5) / stones;
        const block = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.6), stone);
        block.position.set(Math.cos(a) * (half + 0.9), height + Math.sin(a) * (half * 0.45) + 0.6, 0);
        block.rotation.z = a - Math.PI / 2;
        this.group.add(block);
      }
    }
  }

  /** 0 shut .. 1 wide open. */
  setOpen(t: number) {
    this.open = t;
    const angle = THREE.MathUtils.smoothstep(t, 0, 1) * 1.1;
    this.leaves[0].rotation.y = angle;
    this.leaves[1].rotation.y = -angle;
  }

  /** Swing towards open (or shut), at a gate's pace. */
  update(dt: number, wantOpen: boolean) {
    const t = THREE.MathUtils.clamp(this.open + (wantOpen ? dt : -dt) / 2.2, 0, 1);
    if (t !== this.open) this.setOpen(t);
  }

  /** As fixed parts of a building (for gates that never move), placed by `m`. */
  parts(m: THREE.Matrix4): Part[] {
    const out: Part[] = [];
    this.group.updateMatrixWorld(true);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) out.push({ geometry: o.geometry, material: o.material as THREE.Material, matrix: m.clone().multiply(o.matrixWorld) });
    });
    return out;
  }
}
