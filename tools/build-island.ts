// Turns Caitlin's drawing (assets/island-drawing.png) into the maps the game
// uses to build the Island. Run with `npm run island`.
//
// Outputs (in public/island/):
//   island-a.png  R = biome id, G = signed coast distance (128 = coast, >128 inland),
//                 B = distance to nearest lake/river (px)
//   island-b.png  R = distance to the mountain spine (px), G = base height, B = roughness
//   island.json   size, scale and points of interest (volcano, home village)
// Plus assets/island-preview.png for Caitlin to check.

import { PNG } from 'pngjs';
import fs from 'node:fs';
import { Biome } from '../src/world/biomes';

const SRC = 'assets/island-drawing.png';
// The photo has stickers above the paper and a window frame to the right.
const CROP = { x0: 40, y0: 45, x1: 745, y1: 578 };

const src = PNG.sync.read(fs.readFileSync(SRC));
const W = CROP.x1 - CROP.x0;
const H = CROP.y1 - CROP.y0;
const N = W * H;
const idx = (x: number, y: number) => y * W + x;

// ---------- 1. classify pixels ----------
const enum Ink { Paper, Pencil, Black, Red, Brown, Yellow, Green, Blue }

function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx / 255];
}

const value = new Float32Array(N);
const ink = new Uint8Array(N);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = ((y + CROP.y0) * src.width + x + CROP.x0) * 4;
    const [h, s, v] = hsv(src.data[i], src.data[i + 1], src.data[i + 2]);
    value[idx(x, y)] = v;
    let k = Ink.Paper;
    const reddish = h >= 330 || h < 40;
    if (reddish && s > 0.3 && v < 0.55) k = Ink.Brown; // spine marker is a dark red-brown
    else if (v < 0.35 && (s < 0.35 || (h > 180 && h < 280))) k = Ink.Black;
    else if (s > 0.25) {
      if (h >= 330 || h < 15) k = Ink.Red;
      else if (h < 40) k = Ink.Brown;
      else if (h < 75) k = Ink.Yellow;
      else if (h < 175) k = Ink.Green;
      else if (h < 270) k = Ink.Blue;
    }
    ink[idx(x, y)] = k;
  }
}

// Pencil: grey marks darker than the paper around them (the photo has uneven lighting).
const bg = boxBlur(value, 12);
for (let i = 0; i < N; i++) {
  if (ink[i] === Ink.Paper && value[i] < bg[i] - 0.035) ink[i] = Ink.Pencil;
}
// Drop isolated specks of noise.
for (const k of [Ink.Pencil, Ink.Black, Ink.Red, Ink.Brown, Ink.Yellow, Ink.Green, Ink.Blue]) {
  removeSmall(ink, (v) => v === k, k === Ink.Pencil ? 3 : 12, Ink.Paper);
}

// ---------- 2. land and sea ----------
// The pencil outline hugs the coloured areas. Pencil marks further out than that
// (the tail circles and toe dots) are small islands, not part of the outline.
const coloured = new Uint8Array(N);
for (let i = 0; i < N; i++) coloured[i] = ink[i] !== Ink.Paper && ink[i] !== Ink.Pencil ? 1 : 0;
const nearColour = dilate(coloured, 26);
const outlineMarks = new Uint8Array(N);
const islandMarks = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  if (ink[i] === Ink.Paper) continue;
  if (nearColour[i]) outlineMarks[i] = 1;
  else if (ink[i] === Ink.Pencil) islandMarks[i] = 1;
}
const walls = dilate(outlineMarks, 3); // bridges small gaps in the faint pencil outline
// The sea is the paper reachable from the edge of the picture without crossing a mark.
const sea = new Uint8Array(N);
{
  const q: number[] = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) q.push(idx(x, y));
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) q.push(idx(x, y));
  for (const i of q) sea[i] = walls[i] ? 0 : 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (!sea[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (!sea[j] && !walls[j]) { sea[j] = 1; q.push(j); }
    }
  }
}
// The biggest enclosed piece is the dragon.
const enclosed = erode(dilate(invert(sea), 3), 3); // smooth the coast a little
const comps = components(enclosed);
const mainId = comps.sizes.indexOf(Math.max(...comps.sizes));
const land = new Uint8Array(N);
for (let i = 0; i < N; i++) land[i] = comps.label[i] === mainId && nearColour[i] ? 1 : 0;

