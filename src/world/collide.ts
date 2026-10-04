// Solid things on the ground the dragon can't walk through: building walls,
// towers, huts. Each is a circle or a box seen from above, solid from the
// ground up to `height`; above that the dragon can fly over it.

/** A circle of radius `r`, or a box `hw` × `hd` (half-sizes) turned by `rot` about y, if `hw` is set. */
export interface Collider { x: number; z: number; r: number; height: number; hw?: number; hd?: number; rot?: number }

export const box = (x: number, z: number, hw: number, hd: number, height: number, rot = 0): Collider => ({ x, z, r: 0, hw, hd, rot, height });

/**
 * How far to move a circle of `radius` at (x, z) so it no longer overlaps `c`,
 * written into `out`. Returns false (and leaves `out` alone) if they don't overlap.
 */
export function pushOutOf(c: Collider, x: number, z: number, radius: number, out: { x: number; z: number }): boolean {
  const dx = x - c.x, dz = z - c.z;
  if (c.hw === undefined) {
    const d = Math.hypot(dx, dz), reach = c.r + radius;
    if (d >= reach) return false;
    if (d < 1e-6) { out.x = reach; out.z = 0; return true; }
    out.x = (dx / d) * (reach - d);
    out.z = (dz / d) * (reach - d);
    return true;
  }
  // Into the box's own frame (the same turn as `rotation.y = rot` in three.js).
  const cos = Math.cos(c.rot ?? 0), sin = Math.sin(c.rot ?? 0);
  const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
  const hw = c.hw, hd = c.hd ?? hw;
  let px: number, pz: number;
  if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
    // Centre inside the box: out through the nearest side.
    const ox = hw - Math.abs(lx), oz = hd - Math.abs(lz);
    if (ox < oz) { px = Math.sign(lx || 1) * (ox + radius); pz = 0; }
    else { px = 0; pz = Math.sign(lz || 1) * (oz + radius); }
  } else {
    const nx = lx - Math.max(-hw, Math.min(hw, lx)), nz = lz - Math.max(-hd, Math.min(hd, lz));
    const d = Math.hypot(nx, nz);
    if (d >= radius) return false;
    px = (nx / d) * (radius - d);
    pz = (nz / d) * (radius - d);
  }
  out.x = px * cos + pz * sin;
  out.z = -px * sin + pz * cos;
  return true;
}

// Parts of the dragon that bump into things: [distance ahead of its feet, radius].
const BODY: [number, number][] = [[4.6, 1.6], [0, 2.5], [-2.6, 2.0]];

/**
 * Move a dragon at `pos` facing `yaw` out of anything solid it's standing in,
 * so neither its body nor its head (where the first-person camera is) goes
 * inside. Returns true if it was moved.
 */
export function pushDragonOut(pos: { x: number; y: number; z: number }, yaw: number, colliders: Iterable<Collider>): boolean {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const push = { x: 0, z: 0 };
  let moved = false;
  // A few passes, so being pushed out of one wall into another settles.
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const c of colliders) {
      if (pos.y > c.height) continue;
      for (const [ahead, radius] of BODY) {
        if (pushOutOf(c, pos.x + fx * ahead, pos.z + fz * ahead, radius, push)) {
          pos.x += push.x;
          pos.z += push.z;
          any = moved = true;
        }
      }
    }
    if (!any) break;
  }
  return moved;
}
