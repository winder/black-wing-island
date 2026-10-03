// The Island's shape, loaded from the maps that tools/build-island.ts made from
// Caitlin's drawing, and the height function that turns it into terrain.
//
// World coordinates: metres, y up, the centre of the drawing at x = z = 0,
// north (the top of the drawing) towards -z.

import { Biome } from './biomes';
import { fbm, ridged, noise2, smoothstep, lerp } from './noise';

export interface IslandMeta {
  width: number;
  height: number;
  metresPerPixel: number;
  volcano: { x: number; y: number; radius: number };
  homeVillage: { x: number; y: number };
}

export interface Ground {
  height: number;
  /** Height of inland water (lakes, rivers) here, or -Infinity if none. */
  water: number;
  biome: Biome;
  /** Signed distance to the coast in metres (positive on land). */
  coast: number;
}

async function loadPixels(url: string): Promise<Uint8ClampedArray> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}

export const VILLAGE_RADIUS = 160;
const SEA_FLOOR = -40;
const WATER_DEPTH = 12;

export class Island {
  readonly W: number;
  readonly H: number;
  readonly mpp: number;
  readonly sizeX: number;
  readonly sizeZ: number;
  readonly volcano: { x: number; z: number; radius: number };
  readonly home: { x: number; z: number };
  private homeLevel = 0;
  readonly biomeMap: Uint8Array;
  readonly coastMap: Float32Array;
  readonly waterMap: Float32Array;
  private spineMap: Float32Array;
  private baseMap: Float32Array;
  private roughMap: Float32Array;