// Each small mark outside the dragon becomes a small island, made chunky enough to land on.
// Marks touching the picture edge or far from the dragon are paper creases and shadows.
const fromMain = edt(land);
const im = components(erode(fillHoles(dilate(islandMarks, 2)), 1)); // a pencil circle becomes a round island
const imBox = im.sizes.map(() => ({ x0: W, y0: H, x1: 0, y1: 0 }));
const keep = im.sizes.map(() => true);
for (let i = 0; i < N; i++) {
  const c = im.label[i];
  if (c < 0) continue;
  const x = i % W, y = (i / W) | 0, b = imBox[c];
  b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || fromMain[i] > 160) keep[c] = false;
}
// Creases are long thin streaks; the circles and dots are round.
imBox.forEach((b, c) => {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  if (Math.max(w, h) / Math.min(w, h) > 2.2) keep[c] = false;
});
const isletSeed = new Uint8Array(N);
for (let i = 0; i < N; i++) if (im.label[i] >= 0 && keep[im.label[i]]) isletSeed[i] = 1;
// Grow islands so they're worth landing on, but never so much that two join together.
const islet = new Uint8Array(isletSeed);
{
  const seeds = components(isletSeed);
  const grown = components(dilate(isletSeed, 3));
  const seedsIn = grown.sizes.map(() => new Set<number>());
  for (let i = 0; i < N; i++) if (seeds.label[i] >= 0) seedsIn[grown.label[i]].add(seeds.label[i]);
  for (let i = 0; i < N; i++) if (grown.label[i] >= 0 && seedsIn[grown.label[i]].size === 1) islet[i] = 1;
}
for (let i = 0; i < N; i++) if (islet[i]) land[i] = 1;
const isletCount = components(islet).sizes.length;

// ---------- 3. the spine ----------
// For "no desert north of the mountains" we need the top of the spine in each column.
const spineTop = new Int32Array(W).fill(-1);
for (let x = 0; x < W; x++) {
  for (let y = 0; y < H; y++) if (ink[idx(x, y)] === Ink.Brown) { spineTop[x] = y; break; }
}
fillGaps(spineTop);
const northOfSpine = (x: number, y: number) => spineTop[x] >= 0 && y < spineTop[x];

// ---------- 4. biomes ----------
const seedBiome: Partial<Record<Ink, Biome>> = {
  [Ink.Red]: Biome.Volcano, [Ink.Blue]: Biome.Forest, [Ink.Yellow]: Biome.Desert,
  [Ink.Brown]: Biome.Mountain, [Ink.Green]: Biome.Meadow,
};
const biome = new Uint8Array(N); // Biome.Ocean = 0
{
  // Grow every coloured region outward until the land is filled (nearest colour wins).
  const q: number[] = [];
  for (let i = 0; i < N; i++) {
    const b = seedBiome[ink[i] as Ink];
    if (b === undefined || !land[i] || islet[i]) continue;
    const x = i % W, y = (i / W) | 0;
    if (b === Biome.Desert && northOfSpine(x, y)) continue; // yellow scribbled past the spine
    biome[i] = b;
    q.push(i);
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], b = biome[i];
    const x = i % W, y = (i / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (biome[j] || !land[j] || islet[j]) continue;
      if (b === Biome.Desert && northOfSpine(nx, ny)) continue;
      biome[j] = b;
      q.push(j);
    }
  }
  for (let i = 0; i < N; i++) {
    if (land[i] && islet[i]) biome[i] = Biome.Beach;
    else if (land[i] && !biome[i]) biome[i] = Biome.Meadow;
  }
}
// The spine is a thin line; the mountain range is wider than the pen stroke.
const spine = new Uint8Array(N);
for (let i = 0; i < N; i++) spine[i] = ink[i] === Ink.Brown ? 1 : 0;
const spineDist = edt(spine);
for (let i = 0; i < N; i++) if (land[i] && !islet[i] && spineDist[i] < 9) biome[i] = Biome.Mountain;

// ---------- 5. water ----------
const black = new Uint8Array(N);
for (let i = 0; i < N; i++) black[i] = ink[i] === Ink.Black && land[i] && !islet[i] && spineDist[i] > 3 ? 1 : 0;
removeSmall(black, (v) => v === 1, 25, 0); // dark specks in the spine marker, not water
const waterDist = edt(black);

