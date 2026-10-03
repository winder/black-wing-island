// Shapes for working out what hits what. Monsters are made of hit spheres.

import * as THREE from 'three';

export interface HitSphere { center: THREE.Vector3; radius: number }

/** Does a cone (apex, unit direction, length, half-angle) touch a sphere? */
export function coneHitsSphere(apex: THREE.Vector3, dir: THREE.Vector3, length: number, halfAngle: number, s: HitSphere): boolean {
  const to = s.center.clone().sub(apex);
  const along = to.dot(dir);
  if (along < -s.radius || along > length + s.radius) return false;
  const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
  const allowed = Math.max(0, along) * Math.tan(halfAngle) + s.radius;
  return perp <= allowed;
}

export function spheresTouch(a: HitSphere, b: HitSphere): boolean {
  return a.center.distanceToSquared(b.center) <= (a.radius + b.radius) ** 2;
}
