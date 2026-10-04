// The Map (M): the whole Island, covered in fog that clears where the player has been.

import { Biome } from '../world/biomes';
import { Island } from '../world/island';

const COLORS: Record<Biome, [number, number, number]> = {
  [Biome.Ocean]: [44, 92, 160], [Biome.Meadow]: [128, 196, 96], [Biome.Forest]: [44, 112, 64],
  [Biome.Desert]: [232, 200, 124], [Biome.Mountain]: [140, 122, 104], [Biome.Volcano]: [184, 64, 44],
  [Biome.Beach]: [240, 220, 164],
};

export class WorldMap {
  /** One byte per map pixel: 1 = explored. */
  explored: Uint8Array;
  open = false;
  private base: ImageData;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private dirty = true;
  /** Places to mark once you've seen them. */
  markers: { x: number; z: number; kind: 'castle' | 'dungeon' | 'cave'; owned?: boolean }[] = [];

  constructor(private island: Island, parent: HTMLElement) {
    const { W, H } = island;
    this.explored = new Uint8Array(W * H);
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.className = 'world-map hidden';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.base = this.ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      let c = COLORS[island.biomeMap[i] as Biome];
      const coast = island.coastMap[i];
      if (coast > 0 && coast < 20) c = COLORS[Biome.Beach];
      if (coast > 0 && island.waterMap[i] < 16) c = [80, 150, 230];
      if (coast <= 0) {
        // Shallow water near the shore is lighter.
        const t = Math.max(0, 1 + coast / 300);
        c = [44 + 40 * t, 92 + 50 * t, 160 + 40 * t];
      }
      this.base.data.set([c[0], c[1], c[2], 255], i * 4);
    }
  }

  /** Clear the fog around the player. Higher up, you can see further. */
  reveal(x: number, z: number, altitude: number) {
    const { px, py } = this.island.toMap(x, z);
    const r = (260 + Math.max(0, altitude) * 1.6) / this.island.mpp;
    const { W, H } = this.island;
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, Math.ceil(py + r)); y++) {
      for (let xx = Math.max(0, Math.floor(px - r)); xx <= Math.min(W - 1, Math.ceil(px + r)); xx++) {
        const i = y * W + xx;
        if (!this.explored[i] && (xx - px) ** 2 + (y - py) ** 2 <= r * r) { this.explored[i] = 1; this.dirty = true; }
      }
    }
  }

  /** Fraction of the Island's land that has been explored. */
  get exploredFraction() {
    let land = 0, seen = 0;
    for (let i = 0; i < this.explored.length; i++) {
      if (this.island.coastMap[i] > 0) { land++; if (this.explored[i]) seen++; }
    }
    return land ? seen / land : 0;
  }

  toggle() {
    this.open = !this.open;
    this.canvas.classList.toggle('hidden', !this.open);
  }

  draw(x: number, z: number, yaw: number) {
    if (!this.open) return;
    const { W, H } = this.island;
    if (this.dirty) {
      const img = this.ctx.createImageData(W, H);
      for (let i = 0; i < W * H; i++) {
        if (this.explored[i]) img.data.set(this.base.data.subarray(i * 4, i * 4 + 4), i * 4);
        else img.data.set([214, 206, 186, 255], i * 4); // parchment fog
      }
      this.fog = img;
      this.dirty = false;
    }
    this.ctx.putImageData(this.fog!, 0, 0);
    // Home Village.
    const home = this.island.toMap(this.island.home.x, this.island.home.z);
    if (this.explored[Math.round(home.py) * W + Math.round(home.px)]) {
      this.ctx.fillStyle = '#7a3b1e';
      this.ctx.fillRect(home.px - 4, home.py - 4, 8, 8);
    }
    // Castles, Dungeons and Caves you've found.
    for (const m of this.markers) {
      const { px: mx, py: my } = this.island.toMap(m.x, m.z);
      if (!this.explored[Math.round(my) * W + Math.round(mx)]) continue;
      const c = this.ctx;
      c.save();
      c.translate(mx, my);
      c.lineWidth = 2;
      c.strokeStyle = '#f4ead2';
      if (m.kind === 'castle') {
        c.fillStyle = m.owned ? '#5b3a8a' : '#1a1416';
        c.beginPath();
        c.moveTo(-8, 7); c.lineTo(-8, -6); c.lineTo(-4, -6); c.lineTo(-4, -2); c.lineTo(-1, -2); c.lineTo(-1, -6);
        c.lineTo(1, -6); c.lineTo(1, -2); c.lineTo(4, -2); c.lineTo(4, -6); c.lineTo(8, -6); c.lineTo(8, 7); c.closePath();
        c.stroke(); c.fill();
      } else {
        c.fillStyle = m.kind === 'dungeon' ? '#3a2a20' : '#6b5a48';
        const r = m.kind === 'dungeon' ? 7 : 5;
        c.beginPath();
        c.moveTo(-r, r); c.lineTo(-r, 0); c.arc(0, 0, r, Math.PI, 0); c.lineTo(r, r); c.closePath();
        c.stroke(); c.fill();
      }
      c.restore();
    }
    // The player, as an arrow.
    const { px, py } = this.island.toMap(x, z);
    this.ctx.save();
    this.ctx.translate(px, py);
    this.ctx.rotate(-yaw);
    this.ctx.fillStyle = '#111';
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -10); this.ctx.lineTo(7, 8); this.ctx.lineTo(0, 4); this.ctx.lineTo(-7, 8); this.ctx.closePath();
    this.ctx.stroke(); this.ctx.fill();
    this.ctx.restore();
  }

  private fog?: ImageData;
}