// ---------- 6. distances and heights ----------
const landDist = edt(invert(land)); // distance to the sea, measured on land
const seaDist = edt(land);          // distance to land, measured at sea

// Base height (metres) and roughness per biome; blurred so biomes blend.
const BASE: Record<number, [number, number]> = {
  [Biome.Ocean]: [0, 0], [Biome.Meadow]: [25, 10], [Biome.Forest]: [45, 25],
  [Biome.Desert]: [30, 14], [Biome.Mountain]: [80, 60], [Biome.Volcano]: [60, 30], [Biome.Beach]: [6, 3],
};
const baseH = new Float32Array(N), rough = new Float32Array(N);
for (let i = 0; i < N; i++) [baseH[i], rough[i]] = BASE[biome[i]];
const baseHB = boxBlur(boxBlur(baseH, 6), 6);
const roughB = boxBlur(boxBlur(rough, 6), 6);

// ---------- 7. points of interest ----------
const centroid = (b: Biome) => {
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < N; i++) if (biome[i] === b) { sx += i % W; sy += (i / W) | 0; n++; }
  return { x: sx / n, y: sy / n, area: n };
};
const volcano = centroid(Biome.Volcano);
// Home Village: the meadow spot furthest from any other biome and from the sea,
// away from rivers.
let home = { x: 0, y: 0 };
{
  const notMeadow = new Uint8Array(N);
  for (let i = 0; i < N; i++) notMeadow[i] = biome[i] !== Biome.Meadow ? 1 : 0;
  const d = edt(notMeadow);
  let best = -1;
  for (let i = 0; i < N; i++) {
    const score = Math.min(d[i], waterDist[i] * 1.5);
    if (biome[i] === Biome.Meadow && !islet[i] && score > best) { best = score; home = { x: i % W, y: (i / W) | 0 }; }
  }
}

// ---------- 8. write ----------
const METRES_PER_PX = 12.5;
fs.mkdirSync('public/island', { recursive: true });
const a = new PNG({ width: W, height: H }), b = new PNG({ width: W, height: H });
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
for (let i = 0; i < N; i++) {
  const signed = land[i] ? landDist[i] : -seaDist[i];
  a.data.set([biome[i], clamp(128 + signed), clamp(waterDist[i]), 255], i * 4);
  b.data.set([clamp(spineDist[i]), clamp(baseHB[i] * 2), clamp(roughB[i] * 2), 255], i * 4);
}
fs.writeFileSync('public/island/island-a.png', PNG.sync.write(a));
fs.writeFileSync('public/island/island-b.png', PNG.sync.write(b));
fs.writeFileSync('public/island/island.json', JSON.stringify({
  width: W, height: H, metresPerPixel: METRES_PER_PX,
  volcano: { x: volcano.x, y: volcano.y, radius: Math.sqrt(volcano.area / Math.PI) },
  homeVillage: home,
}, null, 2));

// Preview for Caitlin: biome colours, water, beaches, and the home village.
const COLORS: Record<number, number[]> = {
  [Biome.Ocean]: [40, 90, 170], [Biome.Meadow]: [120, 200, 90], [Biome.Forest]: [30, 110, 60],
  [Biome.Desert]: [235, 205, 120], [Biome.Mountain]: [130, 110, 95], [Biome.Volcano]: [200, 60, 40],
  [Biome.Beach]: [245, 230, 170],
};
const S = 2;
const p = new PNG({ width: W * S, height: H * S });
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  const i = idx((x / S) | 0, (y / S) | 0);
  let c = COLORS[biome[i]];
  if (land[i] && landDist[i] < 1.5) c = COLORS[Biome.Beach];
  if (land[i] && waterDist[i] < 1) c = [70, 140, 230];
  if (Math.hypot(x / S - home.x, y / S - home.y) < 5) c = [255, 255, 255];
  if (Math.hypot(x / S - home.x, y / S - home.y) < 3) c = [0, 0, 0];
  p.data.set([...c, 255], (y * W * S + x) * 4);
}
fs.writeFileSync('assets/island-preview.png', PNG.sync.write(p));
console.log(`island ${W}x${H}px = ${(W * METRES_PER_PX / 1000).toFixed(1)}x${(H * METRES_PER_PX / 1000).toFixed(1)} km, ` +
  `${isletCount} small islands, home village at ${home.x},${home.y}`);