  private constructor(meta: IslandMeta, a: Uint8ClampedArray, b: Uint8ClampedArray) {
    this.W = meta.width;
    this.H = meta.height;
    this.mpp = meta.metresPerPixel;
    this.sizeX = this.W * this.mpp;
    this.sizeZ = this.H * this.mpp;
    const n = this.W * this.H;
    this.biomeMap = new Uint8Array(n);
    this.coastMap = new Float32Array(n);
    this.waterMap = new Float32Array(n);
    this.spineMap = new Float32Array(n);
    this.baseMap = new Float32Array(n);
    this.roughMap = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.biomeMap[i] = a[i * 4];
      this.coastMap[i] = (a[i * 4 + 1] - 128) * this.mpp;
      this.waterMap[i] = a[i * 4 + 2] * this.mpp;
      this.spineMap[i] = b[i * 4] * this.mpp;
      this.baseMap[i] = b[i * 4 + 1] / 2;
      this.roughMap[i] = b[i * 4 + 2] / 2;
    }
    const v = this.toWorld(meta.volcano.x, meta.volcano.y);
    this.volcano = { x: v.x, z: v.z, radius: meta.volcano.radius * this.mpp * 1.25 };
    this.home = this.toWorld(meta.homeVillage.x, meta.homeVillage.y);
    this.homeLevel = Math.max(6, this.rawGround(this.home.x, this.home.z).smooth);
  }

  static async load(base = 'island/'): Promise<Island> {
    const [meta, a, b] = await Promise.all([
      fetch(base + 'island.json').then((r) => r.json() as Promise<IslandMeta>),
      loadPixels(base + 'island-a.png'),
      loadPixels(base + 'island-b.png'),
    ]);
    return new Island(meta, a, b);
  }

  toWorld(px: number, py: number) {
    return { x: (px - this.W / 2) * this.mpp, z: (py - this.H / 2) * this.mpp };
  }

  toMap(x: number, z: number) {
    return { px: x / this.mpp + this.W / 2, py: z / this.mpp + this.H / 2 };
  }

  private bilinear(map: Float32Array, px: number, py: number, outside: number): number {
    if (px < 0 || py < 0 || px >= this.W - 1 || py >= this.H - 1) return outside;
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const i = y0 * this.W + x0;
    const top = map[i] + (map[i + 1] - map[i]) * fx;
    const bot = map[i + this.W] + (map[i + this.W + 1] - map[i + this.W]) * fx;
    return top + (bot - top) * fy;
  }

  /** Biome at a point, with wobbly borders so they don't follow the pixel grid. */
  biomeAt(x: number, z: number): Biome {
    const wx = x + noise2(x / 90, z / 90) * 22, wz = z + noise2(x / 90 + 50, z / 90) * 22;
    const { px, py } = this.toMap(wx, wz);
    const ix = Math.round(px), iy = Math.round(py);
    if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H) return Biome.Ocean;
    return this.biomeMap[iy * this.W + ix];
  }

  /** Signed distance to the coast in metres, with a wobbly coastline. */
  coastAt(x: number, z: number): number {
    const { px, py } = this.toMap(x, z);
    const c = this.bilinear(this.coastMap, px, py, -2000);
    return c + fbm(x / 260, z / 260, 3) * 30;
  }

  private rawGround(x: number, z: number) {
    const { px, py } = this.toMap(x, z);
    const coast = this.coastAt(x, z);
    const base = this.bilinear(this.baseMap, px, py, 0);
    const rough = this.bilinear(this.roughMap, px, py, 0);
    const spine = this.bilinear(this.spineMap, px, py, 4000);

    // Rolling land, flattened towards the beach.
    const inland = smoothstep(0, 220, coast);
    let smooth = lerp(1.5, base + fbm(x / 900, z / 900, 3) * base * 0.5, inland);
    let detail = rough * inland * fbm(x / 220, z / 220, 4);

    // Giant mountains along the spine.
    const range = Math.pow(Math.max(0, 1 - spine / 650), 1.6);
    if (range > 0) {
      const peak = 420 + 260 * fbm(x / 1400, z / 1400, 2);
      smooth += range * peak * smoothstep(-20, 120, coast);
      detail += range * 140 * (ridged(x / 520, z / 520, 4) - 0.5) * smoothstep(-20, 120, coast);
    }

    // The volcano at the head: a cone with a crater on top.
    const dv = Math.hypot(x - this.volcano.x, z - this.volcano.z) / this.volcano.radius;
    if (dv < 1.2) {
      const cone = 560 * Math.pow(1 - smoothstep(0.12, 1.15, dv), 1.3);
      const crater = 150 * (1 - smoothstep(0.06, 0.16, dv));
      smooth += cone - crater;
      detail *= 0.6;
      detail += 20 * fbm(x / 120, z / 120, 3) * (1 - dv);
    }

    // Under the sea the ground drops away.
    if (coast < 0) {
      const floor = Math.max(SEA_FLOOR, coast * 0.35);
      smooth = lerp(smooth, floor, smoothstep(0, -40, coast));
      detail *= smoothstep(-60, 0, coast);
    }
    return { smooth, detail, coast, range };
  }

  /** Everything about the ground at a point. */
  ground(x: number, z: number): Ground {
    const { smooth, detail, coast, range } = this.rawGround(x, z);
    let height = smooth + detail;
    let water = -Infinity;

    // Lakes and rivers: carve a bed below a smooth water level.
    const { px, py } = this.toMap(x, z);
    const wd = this.bilinear(this.waterMap, px, py, 1e4) + noise2(x / 70, z / 70) * 6;
    // Rivers don't run over the mountains: they fade out where the range rises.
    const flat = 1 - smoothstep(0.04, 0.12, range);
    if (wd < 55 && coast > -30 && flat > 0) {
      const level = Math.max(0, smooth - 2);
      const bank = lerp(1, smoothstep(18, 55, wd), flat);
      const bed = level - WATER_DEPTH * (1 - smoothstep(0, 22, wd));
      height = lerp(bed, Math.max(height, level + 1.5), bank);
      if (wd < 26 && flat > 0.6) water = level;
    }

    // Flatten the ground for the Home Village.
    const dh = Math.hypot(x - this.home.x, z - this.home.z);
    if (dh < VILLAGE_RADIUS * 1.6) {
      height = lerp(this.homeLevel + detail * 0.1, height, smoothstep(VILLAGE_RADIUS, VILLAGE_RADIUS * 1.6, dh));
      if (dh < VILLAGE_RADIUS) water = -Infinity;
    }

    return { height, water, biome: coast > 0 ? this.biomeAt(x, z) : Biome.Ocean, coast };
  }

  heightAt(x: number, z: number): number {
    return this.ground(x, z).height;
  }
}