// ---------- helpers ----------
function boxBlur(f: Float32Array, r: number): Float32Array {
  const tmp = new Float32Array(N), out = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    let s = 0, n = 0;
    for (let x = -r; x < W + r; x++) {
      if (x + r < W && x + r >= 0) { s += f[idx(x + r, y)]; n++; }
      if (x - r - 1 >= 0) { s -= f[idx(x - r - 1, y)]; n--; }
      if (x >= 0 && x < W) tmp[idx(x, y)] = s / n;
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let y = -r; y < H + r; y++) {
      if (y + r < H && y + r >= 0) { s += tmp[idx(x, y + r)]; n++; }
      if (y - r - 1 >= 0) { s -= tmp[idx(x, y - r - 1)]; n--; }
      if (y >= 0 && y < H) out[idx(x, y)] = s / n;
    }
  }
  return out;
}

function invert(m: Uint8Array) { return m.map((v) => (v ? 0 : 1)); }
function dilate(m: Uint8Array, r: number) { const d = edt(m); return d.map((v) => (v <= r ? 1 : 0)) as unknown as Uint8Array; }
function erode(m: Uint8Array, r: number) { return invert(dilate(invert(m), r)); }

// Exact Euclidean distance (in px) from each pixel to the nearest set pixel (Felzenszwalb & Huttenlocher).
function edt(m: Uint8Array): Float32Array {
  const INF = 1e12;
  const f = new Float64Array(Math.max(W, H));
  const grid = new Float64Array(N);
  for (let i = 0; i < N; i++) grid[i] = m[i] ? 0 : INF;
  const pass = (len: number, get: (k: number) => number, set: (k: number, v: number) => void) => {
    for (let k = 0; k < len; k++) f[k] = get(k);
    const v = new Int32Array(len), z = new Float64Array(len + 1);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s: number;
      while (true) {
        s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        if (s <= z[k] && k > 0) k--; else break;
      }
      if (s <= z[k]) { v[0] = q; z[0] = -INF; z[1] = INF; k = 0; continue; }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      set(q, (q - v[k]) * (q - v[k]) + f[v[k]]);
    }
  };
  for (let x = 0; x < W; x++) pass(H, (k) => grid[idx(x, k)], (k, val) => { grid[idx(x, k)] = val; });
  for (let y = 0; y < H; y++) pass(W, (k) => grid[idx(k, y)], (k, val) => { grid[idx(k, y)] = val; });
  return Float32Array.from(grid, Math.sqrt);
}

function components(m: Uint8Array) {
  const label = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < N; s++) {
    if (!m[s] || label[s] >= 0) continue;
    const id = sizes.length, stack = [s];
    label[s] = id;
    let n = 0;
    while (stack.length) {
      const i = stack.pop()!; n++;
      const x = i % W, y = (i / W) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny);
        if (m[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

// Replace connected groups of pixels matching `is` smaller than `min` with `fill`.
function removeSmall(arr: Uint8Array, is: (v: number) => boolean, min: number, fill: number) {
  const m = arr.map((v) => (is(v) ? 1 : 0)) as Uint8Array;
  const c = components(m);
  for (let i = 0; i < N; i++) if (c.label[i] >= 0 && c.sizes[c.label[i]] < min) arr[i] = fill;
}

// Fill enclosed holes (paper inside a drawn circle).
function fillHoles(m: Uint8Array): Uint8Array {
  const outside = new Uint8Array(N);
  const q: number[] = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) q.push(idx(x, y));
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) q.push(idx(x, y));
  for (const i of q) outside[i] = m[i] ? 0 : 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (!outside[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = idx(nx, ny);
      if (!outside[j] && !m[j]) { outside[j] = 1; q.push(j); }
    }
  }
  return invert(outside);
}

// Columns with no spine pixel take the nearest column's value (only between spine ends).
function fillGaps(a: Int32Array) {
  const first = a.findIndex((v) => v >= 0);
  let last = W - 1;
  while (last >= 0 && a[last] < 0) last--;
  for (let x = first; x <= last; x++) {
    if (a[x] >= 0) continue;
    let r = x; while (a[r] < 0) r++;
    a[x] = Math.round((a[x - 1] + a[r]) / 2);
  }
}
